import CheckIn from '../../models/CheckIn.model.js';
import SpaBooking from '../../models/SpaBooking.model.js';
import TransportBooking from '../../models/TransportBooking.model.js';
import ExperienceBooking from '../../models/ExperienceBooking.model.js';
import DiningReservation from '../../models/DiningReservation.model.js';
import { resolveMainStayBooking } from '../../utils/mainStay.js';

/**
 * Used by every hub's "Add Booking" dialog (Spa, Transport, Experiences, F&B) to verify a
 * staff-entered Booking ID against the real stay and preview the guest name/room it resolves to,
 * before the booking is actually created against that ID.
 */
export const lookupMainStayBooking = async (req, res) => {
  try {
    const { bookingId } = req.query;
    const { booking, error } = await resolveMainStayBooking(bookingId);
    if (error) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    res.status(200).json({
      success: true,
      data: {
        bookingId: booking.bookingId,
        guestName: booking.primaryGuestName,
        room: booking.roomNumber || '',
        propertyId: booking.propertyId,
        arrivalDate: booking.arrivalDate,
        checkoutDate: booking.checkoutDate,
      },
    });
  } catch (error) {
    console.error('Lookup main stay booking error:', error);
    res.status(500).json({ success: false, message: 'Failed to look up booking', error: error.message });
  }
};

/**
 * "Everything about this guest's stay, one fetch." Spa/Transport/Experience/Dining stay as
 * separate collections — each hub's own table still needs to list/filter/paginate across every
 * guest independently (rewriting those into one embedded-array document would break that) — but
 * they all share the exact same identifying value (mainStayBookingId === Booking.bookingId ===
 * CheckIn.bookingId), so fanning out across them by that one key gives a single combined view
 * without duplicating any data. This is the reference/lookup-by-shared-key pattern; embedding
 * would only pay off if nothing but this single-guest view ever needed to query these bookings.
 */
export const getStayActivity = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { booking: stay, error } = await resolveMainStayBooking(bookingId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const [checkIn, spaBookings, transportBookings, experienceBookings, diningReservations] = await Promise.all([
      CheckIn.findOne({ bookingId: stay.bookingId }).lean(),
      SpaBooking.find({ mainStayBookingId: stay.bookingId }).sort({ date: -1 }).lean(),
      TransportBooking.find({ mainStayBookingId: stay.bookingId }).sort({ checkInDate: -1 }).lean(),
      ExperienceBooking.find({ mainStayBookingId: stay.bookingId }).sort({ date: -1 }).lean(),
      DiningReservation.find({ mainStayBookingId: stay.bookingId }).sort({ date: -1 }).lean(),
    ]);

    res.status(200).json({
      success: true,
      data: { stay, checkIn, spaBookings, transportBookings, experienceBookings, diningReservations },
    });
  } catch (error) {
    console.error('Get stay activity error:', error);
    res.status(500).json({ success: false, message: 'Failed to load stay activity', error: error.message });
  }
};
