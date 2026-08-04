import Razorpay from 'razorpay';
import crypto from 'crypto';
import ExperienceBooking from '../models/ExperienceBooking.model.js';
import SpaBooking from '../models/SpaBooking.model.js';
import TransportBooking from '../models/TransportBooking.model.js';
import DiningReservation from '../models/DiningReservation.model.js';
import Notification from '../models/Notification.model.js';
import Booking from '../models/Booking.model.js';
import { sendGuestBookingEmail, toISTDate } from '../utils/emailService.js';
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

/**
 * Create Razorpay order
 */
export const createOrder = async (req, res) => {
  try {
    const { bookingId, amount } = req.body;

    // Validate booking exists (experience or spa)
    const found = await findBookingById(bookingId);
    if (!found) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    const booking = found.booking;
    const bookingType = found.type;

    const receiptId = (booking.bookingId || booking._id).toString();
    const bookingName = bookingType === 'transport'
      ? `Private Transfer – ${booking.guestName || ''}`
      : bookingType === 'dining'
      ? `${booking.facilityName || 'Dining'} – ${booking.guestName || ''}`
      : (booking.experienceName || booking.treatmentName);
    const options = {
      amount: Math.round(amount * 100), // Convert rupees to paise
      currency: booking.currency || 'INR',
      receipt: receiptId,
      notes: {
        bookingId: booking._id.toString(),
        name: bookingName,
        guestEmail: booking.guestEmail || '',
      }
    };

    const razorpayInstance = getRazorpayInstance();
    const order = await razorpayInstance.orders.create(options);

    // Update booking with order ID
    booking.razorpayOrderId = order.id;
    booking.paymentStatus = 'processing';
    await booking.save();

    res.status(200).json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        bookingId: booking._id,
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
 * Verify Razorpay payment signature
 */
export const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      bookingId
    } = req.body;

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

    // Update booking (experience or spa)
    const found = await findBookingById(bookingId);
    if (!found) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
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

    res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      data: booking
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
