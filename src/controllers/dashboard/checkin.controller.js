import Booking from '../../models/Booking.model.js';
import CheckIn from '../../models/CheckIn.model.js';
import Notification from '../../models/Notification.model.js';
import { propagateRoomToLinkedBookings } from '../../utils/mainStay.js';

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
 * Get submitted check-ins for review. `all=true` drops the status filter entirely (used by the
 * Check-in Hub dashboard table, which needs every CheckIn — including ones still at 'initiated' —
 * to merge against the full arrivals list); without it, behaves as before (submitted-and-beyond only).
 */
export const getSubmittedCheckIns = async (req, res) => {
  try {
    const { propertyId, approvalStatus, all } = req.query;

    const filter = all === 'true'
      ? {}
      : { status: { $in: ['pending-review', 'documents-uploaded', 'approved', 'rejected'] } };

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

/**
 * Approve or reject one guest's ID within a check-in — per-guest granularity, since a family
 * booking can have some guests approved, some still pending, and one rejected all at once (the
 * dashboard's per-booking Check-in Status is derived from this, never set directly). The
 * guestDocuments subdocument already carries verified/rejectionReason per guest; reviewCheckIn
 * above only ever wrote the whole check-in's top-level approvalStatus, which can't represent that.
 */
export const reviewGuestDocument = async (req, res) => {
  try {
    const { checkInId, guestNumber } = req.params;
    const { verified, rejectionReason, staffId } = req.body;

    const checkIn = await CheckIn.findById(checkInId);
    if (!checkIn) {
      return res.status(404).json({
        success: false,
        message: 'Check-in not found'
      });
    }

    const doc = checkIn.guestDocuments.find((d) => d.guestNumber === parseInt(guestNumber));
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'No uploaded document found for that guest'
      });
    }

    doc.verified = !!verified;
    doc.rejectionReason = verified ? undefined : (rejectionReason || 'Please resubmit your documents.');
    doc.verifiedAt = new Date();
    if (staffId && /^[a-f\d]{24}$/i.test(staffId)) {
      doc.verifiedBy = staffId;
    }

    // The check-in's own status is derived from every guest's state, same rule the dashboard
    // itself uses: any guest rejected reads as rejected regardless of how many others are
    // approved; only every guest submitted AND approved reads as approved.
    const allDocs = checkIn.guestDocuments;
    const anyRejected = allDocs.some((d) => !!d.rejectionReason);
    const allApproved = allDocs.length === checkIn.totalGuests && allDocs.every((d) => d.verified);
    checkIn.approvalStatus = anyRejected ? 'rejected' : allApproved ? 'approved' : 'pending';
    if (anyRejected) {
      checkIn.status = 'rejected';
    } else if (allApproved) {
      checkIn.status = 'approved';
      checkIn.completedAt = new Date();
    } else {
      checkIn.status = 'documents-uploaded';
    }

    await checkIn.save();

    await Booking.findOneAndUpdate(
      { bookingId: checkIn.bookingId },
      { checkInStatus: anyRejected ? 'rejected' : allApproved ? 'approved' : 'submitted' }
    );

    if (!verified) {
      await Notification.create({
        guestId: checkIn.guestId,
        title: 'Check-in Action Required',
        message: `Your ID was not approved. Reason: ${doc.rejectionReason}`,
        type: 'warning',
        relatedId: checkIn._id.toString(),
        relatedType: 'check-in'
      });
    }

    res.status(200).json({
      success: true,
      message: `Guest ${guestNumber} ${verified ? 'approved' : 'rejected'} successfully`,
      data: checkIn
    });
  } catch (error) {
    console.error('Review guest document error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to review guest document',
      error: error.message
    });
  }
};

/**
 * Assign a room number to one room within a (possibly multi-room) booking. Booking.roomType and
 * Booking.roomNumber are single comma-joined strings, not a per-room array (there is no per-room
 * subdocument in the schema) — this reads/writes that convention at a given index so multi-room
 * bookings can be resolved room-by-room, matching the assign-room pattern already used by the
 * Spa/Transport/Experiences booking routes.
 */
export const assignCheckInRoom = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { roomIndex, number } = req.body;

    const booking = await Booking.findOne({ bookingId });
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const types = (booking.roomType || '').split(',').map((s) => s.trim()).filter(Boolean);
    const numbers = (booking.roomNumber || '').split(',').map((s) => s.trim());
    while (numbers.length < types.length) numbers.push('');
    numbers[roomIndex] = number;

    booking.roomNumber = numbers.slice(0, types.length).join(', ');
    await booking.save();

    // Room reassignment shouldn't leave Spa/Transport/Experience/Dining bookings pointing at a
    // stale room — see docs/backend-integration.md's "coherent booking system" note.
    await propagateRoomToLinkedBookings(booking.bookingId, booking.roomNumber);

    res.status(200).json({
      success: true,
      message: 'Room assigned successfully',
      data: booking
    });
  } catch (error) {
    console.error('Assign check-in room error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign room',
      error: error.message
    });
  }
};
