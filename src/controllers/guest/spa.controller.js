import SpaFacility from '../../models/Spa.model.js';
import SpaBooking from '../../models/SpaBooking.model.js';
import { persistPrepared } from '../../services/guestCheckout.js';
import { resolveGuestStayId } from '../../utils/mainStay.js';
import { arrivalDayForGuest, bestDiscountFor, loadEligibleDiscounts } from '../../utils/discounts.js';

/**
 * Get spa facilities for guest portal
 */
export const getSpaFacilities = async (req, res) => {
  try {
    const { propertyId } = req.query;
    const filter = { isActive: true };
    if (propertyId) filter.propertyId = propertyId;
    const spaFacilities = await SpaFacility.find(filter).sort({ updatedAt: -1 });
    res.status(200).json({ success: true, count: spaFacilities.length, data: spaFacilities });
  } catch (error) {
    console.error('Get spa facilities error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve spa facilities', error: error.message });
  }
};

/**
 * Get available time slots for a spa facility on a given date
 * Query: facilityId, date (YYYY-MM-DD)
 */
export const getSpaTimeSlots = async (req, res) => {
  try {
    const { facilityId, date } = req.query;
    if (!facilityId || !date) {
      return res.status(400).json({ success: false, message: 'facilityId and date are required' });
    }

    const facility = await SpaFacility.findById(facilityId);
    if (!facility) return res.status(404).json({ success: false, message: 'Spa facility not found' });

    const slots = facility.timeSlots?.length
      ? facility.timeSlots
      : ['09:00', '10:15', '11:30', '14:00', '15:15'];

    const maxPerSlot = facility.therapistsAvailable ?? facility.maxBookingsPerSlot ?? 1;

    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const bookings = await SpaBooking.find({
      spaFacilityId: facilityId,
      date: { $gte: start, $lte: end },
      status: { $in: ['Upcoming', 'In Progress'] }
    });

    // Every guest takes one place in the slot (the spa's therapists), so a booking for 3 guests uses up 3.
    const slotCounts = {};
    bookings.forEach(b => { slotCounts[b.timeSlot] = (slotCounts[b.timeSlot] || 0) + (b.numberOfGuests || 1); });

    // `guests` (optional): the party size being booked, so a slot with fewer places left than that reads as full.
    const wanted = Math.max(1, parseInt(req.query.guests, 10) || 1);
    const result = slots.map(time => {
      const remaining = Math.max(0, maxPerSlot - (slotCounts[time] || 0));
      return { time, available: remaining >= wanted, remaining };
    });

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('Get spa timeslots error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve time slots', error: error.message });
  }
};

/**
 * Validate + price a guest spa booking WITHOUT saving anything. Shared by the direct endpoint below
 * (free bookings only) and the paid checkout (services/guestCheckout.js), which creates the booking
 * only once payment has come through.
 * Returns { ok:false, status, message } or { ok:true, kind, amount, doc }.
 */
