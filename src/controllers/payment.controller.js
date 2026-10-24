import Razorpay from 'razorpay';
import crypto from 'crypto';
import ExperienceBooking from '../models/ExperienceBooking.model.js';
import SpaBooking from '../models/SpaBooking.model.js';
import TransportBooking from '../models/TransportBooking.model.js';
import DiningReservation from '../models/DiningReservation.model.js';
import Notification from '../models/Notification.model.js';
import Booking from '../models/Booking.model.js';
import { sendGuestBookingEmail, toISTDate } from '../utils/emailService.js';
import PendingCheckout from '../models/PendingCheckout.model.js';
import { CHECKOUT_KINDS, bookAll, loadBookingsByRefs, prepareItem } from '../services/guestCheckout.js';
import { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } from '../config/env.js';

// Find a booking by ID across all booking types
async function findBookingById(id) {
  const exp = await ExperienceBooking.findById(id).catch(() => null);
  if (exp) return { booking: exp, type: 'experience' };
  const spa = await SpaBooking.findById(id).catch(() => null);
  if (spa) return { booking: spa, type: 'spa' };
  const transport = await TransportBooking.findById(id).catch(() => null);
  if (transport) return { booking: transport, type: 'transport' };
  const dining = await DiningReservation.findById(id).catch(() => null);
  if (dining) return { booking: dining, type: 'dining' };
  return null;
}

async function findBookingByOrderId(orderId) {
  const exp = await ExperienceBooking.findOne({ razorpayOrderId: orderId }).catch(() => null);
  if (exp) return exp;
  const spa = await SpaBooking.findOne({ razorpayOrderId: orderId }).catch(() => null);
  if (spa) return spa;
  const transport = await TransportBooking.findOne({ razorpayOrderId: orderId }).catch(() => null);
  if (transport) return transport;
  const dining = await DiningReservation.findOne({ razorpayOrderId: orderId }).catch(() => null);
  return dining;
}

// Lazy initialize Razorpay
let razorpay = null;

const getRazorpayInstance = () => {
  if (!razorpay) {
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay credentials not configured. Please add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to your .env file');
    }
    razorpay = new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET
    });
  }
  return razorpay;
};

const amountOf = (found) =>
  found.type === 'experience' ? found.booking.totalAmount
  : found.type === 'spa' ? found.booking.price
  : found.booking.amount;

/**
 * Start a guest checkout: one or many booking requests (a cart). NOTHING is booked yet unless the whole
 * cart is free.
 *   - everything free  -> booked and confirmed right away          -> { status: 'booked', bookings }
 *   - anything paid    -> a Razorpay order for the cart's total is created and the requests are parked
 *                         in a PendingCheckout; bookings (free and paid together) are created only when
 *                         the payment comes through (verify / webhook) -> { status: 'payment_required', ... }
 * So a guest who closes the payment pop-up leaves no booking behind, and a cart is never half-booked.
 * Body: { guestId, items: [{ kind: 'experience'|'spa'|'dining'|'transport', req: <that hub's booking body> }] }
 */
