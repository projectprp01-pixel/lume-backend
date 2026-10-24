import Notification from '../models/Notification.model.js';
import Booking from '../models/Booking.model.js';
import ExperienceBooking from '../models/ExperienceBooking.model.js';
import SpaBooking from '../models/SpaBooking.model.js';
import DiningReservation from '../models/DiningReservation.model.js';
import TransportBooking from '../models/TransportBooking.model.js';
import { createWithHubRef } from '../utils/hubRef.js';
import { sendGuestBookingEmail, toISTDate } from '../utils/emailService.js';

// Guest-side booking, in one place.
//
// RULE: a guest booking only ever exists as paid + confirmed. A complimentary booking is created (and
// confirmed) immediately; a paid one is created ONLY after its payment has come through - there is no
// "pending payment" booking, so a guest who closes the payment pop-up leaves nothing behind. A cart is
// all-or-nothing: free and paid items are booked together once the payment lands, never partially.
//
// Each hub controller exposes prepare*(body) -> { ok:false, status, message } | { ok:true, kind, amount, doc },
// which validates and prices a request without saving. This file turns prepared requests into bookings.

export const CHECKOUT_KINDS = ['experience', 'spa', 'dining', 'transport'];

// Resolved lazily: the controllers import persistPrepared from this file, so they can't be imported at load time.
async function preparer(kind) {
  switch (kind) {
    case 'experience':
      return (await import('../controllers/experience.controller.js')).prepareExperienceBooking;
    case 'spa':
      return (await import('../controllers/guest/spa.controller.js')).prepareSpaBooking;
    case 'dining':
      return (await import('../controllers/guest/dining.controller.js')).prepareDiningReservation;
    case 'transport':
      return (await import('../controllers/guest/transport.controller.js')).prepareTransportBooking;
    default:
      return null;
  }
}

/** Validate + price one request without saving anything. */
export async function prepareItem(kind, body) {
  const fn = await preparer(kind);
  if (!fn) return { ok: false, status: 400, message: `Unknown booking type "${kind}"` };
  return fn(body);
}

// What "paid and confirmed" means on each hub's own status field.
const CONFIRMED = {
  experience: { bookingStatus: 'confirmed' },
  spa: { status: 'Upcoming' },
  dining: { status: 'confirmed' },
  transport: { status: 'confirmed' },
};

/**
 * Save a prepared request as a paid + confirmed booking. `payment` = { orderId, paymentId, signature } for
 * a booking that was part of a Razorpay payment, omitted for a complimentary one. `notify: false` lets a
 * cart hold the guest notifications back until every item has been created.
 */
export async function persistPrepared(prepared, payment, { notify = true } = {}) {
  const { Model, field, hubKind, stayId, data } = prepared.doc;
  const paidFields = payment
    ? {
        razorpayOrderId: payment.orderId,
        razorpayPaymentId: payment.paymentId,
        razorpaySignature: payment.signature || undefined,
        paidAt: new Date(),
      }
    : {};
  const booking = await createWithHubRef({
    Model,
    field,
    kind: hubKind,
    stayId,
    data: { ...data, ...CONFIRMED[prepared.kind], paymentStatus: 'paid', ...paidFields },
  });
  booking.__kind = prepared.kind; // not persisted (not in the schema); lets callers tell the hubs apart
  if (notify) await notifyBooked(prepared.kind, booking);
  return booking;
}

/**
 * Book a whole cart: validate -> create each item in turn (each sees the previous ones, so two items can't
 * both take the last slot) -> notify. If anything fails every booking already created for this cart is
 * deleted, so the cart is all-or-nothing. `expectedAmount` (rupees) is the total that was charged; if the
 * re-priced total differs, the cart is rejected rather than booked at a different price.
 */
