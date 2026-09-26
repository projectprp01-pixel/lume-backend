import ExperienceBooking from '../models/ExperienceBooking.model.js';
import Experience from '../models/Experience.model.js';
import Guest from '../models/Guest.model.js';
import Booking from '../models/Booking.model.js';
import Notification from '../models/Notification.model.js';
import { createWithHubRef } from '../utils/hubRef.js';
import { resolveGuestStayId } from '../utils/mainStay.js';

/**
 * Create a new experience booking
 */
export const createBooking = async (req, res) => {
  try {
    const {
      experienceId,
      guestId,
      date,
      timeSlot,
      numberOfGuests,
      specialRequests
    } = req.body;

    // Validate required fields
    if (!experienceId || !guestId || !date || !timeSlot || !numberOfGuests) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Get experience details
    const experience = await Experience.findById(experienceId);
    if (!experience) {
      return res.status(404).json({
        success: false,
        message: 'Experience not found'
      });
    }

    // Get guest details
    const guest = await Guest.findById(guestId);
    if (!guest) {
      return res.status(404).json({
        success: false,
        message: 'Guest not found'
      });
    }

    // Validate group size
    if (numberOfGuests < experience.groupSize.min || numberOfGuests > experience.groupSize.max) {
      return res.status(400).json({
        success: false,
        message: `Number of guests must be between ${experience.groupSize.min} and ${experience.groupSize.max}`
      });
    }

    // Find the time slot
    const slot = experience.timeSlots.find(s => s.time === timeSlot);
    if (!slot) {
      return res.status(400).json({
        success: false,
        message: 'Invalid time slot'
      });
    }

    // Check availability
    const bookingsOnSlot = await ExperienceBooking.find({
      experienceId,
      date: new Date(date),
      timeSlot,
      bookingStatus: { $in: ['confirmed', 'completed'] }
    });

    const bookedGuests = bookingsOnSlot.reduce(
      (sum, booking) => sum + booking.numberOfGuests,
      0
    );

    if ((bookedGuests + numberOfGuests) > slot.capacity) {
      return res.status(400).json({
        success: false,
        message: 'Not enough availability for the selected time slot'
      });
    }

    // Calculate pricing
    const unitPrice = experience.pricing.basePrice + (experience.pricing.basePrice * (slot.priceModifier || 0) / 100);
    const totalAmount = unitPrice * numberOfGuests;

    // Reference is generated as <stayId>-EXP-<n> (see utils/hubRef.js), from the guest's stay.
    // TODO: this legacy path still does NOT store mainStayBookingId (so these bookings are missing from Stay
    // Activity and the Checkout folio) — same gap already fixed for guest Transport/Experience/Spa/Dining.
    // Fix: add `mainStayBookingId: stayId` to the data below. Deferred deliberately; see README 'Known gaps'.
    const stayId = await resolveGuestStayId({ guestId });

    // Create booking
    const booking = await createWithHubRef({
      Model: ExperienceBooking, field: 'bookingId', kind: 'exp',
      stayId,
      data: {
        experienceId,
        experienceName: experience.title,
        guestId,
        date: new Date(date),
        timeSlot,
        numberOfGuests,
        unitPrice,
        totalAmount,
        currency: experience.pricing.currency,
        guestName: guest.fullName,
        guestEmail: guest.email,
        guestPhone: guest.mobileNumber,
        specialRequests,
        paymentStatus: 'pending',
        bookingStatus: 'pending'
      },
    });

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      data: booking
    });

  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create booking',
      error: error.message
    });
  }
};

/**
 * Get bookings for a guest
 */
export const getGuestBookings = async (req, res) => {
  try {
    const { guestId } = req.params;
    const { status, upcoming } = req.query;

    const filter = { guestId, bookingStatus: { $ne: 'pending' } };

    if (status) {
      filter.bookingStatus = status;
    }

    if (upcoming === 'true') {
      filter.date = { $gte: new Date() };
    }

    const bookings = await ExperienceBooking.find(filter)
      .populate('experienceId')
      .sort({ date: upcoming === 'true' ? 1 : -1 });

    res.status(200).json({
      success: true,
      count: bookings.length,
      data: bookings
    });
  } catch (error) {
    console.error('Get guest bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve bookings',
      error: error.message
    });
  }
};

/**
 * Get booking by ID
 */
export const getBookingById = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await ExperienceBooking.findById(id)
      .populate('experienceId')
      .populate('guestId');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    res.status(200).json({
      success: true,
      data: booking
    });
  } catch (error) {
    console.error('Get booking by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve booking',
      error: error.message
    });
  }
};

/**
 * Update booking payment status
 */
export const updatePaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus, paymentId, razorpayPaymentId, razorpaySignature } = req.body;

    const booking = await ExperienceBooking.findById(id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    booking.paymentStatus = paymentStatus;
    if (paymentId) booking.paymentId = paymentId;
    if (razorpayPaymentId) booking.razorpayPaymentId = razorpayPaymentId;
    if (razorpaySignature) booking.razorpaySignature = razorpaySignature;

    if (paymentStatus === 'paid') {
      booking.paidAt = new Date();
    }

    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Payment status updated successfully',
      data: booking
    });
  } catch (error) {
    console.error('Update payment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update payment status',
      error: error.message
    });
  }
};

/**
 * Cancel booking
 */
export const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { cancellationReason } = req.body;

    const booking = await ExperienceBooking.findById(id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (booking.bookingStatus === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Booking is already cancelled'
      });
    }

    booking.bookingStatus = 'cancelled';
    booking.cancellationReason = cancellationReason;
    booking.cancelledAt = new Date();

    await booking.save();

    res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully',
      data: booking
    });

  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel booking',
      error: error.message
    });
  }
};