export const startCheckout = async (req, res) => {
  try {
    const { guestId, items } = req.body;
    if (!guestId) return res.status(400).json({ success: false, message: 'guestId is required' });
    if (!Array.isArray(items) || items.length === 0 || items.length > 25) {
      return res.status(400).json({ success: false, message: 'Nothing to book' });
    }
    const queue = [];
    for (const item of items) {
      if (!item || !CHECKOUT_KINDS.includes(item.kind) || typeof item.req !== 'object' || !item.req) {
        return res.status(400).json({ success: false, message: 'Invalid booking request' });
      }
      queue.push({ kind: item.kind, req: { ...item.req, guestId } });
    }

    // Validate + price every item (saves nothing).
    let total = 0;
    for (const item of queue) {
      const prepared = await prepareItem(item.kind, item.req);
      if (!prepared.ok) return res.status(prepared.status || 400).json({ success: false, message: prepared.message });
      total += prepared.amount;
    }

    if (!(total > 0)) {
      const result = await bookAll(queue, null, undefined);
      if (!result.ok) return res.status(result.status).json({ success: false, message: result.message });
      return res.status(201).json({ success: true, data: { status: 'booked', bookings: result.bookings } });
    }

    const rzp = getRazorpayInstance(); // throws first if Razorpay isn't configured, before anything is saved
    const pending = await PendingCheckout.create({ guestId, items: queue, amount: total });
    let order;
    try {
      order = await rzp.orders.create({
        amount: Math.round(total * 100), // rupees -> paise
        currency: 'INR',
        receipt: pending._id.toString(),
        notes: { pendingCheckout: pending._id.toString(), guestId: String(guestId), items: String(queue.length) },
      });
    } catch (orderError) {
      await PendingCheckout.deleteOne({ _id: pending._id }).catch(() => {});
      throw orderError;
    }
    pending.razorpayOrderId = order.id;
    await pending.save();

    res.status(200).json({
      success: true,
      data: {
        status: 'payment_required',
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        key: RAZORPAY_KEY_ID,
      },
    });
  } catch (error) {
    console.error('Start checkout error:', error);
    res.status(500).json({ success: false, message: 'Failed to start checkout', error: error.message });
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A payment for a checkout order has come through: create every booking in the cart as paid + confirmed.
 * Safe to call twice (verify + webhook race): only one caller does the work, the other gets the same result.
 * If the cart can no longer be booked (slot filled meanwhile, price changed) nothing is booked and the
 * payment is refunded in full.
 * Returns { found:false } when the order isn't a checkout order, else { found:true, ok, bookings | message }.
 */
export async function fulfillCheckout(orderId, { paymentId, signature }) {
  const claimed = await PendingCheckout.findOneAndUpdate(
    { razorpayOrderId: orderId, status: 'created' },
    { status: 'processing', razorpayPaymentId: paymentId },
    { new: true },
  );
  if (!claimed) {
    let existing = await PendingCheckout.findOne({ razorpayOrderId: orderId });
    if (!existing) return { found: false };
    for (let i = 0; i < 20 && existing.status === 'processing'; i++) {
      await sleep(750); // the other caller is mid-way; wait for it to finish
      existing = await PendingCheckout.findOne({ razorpayOrderId: orderId });
    }
    if (existing.status === 'fulfilled') {
      return { found: true, ok: true, bookings: await loadBookingsByRefs(existing.bookingRefs) };
    }
    return { found: true, ok: false, message: existing.failureReason || 'This payment could not be completed.' };
  }

  const result = await bookAll(claimed.items, { orderId, paymentId, signature }, claimed.amount);
  if (result.ok) {
    claimed.status = 'fulfilled';
    claimed.bookingRefs = result.bookings.map((b) => ({ kind: b.__kind, id: b._id }));
    await claimed.save();
    return { found: true, ok: true, bookings: result.bookings };
  }

  // Could not book after taking the money: give it all back.
  let refunded = false;
  try {
    await getRazorpayInstance().payments.refund(paymentId, {
      amount: Math.round(claimed.amount * 100),
      speed: 'normal',
      notes: { reason: result.message.slice(0, 200), pendingCheckout: claimed._id.toString() },
    });
    refunded = true;
  } catch (refundError) {
    console.error('REFUND FAILED - refund this payment manually in Razorpay:', paymentId, refundError);
  }
  claimed.status = 'failed';
  claimed.refunded = refunded;
  claimed.failureReason = refunded
    ? `${result.message} Your payment has been refunded.`
    : `${result.message} Please contact the front desk about your payment.`;
  await claimed.save();
  return { found: true, ok: false, message: claimed.failureReason };
}

/**
 * Create Razorpay order — for one booking (`bookingId`) or a whole cart (`bookingIds`): one order
 * whose amount is the sum of the bookings, so the guest pays once.
 */
export const createOrder = async (req, res) => {
  try {
    const { bookingId, bookingIds } = req.body;
    const ids = [...new Set((Array.isArray(bookingIds) && bookingIds.length ? bookingIds : [bookingId]).filter(Boolean).map(String))];
    if (!ids.length) {
      return res.status(400).json({ success: false, message: 'No booking to pay for' });
    }

    const items = [];
    for (const id of ids) {
      const found = await findBookingById(id);
      if (!found) {
        return res.status(404).json({ success: false, message: 'Booking not found' });
      }
      if (found.booking.paymentStatus === 'paid') {
        return res.status(400).json({ success: false, message: 'This booking is already paid' });
      }
      items.push(found);
    }

    // The amount always comes from the bookings the server created (which already include any
    // dashboard discount and add-ons) — never from the client, so it can't be tampered with.
    const total = items.reduce((sum, f) => sum + (amountOf(f) > 0 ? amountOf(f) : 0), 0);
    if (!(total > 0)) {
      return res.status(400).json({ success: false, message: 'Nothing to pay for this booking' });
    }

    const first = items[0].booking;
    const bookingName = items.length > 1
      ? `${items.length} bookings`
      : items[0].type === 'transport'
      ? `Private Transfer – ${first.guestName || ''}`
      : items[0].type === 'dining'
      ? `${first.facilityName || 'Dining'} – ${first.guestName || ''}`
      : (first.experienceName || first.treatmentName);
    const options = {
      amount: Math.round(total * 100), // Convert rupees to paise
      currency: first.currency || 'INR',
      receipt: (first.bookingId || first._id).toString().slice(0, 40),
      notes: {
        bookingId: items.map((f) => f.booking._id.toString()).join(',').slice(0, 250),
        name: bookingName,
        guestEmail: first.guestEmail || '',
      }
    };

    const razorpayInstance = getRazorpayInstance();
    const order = await razorpayInstance.orders.create(options);

    // Every booking in the order points at it; verify marks them all paid together.
    for (const f of items) {
      f.booking.razorpayOrderId = order.id;
      f.booking.paymentStatus = 'processing';
      await f.booking.save();
    }

    res.status(200).json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        bookingId: first._id,
        bookingIds: items.map((f) => f.booking._id),
        key: RAZORPAY_KEY_ID
      }
    });
  } catch (error) {
    console.error('Create Razorpay order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order',
      error: error.message
    });
  }
};

