import Transport from '../../models/Transport.model.js';
import TransportBooking from '../../models/TransportBooking.model.js';
import { notifyStaffCancellation } from '../../utils/staffCancellationNotifier.js';
import { toISTDate } from '../../utils/emailService.js';
import { uploadToCloudinary } from '../../utils/cloudinaryUpload.js';
import { resolveMainStayBooking } from '../../utils/mainStay.js';

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
    const { propertyId = 'default', checkInDate, includePast } = req.query;

    const filter = {
      propertyId,
      status: 'confirmed',
      hubBooking: { $ne: true },
    };

    // By default, only show bookings where the guest's stay hasn't ended yet.
    // Pass includePast=true to also see bookings for guests who have already checked out.
    if (includePast !== 'true') {
      filter.checkOutDate = { $gte: new Date() };
    }

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

    // Same shared lookup every other hub uses, so this booking carries the stay's Booking ID.
    const { booking, error } = await resolveMainStayBooking(mainStayBookingId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const checkInDate = new Date(booking.arrivalDate);
    const checkOutDate = new Date(booking.checkoutDate);
    const nights = Math.max(1, Math.round((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24)));

    const transportBooking = await TransportBooking.create({
      guestId: booking.guestId,
      bookingId: booking._id,
      mainStayBookingId: booking.bookingId,
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

// ==================== TRANSPORT HUB (fleet / offerings / bookings) ====================
// Additive feature set living alongside the legacy "How to Reach" fields above, on the
// same Transport document. See docs/backend-integration.md §Transport for context.

export const uploadTransportImage = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'No image file provided' });
    }
    const imageUrl = await uploadToCloudinary(req.file.buffer, 'transport');
    res.status(200).json({ success: true, data: { imageUrl } });
  } catch (error) {
    console.error('Upload transport image error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload image', error: error.message });
  }
};

function generateTrnRef() {
  return 'EB-2026-' + (78000 + Math.floor(Math.random() * 1999));
}

async function getOrCreateTransportSettings(propertyId) {
  let settings = await Transport.findOne({ propertyId });
  if (!settings) {
    settings = await Transport.create({ propertyId, ...TRANSPORT_DEFAULTS });
  }
  return settings;
}

export const addTransportVehicle = async (req, res) => {
  try {
    const { propertyId = 'default', name, type, capacity, photoUrl } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Vehicle name is required' });
    }
    const settings = await getOrCreateTransportSettings(propertyId);
    settings.vehicles.push({ name, type: type || 'Sedan', capacity: capacity || '', photoUrl: photoUrl || '' });
    await settings.save();
    res.status(201).json({ success: true, data: settings });
  } catch (error) {
    console.error('Add transport vehicle error:', error);
    res.status(500).json({ success: false, message: 'Failed to add vehicle', error: error.message });
  }
};

export const updateTransportVehicle = async (req, res) => {
  try {
    const { propertyId = 'default' } = req.body;
    const { vehicleId } = req.params;
    const settings = await getOrCreateTransportSettings(propertyId);
    const vehicle = settings.vehicles.id(vehicleId);
    if (!vehicle) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }
    ['name', 'type', 'capacity', 'photoUrl'].forEach((field) => {
      if (req.body[field] !== undefined) vehicle[field] = req.body[field];
    });
    await settings.save();
    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error('Update transport vehicle error:', error);
    res.status(500).json({ success: false, message: 'Failed to update vehicle', error: error.message });
  }
};

export const deleteTransportVehicle = async (req, res) => {
  try {
    const { propertyId = 'default' } = req.query;
    const { vehicleId } = req.params;
    const settings = await getOrCreateTransportSettings(propertyId);
    settings.vehicles.id(vehicleId)?.deleteOne();
    settings.offerings.forEach((o) => {
      o.vehiclePricing = o.vehiclePricing.filter((vp) => String(vp.vehicleId) !== vehicleId);
      o.eligibleVehicles = o.eligibleVehicles.filter((id) => String(id) !== vehicleId);
      o.cities.forEach((c) => {
        c.vehiclePrices = c.vehiclePrices.filter((vp) => String(vp.vehicleId) !== vehicleId);
      });
    });
    await settings.save();
    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error('Delete transport vehicle error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete vehicle', error: error.message });
  }
};

const OFFERING_EDITABLE_FIELDS = ['name', 'desc', 'published', 'flatRate', 'included', 'vehiclePricing', 'eligibleVehicles', 'cities', 'addons'];

