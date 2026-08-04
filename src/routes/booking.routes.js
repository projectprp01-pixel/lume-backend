import express from 'express';
import {
  createBooking,
  getGuestBookings,
  getBookingById,
  updatePaymentStatus,
  cancelBooking
} from '../controllers/booking.controller.js';

const router = express.Router();

// Create new booking
router.post('/create', createBooking);

// Get bookings for a guest
router.get('/guest/:guestId', getGuestBookings);

// Get booking by ID
router.get('/:id', getBookingById);

// Update payment status
router.put('/:id/payment', updatePaymentStatus);

// Cancel booking
router.put('/:id/cancel', cancelBooking);

export default router;
