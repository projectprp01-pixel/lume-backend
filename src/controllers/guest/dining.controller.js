import Booking from '../../models/Booking.model.js';
import DiningReservation from '../../models/DiningReservation.model.js';
import Guest from '../../models/Guest.model.js';
import Restaurant from '../../models/Restaurant.model.js';
import { persistPrepared } from '../../services/guestCheckout.js';
import { singleRoomOf } from '../../utils/mainStay.js';
import { arrivalDayForGuest, bestDiscountFor, loadEligibleDiscounts } from '../../utils/discounts.js';

// A date (YYYY-MM-DD) is blocked if listed in blockedDates or inside a dashboard-set blockedRanges entry.
const isBlockedDate = (facility, date) =>
  (facility.blockedDates || []).includes(date) ||
  (facility.blockedRanges || []).some((r) => r.start && r.end && date >= r.start && date <= r.end);

/**
 * Get restaurants for guest app
 */
export const getRestaurants = async (req, res) => {
  try {
    const { propertyId } = req.query;

    const filter = { isActive: true };
    if (propertyId) filter.propertyId = propertyId;

    const restaurants = await Restaurant.find(filter).sort({ isFeatured: -1, name: 1 });

    res.status(200).json({
      success: true,
      count: restaurants.length,
      data: restaurants
    });
  } catch (error) {
    console.error('Get restaurants error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve restaurants',
      error: error.message
    });
  }
};

/**
 * Check availability for an intimate dining facility on a date
 * Query: facilityId, date (YYYY-MM-DD), propertyId
 */
export const getDiningAvailability = async (req, res) => {
  try {
    const { facilityId, date } = req.query;

    if (!facilityId || !date) {
      return res.status(400).json({ success: false, message: 'facilityId and date are required' });
    }

    const facility = await Restaurant.findById(facilityId);
    if (!facility) {
      return res.status(404).json({ success: false, message: 'Facility not found' });
    }

    // Restaurants don't have capacity constraints
    if (facility.facilityType !== 'intimate_dining') {
      return res.status(200).json({ success: true, data: { available: true, remaining: null, tablesPerNight: null } });
    }

    // Check if date is blocked
    if (isBlockedDate(facility, date)) {
      return res.status(200).json({ success: true, data: { available: false, remaining: 0, tablesPerNight: facility.tablesPerNight, reason: 'blocked' } });
    }

    const confirmedCount = await DiningReservation.countDocuments({
      facilityId, date, status: 'confirmed',
    });

    const tablesPerNight = facility.tablesPerNight || 1;
    const remaining = tablesPerNight - confirmedCount;

    res.status(200).json({
      success: true,
      data: { available: remaining > 0, remaining: Math.max(0, remaining), tablesPerNight },
    });
  } catch (error) {
    console.error('Dining availability error:', error);
    res.status(500).json({ success: false, message: 'Failed to check availability', error: error.message });
  }
};

/**
 * Validate + price a guest dining reservation WITHOUT saving anything. Shared by the direct endpoint
 * below (free reservations only) and the paid checkout (services/guestCheckout.js).
 * Returns { ok:false, status, message } or { ok:true, kind, amount, doc }.
 */