export async function prepareSpaBooking(body) {
  const fail = (status, message) => ({ ok: false, status, message });
  {
    const { treatmentName, date, timeSlot, spaFacilityId, treatmentId } = body;
    if (!treatmentName || !date || !timeSlot) {
      return fail(400, 'treatmentName, date, and timeSlot are required');
    }

    // Validate slot capacity before creating the booking. Capacity is the spa's therapists per slot and every
    // guest takes one place, so a booking for 3 guests needs 3 free places (same rule as the time-slot list).
    if (spaFacilityId) {
      const facility = await SpaFacility.findById(spaFacilityId);
      if (facility) {
        const maxPerSlot = facility.therapistsAvailable ?? facility.maxBookingsPerSlot ?? 1;
        const wanted = Math.max(1, parseInt(body.numberOfGuests, 10) || 1);
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);
        const existing = await SpaBooking.find({
          spaFacilityId,
          date: { $gte: start, $lte: end },
          timeSlot,
          status: { $in: ['Upcoming', 'In Progress'] },
        }).select('numberOfGuests');
        const taken = existing.reduce((sum, b) => sum + (b.numberOfGuests || 1), 0);
        if (taken + wanted > maxPerSlot) {
          const left = Math.max(0, maxPerSlot - taken);
          return fail(400, left === 0
            ? 'This time slot is fully booked. Please choose another slot.'
            : `Only ${left} place${left === 1 ? '' : 's'} left in this time slot. Please reduce the number of guests or choose another slot.`);
        }
      }
    }

    // The stay is derived server-side; a client-sent mainStayBookingId only counts if it is this guest's own.
    // It drives both the stored mainStayBookingId and the <stayId>-SPA-<n> reference (see utils/hubRef.js).
    const stayId = await resolveGuestStayId({ guestId: body.guestId, claimedStayId: body.mainStayBookingId });

    // Price the booking from the treatment itself so a Spa Hub discount tagged to it always applies and the
    // charged amount (which payment reads from `price`) can't be set by the client. Falls back to the
    // client-sent price only when the treatment can't be found.
    let pricing = {};
    const facility = spaFacilityId ? await SpaFacility.findById(spaFacilityId).catch(() => null) : null;
    const treatment = facility && treatmentId
      ? (facility.categories || []).flatMap((c) => c.treatments || []).find((t) => String(t._id) === String(treatmentId))
      : null;
    if (treatment) {
      const wantedMin = Number(body.duration) || 0;
      const picked = (treatment.durations || []).find((d) => d.minutes === wantedMin) || (treatment.durations || [])[0];
      const listPrice = picked?.price ?? treatment.price ?? 0;
      const eligible = await loadEligibleDiscounts({
        propertyId: facility.propertyId || body.propertyId,
        checkInDay: await arrivalDayForGuest(body.guestId),
      });
      const applied = bestDiscountFor(eligible, 'spa', treatmentId, listPrice);
      const guests = Math.max(1, parseInt(body.numberOfGuests, 10) || 1);
      const addonNames = (Array.isArray(body.addons) ? body.addons : []).map((a) => a?.name);
      const addons = (treatment.addons || []).filter((a) => addonNames.includes(a.name)).map((a) => ({ name: a.name, price: a.price || 0 }));
      pricing = {
        price: (listPrice - (applied?.amount ?? 0)) * guests + addons.reduce((sum, a) => sum + a.price, 0),
        addons,
        discountName: applied?.discount.name,
        discountAmount: applied ? applied.amount * guests : undefined,
      };
    }
    // Never trust client-sent status / payment fields: those are set by the server when the booking is created.
    const { status: _s, paymentStatus: _p, razorpayOrderId: _o, razorpayPaymentId: _i, razorpaySignature: _g, paidAt: _t, _id: _d, ...safe } = body;
    const data = { ...safe, ...pricing, mainStayBookingId: stayId ?? undefined };
    return {
      ok: true,
      kind: 'spa',
      amount: Number(data.price) > 0 ? Number(data.price) : 0,
      doc: { Model: SpaBooking, field: 'bookingId', hubKind: 'spa', stayId, data },
    };
  }
}

/**
 * Create a spa booking (guest-side). Only complimentary bookings are created here: a paid booking exists
 * only after its payment has come through, via POST /payments/checkout.
 */
export const createSpaBooking = async (req, res) => {
  try {
    const prepared = await prepareSpaBooking(req.body);
    if (!prepared.ok) return res.status(prepared.status).json({ success: false, message: prepared.message });
    if (prepared.amount > 0) {
      return res.status(402).json({ success: false, message: 'Payment is required: book paid treatments through checkout.' });
    }
    const booking = await persistPrepared(prepared);
    res.status(201).json({ success: true, data: booking });
  } catch (error) {
    console.error('Create spa booking error:', error);
    res.status(500).json({ success: false, message: 'Failed to create spa booking', error: error.message });
  }
};

/**
 * Get spa bookings for a specific guest
 */
export const getGuestSpaBookings = async (req, res) => {
  try {
    const { guestId } = req.params;
    const bookings = await SpaBooking.find({ guestId, status: { $in: ['Upcoming', 'In Progress', 'Completed'] } })
      .sort({ date: -1 })
      .select('bookingId treatmentName date timeSlot numberOfGuests status');
    res.status(200).json({ success: true, data: bookings });
  } catch (error) {
    console.error('Get guest spa bookings error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve spa bookings', error: error.message });
  }
};

/**
 * Cancel spa booking (on payment dismiss)
 */
export const cancelSpaBooking = async (req, res) => {
  try {
    const booking = await SpaBooking.findByIdAndUpdate(
      req.params.id,
      { status: 'Cancelled' },
      { new: true }
    );
    if (!booking) return res.status(404).json({ success: false, message: 'Spa booking not found' });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Cancel spa booking error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel spa booking', error: error.message });
  }
};
