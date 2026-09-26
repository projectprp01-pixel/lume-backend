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
 * The stay a GUEST-side booking belongs to, derived server-side so a client can never attach a booking
 * to a stay it does not own. A `claimedStayId` sent by the client is honoured only if that stay really
 * belongs to this guest (a guest can have several stays); otherwise — or if none was sent — the guest's
 * most recent stay is used. Returns the human Booking ID (EB-…), or null when the guest has no stay
 * (or no guestId was sent, in which case nothing can be derived and nothing is guessed).
 */
export async function resolveGuestStayId({ guestId, claimedStayId } = {}) {
  if (!guestId) return null;
  const claimed = String(claimedStayId ?? '').trim();
  if (claimed) {
    const owned = await Booking.findOne({ bookingId: claimed, guestId }).select('bookingId').lean().catch(() => null);
    if (owned) return owned.bookingId;
  }
  const latest = await Booking.findOne({ guestId }).sort({ createdAt: -1 }).select('bookingId').lean().catch(() => null);
  return latest?.bookingId ?? null;
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