export async function prepareDiningReservation(body) {
  const fail = (status, message) => ({ ok: false, status, message });
  {
    const { facilityId, guestId, bookingId, date, numberOfGuests, propertyId = 'default', addonNames } = body;

    if (!facilityId || !date || !numberOfGuests) {
      return fail(400, 'facilityId, date, and numberOfGuests are required');
    }

    const facility = await Restaurant.findById(facilityId);
    if (!facility) {
      return fail(404, 'Facility not found');
    }
    // Intimate dining is always bookable; a restaurant only when the property switched it to
    // table reservations (bookingMode) instead of info-only.
    if (facility.facilityType !== 'intimate_dining' && facility.bookingMode !== 'reservations') {
      return fail(400, 'This facility does not take reservations');
    }

    // Check blocked dates
    if (isBlockedDate(facility, date)) {
      return fail(400, `${date} is not available for bookings`);
    }

    // Check capacity
    if (facility.tablesPerNight) {
      const confirmedCount = await DiningReservation.countDocuments({ facilityId, date, status: 'confirmed' });
      if (confirmedCount >= facility.tablesPerNight) {
        return fail(400, 'All tables are booked for this date');
      }
    }

    // Fetch guest info
    let guestName = 'Guest';
    let roomNumber = '';
    let mainStayBooking = null;
    if (guestId) {
      const diningGuest = await Guest.findById(guestId).catch(() => null);
      if (diningGuest) guestName = diningGuest.fullName;
    }
    if (bookingId) {
      mainStayBooking = await Booking.findById(bookingId).catch(() => null);
      if (mainStayBooking) roomNumber = singleRoomOf(mainStayBooking.roomNumber);
    }
    if (!mainStayBooking && guestId) {
      mainStayBooking = await Booking.findOne({ guestId }).sort({ createdAt: -1 }).lean().catch(() => null);
    }

    // Validate each selected addon against the facility's configured list and snapshot its
    // price at booking time (prices can change on the facility after a guest books).
    const selectedAddons = Array.isArray(addonNames)
      ? (facility.addons || []).filter((a) => addonNames.includes(a.name)).map((a) => ({ name: a.name, price: a.price }))
      : [];
    // Dining Hub discounts tagged to this facility apply to its own price (not add-ons).
    const eligible = await loadEligibleDiscounts({ propertyId: facility.propertyId || propertyId, checkInDay: await arrivalDayForGuest(guestId) });
    const applied = bestDiscountFor(eligible, 'dining', facilityId, facility.price || 0);
    // Per-person facilities (guest chooses the group size) charge per head; the rest per booking.
    const heads = facility.guestCanChooseGroupSize ? Math.max(1, Number(numberOfGuests) || 1) : 1;
    const amount = ((facility.price || 0) - (applied?.amount ?? 0)) * heads + selectedAddons.reduce((sum, a) => sum + (a.price || 0), 0);

    // Derived from the stay loaded above (never from a client-sent mainStayBookingId); it drives both the
    // stored mainStayBookingId and the <stayId>-DIN-<n> reference (see utils/hubRef.js).
    const stayId = mainStayBooking?.bookingId ?? null;
    return {
      ok: true,
      kind: 'dining',
      amount: amount > 0 ? amount : 0,
      doc: {
        Model: DiningReservation, field: 'reservationRef', hubKind: 'din', stayId,
        data: {
          facilityId,
          facilityName: facility.name,
          facilityType: facility.facilityType,
          guestId: guestId || undefined,
          bookingId: bookingId || undefined,
          mainStayBookingId: stayId ?? undefined,
          guestName,
          roomNumber,
          date,
          numberOfGuests,
          propertyId,
          amount,
          discountName: applied?.discount.name,
          discountAmount: applied ? applied.amount * heads : undefined,
          source: 'app',
          addons: selectedAddons,
        },
      },
    };
  }
}

/**
 * Create a dining reservation (guest-side). Only complimentary reservations are created here: a paid
 * one exists only after its payment has come through, via POST /payments/checkout.
 * Body: { facilityId, guestId, bookingId, date, numberOfGuests, propertyId }
 */
export const createDiningReservation = async (req, res) => {
  try {
    const prepared = await prepareDiningReservation(req.body);
    if (!prepared.ok) return res.status(prepared.status).json({ success: false, message: prepared.message });
    if (prepared.amount > 0) {
      return res.status(402).json({ success: false, message: 'Payment is required: book paid reservations through checkout.' });
    }
    const reservation = await persistPrepared(prepared);
    res.status(201).json({
      success: true,
      data: {
        _id: reservation._id,
        facilityName: reservation.facilityName,
        date: reservation.date,
        amount: reservation.amount,
      },
    });
  } catch (error) {
    console.error('Create dining reservation error:', error);
    res.status(500).json({ success: false, message: 'Failed to create reservation', error: error.message });
  }
};

/**
 * Get all dining reservations for a guest
 * Params: guestId
 */
export const getGuestDiningReservations = async (req, res) => {
  try {
    const { guestId } = req.params;
    const reservations = await DiningReservation.find({ guestId }).sort({ date: 1 });
    res.status(200).json({ success: true, data: reservations });
  } catch (error) {
    console.error('Get guest dining reservations error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve dining reservations', error: error.message });
  }
};

/**
 * Cancel a dining reservation (guest-side, e.g. on payment dismiss)
 */
export const cancelDiningReservation = async (req, res) => {
  try {
    const reservation = await DiningReservation.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled' },
      { new: true }
    );
    if (!reservation) {
      return res.status(404).json({ success: false, message: 'Reservation not found' });
    }
    res.status(200).json({ success: true, data: reservation });
  } catch (error) {
    console.error('Cancel dining reservation error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel reservation', error: error.message });
  }
};
