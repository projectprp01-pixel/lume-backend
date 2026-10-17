import express from 'express';
import {
  startCheckout,
  createOrder,
  verifyPayment,
  handleWebhook,
  getPaymentStatus
} from '../controllers/payment.controller.js';

const router = express.Router();

// Guest checkout (cart): books a free cart straight away; otherwise opens a Razorpay order and books
// everything only after the payment comes through
router.post('/checkout', startCheckout);

// Create Razorpay order (legacy: for bookings that already exist)
router.post('/create-order', createOrder);

// Verify payment
router.post('/verify', verifyPayment);

// Razorpay webhook
router.post('/webhook', handleWebhook);

// Get payment status
router.get('/status/:bookingId', getPaymentStatus);

export default router;
