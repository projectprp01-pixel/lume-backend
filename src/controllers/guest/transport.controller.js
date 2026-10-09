import mongoose from 'mongoose';
import Booking from '../../models/Booking.model.js';
import Guest from '../../models/Guest.model.js';
import Notification from '../../models/Notification.model.js';
import Transport from '../../models/Transport.model.js';
import TransportBooking from '../../models/TransportBooking.model.js';
import { createWithHubRef } from '../../utils/hubRef.js';

const TRANSPORT_DEFAULTS = {
  visible: true,
  pageTitle: 'How to Reach Evolve Back, Coorg',
  introText: 'Evolve Back, Coorg is just a 235 km (4.5 hour) drive from Bengaluru city. The resort is nestled in the heart of a 300-acre coffee plantation in Karadigodu village, Siddapur.',
  transfersDescription: 'We provide the finest vehicles (Private Innova Crysta) with experienced and courteous drivers to make your journey comfortable and memorable.',
  priceIncludes: [],
  sightseeingIntro: 'The vehicle is at your disposal throughout your stay for sightseeing in and around Coorg.',
  sightseeingAttractions: [],
  pricingTiers: [],
  defaultPrice: 15000,
  customRequest: {
    active: true,
    descriptionText: "If you're looking for transfers from any other location apart from Bangalore, please Write to Us. Our team will review your request and respond to you on your registered email address, latest within the next 4 hours.",
  },
  stopovers: {
    active: true,
    subtitleText: 'Plan a break on your way here',
    externalUrl: 'https://www.coorg-guest.evolveback.com/stopover',
  },
};

/**
 * Get transport settings + dynamic pricing for guest
 * Query: guestId (optional), propertyId (optional)
 */
