import Booking from '../../models/Booking.model.js';
import Experience from '../../models/Experience.model.js';
import ExperienceBooking from '../../models/ExperienceBooking.model.js';
import { uploadToCloudinary } from '../../utils/cloudinaryUpload.js';
import { notifyStaffCancellation } from '../../utils/staffCancellationNotifier.js';

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

    const filter = {
      bookingStatus: { $in: ['confirmed', 'completed', 'no-show'] },
    };

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
    const { experienceId, date, timeSlot, numberOfGuests, guestName, guestEmail, guestPhone, adminNotes, mainStayBookingId } = req.body;

    const experience = await Experience.findById(experienceId);
    if (!experience) {
      return res.status(404).json({
        success: false,
        message: 'Experience not found'
      });
    }

    // Generate booking ID
    const bookingId = `MANUAL-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;

    // Calculate pricing
    const slot = experience.timeSlots.find(s => s.time === timeSlot);
    const unitPrice = experience.pricing.basePrice + (experience.pricing.basePrice * ((slot?.priceModifier || 0) / 100));
    const totalAmount = unitPrice * numberOfGuests;

    // Resolve guestId from mainStayBookingId if provided
    let resolvedGuestId;
    if (mainStayBookingId) {
      const mainBooking = await Booking.findOne({ bookingId: mainStayBookingId }).lean();
      if (mainBooking) resolvedGuestId = mainBooking.guestId;
    }

    const booking = await ExperienceBooking.create({
      bookingId,
      experienceId,
      experienceName: experience.title,
      date: new Date(date),
      timeSlot,
      numberOfGuests,
      unitPrice,
      totalAmount,
      currency: experience.pricing.currency,
      guestName,
      guestEmail,
      guestPhone,
      paymentStatus: 'paid', // Manual bookings are marked as paid
      bookingStatus: 'confirmed',
      adminNotes,
      mainStayBookingId: mainStayBookingId || undefined,
      guestId: resolvedGuestId || undefined,
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
 * Upload experience image to Cloudinary
 */
export const uploadExperienceImage = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }
    const imageUrl = await uploadToCloudinary(req.file.buffer, 'experiences');
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
