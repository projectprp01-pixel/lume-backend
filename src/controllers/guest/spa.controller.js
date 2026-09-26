import SpaFacility from '../../models/Spa.model.js';
import SpaBooking from '../../models/SpaBooking.model.js';
import { createWithHubRef } from '../../utils/hubRef.js';
import { resolveGuestStayId } from '../../utils/mainStay.js';

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

    const slotCounts = {};
    bookings.forEach(b => { slotCounts[b.timeSlot] = (slotCounts[b.timeSlot] || 0) + 1; });

    const result = slots.map(time => ({
      time,
      available: (slotCounts[time] || 0) < maxPerSlot,
      remaining: Math.max(0, maxPerSlot - (slotCounts[time] || 0))
    }));

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('Get spa timeslots error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve time slots', error: error.message });
  }
};

/**
 * Create a spa booking (guest-side)
 */
export const createSpaBooking = async (req, res) => {
  try {
    const { treatmentName, date, timeSlot, spaFacilityId, treatmentId } = req.body;
    if (!treatmentName || !date || !timeSlot) {
      return res.status(400).json({ success: false, message: 'treatmentName, date, and timeSlot are required' });
    }

    // Validate slot capacity before creating booking
    if (spaFacilityId && treatmentId) {
      const facility = await SpaFacility.findById(spaFacilityId);
      const treatment = facility?.categories
        ?.flatMap(c => c.treatments || [])
        .find(t => t._id?.toString() === treatmentId);
      const capacityMax = treatment?.capacityMax ?? 2;
      const existingCount = await SpaBooking.countDocuments({
        spaFacilityId,
        treatmentId,
        date,
        timeSlot,
        status: { $ne: 'Cancelled' },
      });
      if (existingCount >= capacityMax) {
        return res.status(400).json({ success: false, message: 'This time slot is fully booked. Please choose another slot.' });
      }
    }

    // The stay is derived server-side; a client-sent mainStayBookingId only counts if it is this guest's own.
    // It drives both the stored mainStayBookingId and the <stayId>-SPA-<n> reference (see utils/hubRef.js).
    const stayId = await resolveGuestStayId({ guestId: req.body.guestId, claimedStayId: req.body.mainStayBookingId });
    const booking = await createWithHubRef({
      Model: SpaBooking, field: 'bookingId', kind: 'spa', stayId,
      data: { ...req.body, mainStayBookingId: stayId ?? undefined, status: 'Pending', paymentStatus: 'pending' },
    });

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