/**
 * Verify Razorpay payment signature (one booking, or every booking of a cart order)
 */
export const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      bookingId,
      bookingIds
    } = req.body;
    const ids = [...new Set((Array.isArray(bookingIds) && bookingIds.length ? bookingIds : [bookingId]).filter(Boolean).map(String))];

    // Verify HMAC signature
    const text = razorpay_order_id + '|' + razorpay_payment_id;
    const generated_signature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(text)
      .digest('hex');

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }

    // Confirm the payment is actually captured/authorized via Razorpay API
    // (guards against card flows where handler fires before payment completes)
    const rzp = getRazorpayInstance();
    const rzpPayment = await rzp.payments.fetch(razorpay_payment_id);
    if (rzpPayment.status !== 'captured' && rzpPayment.status !== 'authorized') {
      return res.status(400).json({
        success: false,
        message: `Payment not completed (status: ${rzpPayment.status})`
      });
    }

    // A guest checkout (cart): this is the moment its bookings are actually created.
    const fulfilled = await fulfillCheckout(razorpay_order_id, { paymentId: razorpay_payment_id, signature: razorpay_signature });
    if (fulfilled.found) {
      if (!fulfilled.ok) return res.status(409).json({ success: false, message: fulfilled.message });
      return res.status(200).json({ success: true, message: 'Payment verified successfully', data: fulfilled.bookings });
    }

    // Find every booking this payment covers; each must belong to the order that was paid.
    const founds = [];
    for (const id of ids) {
      const f = await findBookingById(id);
      if (!f) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }
      if (f.booking.razorpayOrderId && f.booking.razorpayOrderId !== razorpay_order_id) {
        return res.status(400).json({ success: false, message: 'Payment does not match this booking' });
      }
      founds.push(f);
    }
    if (!founds.length) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const bookings = [];
    for (const f of founds) bookings.push(await confirmPaid(f, razorpay_payment_id, razorpay_signature));

    res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      data: bookings.length === 1 ? bookings[0] : bookings
    });
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment',
      error: error.message
    });
  }
};