export const updateTransportOffering = async (req, res) => {
  try {
    const { propertyId = 'default' } = req.body;
    const slot = Number(req.params.slot);
    const settings = await getOrCreateTransportSettings(propertyId);
    const offering = settings.offerings.find((o) => o.slot === slot);
    if (!offering) {
      return res.status(404).json({ success: false, message: 'Offering slot not found' });
    }
    OFFERING_EDITABLE_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) offering[field] = req.body[field];
    });
    await settings.save();
    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error('Update transport offering error:', error);
    res.status(500).json({ success: false, message: 'Failed to update offering', error: error.message });
  }
};

export const updateTransportOfferingBlockDates = async (req, res) => {
  try {
    const { propertyId = 'default', blockedRanges } = req.body;
    const slot = Number(req.params.slot);
    if (!Array.isArray(blockedRanges)) {
      return res.status(400).json({ success: false, message: 'blockedRanges must be an array' });
    }
    const settings = await getOrCreateTransportSettings(propertyId);
    const offering = settings.offerings.find((o) => o.slot === slot);
    if (!offering) {
      return res.status(404).json({ success: false, message: 'Offering slot not found' });
    }
    offering.blockedRanges = blockedRanges;
    await settings.save();
    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error('Update transport offering block dates error:', error);
    res.status(500).json({ success: false, message: 'Failed to update block dates', error: error.message });
  }
};

// ---- Hub bookings: distinct from the legacy flat-rate whole-stay booking above ----
// (getTransportBookings/createManualTransportBooking/cancelTransportBooking remain untouched
// for the guest-facing Razorpay flow; these operate on the same TransportBooking collection
// but are tagged hubBooking:true and kept out of each other's queries.)

export const getTransportHubBookings = async (req, res) => {
  try {
    const { propertyId = 'default' } = req.query;
    const bookings = await TransportBooking.find({
      propertyId,
      hubBooking: true,
      offeringSlot: { $in: [1, 2, 3] },
    }).sort({ checkInDate: -1 });
    res.status(200).json({ success: true, count: bookings.length, data: bookings });
  } catch (error) {
    console.error('Get transport hub bookings error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve bookings', error: error.message });
  }
};

export const createTransportHubBooking = async (req, res) => {
  try {
    const { propertyId = 'default', mainStayBookingId, offeringSlot, vehicleId, vehicleName, date, price, paymentStatus } = req.body;

    if (!offeringSlot || price == null) {
      return res.status(400).json({ success: false, message: 'offeringSlot and price are required' });
    }

    // Link to the guest's real stay — see docs/backend-integration.md's "coherent booking
    // system" note. guestName/room are derived from it, not free-typed, so this hub can't drift
    // from what Check-in Hub/Guest Management show for the same guest.
    const { booking: mainStay, error } = await resolveMainStayBooking(mainStayBookingId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const checkInDate = date ? new Date(date) : new Date();

    const transportBooking = await TransportBooking.create({
      guestId: mainStay.guestId,
      mainStayBookingId: mainStay.bookingId,
      guestName: mainStay.primaryGuestName,
      room: mainStay.roomNumber || '',
      checkInDate,
      amount: Number(price),
      status: 'confirmed',
      paymentStatus: paymentStatus === 'Completed' ? 'paid' : 'pending',
      propertyId,
      staffSeen: true,
      hubBooking: true,
      ref: generateTrnRef(),
      offeringSlot: Number(offeringSlot),
      vehicleId,
      vehicleName: vehicleName || '',
      source: 'staff',
    });

    res.status(201).json({ success: true, data: transportBooking });
  } catch (error) {
    console.error('Create transport hub booking error:', error);
    res.status(500).json({ success: false, message: 'Failed to add booking', error: error.message });
  }
};

export const setTransportHubBookingPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus } = req.body; // 'paid' | 'pending'
    const booking = await TransportBooking.findByIdAndUpdate(id, { paymentStatus }, { new: true });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    res.status(200).json({ success: true, data: booking });
  } catch (error) {
    console.error('Set transport hub booking payment error:', error);
    res.status(500).json({ success: false, message: 'Failed to update payment status', error: error.message });
  }
};

export const assignTransportHubBookingRoom = async (req, res) => {
  try {
    const { id } = req.params;
    const { room } = req.body;
    const booking = await TransportBooking.findByIdAndUpdate(id, { room }, { new: true });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    res.status(200).json({ success: true, data: booking });
  } catch (error) {
    console.error('Assign transport hub booking room error:', error);
    res.status(500).json({ success: false, message: 'Failed to assign room', error: error.message });
  }
};

export const cancelTransportHubBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await TransportBooking.findByIdAndUpdate(id, { status: 'cancelled' }, { new: true });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    res.status(200).json({ success: true, data: booking });
  } catch (error) {
    console.error('Cancel transport hub booking error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel booking', error: error.message });
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
