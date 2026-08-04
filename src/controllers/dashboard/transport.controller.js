import Booking from '../../models/Booking.model.js';
import Transport from '../../models/Transport.model.js';
import TransportBooking from '../../models/TransportBooking.model.js';
import { notifyStaffCancellation } from '../../utils/staffCancellationNotifier.js';
import { toISTDate } from '../../utils/emailService.js';

// ==================== TRANSPORT HUB ====================

const TRANSPORT_DEFAULTS = {
  visible: true,
  pageTitle: 'How to Reach Evolve Back, Coorg',
  introText: 'Evolve Back, Coorg is just a 235 km (4.5 hour) drive from Bengaluru city. The resort is nestled in the heart of a 300-acre coffee plantation in Karadigodu village, Siddapur.',
  transfersDescription: 'We provide the finest vehicles (Private Innova Crysta) with experienced and courteous drivers to make your journey comfortable and memorable.',
  priceIncludes: [
    { label: "Driver's accommodation" },
    { label: "Driver's meals" },
    { label: 'Toll charges' },
    { label: 'Car parking' },
    { label: 'All taxes' },
  ],
  sightseeingIntro: 'The vehicle is at your disposal throughout your stay for sightseeing in and around Coorg.',
  sightseeingAttractions: [
    { label: 'Dubare Elephant Camp' },
    { label: 'Tibetan Monastery' },
    { label: 'Abbey Waterfalls' },
    { label: 'Talacauvery' },
    { label: "Raja's Seat" },
  ],
  pricingTiers: [
    { fromNights: 1, toNights: 2, routeLabel: '1 Night / 2 Days – Bangalore – Coorg – Bangalore', price: 12000 },
    { fromNights: 3, toNights: 4, routeLabel: '3 Nights / 4 Days – Bangalore – Coorg – Bangalore', price: 18000 },
    { fromNights: 6, toNights: 7, routeLabel: '6 Nights / 7 Days – Bangalore – Coorg – Bangalore', price: 24000 },
  ],
  defaultPrice: 15000,
  customRequest: {
    active: true,
    descriptionText: "If you're looking for transfers from any other location apart from Bangalore, please Write to Us. Our team will review your request and respond to you on your registered email address, latest within the next 4 hours."
  },
  stopovers: {
    active: true,
    subtitleText: 'Plan a break on your way here',
    externalUrl: ''
  }
};

export const getTransportSettings = async (req, res) => {
  try {
    const { propertyId = 'default' } = req.query;
    let settings = await Transport.findOne({ propertyId });

    if (!settings) {
      settings = await Transport.create({ propertyId, ...TRANSPORT_DEFAULTS });
    }

    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error('Get transport settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve transport settings', error: error.message });
  }
};

export const updateTransportSettings = async (req, res) => {
  try {
    const { propertyId = 'default', ...updateData } = req.body;

    const settings = await Transport.findOneAndUpdate(
      { propertyId },
      { $set: updateData },
      { new: true, upsert: true, runValidators: true }
    );

    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error('Update transport settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to update transport settings', error: error.message });
  }
};

export const getTransportBookings = async (req, res) => {
  try {
    const { propertyId = 'default', checkInDate } = req.query;

    // Only show bookings where the guest's stay hasn't ended yet
    const filter = {
      propertyId,
      status: 'confirmed',
      checkOutDate: { $gte: new Date() }
    };

    if (checkInDate) {
      const start = new Date(checkInDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(checkInDate);
      end.setHours(23, 59, 59, 999);
      filter.checkInDate = { $gte: start, $lte: end };
    }

    const bookings = await TransportBooking.find(filter)
      .sort({ checkInDate: 1 })
      .populate('guestId', 'fullName roomNumber')
      .populate('bookingId', 'bookingId');

    res.status(200).json({ success: true, count: bookings.length, data: bookings });
  } catch (error) {
    console.error('Get transport bookings error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve transport bookings', error: error.message });
  }
};

export const cancelTransportBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const cancelledAt = new Date();
    const booking = await TransportBooking.findByIdAndUpdate(
      id,
      { status: 'cancelled' },
      { new: true }
    );

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Transport booking not found' });
    }

    notifyStaffCancellation({
      guestId: booking.guestId,
      bookingType: 'Transport',
      guestName: booking.guestName,
      bookingDateTime: booking.checkInDate ? toISTDate(booking.checkInDate) : 'N/A',
      staff: req.staff,
      cancelledAt,
    });

    res.status(200).json({ success: true, data: booking });
  } catch (error) {
    console.error('Cancel transport booking error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel transport booking', error: error.message });
  }
};

export const createManualTransportBooking = async (req, res) => {
  try {
    const { mainStayBookingId, amount, propertyId } = req.body;

    if (!mainStayBookingId || amount == null) {
      return res.status(400).json({ success: false, message: 'mainStayBookingId and amount are required' });
    }

    const booking = await Booking.findOne({ bookingId: mainStayBookingId.trim() }).lean();
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found. Check the booking ID and try again.' });
    }

    const checkInDate = new Date(booking.arrivalDate);
    const checkOutDate = new Date(booking.checkoutDate);
    const nights = Math.max(1, Math.round((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24)));

    const transportBooking = await TransportBooking.create({
      guestId: booking.guestId,
      bookingId: booking._id,
      guestName: booking.primaryGuestName,
      roomNumber: booking.roomNumber || '',
      checkInDate,
      checkOutDate,
      nights,
      amount: Number(amount),
      status: 'confirmed',
      paymentStatus: 'paid',
      propertyId: propertyId || booking.propertyId,
      staffSeen: true,
    });

    res.status(201).json({ success: true, data: transportBooking });
  } catch (error) {
    console.error('Create manual transport booking error:', error);
    res.status(500).json({ success: false, message: 'Failed to create transport booking', error: error.message });
  }
};

export const getTransportUnseenCount = async (req, res) => {
  try {
    const { propertyId = 'default' } = req.query;
    const count = await TransportBooking.countDocuments({ propertyId, staffSeen: false });
    res.status(200).json({ success: true, data: { count } });
  } catch (error) {
    console.error('Get transport unseen count error:', error);
    res.status(500).json({ success: false, message: 'Failed to get unseen count', error: error.message });
  }
};

export const markTransportBookingsSeen = async (req, res) => {
  try {
    const { propertyId = 'default' } = req.body;
    await TransportBooking.updateMany({ propertyId, staffSeen: false }, { staffSeen: true });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Mark transport bookings seen error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark bookings as seen', error: error.message });
  }
};