// Marks one booking paid + confirmed, then notifies the guest (notification + email).
async function confirmPaid(found, razorpay_payment_id, razorpay_signature) {
    const booking = found.booking;

    booking.paymentStatus = 'paid';
    booking.razorpayPaymentId = razorpay_payment_id;
    booking.razorpaySignature = razorpay_signature;
    booking.paidAt = new Date();

    // Confirm the booking now that payment is verified
    if (found.type === 'experience') {
      booking.bookingStatus = 'confirmed';
    } else if (found.type === 'spa') {
      booking.status = 'Upcoming';
    } else if (found.type === 'dining') {
      booking.status = 'confirmed';
    } else if (found.type === 'transport') {
      booking.status = 'confirmed';
    }

    await booking.save();

    if (booking.guestId) {
      if (found.type === 'experience') {
        Notification.create({
          guestId: booking.guestId,
          title: 'Booking Confirmed!',
          message: `Your booking for "${booking.experienceName}" on ${new Date(booking.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} at ${booking.timeSlot} has been confirmed.`,
          type: 'success',
          relatedId: booking._id.toString(),
          relatedType: 'booking',
        }).catch(() => {});
      } else if (found.type === 'spa') {
        Notification.create({
          guestId: booking.guestId,
          title: 'Spa Booking Confirmed',
          message: `Your ${booking.treatmentName} is booked for ${new Date(booking.date).toDateString()} at ${booking.timeSlot}.`,
          type: 'info',
          relatedId: booking._id.toString(),
          relatedType: 'spa-booking',
        }).catch(() => {});
      }
    }

    // Send booking confirmation email (fire-and-forget)
    // Enrich with main stay details if guestId is available, otherwise send with defaults
    const guestId = booking.guestId;
    const mainStayPromise = guestId
      ? Booking.findOne({ guestId }).sort({ createdAt: -1 }).lean()
      : Promise.resolve(null);

    mainStayPromise.then(mainStay => {
      const checkInDate = mainStay ? toISTDate(mainStay.arrivalDate) : 'N/A';
      const propertyName = mainStay?.propertyName || 'Evolve Back';
      const mainBookingId = mainStay?.bookingId || null;

      if (found.type === 'experience') {
        return sendGuestBookingEmail({
          mainBookingId,
          bookingType: 'Experience',
          guestName: booking.guestName || 'Guest',
          activityName: booking.experienceName,
          bookingDateTime: `${new Date(booking.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} at ${booking.timeSlot}`,
          checkInDate,
          propertyName,
        });
      } else if (found.type === 'spa') {
        return sendGuestBookingEmail({
          mainBookingId,
          bookingType: 'Spa',
          guestName: booking.guestName || 'Guest',
          activityName: booking.treatmentName,
          bookingDateTime: `${booking.date} at ${booking.timeSlot}`,
          checkInDate,
          propertyName,
        });
      } else if (found.type === 'dining') {
        return sendGuestBookingEmail({
          mainBookingId,
          bookingType: 'Dining',
          guestName: booking.guestName || 'Guest',
          activityName: booking.facilityName || 'Dining',
          bookingDateTime: booking.date,
          checkInDate,
          propertyName,
        });
      } else if (found.type === 'transport') {
        return sendGuestBookingEmail({
          mainBookingId,
          bookingType: 'Transport',
          guestName: booking.guestName || 'Guest',
          activityName: 'Private Transfer',
          bookingDateTime: booking.checkInDate ? toISTDate(booking.checkInDate) : 'N/A',
          checkInDate,
          propertyName,
        });
      }
    }).catch(emailErr => console.error('Failed to send booking confirmation email:', emailErr));

    return booking;
}

/**
 * Razorpay webhook handler
 */
export const handleWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const body = JSON.stringify(req.body);

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (signature !== expectedSignature) {
      return res.status(400).json({
        success: false,
        message: 'Invalid webhook signature'
      });
    }

    const event = req.body.event;
    const payload = req.body.payload.payment.entity;

    // Handle payment success
    if (event === 'payment.captured') {
      const orderId = payload.order_id;
      const paymentId = payload.id;

      // A guest checkout whose guest never made it back to the app (closed the tab after paying):
      // the bookings are created here instead.
      const fulfilled = await fulfillCheckout(orderId, { paymentId, signature: null });
      if (fulfilled.found) {
        console.log(`Checkout ${orderId}: ${fulfilled.ok ? 'booked' : 'not booked - ' + fulfilled.message}`);
        return res.status(200).json({ success: true });
      }

      // Find booking by order ID
      const booking = await findBookingByOrderId(orderId);

      if (booking && booking.paymentStatus !== 'paid') {
        booking.paymentStatus = 'paid';
        booking.razorpayPaymentId = paymentId;
        booking.paidAt = new Date();
        await booking.save();

        console.log(`Payment captured for booking ${booking.bookingId}`);
      }
    }

    // Handle payment failure
    if (event === 'payment.failed') {
      const orderId = payload.order_id;

      const booking = await findBookingByOrderId(orderId);

      if (booking) {
        booking.paymentStatus = 'failed';
        await booking.save();

        console.log(`Payment failed for booking ${booking.bookingId}`);
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed',
      error: error.message
    });
  }
};

/**
 * Get payment status
 */
export const getPaymentStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const found = await findBookingById(bookingId);
    if (!found) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    const booking = found.booking;

    res.status(200).json({
      success: true,
      data: {
        bookingId: booking._id,
        paymentStatus: booking.paymentStatus,
        razorpayOrderId: booking.razorpayOrderId,
        razorpayPaymentId: booking.razorpayPaymentId,
        paidAt: booking.paidAt,
        totalAmount: booking.totalAmount,
        currency: booking.currency
      }
    });
  } catch (error) {
    console.error('Get payment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve payment status',
      error: error.message
    });
  }
};
