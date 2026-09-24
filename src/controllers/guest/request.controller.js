import Booking from '../../models/Booking.model.js';
import Guest from '../../models/Guest.model.js';
import ServiceRequest from '../../models/ServiceRequest.model.js';
import { sendWriteToUsEmail } from '../../utils/emailService.js';
import { routeRequest } from '../../ai/classifyRequest.js';

/**
 * Create a guest request (Write to Us)
 * Body: { guestId, content }
 */
export const createGuestRequest = async (req, res) => {
  try {
    const { guestId, content } = req.body;

    if (!guestId || !content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'guestId and content are required' });
    }

    const guest = await Guest.findById(guestId);
    const booking = await Booking.findOne({ guestId }).sort({ createdAt: -1 }).lean();

    const propertyId = booking?.propertyId || 'default';
    // Department comes from the live Staff Management list via the AI layer; with no AI
    // suggestion it falls back to the first department (see src/ai/classifyRequest.js).
    const { department, routing } = await routeRequest(propertyId, content.trim());

    const request = await ServiceRequest.create({
      item: content.trim(),
      category: 'Guest Services',
      department,
      routing,
      source: 'App',
      guestId,
      guestName: guest ? guest.fullName : '',
      roomNumber: guest ? (guest.roomNumber || '') : '',
      bookingId: booking?.bookingId || '',
      propertyId,
      status: 'Pending'
    });

    Booking.findOne({ guestId }).sort({ createdAt: -1 }).lean()
      .then(mainStay => sendWriteToUsEmail({
        mainBookingId: mainStay?.bookingId || null,
        guestName: guest ? guest.fullName : 'Guest',
        guestEmail: guest ? guest.email : '',
        submittedAt: new Date(),
        message: content.trim(),
        propertyName: mainStay?.propertyName || 'Evolve Back',
      }))
      .catch(emailErr => console.error('Failed to send write-to-us email:', emailErr));

    res.status(201).json({ success: true, data: request });

  } catch (error) {
    console.error('Create guest request error:', error);
    res.status(500).json({ success: false, message: 'Failed to create request', error: error.message });
  }
};

/**
 * Get guest's own requests
 * Query: guestId (required)
 */
export const getGuestRequests = async (req, res) => {
  try {
    const { guestId } = req.query;

    if (!guestId) {
      return res.status(400).json({ success: false, message: 'guestId is required' });
    }

    const requests = await ServiceRequest.find({ guestId })
      .sort({ createdAt: -1 })
      .limit(20);

    res.status(200).json({ success: true, count: requests.length, data: requests });
  } catch (error) {
    console.error('Get guest requests error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve requests', error: error.message });
  }
};
