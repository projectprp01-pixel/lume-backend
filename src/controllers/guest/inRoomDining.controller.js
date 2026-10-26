import Booking from '../../models/Booking.model.js';
import Guest from '../../models/Guest.model.js';
import FbMenuCategory from '../../models/FbMenuCategory.model.js';
import FbMenuSubcategory from '../../models/FbMenuSubcategory.model.js';
import FbDish from '../../models/FbDish.model.js';
import FbOrder from '../../models/FbOrder.model.js';
import FbOrderingSettings from '../../models/FbOrderingSettings.model.js';
import PropertySettings from '../../models/PropertySettings.model.js';
import { notifyFbOrderStage } from '../../utils/fbOrderNotifier.js';

// The property runs on one clock; "kitchen open" must not depend on the server's timezone.
const PROPERTY_TZ = 'Asia/Kolkata';

const toMinutes = (hhmm = '') => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : null;
};

const minutesNow = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: PROPERTY_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === 'hour')?.value);
  const m = Number(parts.find((p) => p.type === 'minute')?.value);
  return (h % 24) * 60 + m;
};

/** Is the kitchen taking orders right now, and (if so) how long until it closes. */
const kitchenState = (settings, enabled) => {
  if (!enabled) return { open: false, reason: 'disabled', closesInMinutes: null };
  if (settings.paused) return { open: false, reason: 'paused', closesInMinutes: null };
  const opens = toMinutes(settings.opens);
  const closes = toMinutes(settings.closes);
  const now = minutesNow();
  if (opens == null || closes == null) return { open: true, reason: null, closesInMinutes: null };
  // Overnight windows (e.g. 18:00 → 02:00) wrap past midnight.
  const open = opens <= closes ? now >= opens && now < closes : now >= opens || now < closes;
  if (!open) return { open: false, reason: 'outside-hours', closesInMinutes: null };
  const closesInMinutes = closes > now ? closes - now : closes + 24 * 60 - now;
  return { open: true, reason: null, closesInMinutes };
};

const loadSettings = async (propertyId) => {
  const [ordering, property] = await Promise.all([
    FbOrderingSettings.findOne({ propertyId }).lean(),
    PropertySettings.findOne({ propertyId }).lean(),
  ]);
  const settings = ordering ?? { opens: '07:00', closes: '22:00', paused: false, packagingCharge: 30 };
  // The dashboard Guest App builder can switch in-room ordering off entirely.
  const enabled = property?.guestApp?.inRoomOrderingEnabled !== false;
  return { settings, enabled };
};

/**
 * Guest in-room dining menu: kitchen state + categories → subcategories → in-stock dishes.
 * Query: propertyId (default 'default')
 */
export const getInRoomMenu = async (req, res) => {
  try {
    const { propertyId = 'default' } = req.query;
    const { settings, enabled } = await loadSettings(propertyId);

    const categories = await FbMenuCategory.find({ propertyId }).sort({ openTime: 1, name: 1 }).lean();
    const subcategories = await FbMenuSubcategory.find({
      categoryId: { $in: categories.map((c) => c._id) },
    }).sort({ name: 1 }).lean();
    const dishes = await FbDish.find({
      subcategoryId: { $in: subcategories.map((s) => s._id) },
      inStock: true,
    }).sort({ name: 1 }).lean();

    const data = categories
      .map((c) => ({
        ...c,
        subcategories: subcategories
          .filter((s) => String(s.categoryId) === String(c._id))
          .map((s) => ({
            _id: s._id,
            name: s.name,
            dishes: dishes.filter((d) => String(d.subcategoryId) === String(s._id)),
          }))
          .filter((s) => s.dishes.length > 0),
      }))
      .filter((c) => c.subcategories.length > 0);

    res.status(200).json({
      success: true,
      data: {
        kitchen: {
          opens: settings.opens,
          closes: settings.closes,
          packagingCharge: settings.packagingCharge,
          ...kitchenState(settings, enabled),
        },
        categories: data,
      },
    });
  } catch (error) {
    console.error('Get in-room menu error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve menu', error: error.message });
  }
};

