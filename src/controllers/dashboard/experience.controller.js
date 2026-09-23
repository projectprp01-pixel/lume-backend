import Experience from '../../models/Experience.model.js';
import ExperienceBooking from '../../models/ExperienceBooking.model.js';
import ExperienceDiscount from '../../models/ExperienceDiscount.model.js';
import Guest from '../../models/Guest.model.js';
import { uploadToR2 } from '../../utils/r2Upload.js';
import { remuxForFaststart } from '../../utils/videoProcessing.js';
import { notifyStaffCancellation } from '../../utils/staffCancellationNotifier.js';
import { resolveMainStayBooking } from '../../utils/mainStay.js';

// ==================== EXPERIENCE HUB ====================

/**
 * Get all experiences (for dashboard - includes inactive)
 */
export const getAllExperiences = async (req, res) => {
  try {
    const { propertyId } = req.query;

    const filter = {};
    if (propertyId) filter.propertyId = propertyId;

    // Dashboard needs all experiences including inactive ones
    const experiences = await Experience.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: experiences.length,
      data: experiences
    });
  } catch (error) {
    console.error('Get all experiences error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve experiences',
      error: error.message
    });
  }
};

/**
 * Get all experience bookings (for booking details view)
 */
export const getExperienceBookings = async (req, res) => {
  try {
    const { date, propertyId, status } = req.query;

    // Previously hardcoded to bookingStatus in ['confirmed','completed','no-show'], which
    // silently hid cancelled bookings from the dashboard. The Experience Hub table shows
    // cancelled bookings inline (greyed out), same as Spa Hub — see getSpaBookings.
    const filter = {};

    if (date) {
      const targetDate = new Date(date);
      const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));
      filter.date = { $gte: startOfDay, $lte: endOfDay };
    }

    if (status) {
      filter.bookingStatus = status;
    }

    const bookings = await ExperienceBooking.find(filter)
      .populate('experienceId')
      .populate('guestId')
      .sort({ date: -1, timeSlot: 1 });

    // Filter by propertyId if provided
    let filteredBookings = bookings;
    if (propertyId) {
      filteredBookings = bookings.filter(
        booking => booking.experienceId && booking.experienceId.propertyId === propertyId
      );
    }

    res.status(200).json({
      success: true,
      count: filteredBookings.length,
      data: filteredBookings
    });
  } catch (error) {
    console.error('Get experience bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve experience bookings',
      error: error.message
    });
  }
};

/**
 * Create manual experience booking (by staff)
 */
