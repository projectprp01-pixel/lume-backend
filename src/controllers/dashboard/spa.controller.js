import SpaFacility from '../../models/Spa.model.js';
import SpaBooking from '../../models/SpaBooking.model.js';
import { uploadToCloudinary } from '../../utils/cloudinaryUpload.js';
import { notifyStaffCancellation } from '../../utils/staffCancellationNotifier.js';

// ==================== SPA HUB ====================

// findByIdAndUpdate doesn't run subdocument 'save' middleware, so keep each treatment's
// legacy isActive boolean (still read by the guest app) in sync with the new status enum
// whenever a facility update includes a categories array.
function syncTreatmentIsActive(update) {
  if (!Array.isArray(update.categories)) return update;
  update.categories = update.categories.map((cat) => ({
    ...cat,
    treatments: Array.isArray(cat.treatments)
      ? cat.treatments.map((t) => ({ ...t, isActive: (t.status ?? 'active') === 'active' }))
      : cat.treatments,
  }));
  return update;
}

/**
 * Get all spa facilities
 */
export const getAllSpaFacilities = async (req, res) => {
  try {
    const { propertyId, isActive } = req.query;

    const filter = {};
    if (propertyId) filter.propertyId = propertyId;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const facilities = await SpaFacility.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: facilities.length,
      data: facilities
    });
  } catch (error) {
    console.error('Get spa facilities error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve spa facilities',
      error: error.message
    });
  }
};

/**
 * Create spa facility
 */
export const createSpaFacility = async (req, res) => {
  try {
    const facility = await SpaFacility.create(req.body);

    res.status(201).json({
      success: true,
      message: 'Spa facility created successfully',
      data: facility
    });
  } catch (error) {
    console.error('Create spa facility error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create spa facility',
      error: error.message
    });
  }
};

/**
 * Update spa facility
 */
export const updateSpaFacility = async (req, res) => {
  try {
    const { id } = req.params;

    const update = { ...req.body };
    if (update.coverImage !== undefined) {
      update.listingImage = update.coverImage;
      delete update.coverImage;
    }
    syncTreatmentIsActive(update);

    const facility = await SpaFacility.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true
    });

    if (!facility) {
      return res.status(404).json({
        success: false,
        message: 'Spa facility not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Spa facility updated successfully',
      data: facility
    });
  } catch (error) {
    console.error('Update spa facility error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update spa facility',
      error: error.message
    });
  }
};

/**
 * Delete spa facility (soft delete)
 */
export const deleteSpaFacility = async (req, res) => {
  try {
    const { id } = req.params;

    const facility = await SpaFacility.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    if (!facility) {
      return res.status(404).json({
        success: false,
        message: 'Spa facility not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Spa facility deleted successfully'
    });
  } catch (error) {
    console.error('Delete spa facility error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete spa facility',
      error: error.message
    });
  }
};

/**
 * Upload spa image to Cloudinary
 */
export const uploadSpaImage = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'No image file provided' });
    }
    const imageUrl = await uploadToCloudinary(req.file.buffer, 'spa');
    res.status(200).json({ success: true, data: { imageUrl } });
  } catch (error) {
    console.error('Upload spa image error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload spa image', error: error.message });
  }
};

// ==================== SPA BOOKINGS ====================

/**
 * Get spa bookings (filterable by propertyId, date, status)
 */
export const getSpaBookings = async (req, res) => {
  try {
    const { propertyId, date, status } = req.query;
    // Previously hardcoded to paymentStatus: 'paid', which silently hid every manually-added
    // or payment-pending booking from the dashboard. Show everything except cancelled/refunded
    // by default; the dashboard's own paymentStatus pill/filter handles Completed vs Pending.
    const filter = { paymentStatus: { $nin: ['refunded'] } };
    if (propertyId) filter.propertyId = propertyId;
    if (status) filter.status = status;
    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      filter.date = { $gte: start, $lte: end };
    }
    const bookings = await SpaBooking.find(filter).sort({ date: 1, timeSlot: 1 });
    res.status(200).json({ success: true, count: bookings.length, data: bookings });
  } catch (error) {
    console.error('Get spa bookings error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve spa bookings', error: error.message });
  }
};

/**
 * Create spa booking manually (staff-side)
 */
export const createManualSpaBooking = async (req, res) => {
  try {
    const bookingId = `SPA-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    const { mainStayBookingId, paymentStatus, ...rest } = req.body;
    const booking = await SpaBooking.create({
      ...rest,
      bookingId,
      mainBookingId: mainStayBookingId || undefined,
      source: 'staff',
      // Staff can mark a manual booking as already paid (e.g. collected at the desk);
      // otherwise it defaults to the schema's 'pending'.
      paymentStatus: paymentStatus === 'paid' ? 'paid' : undefined,
    });
    res.status(201).json({ success: true, message: 'Spa booking created', data: booking });
  } catch (error) {
    console.error('Create spa booking error:', error);
    res.status(500).json({ success: false, message: 'Failed to create spa booking', error: error.message });
  }
};

/**
 * Set spa booking payment status (dashboard payment pill / revert-to-pending flow)
 */
export const updateSpaBookingPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus } = req.body;
    if (!['paid', 'pending'].includes(paymentStatus)) {
      return res.status(400).json({ success: false, message: "paymentStatus must be 'paid' or 'pending'" });
    }
    const booking = await SpaBooking.findByIdAndUpdate(id, { paymentStatus }, { new: true, runValidators: true });
    if (!booking) return res.status(404).json({ success: false, message: 'Spa booking not found' });
    res.status(200).json({ success: true, data: booking });
  } catch (error) {
    console.error('Update spa booking payment error:', error);
    res.status(500).json({ success: false, message: 'Failed to update payment status', error: error.message });
  }
};

/**
 * Assign a room to a spa booking
 */
export const assignSpaBookingRoom = async (req, res) => {
  try {
    const { id } = req.params;
    const { room } = req.body;
    if (!room || !String(room).trim()) {
      return res.status(400).json({ success: false, message: 'room is required' });
    }
    const booking = await SpaBooking.findByIdAndUpdate(id, { room: String(room).trim() }, { new: true, runValidators: true });
    if (!booking) return res.status(404).json({ success: false, message: 'Spa booking not found' });
    res.status(200).json({ success: true, data: booking });
  } catch (error) {
    console.error('Assign spa booking room error:', error);
    res.status(500).json({ success: false, message: 'Failed to assign room', error: error.message });
  }
};

/**
 * Update spa booking status
 */
export const updateSpaBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;
    const cancelledAt = new Date();
    const update = { status };
    if (adminNotes !== undefined) update.adminNotes = adminNotes;
    const booking = await SpaBooking.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    if (!booking) return res.status(404).json({ success: false, message: 'Spa booking not found' });
    if (status === 'Cancelled') {
      notifyStaffCancellation({
        guestId: booking.guestId,
        bookingType: 'Spa',
        guestName: booking.guestName,
        bookingDateTime: `${booking.date} at ${booking.timeSlot}`,
        staff: req.staff,
        cancelledAt,
      });
    }
    res.status(200).json({ success: true, data: booking });
  } catch (error) {
    console.error('Update spa booking status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update status', error: error.message });
  }
};
