import express from 'express';
import {
  getAllExperiences,
  getSpotlightExperiences,
  getCraftedExperiences,
  getExperienceById,
  getAvailableSlots,
  createExperienceBookingGuest,
  getGuestExperienceBookings
} from '../controllers/experience.controller.js';
import ExperienceBooking from '../models/ExperienceBooking.model.js';

const router = express.Router();

// Get all experiences with filters
router.get('/', getAllExperiences);

// Get spotlight experiences
router.get('/spotlight', getSpotlightExperiences);

// Get crafted experiences
router.get('/crafted', getCraftedExperiences);

// Get experience by ID
router.get('/:id', getExperienceById);

// Get available slots for an experience on a specific date
router.get('/:id/slots', getAvailableSlots);

// Create experience booking (guest-side)
router.post('/bookings', createExperienceBookingGuest);

// Get experience bookings for a specific guest
router.get('/bookings/guest/:guestId', getGuestExperienceBookings);

// Cancel experience booking (on payment dismiss)
router.delete('/bookings/:id', async (req, res) => {
  try {
    const booking = await ExperienceBooking.findByIdAndUpdate(
      req.params.id,
      { bookingStatus: 'cancelled', cancelledAt: new Date() },
      { new: true }
    );
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Cancel experience booking error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel booking', error: error.message });
  }
});

export default router;