export async function bookAll(items, payment, expectedAmount) {
  const created = [];
  const rollback = async () => {
    for (const b of created) await b.constructor.deleteOne({ _id: b._id }).catch(() => {});
  };
  try {
    let total = 0;
    for (const item of items) {
      const prepared = await prepareItem(item.kind, item.req);
      if (!prepared.ok) {
        await rollback();
        return { ok: false, status: prepared.status || 400, message: prepared.message };
      }
      total += prepared.amount;
      created.push(await persistPrepared(prepared, payment, { notify: false }));
    }
    if (expectedAmount != null && Math.abs(total - expectedAmount) > 0.5) {
      await rollback();
      return { ok: false, status: 409, message: 'Prices changed while you were paying, so nothing was booked.' };
    }
    if (expectedAmount == null && total > 0) {
      await rollback();
      return { ok: false, status: 409, message: 'This booking now needs payment. Please try again.' };
    }
  } catch (error) {
    await rollback();
    console.error('Book cart error:', error);
    return { ok: false, status: 500, message: 'Could not complete the booking.' };
  }
  for (const b of created) await notifyBooked(b.__kind, b).catch((e) => console.error('Booking notification failed:', e));
  return { ok: true, bookings: created };
}

const MODELS = { experience: ExperienceBooking, spa: SpaBooking, dining: DiningReservation, transport: TransportBooking };

/** Re-load the bookings a fulfilled checkout produced (for a repeated verify / webhook). */
export async function loadBookingsByRefs(refs) {
  const out = [];
  for (const r of refs || []) {
    const doc = await MODELS[r.kind]?.findById(r.id);
    if (doc) {
      doc.__kind = r.kind;
      out.push(doc);
    }
  }
  return out;
}

// Guest notification + staff email for a confirmed booking.
export async function notifyBooked(kind, booking) {
  if (booking.guestId) {
    if (kind === 'experience') {
      await Notification.create({
        guestId: booking.guestId,
        title: 'Booking Confirmed!',
        message: `Your booking for "${booking.experienceName}" on ${new Date(booking.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} at ${booking.timeSlot} has been confirmed.`,
        type: 'success',
        relatedId: booking._id.toString(),
        relatedType: 'booking',
      }).catch(() => {});
    } else if (kind === 'spa') {
      await Notification.create({
        guestId: booking.guestId,
        title: 'Spa Booking Confirmed',
        message: `Your ${booking.treatmentName} is booked for ${new Date(booking.date).toDateString()} at ${booking.timeSlot}.`,
        type: 'info',
        relatedId: booking._id.toString(),
        relatedType: 'spa-booking',
      }).catch(() => {});
    } else if (kind === 'transport') {
      await Notification.create({
        guestId: booking.guestId,
        title: 'Transfer Booking Confirmed',
        message: 'Your transfer booking is confirmed.',
        type: 'success',
        relatedId: booking._id.toString(),
        relatedType: 'transport-booking',
      }).catch(() => {});
    }
  }

  // Staff confirmation email (fire-and-forget; never blocks the booking)
  const mainStayPromise = booking.guestId
    ? Booking.findOne({ guestId: booking.guestId }).sort({ createdAt: -1 }).lean()
    : Promise.resolve(null);
  mainStayPromise
    .then((mainStay) => {
      const base = {
        mainBookingId: mainStay?.bookingId || null,
        guestName: booking.guestName || 'Guest',
        checkInDate: mainStay ? toISTDate(mainStay.arrivalDate) : 'N/A',
        propertyName: mainStay?.propertyName || 'Evolve Back',
      };
      if (kind === 'experience') {
        return sendGuestBookingEmail({
          ...base,
          bookingType: 'Experience',
          activityName: booking.experienceName,
          bookingDateTime: `${new Date(booking.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} at ${booking.timeSlot}`,
        });
      }
      if (kind === 'spa') {
        return sendGuestBookingEmail({
          ...base,
          bookingType: 'Spa',
          activityName: booking.treatmentName,
          bookingDateTime: `${booking.date} at ${booking.timeSlot}`,
        });
      }
      if (kind === 'dining') {
        return sendGuestBookingEmail({
          ...base,
          bookingType: 'Dining',
          activityName: booking.facilityName || 'Dining',
          bookingDateTime: booking.date,
        });
      }
      if (kind === 'transport') {
        return sendGuestBookingEmail({
          ...base,
          bookingType: 'Transport',
          activityName: 'Private Transfer',
          bookingDateTime: booking.checkInDate ? toISTDate(booking.checkInDate) : 'N/A',
        });
      }
    })
    .catch((emailErr) => console.error('Failed to send booking confirmation email:', emailErr));
}
