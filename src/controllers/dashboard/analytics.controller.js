import Booking from '../../models/Booking.model.js';
import CheckIn from '../../models/CheckIn.model.js';
import Experience from '../../models/Experience.model.js';
import ExperienceBooking from '../../models/ExperienceBooking.model.js';
import Guest from '../../models/Guest.model.js';

// ==================== ANALYTICS ====================

/**
 * Get dashboard analytics
 */
export const getAnalytics = async (req, res) => {
  try {
    const { propertyId, startDate, endDate } = req.query;

    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Resolve which experience IDs belong to this property (used by several metrics below)
    let propertyExperienceIds = null;
    if (propertyId) {
      const propExperiences = await Experience.find({ propertyId }).select('_id').lean();
      propertyExperienceIds = propExperiences.map(e => e._id);
    }

    // Total guests — scoped via Booking join since Guest has no propertyId field
    let totalGuests;
    if (propertyId) {
      const propertyBookings = await Booking.find({ propertyId }).select('guestId').lean();
      const guestIds = [...new Set(propertyBookings.map(b => String(b.guestId)))];
      totalGuests = guestIds.length;
    } else {
      totalGuests = await Guest.countDocuments();
    }

    // Total experience bookings
    const bookingFilter = { ...dateFilter };
    if (propertyExperienceIds) bookingFilter.experienceId = { $in: propertyExperienceIds };
    const totalBookings = await ExperienceBooking.countDocuments(bookingFilter);

    // Revenue (paid bookings)
    const revenueData = await ExperienceBooking.aggregate([
      {
        $match: {
          paymentStatus: 'paid',
          ...bookingFilter
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalAmount' }
        }
      }
    ]);

    // Check-ins status — scoped via Booking join
    let checkInsStatus;
    if (propertyId) {
      const propertyBookingIds = (await Booking.find({ propertyId }).select('_id').lean()).map(b => b._id);
      checkInsStatus = await CheckIn.aggregate([
        { $match: { bookingId: { $in: propertyBookingIds } } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]);
    } else {
      checkInsStatus = await CheckIn.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]);
    }

    // Popular experiences
    const popularExperiences = await ExperienceBooking.aggregate([
      {
        $match: {
          bookingStatus: { $in: ['confirmed', 'completed'] },
          ...bookingFilter
        }
      },
      {
        $group: {
          _id: '$experienceId',
          bookings: { $sum: 1 },
          revenue: { $sum: '$totalAmount' }
        }
      },
      {
        $sort: { bookings: -1 }
      },
      {
        $limit: 5
      }
    ]);

    // Populate experience details
    await Experience.populate(popularExperiences, { path: '_id', select: 'title imageUrl' });

    res.status(200).json({
      success: true,
      data: {
        totalGuests,
        totalBookings,
        totalRevenue: revenueData[0]?.totalRevenue || 0,
        checkInsStatus,
        popularExperiences
      }
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve analytics',
      error: error.message
    });
  }
};