/**
 * Place an in-room dining order (billed to the room, settled at checkout).
 * Body: { guestId, room?, notes?, items: [{ dishId, qty }], propertyId? }
 * Prices, GST and the packaging charge always come from the server, never the client.
 */
export const createInRoomOrder = async (req, res) => {
  try {
    const { guestId, room, notes, items, propertyId = 'default' } = req.body;
    if (!guestId) return res.status(400).json({ success: false, message: 'guestId is required' });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Add at least one item to your order' });
    }

    const { settings, enabled } = await loadSettings(propertyId);
    const kitchen = kitchenState(settings, enabled);
    if (!kitchen.open) {
      return res.status(400).json({
        success: false,
        message: kitchen.reason === 'outside-hours'
          ? `The kitchen is closed right now (orders ${settings.opens}–${settings.closes}).`
          : 'The kitchen is closed temporarily. Please try again shortly.',
      });
    }

    const guest = await Guest.findById(guestId).catch(() => null);
    if (!guest) return res.status(404).json({ success: false, message: 'Guest not found' });
    const booking = await Booking.findOne({ guestId }).sort({ createdAt: -1 }).lean().catch(() => null);

    // One line per dish + set of extras: the same dish with different extras is a different line.
    const wanted = new Map();
    for (const it of items) {
      const qty = Math.floor(Number(it?.qty));
      if (!it?.dishId || !(qty >= 1 && qty <= 20)) {
        return res.status(400).json({ success: false, message: 'Each item needs a dish and a quantity from 1 to 20' });
      }
      const extraNames = [...new Set((Array.isArray(it.extras) ? it.extras : []).map(String))].sort();
      const key = `${it.dishId}|${extraNames.join('|')}`;
      const hit = wanted.get(key);
      wanted.set(key, { dishId: String(it.dishId), extraNames, qty: (hit?.qty ?? 0) + qty });
    }

    const dishIds = [...new Set([...wanted.values()].map((l) => l.dishId))];
    const dishes = await FbDish.find({ _id: { $in: dishIds } }).lean();
    const orderItems = [];
    for (const { dishId, extraNames, qty } of wanted.values()) {
      const dish = dishes.find((d) => String(d._id) === dishId);
      if (!dish || !dish.inStock) {
        return res.status(400).json({ success: false, message: 'An item in your cart is no longer available' });
      }
      // Extras are priced from the dish's own list, never from the client.
      const chosen = extraNames.map((n) => (dish.extras ?? []).find((e) => e.name === n));
      if (chosen.some((e) => !e)) {
        return res.status(400).json({ success: false, message: 'An extra in your cart is no longer available' });
      }
      const extras = chosen.map((e) => ({ name: e.name, price: e.price ?? 0 }));
      const price = dish.price + extras.reduce((sum, e) => sum + e.price, 0);
      orderItems.push({ dishId: dish._id, name: dish.name, qty, price, extras, gstPercent: dish.gstPercent ?? 0 });
    }

    const order = await FbOrder.create({
      propertyId,
      guestId,
      bookingId: booking?._id,
      guestName: guest.fullName || 'Guest',
      room: (room || guest.roomNumber || booking?.roomNumber || '').toString().trim(),
      items: orderItems,
      packagingCharge: settings.packagingCharge,
      notes: notes ? String(notes).trim().slice(0, 500) : undefined,
      stage: 'placed',
      paymentStatus: 'pending',
      timestamps: { placed: new Date() },
    });
    await notifyFbOrderStage(order);

    res.status(201).json({ success: true, data: order });
  } catch (error) {
    console.error('Create in-room order error:', error);
    res.status(500).json({ success: false, message: 'Failed to place order', error: error.message });
  }
};

/** The guest's own in-room orders, newest first. */
export const getGuestInRoomOrders = async (req, res) => {
  try {
    const { guestId } = req.query;
    if (!guestId) return res.status(400).json({ success: false, message: 'guestId is required' });
    const orders = await FbOrder.find({ guestId }).sort({ createdAt: -1 }).limit(20);
    res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    console.error('Get in-room orders error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve orders', error: error.message });
  }
};
