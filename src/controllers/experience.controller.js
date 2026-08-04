import Experience from '../models/Experience.model.js';
import ExperienceBookingModel from '../models/ExperienceBooking.model.js';
import Notification from '../models/Notification.model.js';
import Guest from '../models/Guest.model.js';
import Booking from '../models/Booking.model.js';
import { sendGuestBookingEmail, toISTDate } from '../utils/emailService.js';

/**
 * Get all experiences with optional filters
 */
export const getAllExperiences = async (req, res) => {
  try {
    const {
      category,
      isFeatured,
      isSpotlight,
      isCrafted,
      propertyId,
      isActive = true
    } = req.query;

    const filter = { isActive };

    if (category) filter.category = category;
    if (isFeatured !== undefined) filter.isFeatured = isFeatured === 'true';
    if (isSpotlight !== undefined) filter.isSpotlight = isSpotlight === 'true';
    if (isCrafted !== undefined) filter.isCrafted = isCrafted === 'true';
    if (propertyId) filter.propertyId = propertyId;

    const experiences = await Experience.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: experiences.length,
      data: experiences
    });
  } catch (error) {
    console.error('Get experiences error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve experiences',
      error: error.message
    });
  }
};

/**
 * Get spotlight experiences for home carousel
 */
export const getSpotlightExperiences = async (req, res) => {
  try {
    const { propertyId } = req.query;

    const filter = {
      isActive: true,
      isSpotlight: true
    };

    if (propertyId) filter.propertyId = propertyId;

    const experiences = await Experience.find(filter).sort({ spotlightOrder: 1 });

    res.status(200).json({
      success: true,
      count: experiences.length,
      data: experiences
    });
  } catch (error) {
    console.error('Get spotlight experiences error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve spotlight experiences',
      error: error.message
    });
  }
};

/**
 * Get crafted experiences for carousel
 */
export const getCraftedExperiences = async (req, res) => {
  try {
    const { propertyId } = req.query;

    const filter = {
      isActive: true,
      isCrafted: true
    };

    if (propertyId) filter.propertyId = propertyId;

    const experiences = await Experience.find(filter).sort({ craftedOrder: 1 });

    res.status(200).json({
      success: true,
      count: experiences.length,
      data: experiences
    });
  } catch (error) {
    console.error('Get crafted experiences error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve crafted experiences',
      error: error.message
    });
  }
};

/**
 * Get single experience by ID
 */
export const getExperienceById = async (req, res) => {
  try {
    const { id } = req.params;

    const experience = await Experience.findById(id);

    if (!experience) {
      return res.status(404).json({
        success: false,
        message: 'Experience not found'
      });
    }

    if (!experience.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Experience is no longer available'
      });
    }

    res.status(200).json({
      success: true,
      data: experience
    });
  } catch (error) {
    console.error('Get experience by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve experience',
      error: error.message
    });
  }
};

/**
 * Get available time slots for an experience on a specific date
 */
export const getAvailableSlots = async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required'
      });
    }

    const experience = await Experience.findById(id);

    if (!experience) {
      return res.status(404).json({
        success: false,
        message: 'Experience not found'
      });
    }

    // Get bookings for this experience on the specified date
    const ExperienceBooking = ExperienceBookingModel;

    const bookingsOnDate = await ExperienceBooking.find({
      experienceId: id,
      date: new Date(date),
      bookingStatus: { $in: ['confirmed', 'completed'] }
    });

    // Calculate availability for each slot
    const availableSlots = experience.timeSlots.map(slot => {
      const bookingsForSlot = bookingsOnDate.filter(
        booking => booking.timeSlot === slot.time
      );

      const bookedGuests = bookingsForSlot.reduce(
        (sum, booking) => sum + booking.numberOfGuests,
        0
      );

      return {
        time: slot.time,
        capacity: slot.capacity,
        available: slot.capacity - bookedGuests,
        priceModifier: slot.priceModifier,
        isAvailable: (slot.capacity - bookedGuests) > 0
      };
    });

    res.status(200).json({
      success: true,
      data: {
        experienceId: experience._id,
        experienceName: experience.title,
        date: date,
        basePrice: experience.pricing.basePrice,
        currency: experience.pricing.currency,
        slots: availableSlots
      }
    });
  } catch (error) {
    console.error('Get available slots error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve available slots',
      error: error.message
    });
  }
};

/**
 * Create an experience booking (guest-side)
 */
