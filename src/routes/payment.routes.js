import express from 'express';
import {
  createOrder,
  verifyPayment,
  handleWebhook,
  getPaymentStatus
} from '../controllers/payment.controller.js';

const router = express.Router();

// Create Razorpay order
router.post('/create-order', createOrder);

// Verify payment
router.post('/verify', verifyPayment);

// Razorpay webhook
router.post('/webhook', handleWebhook);

// Get payment status
router.get('/status/:bookingId', getPaymentStatus);

export default router;
