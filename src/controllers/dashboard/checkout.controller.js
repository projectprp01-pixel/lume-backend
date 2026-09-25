import Booking from '../../models/Booking.model.js';
import CheckoutFolio from '../../models/CheckoutFolio.model.js';
import PropertySettings from '../../models/PropertySettings.model.js';
import SpaBooking from '../../models/SpaBooking.model.js';
import ExperienceBooking from '../../models/ExperienceBooking.model.js';
import TransportBooking from '../../models/TransportBooking.model.js';
import DiningReservation from '../../models/DiningReservation.model.js';
import FbOrder from '../../models/FbOrder.model.js';

// ==================== CHECKOUT (Checkout & Feedback hub, "Checkouts" tab) ====================
// Pending amount and status (Needs Approval / Pre-approved) are never stored or returned as
// their own values — the client derives both from each folio line's `paid` flag on every
// render (Checkout & Feedback PRD, Step 2).

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseLocalDate(date) {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return date ? new Date(date) : new Date();
}

export function dayRange(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function propertyFilter(propertyId) {
  return propertyId && propertyId !== 'default' ? { propertyId } : {};
}

function nightsBetween(arrival, checkout) {
  const ms = new Date(checkout).setHours(0, 0, 0, 0) - new Date(arrival).setHours(0, 0, 0, 0);
  return Math.max(1, Math.round(ms / 86400000));
}

// The folio is not stored — it is assembled on every read from what the guest actually booked
// across the hubs (Spa, Experiences, Transport, Dining, in-room F&B), all linked by the shared
// stay ID (mainStayBookingId === Booking.bookingId; F&B orders link by Booking._id). Each line's
// `paid` flag is that booking's own paymentStatus, so anything a guest hasn't paid for shows up
// as pending here automatically, and anything already paid never adds to the amount due.
// Cancelled and refunded bookings are not owed and are left out. CheckoutFolio.folio only holds
// manually-added extra charges (e.g. a late check-out fee) — see PRD Step 2.
const isPaid = (status) => status === 'paid';

function fbOrderTotal(o) {
  const items = (o.items ?? []).reduce((sum, i) => sum + i.qty * i.price * (1 + (i.gstPercent || 0) / 100), 0);
  return Math.round(items + (o.packagingCharge || 0));
}

export async function buildFolios(bookings) {
  const stayIds = bookings.map((b) => b.bookingId);
  const objectIds = bookings.map((b) => b._id);
  const idByObjectId = Object.fromEntries(bookings.map((b) => [String(b._id), b.bookingId]));

  const [spa, exp, trn, din, fb, manual] = await Promise.all([
    SpaBooking.find({ mainStayBookingId: { $in: stayIds }, status: { $ne: 'Cancelled' }, paymentStatus: { $ne: 'refunded' } }).lean(),
    ExperienceBooking.find({ mainStayBookingId: { $in: stayIds }, bookingStatus: { $ne: 'cancelled' }, paymentStatus: { $ne: 'refunded' } }).lean(),
    TransportBooking.find({ mainStayBookingId: { $in: stayIds }, status: { $ne: 'cancelled' } }).lean(),
    DiningReservation.find({ mainStayBookingId: { $in: stayIds }, status: { $ne: 'cancelled' } }).lean(),
    FbOrder.find({ bookingId: { $in: objectIds } }).lean(),
    CheckoutFolio.find({ bookingId: { $in: stayIds } }).lean(),
  ]);

  const map = Object.fromEntries(stayIds.map((id) => [id, []]));
  const push = (stayId, id, name, price, paid) => {
    if (map[stayId] && price > 0) map[stayId].push({ _id: id, name, price, paid });
  };

  spa.forEach((x) => push(x.mainStayBookingId, `spa:${x._id}`, `Spa — ${x.treatmentName}`, x.price, isPaid(x.paymentStatus)));
  exp.forEach((x) => push(x.mainStayBookingId, `exp:${x._id}`, x.experienceName, x.totalAmount, isPaid(x.paymentStatus)));
  trn.forEach((x) => push(x.mainStayBookingId, `trn:${x._id}`, `Transport${x.vehicleName ? ` — ${x.vehicleName}` : ''}`, x.amount, isPaid(x.paymentStatus)));
  din.forEach((x) => push(x.mainStayBookingId, `din:${x._id}`, `Dining — ${x.facilityName}`, x.amount, isPaid(x.paymentStatus)));
  fb.forEach((x) => push(idByObjectId[String(x.bookingId)], `fb:${x._id}`, 'In-room dining', fbOrderTotal(x), isPaid(x.paymentStatus)));
  manual.forEach((m) => m.folio.forEach((l) => push(m.bookingId, `manual:${l._id}`, l.name, l.price, !!l.paid)));

  return map;
}

export const getCheckoutBookings = async (req, res) => {
  try {
    const { propertyId = 'default', date } = req.query;
    const target = parseLocalDate(date);
    if (Number.isNaN(target.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid date' });
    }
    const { start, end } = dayRange(target);
    const yesterday = new Date(target);
    yesterday.setDate(yesterday.getDate() - 1);
    const { start: yStart, end: yEnd } = dayRange(yesterday);

    const base = { ...propertyFilter(propertyId), bookingStatus: { $ne: 'cancelled' } };
    const [bookings, yesterdayCount, settings] = await Promise.all([
      Booking.find({ ...base, checkoutDate: { $gte: start, $lte: end } }).sort({ createdAt: 1 }).lean(),
      Booking.countDocuments({ ...base, checkoutDate: { $gte: yStart, $lte: yEnd } }),
      PropertySettings.findOne({ propertyId }).lean(),
    ]);

    const [overrides, folioMap] = await Promise.all([
      CheckoutFolio.find({ bookingId: { $in: bookings.map((b) => b.bookingId) } }, 'bookingId checkoutTimeOverride').lean(),
      buildFolios(bookings),
    ]);
    const overrideMap = Object.fromEntries(overrides.map((f) => [f.bookingId, f.checkoutTimeOverride]));
    const standardTime = settings?.checkOutTime || '11:00';

    const data = bookings.map((b) => {
      return {
        bookingId: b.bookingId,
        guestName: b.primaryGuestName,
        numberOfGuests: b.numberOfGuests,
        nights: nightsBetween(b.arrivalDate, b.checkoutDate),
        room: b.roomNumber || '',
        checkoutTime: overrideMap[b.bookingId] || standardTime,
        folio: folioMap[b.bookingId],
      };
    });

    res.status(200).json({ success: true, count: data.length, yesterdayCount, data });
  } catch (error) {
    console.error('Get checkout bookings error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve checkouts', error: error.message });
  }
};

/**
 * Staff attestation, not a payment action: marks every currently-unpaid item on the guest's
 * folio as paid at its source — the Spa/Experience/Transport/Dining booking or F&B order itself,
 * plus any manual charge. The Pending Amount and the Pre-approved status then follow from the
 * derived folio; nothing checkout-specific is set (PRD, Step 3).
 */
export const approveCheckout = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const booking = await Booking.findOne({ bookingId }).lean();
    if (!booking) {
      return res.status(404).json({ success: false, message: `No booking found for ID "${bookingId}"` });
    }

    const paidNow = { paymentStatus: 'paid', paidAt: new Date() };
    const unpaid = { $ne: 'paid' };
    await Promise.all([
      SpaBooking.updateMany({ mainStayBookingId: bookingId, status: { $ne: 'Cancelled' }, paymentStatus: { $nin: ['paid', 'refunded'] } }, { $set: paidNow }),
      ExperienceBooking.updateMany({ mainStayBookingId: bookingId, bookingStatus: { $ne: 'cancelled' }, paymentStatus: { $nin: ['paid', 'refunded'] } }, { $set: paidNow }),
      TransportBooking.updateMany({ mainStayBookingId: bookingId, status: { $ne: 'cancelled' }, paymentStatus: unpaid }, { $set: paidNow }),
      DiningReservation.updateMany({ mainStayBookingId: bookingId, status: { $ne: 'cancelled' }, paymentStatus: unpaid }, { $set: paidNow }),
      FbOrder.updateMany({ bookingId: booking._id, paymentStatus: unpaid }, { $set: { paymentStatus: 'paid' } }),
      CheckoutFolio.updateOne({ bookingId }, { $set: { 'folio.$[unpaid].paid': true } }, { arrayFilters: [{ 'unpaid.paid': false }] }),
    ]);

    const folios = await buildFolios([booking]);
    res.status(200).json({ success: true, data: { bookingId, folio: folios[bookingId] } });
  } catch (error) {
    console.error('Approve checkout error:', error);
    res.status(500).json({ success: false, message: 'Failed to approve checkout', error: error.message });
  }
};

/**
 * Records a late checkout already approved elsewhere (GM / Front Office Manager) for one guest.
 * Only updates the displayed time — it does not grant anything (PRD, Step 4).
 */
export const updateCheckoutTime = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { checkoutTime } = req.body;
    if (typeof checkoutTime !== 'string' || !TIME_RE.test(checkoutTime)) {
      return res.status(400).json({ success: false, message: 'checkoutTime must be a "HH:MM" 24-hour time' });
    }
    const booking = await Booking.findOne({ bookingId }).lean();
    if (!booking) {
      return res.status(404).json({ success: false, message: `No booking found for ID "${bookingId}"` });
    }

    const folio = await CheckoutFolio.findOneAndUpdate(
      { bookingId },
      { $set: { checkoutTimeOverride: checkoutTime }, $setOnInsert: { propertyId: booking.propertyId } },
      { new: true, upsert: true }
    ).lean();

    res.status(200).json({ success: true, data: { bookingId, checkoutTime: folio.checkoutTimeOverride } });
  } catch (error) {
    console.error('Update checkout time error:', error);
    res.status(500).json({ success: false, message: 'Failed to update checkout time', error: error.message });
  }
};
