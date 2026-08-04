import DiningReservation from '../../models/DiningReservation.model.js';
import Restaurant from '../../models/Restaurant.model.js';
import { uploadToCloudinary } from '../../utils/cloudinaryUpload.js';
import { notifyStaffCancellation } from '../../utils/staffCancellationNotifier.js';

// ==================== RESTAURANT/DINING HUB ====================

/**
 * Get all restaurants
 */
export const getAllRestaurants = async (req, res) => {
  try {
    const { propertyId, isActive } = req.query;

    const filter = {};
    if (propertyId) filter.propertyId = propertyId;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const restaurants = await Restaurant.find(filter).sort({ name: 1 });

    res.status(200).json({
      success: true,
      count: restaurants.length,
      data: restaurants
    });
  } catch (error) {
    console.error('Get restaurants error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve restaurants',
      error: error.message
    });
  }
};

/**
 * Create restaurant
 */
export const createRestaurant = async (req, res) => {
  try {
    const restaurant = await Restaurant.create(req.body);

    res.status(201).json({
      success: true,
      message: 'Restaurant created successfully',
      data: restaurant
    });
  } catch (error) {
    console.error('Create restaurant error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create restaurant',
      error: error.message
    });
  }
};

/**
 * Update restaurant
 */
export const updateRestaurant = async (req, res) => {
  try {
    const { id } = req.params;

    const restaurant = await Restaurant.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true
    });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Restaurant updated successfully',
      data: restaurant
    });
  } catch (error) {
    console.error('Update restaurant error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update restaurant',
      error: error.message
    });
  }
};

/**
 * Delete dining facility
 */
export const deleteRestaurant = async (req, res) => {
  try {
    const { id } = req.params;
    const restaurant = await Restaurant.findByIdAndDelete(id);
    if (!restaurant) {
      return res.status(404).json({ success: false, message: 'Facility not found' });
    }
    res.status(200).json({ success: true, message: 'Facility deleted successfully' });
  } catch (error) {
    console.error('Delete restaurant error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete facility', error: error.message });
  }
};

/**
 * Upload dining facility image to Cloudinary
 */
export const uploadDiningImage = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'No image file provided' });
    }
    const imageUrl = await uploadToCloudinary(req.file.buffer, 'dining');
    res.status(200).json({ success: true, data: { imageUrl } });
  } catch (error) {
    console.error('Upload dining image error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload image', error: error.message });
  }
};

/**
 * Get dining reservations (dashboard)
 */
export const getDiningReservations = async (req, res) => {
  try {
    const { propertyId, date, facilityId, facilityType, status } = req.query;

    const filter = {};
    if (propertyId) filter.propertyId = propertyId;
    if (date) filter.date = date;
    if (facilityId) filter.facilityId = facilityId;
    if (facilityType) filter.facilityType = facilityType;
    if (status) filter.status = status;

    const reservations = await DiningReservation.find(filter).sort({ guestName: 1 });
    res.status(200).json({ success: true, count: reservations.length, data: reservations });
  } catch (error) {
    console.error('Get dining reservations error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve reservations', error: error.message });
  }
};

/**
 * Cancel a dining reservation (dashboard)
 */
export const cancelDiningReservation = async (req, res) => {
  try {
    const { id } = req.params;
    const cancelledAt = new Date();
    const reservation = await DiningReservation.findByIdAndUpdate(
      id,
      { status: 'cancelled' },
      { new: true }
    );
    if (!reservation) {
      return res.status(404).json({ success: false, message: 'Reservation not found' });
    }
    notifyStaffCancellation({
      guestId: reservation.guestId,
      bookingType: 'Dining',
      guestName: reservation.guestName,
      bookingDateTime: reservation.date,
      staff: req.staff,
      cancelledAt,
    });
    res.status(200).json({ success: true, data: reservation });
  } catch (error) {
    console.error('Cancel dining reservation error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel reservation', error: error.message });
  }
};

/**
 * Create a manual dining reservation (staff action, dashboard)
 */
export const createManualDiningReservation = async (req, res) => {
  try {
    const { facilityId, facilityName, facilityType, guestName, date, numberOfGuests, propertyId, roomNumber, mainStayBookingId } = req.body;

    if (!facilityId || !guestName || !date || !numberOfGuests) {
      return res.status(400).json({ success: false, message: 'facilityId, guestName, date, and numberOfGuests are required' });
    }

    // Capacity check for intimate dining
    if (facilityType === 'intimate_dining') {
      const facility = await Restaurant.findById(facilityId);
      if (facility) {
        // Check blocked dates
        if (facility.blockedDates && facility.blockedDates.includes(date)) {
          return res.status(400).json({ success: false, message: `${date} is blocked for this facility` });
        }
        // Check table capacity
        if (facility.tablesPerNight) {
          const confirmedCount = await DiningReservation.countDocuments({
            facilityId, date, status: 'confirmed',
          });
          if (confirmedCount >= facility.tablesPerNight) {
            return res.status(400).json({ success: false, message: 'All tables are booked for this date' });
          }
        }
      }
    }

    const reservation = await DiningReservation.create({
      facilityId,
      facilityName,
      facilityType,
      guestName,
      date,
      numberOfGuests,
      propertyId: propertyId || 'default',
      roomNumber: roomNumber || '',
      status: 'confirmed',
      paymentStatus: 'paid', // Staff-created reservations are pre-confirmed
      mainStayBookingId: mainStayBookingId || undefined,
    });

    res.status(201).json({ success: true, data: reservation });
  } catch (error) {
    console.error('Create manual dining reservation error:', error);
    res.status(500).json({ success: false, message: 'Failed to create reservation', error: error.message });
  }
};
