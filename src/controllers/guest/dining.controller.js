import Booking from '../../models/Booking.model.js';
import DiningReservation from '../../models/DiningReservation.model.js';
import Guest from '../../models/Guest.model.js';
import Restaurant from '../../models/Restaurant.model.js';

/**
 * Get restaurants for guest app
 */
export const getRestaurants = async (req, res) => {
  try {
    const { propertyId } = req.query;

    const filter = { isActive: true };
    if (propertyId) filter.propertyId = propertyId;

    const restaurants = await Restaurant.find(filter).sort({ isFeatured: -1, name: 1 });

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
 * Check availability for an intimate dining facility on a date
 * Query: facilityId, date (YYYY-MM-DD), propertyId
 */
export const getDiningAvailability = async (req, res) => {
  try {
    const { facilityId, date } = req.query;

    if (!facilityId || !date) {
      return res.status(400).json({ success: false, message: 'facilityId and date are required' });
    }

    const facility = await Restaurant.findById(facilityId);
    if (!facility) {
      return res.status(404).json({ success: false, message: 'Facility not found' });
    }

    // Restaurants don't have capacity constraints
    if (facility.facilityType !== 'intimate_dining') {
      return res.status(200).json({ success: true, data: { available: true, remaining: null, tablesPerNight: null } });
    }

    // Check if date is blocked
    if (facility.blockedDates && facility.blockedDates.includes(date)) {
      return res.status(200).json({ success: true, data: { available: false, remaining: 0, tablesPerNight: facility.tablesPerNight, reason: 'blocked' } });
    }

    const confirmedCount = await DiningReservation.countDocuments({
      facilityId, date, status: 'confirmed',
    });

    const tablesPerNight = facility.tablesPerNight || 1;
    const remaining = tablesPerNight - confirmedCount;

    res.status(200).json({
      success: true,
      data: { available: remaining > 0, remaining: Math.max(0, remaining), tablesPerNight },
    });
  } catch (error) {
    console.error('Dining availability error:', error);
    res.status(500).json({ success: false, message: 'Failed to check availability', error: error.message });
  }
};

/**
 * Create a dining reservation (guest-side, intimate dining only)
 * Body: { facilityId, guestId, bookingId, date, numberOfGuests, propertyId }
 */
export const createDiningReservation = async (req, res) => {
  try {
    const { facilityId, guestId, bookingId, mainStayBookingId, date, numberOfGuests, propertyId = 'default' } = req.body;

    if (!facilityId || !date || !numberOfGuests) {
      return res.status(400).json({ success: false, message: 'facilityId, date, and numberOfGuests are required' });
    }

    const facility = await Restaurant.findById(facilityId);
    if (!facility) {
      return res.status(404).json({ success: false, message: 'Facility not found' });
    }
    if (facility.facilityType !== 'intimate_dining') {
      return res.status(400).json({ success: false, message: 'Only intimate dining facilities can be booked' });
    }

    // Check blocked dates
    if (facility.blockedDates && facility.blockedDates.includes(date)) {
      return res.status(400).json({ success: false, message: `${date} is not available for bookings` });
    }

    // Check capacity
    if (facility.tablesPerNight) {
      const confirmedCount = await DiningReservation.countDocuments({ facilityId, date, status: 'confirmed' });
      if (confirmedCount >= facility.tablesPerNight) {
        return res.status(400).json({ success: false, message: 'All tables are booked for this date' });
      }
    }

    // Fetch guest info
    let guestName = 'Guest';
    let roomNumber = '';
    let mainStayBooking = null;
    if (guestId) {
      const diningGuest = await Guest.findById(guestId).catch(() => null);
      if (diningGuest) guestName = diningGuest.fullName;
    }
    if (bookingId) {
      mainStayBooking = await Booking.findById(bookingId).catch(() => null);
      if (mainStayBooking) roomNumber = mainStayBooking.roomNumber || '';
    }
    if (!mainStayBooking && guestId) {
      mainStayBooking = await Booking.findOne({ guestId }).sort({ createdAt: -1 }).lean().catch(() => null);
    }

    const reservation = await DiningReservation.create({
      facilityId,
      facilityName: facility.name,
      facilityType: facility.facilityType,
      guestId: guestId || undefined,
      bookingId: bookingId || undefined,
      mainStayBookingId: mainStayBookingId || undefined,
      guestName,
      roomNumber,
      date,
      numberOfGuests,
      propertyId,
      status: 'pending',
      amount: facility.price,
      paymentStatus: 'pending',
    });

    res.status(201).json({
      success: true,
      data: {
        _id: reservation._id,
        facilityName: facility.name,
        date: reservation.date,
        amount: facility.price,
      },
    });
  } catch (error) {
    console.error('Create dining reservation error:', error);
    res.status(500).json({ success: false, message: 'Failed to create reservation', error: error.message });
  }
};

/**
 * Get all dining reservations for a guest
 * Params: guestId
 */
export const getGuestDiningReservations = async (req, res) => {
  try {
    const { guestId } = req.params;
    const reservations = await DiningReservation.find({ guestId }).sort({ date: 1 });
    res.status(200).json({ success: true, data: reservations });
  } catch (error) {
    console.error('Get guest dining reservations error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve dining reservations', error: error.message });
  }
};

/**
 * Cancel a dining reservation (guest-side, e.g. on payment dismiss)
 */
export const cancelDiningReservation = async (req, res) => {
  try {
    const reservation = await DiningReservation.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled' },
      { new: true }
    );
    if (!reservation) {
      return res.status(404).json({ success: false, message: 'Reservation not found' });
    }
    res.status(200).json({ success: true, data: reservation });
  } catch (error) {
    console.error('Cancel dining reservation error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel reservation', error: error.message });
  }
};