export const createManualBooking = async (req, res) => {
  try {
    const {
      bookingId: refInput,
      experienceId,
      date,
      timeSlot,
      numberOfGuests,
      adminNotes,
      mainStayBookingId,
      addons,
      price, // optional override — staff can type "Complimentary"/a custom amount in the Add Booking modal
      paymentStatus,
    } = req.body;

    const experience = await Experience.findById(experienceId);
    if (!experience) {
      return res.status(404).json({
        success: false,
        message: 'Experience not found'
      });
    }

    // Link to the guest's real stay — see docs/backend-integration.md's "coherent booking
    // system" note. guestName/room/contact info are derived from it, not free-typed, so this hub
    // can't drift from what Check-in Hub/Guest Management show for the same guest.
    const { booking: mainStay, error: mainStayError } = await resolveMainStayBooking(mainStayBookingId);
    if (mainStayError) return res.status(mainStayError.status).json({ success: false, message: mainStayError.message });
    const guest = mainStay.guestId ? await Guest.findById(mainStay.guestId).lean() : null;

    // Staff can type/edit their own booking ref (Experience Hub's "Add Booking" modal);
    // fall back to a generated one if left blank, same as before.
    const bookingId = refInput && String(refInput).trim()
      ? String(refInput).trim()
      : `MANUAL-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;

    // Calculate pricing — an explicit price override (from the dashboard form) wins over the
    // experience's own stored pricing, same pattern as Transport Hub's createTransportHubBooking.
    let unitPrice;
    let totalAmount;
    if (price !== undefined && price !== null && String(price).trim() !== '') {
      const parsed = parseFloat(String(price).replace(/[^0-9.]/g, ''));
      unitPrice = Number.isNaN(parsed) ? 0 : parsed;
      totalAmount = unitPrice;
    } else {
      const slot = experience.timeSlots.find(s => s.time === timeSlot);
      unitPrice = experience.pricing.basePrice + (experience.pricing.basePrice * ((slot?.priceModifier || 0) / 100));
      totalAmount = unitPrice * (numberOfGuests || 1);
    }

    const booking = await ExperienceBooking.create({
      bookingId,
      experienceId,
      experienceName: experience.title,
      date: new Date(date),
      timeSlot,
      numberOfGuests: numberOfGuests || 1,
      unitPrice,
      totalAmount,
      currency: experience.pricing.currency,
      guestName: mainStay.primaryGuestName,
      guestEmail: guest?.email,
      guestPhone: guest?.mobileNumber,
      // Manual bookings default to Payment Pending — staff mark it Completed once they've
      // collected payment, same as the prototype's Add Booking modal.
      paymentStatus: paymentStatus === 'paid' ? 'paid' : 'pending',
      bookingStatus: 'confirmed',
      adminNotes,
      mainStayBookingId: mainStay.bookingId,
      guestId: mainStay.guestId,
      room: mainStay.roomNumber || '',
      source: 'staff',
      addons: Array.isArray(addons) ? addons : [],
    });

    res.status(201).json({
      success: true,
      message: 'Manual booking created successfully',
      data: booking
    });
  } catch (error) {
    console.error('Create manual booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create manual booking',
      error: error.message
    });
  }
};

/**
 * Set experience booking payment status (dashboard payment pill flow)
 */
export const setExperienceBookingPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus } = req.body;
    if (!['paid', 'pending'].includes(paymentStatus)) {
      return res.status(400).json({ success: false, message: "paymentStatus must be 'paid' or 'pending'" });
    }
    const booking = await ExperienceBooking.findByIdAndUpdate(id, { paymentStatus }, { new: true, runValidators: true });
    if (!booking) return res.status(404).json({ success: false, message: 'Experience booking not found' });
    res.status(200).json({ success: true, data: booking });
  } catch (error) {
    console.error('Set experience booking payment error:', error);
    res.status(500).json({ success: false, message: 'Failed to update payment status', error: error.message });
  }
};

/**
 * Assign a room to an experience booking
 */
export const assignExperienceBookingRoom = async (req, res) => {
  try {
    const { id } = req.params;
    const { room } = req.body;
    if (!room || !String(room).trim()) {
      return res.status(400).json({ success: false, message: 'room is required' });
    }
    const booking = await ExperienceBooking.findByIdAndUpdate(id, { room: String(room).trim() }, { new: true, runValidators: true });
    if (!booking) return res.status(404).json({ success: false, message: 'Experience booking not found' });
    res.status(200).json({ success: true, data: booking });
  } catch (error) {
    console.error('Assign experience booking room error:', error);
    res.status(500).json({ success: false, message: 'Failed to assign room', error: error.message });
  }
};

/**
 * Set blocked date ranges on an experience
 */
export const updateExperienceBlockDates = async (req, res) => {
  try {
    const { id } = req.params;
    const { blockedRanges } = req.body;
    if (!Array.isArray(blockedRanges)) {
      return res.status(400).json({ success: false, message: 'blockedRanges must be an array' });
    }
    const experience = await Experience.findByIdAndUpdate(id, { blockedRanges }, { new: true, runValidators: true });
    if (!experience) return res.status(404).json({ success: false, message: 'Experience not found' });
    res.status(200).json({ success: true, data: experience });
  } catch (error) {
    console.error('Update experience block dates error:', error);
    res.status(500).json({ success: false, message: 'Failed to update block dates', error: error.message });
  }
};

// ==================== DISCOUNTS & PROMOTIONS ====================

export const getExperienceDiscounts = async (req, res) => {
  try {
    const { propertyId } = req.query;
    const filter = {};
    if (propertyId) filter.propertyId = propertyId;
    const discounts = await ExperienceDiscount.find(filter).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: discounts.length, data: discounts });
  } catch (error) {
    console.error('Get experience discounts error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve discounts', error: error.message });
  }
};

export const createExperienceDiscount = async (req, res) => {
  try {
    const discount = await ExperienceDiscount.create(req.body);
    res.status(201).json({ success: true, message: 'Discount created', data: discount });
  } catch (error) {
    console.error('Create experience discount error:', error);
    res.status(500).json({ success: false, message: 'Failed to create discount', error: error.message });
  }
};

export const updateExperienceDiscount = async (req, res) => {
  try {
    const { id } = req.params;
    const discount = await ExperienceDiscount.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
    if (!discount) return res.status(404).json({ success: false, message: 'Discount not found' });
    res.status(200).json({ success: true, message: 'Discount updated', data: discount });
  } catch (error) {
    console.error('Update experience discount error:', error);
    res.status(500).json({ success: false, message: 'Failed to update discount', error: error.message });
  }
};

export const deleteExperienceDiscount = async (req, res) => {
  try {
    const { id } = req.params;
    const discount = await ExperienceDiscount.findByIdAndDelete(id);
    if (!discount) return res.status(404).json({ success: false, message: 'Discount not found' });
    res.status(200).json({ success: true, message: 'Discount deleted' });
  } catch (error) {
    console.error('Delete experience discount error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete discount', error: error.message });
  }
};

/**
 * Cancel an experience booking
 */
export const cancelExperienceBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const cancelledAt = new Date();
    const booking = await ExperienceBooking.findByIdAndUpdate(
      bookingId,
      {
        bookingStatus: 'cancelled',
        cancelledAt,
        cancellationReason: req.body.reason || '',
      },
      { new: true }
    );
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    notifyStaffCancellation({
      guestId: booking.guestId,
      bookingType: 'Experience',
      guestName: booking.guestName,
      bookingDateTime: `${new Date(booking.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} at ${booking.timeSlot}`,
      staff: req.staff,
      cancelledAt,
    });
    res.status(200).json({ success: true, data: booking });
  } catch (error) {
    console.error('Cancel experience booking error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel booking', error: error.message });
  }
};

/**
 * Create new experience
 */
export const createExperience = async (req, res) => {
  try {
    const experience = await Experience.create(req.body);

    res.status(201).json({
      success: true,
      message: 'Experience created successfully',
      data: experience
    });
  } catch (error) {
    console.error('Create experience error:', error);

    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: errors.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create experience',
      error: error.message
    });
  }
};

/**
 * Update experience
 */
export const updateExperience = async (req, res) => {
  try {
    const { id } = req.params;

    const experience = await Experience.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true
    });

    if (!experience) {
      return res.status(404).json({
        success: false,
        message: 'Experience not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Experience updated successfully',
      data: experience
    });
  } catch (error) {
    console.error('Update experience error:', error);

    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: errors.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update experience',
      error: error.message
    });
  }
};

/**
 * Delete experience
 */
export const deleteExperience = async (req, res) => {
  try {
    const { id } = req.params;

    const experience = await Experience.findByIdAndDelete(id);

    if (!experience) {
      return res.status(404).json({
        success: false,
        message: 'Experience not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Experience deleted successfully'
    });
  } catch (error) {
    console.error('Delete experience error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete experience',
      error: error.message
    });
  }
};

/**
 * Upload experience image to R2
 */
export const uploadExperienceImage = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }
    const imageUrl = await uploadToR2(req.file.buffer, 'experiences/images', req.file.mimetype);
    res.status(200).json({
      success: true,
      data: { imageUrl }
    });
  } catch (error) {
    console.error('Upload experience image error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload experience image',
      error: error.message
    });
  }
};

/**
 * Upload experience video to R2 — remuxed for faststart first so it plays instantly and seeks
 * cleanly in the guest app, without staff needing to know that's a thing. See videoProcessing.js
 * for why this step exists.
 */
export const uploadExperienceVideo = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: 'No video file provided'
      });
    }
    const processed = await remuxForFaststart(req.file.buffer);
    const videoUrl = await uploadToR2(processed, 'experiences/videos', 'video/mp4', 'mp4');
    res.status(200).json({
      success: true,
      data: { videoUrl }
    });
  } catch (error) {
    console.error('Upload experience video error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload experience video',
      error: error.message
    });
  }
};
