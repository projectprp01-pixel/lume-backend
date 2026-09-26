import mongoose from 'mongoose';
import Booking from '../../models/Booking.model.js';
import Guest from '../../models/Guest.model.js';
import Notification from '../../models/Notification.model.js';
import Transport from '../../models/Transport.model.js';
import TransportBooking from '../../models/TransportBooking.model.js';

const TRANSPORT_DEFAULTS = {
  visible: true,
  pageTitle: 'How to Reach Evolve Back, Coorg',
  introText: 'Evolve Back, Coorg is just a 235 km (4.5 hour) drive from Bengaluru city. The resort is nestled in the heart of a 300-acre coffee plantation in Karadigodu village, Siddapur.',
  transfersDescription: 'We provide the finest vehicles (Private Innova Crysta) with experienced and courteous drivers to make your journey comfortable and memorable.',
  priceIncludes: [],
  sightseeingIntro: 'The vehicle is at your disposal throughout your stay for sightseeing in and around Coorg.',
  sightseeingAttractions: [],
  pricingTiers: [],
  defaultPrice: 15000,
  customRequest: {
    active: true,
    descriptionText: "If you're looking for transfers from any other location apart from Bangalore, please Write to Us. Our team will review your request and respond to you on your registered email address, latest within the next 4 hours.",
  },
  stopovers: {
    active: true,
    subtitleText: 'Plan a break on your way here',
    externalUrl: 'https://www.coorg-guest.evolveback.com/stopover',
  },
};

/**
 * Get transport settings + dynamic pricing for guest
 * Query: guestId (optional), propertyId (optional)
 */
export const getGuestTransport = async (req, res) => {
  try {
    const { guestId, propertyId = 'default' } = req.query;

    // Upsert avoids duplicate-key race condition when two requests arrive simultaneously
    let settings = await Transport.findOneAndUpdate(
      { propertyId },
      { $setOnInsert: { propertyId, ...TRANSPORT_DEFAULTS } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    let matchedPrice = settings.defaultPrice;
    let nights = null;
    let routeLabel = null;

    if (guestId && mongoose.Types.ObjectId.isValid(guestId)) {
      const booking = await Booking.findOne({ guestId }).sort({ createdAt: -1 });
      if (booking && booking.arrivalDate && booking.checkoutDate) {
        nights = Math.round(
          (new Date(booking.checkoutDate) - new Date(booking.arrivalDate)) / 86400000
        );
        const tier = settings.pricingTiers.find(t => nights === t.toNights);
        if (tier) {
          matchedPrice = tier.price;
          routeLabel = tier.routeLabel;
        } else {
          routeLabel = `${nights} Night(s)`;
        }
      }
    }

    res.status(200).json({
      success: true,
      data: { settings, matchedPrice, nights, routeLabel }
    });
  } catch (error) {
    console.error('Get guest transport error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve transport info', error: error.message });
  }
};

/**
 * Create a transport booking (guest-side)
 * Body: { guestId, bookingId, nights, amount, propertyId }
 */
export const createTransportBooking = async (req, res) => {
  try {
    const { guestId, bookingId, nights, amount, propertyId = 'default' } = req.body;

    if (!guestId || !bookingId) {
      return res.status(400).json({ success: false, message: 'guestId and bookingId are required' });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const guest = await Guest.findById(guestId);

    const transportBooking = await TransportBooking.create({
      guestId,
      bookingId,
      // Derived server-side from the stay we just loaded — never trusted from the client — so this
      // booking shows up in Stay Activity and the Checkout folio like every other hub booking.
      mainStayBookingId: booking.bookingId,
      guestName: guest ? guest.fullName : '',
      roomNumber: booking.roomNumber || guest?.roomNumber || '',
      checkInDate: booking.arrivalDate,
      checkOutDate: booking.checkoutDate,
      nights,
      amount,
      propertyId,
      status: 'pending'
    });

    if (guestId) {
      await Notification.create({
        guestId,
        title: 'Transfer Booking Pending',
        message: `Your private transfer for ${nights} night(s) is pending payment.`,
        type: 'success',
        relatedId: transportBooking._id.toString(),
        relatedType: 'transport-booking'
      });
    }

    res.status(201).json({ success: true, data: transportBooking });
  } catch (error) {
    console.error('Create transport booking error:', error);
    res.status(500).json({ success: false, message: 'Failed to create transport booking', error: error.message });
  }
};

/**
 * Cancel a transport booking (guest-side, e.g. on payment dismiss)
 */
export const cancelTransportBooking = async (req, res) => {
  try {
    const booking = await TransportBooking.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled' },
      { new: true }
    );
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Transport booking not found' });
    }
    res.status(200).json({ success: true, data: booking });
  } catch (error) {
    console.error('Cancel transport booking error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel transport booking', error: error.message });
  }
};

/**
 * Get transport bookings for a specific guest (guest-side My Bookings)
 */
export const getGuestTransportBookings = async (req, res) => {
  try {
    const { guestId } = req.params;
    const bookings = await TransportBooking.find({ guestId, status: 'confirmed' })
      .sort({ createdAt: -1 })
      .select('_id bookingId guestName checkInDate checkOutDate nights amount status paymentStatus');
    res.status(200).json({ success: true, data: bookings });
  } catch (error) {
    console.error('Get guest transport bookings error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve transport bookings', error: error.message });
  }
};
