import Booking from '../models/Booking.model.js';
import { sendStaffCancellationEmail, toISTDate } from './emailService.js';

/**
 * Fire-and-forget notification to staff when a guest-facing booking is cancelled.
 * Looks up the guest's main stay booking for context, then emails the acting staff member.
 */
export function notifyStaffCancellation({ guestId, bookingType, guestName, bookingDateTime, staff, cancelledAt }) {
  (guestId
    ? Booking.findOne({ guestId }).sort({ createdAt: -1 }).lean()
    : Promise.resolve(null)
  ).then(mainStay => sendStaffCancellationEmail({
    mainBookingId: mainStay?.bookingId || null,
    bookingType,
    guestName: guestName || 'Guest',
    bookingDateTime,
    checkInDate: mainStay ? toISTDate(mainStay.arrivalDate) : 'N/A',
    staffName: `${staff.firstName} ${staff.lastName}`,
    staffEmail: staff.email,
    cancelledAt,
    propertyName: mainStay?.propertyName || 'Evolve Back',
  })).catch(emailErr => console.error(`Failed to send ${bookingType.toLowerCase()} cancellation email:`, emailErr));
}
