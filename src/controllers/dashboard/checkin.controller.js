import Booking from '../../models/Booking.model.js';
import CheckIn from '../../models/CheckIn.model.js';
import Notification from '../../models/Notification.model.js';

// ==================== CHECK-IN HUB ====================

/**
 * Get daily arrivals
 */
export const getDailyArrivals = async (req, res) => {
  try {
    const { date, propertyId } = req.query;

    // Parse the date correctly - handle both YYYY-MM-DD format and Date objects
    let targetDate;
    if (date) {
      // If date is in YYYY-MM-DD format, parse it as local date
      if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // Parse as local date to avoid timezone issues
        const [year, month, day] = date.split('-').map(Number);
        targetDate = new Date(year, month - 1, day);
      } else {
        targetDate = new Date(date);
      }
    } else {
      targetDate = new Date();
    }

    // Set start of day (00:00:00.000) - create new Date objects to avoid mutation
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    // Set end of day (23:59:59.999) - create new Date from targetDate again
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const filter = {
      arrivalDate: { $gte: startOfDay, $lte: endOfDay }
    };

    if (propertyId && propertyId !== 'default') {
      filter.propertyId = propertyId;
    }

    const arrivals = await Booking.find(filter)
      .populate('guestId')
      .sort({ arrivalDate: 1 });

    console.log(`Found ${arrivals.length} arrivals for date ${date || 'today'} (${startOfDay.toISOString()} to ${endOfDay.toISOString()})`);

    res.status(200).json({
      success: true,
      count: arrivals.length,
      data: arrivals
    });
  } catch (error) {
    console.error('Get daily arrivals error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve daily arrivals',
      error: error.message
    });
  }
};

/**
 * Get all bookings (for mapping guest IDs to arrival dates)
 */
export const getAllBookings = async (req, res) => {
  try {
    const { propertyId } = req.query;

    const filter = {};

    if (propertyId && propertyId !== 'default') {
      filter.propertyId = propertyId;
    }

    const bookings = await Booking.find(filter)
      .populate('guestId')
      .sort({ arrivalDate: 1 });

    res.status(200).json({
      success: true,
      count: bookings.length,
      data: bookings
    });
  } catch (error) {
    console.error('Get all bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve bookings',
      error: error.message
    });
  }
};

/**
 * Get submitted check-ins for review
 */
export const getSubmittedCheckIns = async (req, res) => {
  try {
    const { propertyId, approvalStatus } = req.query;

    const filter = {
      status: { $in: ['pending-review', 'documents-uploaded', 'approved', 'rejected'] }
    };

    if (approvalStatus) {
      filter.approvalStatus = approvalStatus;
    }

    const checkIns = await CheckIn.find(filter)
      .populate('guestId')
      .lean()
      .sort({ submittedAt: -1 });

    // Batch fetch all related bookings in one query
    const bookingIds = checkIns.map(ci => ci.bookingId).filter(Boolean);
    const bookings = await Booking.find({ bookingId: { $in: bookingIds } }).lean();
    const bookingMap = Object.fromEntries(bookings.map(b => [b.bookingId, b]));

    const enriched = checkIns.map(ci => {
      const b = bookingMap[ci.bookingId];
      return b
        ? { ...ci, bookingData: { primaryGuestName: b.primaryGuestName, bookingId: b.bookingId, roomType: b.roomType, propertyId: b.propertyId } }
        : ci;
    });

    let filteredCheckIns = enriched;
    if (propertyId) {
      filteredCheckIns = enriched.filter(ci => ci.bookingData?.propertyId === propertyId);
    }

    res.status(200).json({
      success: true,
      count: filteredCheckIns.length,
      data: filteredCheckIns
    });
  } catch (error) {
    console.error('Get submitted check-ins error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve submitted check-ins',
      error: error.message
    });
  }
};

/**
 * Approve or reject check-in
 */
export const reviewCheckIn = async (req, res) => {
  try {
    const { checkInId } = req.params;
    const { approvalStatus, reviewNotes, staffId } = req.body;

    const checkIn = await CheckIn.findById(checkInId);

    if (!checkIn) {
      return res.status(404).json({
        success: false,
        message: 'Check-in not found'
      });
    }

    checkIn.approvalStatus = approvalStatus;
    checkIn.reviewNotes = reviewNotes;
    checkIn.reviewedAt = new Date();
    // Only set reviewedBy if it's a valid ObjectId (not a placeholder like 'staff')
    if (staffId && /^[a-f\d]{24}$/i.test(staffId)) {
      checkIn.reviewedBy = staffId;
    }

    if (approvalStatus === 'approved') {
      checkIn.status = 'approved';
      checkIn.completedAt = new Date();
      await Booking.findOneAndUpdate({ bookingId: checkIn.bookingId }, { checkInStatus: 'approved' });
    } else if (approvalStatus === 'rejected') {
      checkIn.status = 'rejected';
      await Booking.findOneAndUpdate({ bookingId: checkIn.bookingId }, { checkInStatus: 'rejected' });

      // Notify guest about rejection so they can resubmit
      await Notification.create({
        guestId: checkIn.guestId,
        title: 'Check-in Action Required',
        message: `Your check-in was not approved. Reason: ${reviewNotes || 'Please resubmit your documents.'}`,
        type: 'warning',
        relatedId: checkIn._id.toString(),
        relatedType: 'check-in'
      });
    }

    await checkIn.save();

    res.status(200).json({
      success: true,
      message: `Check-in ${approvalStatus} successfully`,
      data: checkIn
    });

  } catch (error) {
    console.error('Review check-in error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to review check-in',
      error: error.message
    });
  }
};
