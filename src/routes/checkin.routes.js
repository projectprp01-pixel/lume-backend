import express from 'express';
import upload from '../middleware/upload.js';
import CheckIn from '../models/CheckIn.model.js';
import {
  getBookingByToken,
  updateConsent,
  initializeCheckIn,
  uploadGuestID,
  completeCheckIn,
  getCheckInStatus
} from '../controllers/checkin.controller.js';

const router = express.Router();

// Get booking details by token
router.get('/booking/:token', getBookingByToken);

// Look up most recent check-in by guestId (cross-device sync) — must be before /:checkInId wildcards
router.get('/by-guest', async (req, res) => {
  try {
    const { guestId } = req.query;
    if (!guestId) return res.status(400).json({ success: false, message: 'guestId required' });
    const checkIn = await CheckIn.findOne({ guestId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: checkIn || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update guest consent
router.put('/consent/:guestId', updateConsent);

// Initialize check-in session
router.post('/initialize', initializeCheckIn);

// Upload guest ID documents (requires both front and back)
router.post(
  '/:checkInId/upload-id',
  upload.fields([
    { name: 'idFront', maxCount: 1 },
    { name: 'idBack', maxCount: 1 }
  ]),
  uploadGuestID
);

// Complete check-in (submit for review)
router.post('/:checkInId/complete', completeCheckIn);

// Get check-in status
router.get('/:checkInId/status', getCheckInStatus);

export default router;
