import Booking from '../models/Booking.model.js';

/**
 * Every hub's "Add Booking" form (Spa, Transport, Experiences, F&B) lets staff attach the
 * booking to the guest's actual hotel stay by its human-readable Booking.bookingId (the same
 * ID Check-in Hub and Guest Management already key off). Centralizing the lookup here means all
 * four hubs enforce the same required-and-valid link instead of each trusting free-typed
 * guestName/room fields independently — see the "coherent booking system" discussion this
 * resolves.
 */
export async function resolveMainStayBooking(mainStayBookingId) {
  const trimmed = String(mainStayBookingId ?? '').trim();
  if (!trimmed) {
    return { error: { status: 400, message: 'mainStayBookingId is required — link this booking to the guest\'s stay.' } };
  }
  const booking = await Booking.findOne({ bookingId: trimmed }).lean();
  if (!booking) {
    return { error: { status: 404, message: `No stay booking found for ID "${trimmed}". Check the ID and try again.` } };
  }
  return { booking };
}

/**
 * Pushes a Booking's current room number to every active (not cancelled/completed) hub booking
 * linked to it via mainStayBookingId, so reassigning a room in Check-in Hub doesn't leave Spa/
 * Transport/Experience/Dining bookings pointing at a stale room. Called from assignCheckInRoom.
 */
export async function propagateRoomToLinkedBookings(bookingId, roomNumber) {
  const [{ default: SpaBooking }, { default: TransportBooking }, { default: ExperienceBooking }, { default: DiningReservation }] =
    await Promise.all([
      import('../models/SpaBooking.model.js'),
      import('../models/TransportBooking.model.js'),
      import('../models/ExperienceBooking.model.js'),
      import('../models/DiningReservation.model.js'),
    ]);

  await Promise.all([
    SpaBooking.updateMany(
      { mainStayBookingId: bookingId, status: { $nin: ['Cancelled', 'Completed'] } },
      { $set: { room: roomNumber } }
    ),
    TransportBooking.updateMany(
      { mainStayBookingId: bookingId, status: { $ne: 'cancelled' } },
      { $set: { room: roomNumber, roomNumber } }
    ),
    ExperienceBooking.updateMany(
      { mainStayBookingId: bookingId, bookingStatus: { $nin: ['cancelled', 'completed'] } },
      { $set: { room: roomNumber } }
    ),
    DiningReservation.updateMany(
      { mainStayBookingId: bookingId, status: { $ne: 'cancelled' } },
      { $set: { roomNumber } }
    ),
  ]);
}