export const getGuestTransport = async (req, res) => {
  try {
    const { guestId, propertyId = 'default' } = req.query;

    // Upsert avoids duplicate-key race condition when two requests arrive simultaneously
    let settings = await Transport.findOneAndUpdate(
      { propertyId },
      { $setOnInsert: { propertyId, ...TRANSPORT_DEFAULTS } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    let matchedPrice = settings.defaultPrice;
    let nights = null;
    let routeLabel = null;

    if (guestId && mongoose.Types.ObjectId.isValid(guestId)) {
      const booking = await Booking.findOne({ guestId }).sort({ createdAt: -1 });
      if (booking && booking.arrivalDate && booking.checkoutDate) {
        nights = Math.round(
          (new Date(booking.checkoutDate) - new Date(booking.arrivalDate)) / 86400000
        );
        const tier = settings.pricingTiers.find(t => nights === t.toNights);
        if (tier) {
          matchedPrice = tier.price;
          routeLabel = tier.routeLabel;
        } else {
          routeLabel = `${nights} Night(s)`;
        }
      }
    }

    res.status(200).json({
      success: true,
      data: { settings, matchedPrice, nights, routeLabel }
    });
  } catch (error) {
    console.error('Get guest transport error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve transport info', error: error.message });
  }
};

const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

/**
 * Prices what the guest picked from the property's own settings (the client's numbers are never
 * trusted) and snapshots it. Returns { error } or { offering, items, days, city, amount, vehicleName, addons }.
 *   - daily    : price x quantity x number of days, plus the optional pickup/drop add-on
 *   - flat     : the offering's flat price x quantity (pickup/drop city is part of the package)
 *   - p2p      : the chosen city's fare for the vehicle (falls back to the base price) x quantity
 */
function priceTransportSelection({ settings, offeringSlot, rawItems, booking }) {
  const offerings = (settings.offerings || []).filter((o) => o.published && o.structure !== 'custom');
  const offering = offerings.find((o) => o.slot === Number(offeringSlot));
  if (!offering) return { error: 'This transport option is not available' };
  if (!Array.isArray(rawItems) || rawItems.length === 0) return { error: 'Choose at least one vehicle' };

  const vehicles = new Map((settings.vehicles || []).map((v) => [String(v._id), v]));
  const isP2P = offering.structure === 'p2p';
  const isFlat = offering.structure === 'daily' && offering.flatRate;
  const pickupOffering = offerings.find((o) => o.structure === 'p2p');
  const cities = offering.cities?.length ? offering.cities : (pickupOffering?.cities || []);
  const addonAvailable = !isP2P && !isFlat && (offering.addons || []).some((slot) => offerings.some((o) => o.slot === slot));
  const stayStart = dayKey(booking.arrivalDate);
  const stayEnd = dayKey(booking.checkoutDate);

  const items = [];
  const addons = [];
  let amount = 0;
  const allDays = new Set();
  const cityNames = new Set();

  for (const raw of rawItems) {
    const vehicleId = String(raw.vehicleId || '');
    const listed = (offering.vehiclePricing || []).find((vp) => String(vp.vehicleId) === vehicleId);
    // Pickup & drop is priced per city, so a vehicle with no listed price is sold at its lowest city fare.
    const lowestCityFare = isP2P
      ? Math.min(...cities.flatMap((c) => (c.vehiclePrices || []).filter((vp) => String(vp.vehicleId) === vehicleId && vp.price > 0).map((vp) => vp.price)))
      : Infinity;
    const basePrice = listed?.price > 0 ? listed.price : (Number.isFinite(lowestCityFare) ? lowestCityFare : 0);
    const pricing = { price: basePrice };
    const eligible = !offering.eligibleVehicles?.length || offering.eligibleVehicles.map(String).includes(vehicleId);
    const vehicle = vehicles.get(vehicleId);
    if (!vehicle || !(pricing.price > 0) || !eligible) return { error: 'That vehicle is not available for this option' };

    const quantity = Math.floor(Number(raw.quantity));
    if (!(quantity >= 1 && quantity <= 10)) return { error: 'Invalid number of vehicles' };

    const cityName = String(raw.city || '');
    const city = cities.find((c) => c.name === cityName);
    const cityFare = city?.vehiclePrices?.find((vp) => String(vp.vehicleId) === vehicleId)?.price;
    if ((isP2P || isFlat) && !city) return { error: 'Choose a pickup & drop off city' };

    let days = [];
    let line;
    let pickupAddon = false;
    if (isP2P) {
      line = (cityFare ?? pricing.price) * quantity;
    } else if (isFlat) {
      line = pricing.price * quantity;
    } else {
      days = [...new Set((raw.days || []).map(String))].sort();
      if (days.length === 0) return { error: 'Select at least one day' };
      if (days.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d) || d < stayStart || d > stayEnd)) {
        return { error: 'Selected days must fall within your stay' };
      }
      line = pricing.price * quantity * days.length;
      if (raw.pickupAddon && addonAvailable) {
        if (!city) return { error: 'Choose a pickup & drop off city' };
        const addonPrice = (cityFare ?? 0) * quantity;
        pickupAddon = true;
        line += addonPrice;
        addons.push({ name: `Pickup & drop off from city (${city.name})`, price: addonPrice });
      }
    }

    days.forEach((d) => allDays.add(d));
    if (city && (isP2P || isFlat || pickupAddon)) cityNames.add(city.name);
    items.push({
      vehicleId,
      vehicleName: [vehicle.type, vehicle.name && vehicle.type ? `(${vehicle.name})` : vehicle.name].filter(Boolean).join(' '),
      quantity,
      days,
      city: city && (isP2P || isFlat || pickupAddon) ? city.name : '',
      pickupAddon,
      amount: line,
    });
    amount += line;
  }

  return {
    offering,
    items,
    addons,
    amount,
    days: [...allDays].sort(),
    city: [...cityNames].join(', '),
    vehicleName: items.map((i) => `${i.vehicleName}${i.quantity > 1 ? ` x${i.quantity}` : ''}`).join(', '),
  };
}