export const createExperienceBookingGuest = async (req, res) => {
  try {
    const {
      experienceId, guestId, guestName, guestEmail, guestPhone,
      date, timeSlot, numberOfGuests, mainBookingId, mainStayBookingId, price, propertyId, specialRequests
    } = req.body;

    if (!experienceId || !guestName || !date || !timeSlot) {
      return res.status(400).json({
        success: false,
        message: 'experienceId, guestName, date, and timeSlot are required'
      });
    }

    const experience = await Experience.findById(experienceId);
    if (!experience) {
      return res.status(404).json({ success: false, message: 'Experience not found' });
    }

    // Reject bookings on blackout/blocked dates
    const bookingDateStr = new Date(date).toDateString();
    const isBlocked = experience.blackoutDates?.some(d => new Date(d).toDateString() === bookingDateStr);
    if (isBlocked) {
      return res.status(400).json({ success: false, message: 'This date is unavailable for booking.' });
    }

    // Check slot capacity
    const existingOnSlot = await ExperienceBookingModel.find({
      experienceId,
      date: new Date(date),
      timeSlot,
      bookingStatus: { $in: ['confirmed', 'completed'] },
    });
    const bookedGuests = existingOnSlot.reduce((sum, b) => sum + b.numberOfGuests, 0);
    const slot = experience.timeSlots.find(s => s.time === timeSlot);
    if (slot && slot.capacity > 0 && bookedGuests + (numberOfGuests || 1) > slot.capacity) {
      return res.status(400).json({ success: false, message: 'This time slot is full.' });
    }

    const bookingId = `EXP-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    const unitPrice = price ?? experience.pricing.basePrice;
    const qty = numberOfGuests || 1;
    const isFree = unitPrice * qty === 0;

    const booking = await ExperienceBookingModel.create({
      bookingId,
      experienceId,
      guestId: guestId || undefined,
      experienceName: experience.title,
      guestName,
      guestEmail,
      guestPhone,
      date: new Date(date),
      timeSlot,
      numberOfGuests: qty,
      unitPrice,
      totalAmount: unitPrice * qty,
      mainBookingId: mainBookingId || null,
      mainStayBookingId: mainStayBookingId || null,
      propertyId: propertyId || experience.propertyId,
      specialRequests: specialRequests || null,
      bookingStatus: isFree ? 'confirmed' : 'pending',
      paymentStatus: isFree ? 'paid' : 'pending',
    });

    if (guestId) {
      await Notification.create({
        guestId,
        title: isFree ? 'Experience Booked' : 'Experience Booking Pending',
        message: isFree
          ? `Your booking for "${experience.title}" on ${new Date(date).toDateString()} at ${timeSlot} is confirmed.`
          : `Your booking for "${experience.title}" on ${new Date(date).toDateString()} at ${timeSlot} is pending payment.`,
        type: 'success',
        relatedId: booking._id.toString(),
        relatedType: 'booking'
      });
    }

    // Send confirmation email for complimentary bookings (fire-and-forget)
    if (isFree) {
      const mainStayPromise = guestId
        ? Booking.findOne({ guestId }).sort({ createdAt: -1 }).lean()
        : Promise.resolve(null);

      mainStayPromise.then(mainStay => {
        return sendGuestBookingEmail({
          mainBookingId: mainStay?.bookingId || null,
          bookingType: 'Experience',
          guestName: guestName || 'Guest',
          activityName: experience.title,
          bookingDateTime: `${new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} at ${timeSlot}`,
          checkInDate: mainStay ? toISTDate(mainStay.arrivalDate) : 'N/A',
          propertyName: mainStay?.propertyName || 'Evolve Back',
        });
      }).catch(emailErr => console.error('Failed to send complimentary booking email:', emailErr));
    }

    res.status(201).json({ success: true, data: booking });

  } catch (error) {
    console.error('Create experience booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create experience booking',
      error: error.message
    });
  }
};

/**
 * Get experience bookings for a specific guest
 */
export const getGuestExperienceBookings = async (req, res) => {
  try {
    const { guestId } = req.params;
    const bookings = await ExperienceBookingModel.find({ guestId })
      .populate('experienceId', 'title')
      .sort({ date: 1 });

    res.status(200).json({ success: true, data: bookings });
  } catch (error) {
    console.error('Get guest experience bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve guest experience bookings',
      error: error.message
    });
  }
};