/**
 * Create a transport booking (guest-side)
 * Body: { guestId, bookingId, offeringSlot, items: [{ vehicleId, quantity, days?, city?, pickupAddon? }], propertyId }
 * (The older { nights, amount } whole-stay form still works when no offeringSlot/items are sent.)
 */
export const createTransportBooking = async (req, res) => {
  try {
    const { guestId, bookingId, nights, amount, propertyId = 'default', offeringSlot, items: rawItems } = req.body;

    if (!guestId || !bookingId) {
      return res.status(400).json({ success: false, message: 'guestId and bookingId are required' });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const guest = await Guest.findById(guestId);

    // New flow: price + snapshot the guest's actual selection from the property's settings.
    let selection = null;
    if (offeringSlot != null) {
      const settings = await Transport.findOne({ propertyId });
      if (!settings) return res.status(404).json({ success: false, message: 'Transport is not set up' });
      selection = priceTransportSelection({ settings, offeringSlot, rawItems, booking });
      if (selection.error) return res.status(400).json({ success: false, message: selection.error });
    }

    const stayNights = nights ?? Math.max(0, Math.round((new Date(booking.checkoutDate) - new Date(booking.arrivalDate)) / 86400000));

    const transportBooking = await createWithHubRef({
      Model: TransportBooking, field: 'ref', kind: 'trn',
      stayId: booking.bookingId,
      data: {
        guestId,
        bookingId,
        // Derived server-side from the stay we just loaded — never trusted from the client — so this
        // booking shows up in Stay Activity and the Checkout folio like every other hub booking.
        mainStayBookingId: booking.bookingId,
        guestName: guest ? guest.fullName : '',
        roomNumber: booking.roomNumber || guest?.roomNumber || '',
        checkInDate: selection?.days[0] ? new Date(selection.days[0]) : booking.arrivalDate,
        checkOutDate: booking.checkoutDate,
        nights: stayNights,
        amount: selection ? selection.amount : amount,
        propertyId,
        status: 'pending',
        ...(selection && {
          // hubBooking makes it appear in the dashboard Transport Hub next to staff-added bookings.
          hubBooking: true,
          source: 'app',
          offeringSlot: selection.offering.slot,
          vehicleId: selection.items[0].vehicleId,
          vehicleName: selection.vehicleName,
          addons: selection.addons,
          items: selection.items,
          days: selection.days,
          city: selection.city,
        }),
      },
    });

    if (guestId) {
      await Notification.create({
        guestId,
        title: 'Transfer Booking Pending',
        message: selection
          ? `Your booking for ${selection.offering.name} is pending payment.`
          : `Your private transfer for ${stayNights} night(s) is pending payment.`,
        type: 'success',
        relatedId: transportBooking._id.toString(),
        relatedType: 'transport-booking'
      });
    }

    res.status(201).json({ success: true, data: transportBooking });
  } catch (error) {
    console.error('Create transport booking error:', error);
    res.status(500).json({ success: false, message: 'Failed to create transport booking', error: error.message });
  }
};

/**
 * Cancel a transport booking (guest-side, e.g. on payment dismiss)
 */
export const cancelTransportBooking = async (req, res) => {
  try {
    const booking = await TransportBooking.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled' },
      { new: true }
    );
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Transport booking not found' });
    }
    res.status(200).json({ success: true, data: booking });
  } catch (error) {
    console.error('Cancel transport booking error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel transport booking', error: error.message });
  }
};

/**
 * Get transport bookings for a specific guest (guest-side My Bookings)
 */
export const getGuestTransportBookings = async (req, res) => {
  try {
    const { guestId } = req.params;
    const bookings = await TransportBooking.find({ guestId, status: 'confirmed' })
      .sort({ createdAt: -1 })
      .select('_id bookingId guestName checkInDate checkOutDate nights amount status paymentStatus');
    res.status(200).json({ success: true, data: bookings });
  } catch (error) {
    console.error('Get guest transport bookings error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve transport bookings', error: error.message });
  }
};
