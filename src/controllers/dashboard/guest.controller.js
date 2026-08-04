import Booking from '../../models/Booking.model.js';
import CheckIn from '../../models/CheckIn.model.js';
import DiningReservation from '../../models/DiningReservation.model.js';
import ExperienceBooking from '../../models/ExperienceBooking.model.js';
import Guest from '../../models/Guest.model.js';
import Notification from '../../models/Notification.model.js';
import ServiceRequest from '../../models/ServiceRequest.model.js';
import SpaBooking from '../../models/SpaBooking.model.js';
import TransportBooking from '../../models/TransportBooking.model.js';
import { pushGuestActivity } from '../../services/leadsquaredService.js';
import { PROPERTY_APP_URLS, GUEST_APP_URL } from '../../config/env.js';

// ==================== GUEST MANAGEMENT ====================

/**
 * Get all guests
 */
export const getAllGuests = async (req, res) => {
  try {
    const { search, guestType, checkInDate, checkOutDate, propertyId } = req.query;

    const filter = {};

    if (guestType) filter.guestType = guestType;

    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { mobileNumber: { $regex: search, $options: 'i' } }
      ];
    }

    // Scope guests to a property (or date range) by joining via Booking
    if (propertyId || checkInDate || checkOutDate) {
      const bookingFilter = {};
      if (propertyId && propertyId !== 'all') bookingFilter.propertyId = propertyId;
      if (checkInDate) {
        const start = new Date(checkInDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(checkInDate);
        end.setHours(23, 59, 59, 999);
        bookingFilter.arrivalDate = { $gte: start, $lte: end };
      }
      if (checkOutDate) {
        const start = new Date(checkOutDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(checkOutDate);
        end.setHours(23, 59, 59, 999);
        bookingFilter.checkoutDate = { $gte: start, $lte: end };
      }
      const matchingBookings = await Booking.find(bookingFilter).select('guestId').lean();
      const guestIds = matchingBookings.map(b => b.guestId);
      filter._id = { $in: guestIds };
    }

    const guests = await Guest.find(filter).sort({ createdAt: -1 });

    // Enrich each guest with booking data (arrivalDate, checkoutDate, roomType)
    const guestIds = guests.map(g => g._id);
    const bookings = await Booking.find({ guestId: { $in: guestIds } })
      .select('guestId arrivalDate checkoutDate roomType bookingId propertyName')
      .lean();
    const bookingMap = {};
    for (const b of bookings) bookingMap[String(b.guestId)] = b;
    const enriched = guests.map(g => {
      const b = bookingMap[String(g._id)];
      return {
        ...g.toObject(),
        arrivalDate: b?.arrivalDate ?? null,
        checkoutDate: b?.checkoutDate ?? null,
        roomType: b?.roomType ?? null,
        bookingId: b?.bookingId ?? null,
        propertyName: b?.propertyName ?? null,
      };
    });

    res.status(200).json({
      success: true,
      count: enriched.length,
      data: enriched
    });
  } catch (error) {
    console.error('Get all guests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve guests',
      error: error.message
    });
  }
};

/**
 * Get guest by main stay booking ID
 */
export const getGuestByBookingId = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const booking = await Booking.findOne({ bookingId: bookingId.trim() }).lean();
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    res.status(200).json({
      success: true,
      data: {
        primaryGuestName: booking.primaryGuestName,
        propertyName: booking.propertyName,
        bookingId: booking.bookingId,
        arrivalDate: booking.arrivalDate,
        checkoutDate: booking.checkoutDate,
        roomType: booking.roomType,
        roomNumber: booking.roomNumber,
        guestId: booking.guestId,
        _id: booking._id,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to lookup booking', error: error.message });
  }
};

/**
 * Add guest manually
 */
export const addGuest = async (req, res) => {
  try {
    const { arrivalDate, checkoutDate, specialRequests, ...guestData } = req.body;

    const guest = await Guest.create(guestData);

    // Create Booking if arrivalDate and checkoutDate are provided
    let booking = null;
    if (arrivalDate && checkoutDate) {
      // Use provided booking ID or generate one
      const bookingId = req.body.bookingId?.trim() || `BK-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;

      booking = await Booking.create({
        bookingId,
        guestId: guest._id,
        primaryGuestName: guest.fullName,
        propertyId: req.body.propertyId || 'default',
        propertyName: req.body.propertyName || 'Default Property',
        numberOfGuests: guest.numberOfGuests || 1,
        arrivalDate: new Date(arrivalDate),
        checkoutDate: new Date(checkoutDate),
        roomNumber: guest.roomNumber || null,
        roomType: req.body.roomType || null,
        bookingStatus: 'confirmed',
        checkInStatus: 'pending',
        specialRequests: specialRequests || null,
        totalAmount: req.body.totalAmount || null,
      });

      console.log(`✅ Created booking ${bookingId} for guest ${guest.fullName}`);
    }

    // Create placeholder co-guest records if numberOfGuests > 1
    const numberOfGuests = req.body.numberOfGuests || 1;
    if (numberOfGuests > 1) {
      const coGuests = [];
      for (let i = 2; i <= numberOfGuests; i++) {
        coGuests.push({
          fullName: `Guest ${i}`,
          email: `coguest${i}.${guest.bookingToken}@placeholder.com`,
          mobileNumber: '',   // leave blank — real phone only on primary guest to avoid LSQ false matches
          countryCode: guest.countryCode,
          roomNumber: guest.roomNumber,
          bookingName: `${guest.fullName} - Co Guest`,
          numberOfGuests: numberOfGuests,
          checkInStatus: 'no-id-uploaded',
          bookingToken: guest.bookingToken, // Share same token
        });
      }

      if (coGuests.length > 0) {
        await Guest.insertMany(coGuests);
        console.log(`✅ Created ${coGuests.length} co-guest placeholder(s)`);
      }
    }

    // Generate guest app URL — property-specific subdomains
    const propertyId = req.body.propertyId || 'default';
    const guestAppUrl = PROPERTY_APP_URLS[propertyId] || PROPERTY_APP_URLS['default'];
    const guestLink = `${guestAppUrl}?token=${guest.bookingToken}`;

    // Log check-in link to console
    console.log('\n' + '='.repeat(60));
    console.log('🎉 NEW GUEST ADDED!');
    console.log('='.repeat(60));
    console.log(`Name:  ${guest.fullName}`);
    console.log(`Email: ${guest.email}`);
    console.log(`Phone: ${guest.countryCode} ${guest.mobileNumber}`);
    console.log(`Token: ${guest.bookingToken}`);
    console.log(`Total Guests: ${numberOfGuests}`);
    if (booking) {
      console.log(`Booking ID: ${booking.bookingId}`);
      console.log(`Arrival Date: ${booking.arrivalDate.toISOString().split('T')[0]}`);
      console.log(`Checkout Date: ${booking.checkoutDate.toISOString().split('T')[0]}`);
    }
    console.log('\n📧 GUEST APP LINK (Copy and send to guest):');
    console.log(guestLink);
    console.log('='.repeat(60) + '\n');

    const lsqStatus = await pushGuestActivity(guest.toObject(), booking ? booking.toObject() : null);

    res.status(201).json({
      success: true,
      message: 'Guest added successfully',
      data: {
        ...guest.toObject(),
        booking: booking ? booking.toObject() : null,
        lsqStatus,
      }
    });

  } catch (error) {
    console.error('Add guest error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add guest',
      error: error.message
    });
  }
};

/**
 * Bulk import guests from CSV/XLSX
 */
export const bulkImportGuests = async (req, res) => {
  try {
    const { guests } = req.body;

    if (!Array.isArray(guests) || guests.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid guest data' });
    }

    const guestAppUrl = GUEST_APP_URL || 'http://localhost:5173';
    let imported = 0;

    for (const guestData of guests) {
      try {
        const { arrivalDate, checkoutDate, bookingId, propertyName, roomType, ...rest } = guestData;

        // Save individually to trigger pre('save') hook → generates bookingToken
        const guest = await new Guest(rest).save();

        // Create Booking record if dates are present
        let booking = null;
        if (arrivalDate && checkoutDate) {
          const bid = bookingId?.trim() || `BK-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;
          booking = await Booking.create({
            bookingId: bid,
            guestId: guest._id,
            primaryGuestName: guest.fullName,
            propertyId: 'default',
            propertyName: propertyName || 'Default Property',
            numberOfGuests: guest.numberOfGuests || 1,
            arrivalDate: new Date(arrivalDate),
            checkoutDate: new Date(checkoutDate),
            roomType: roomType || null,
            bookingStatus: 'confirmed',
            checkInStatus: 'pending',
          });
        }

        // Fire-and-forget LSQ activity push
        pushGuestActivity(guest.toObject(), booking ? booking.toObject() : null);

        console.log(`✅ Imported: ${guest.fullName} | Token: ${guest.bookingToken} | Link: ${guestAppUrl}?token=${guest.bookingToken}`);
        imported++;
      } catch (rowErr) {
        console.warn(`⚠️ Skipped row (${guestData.email || guestData.fullName}):`, rowErr.message);
      }
    }

    res.status(201).json({
      success: true,
      message: `${imported} of ${guests.length} guests imported successfully`,
      count: imported,
    });
  } catch (error) {
    console.error('Bulk import error:', error);
    res.status(500).json({ success: false, message: 'Failed to import guests', error: error.message });
  }
};

/**
 * Approve or reject guest ID verification
 */
export const reviewGuestID = async (req, res) => {
  try {
    const { guestId } = req.params;
    const { status, rejectionReason, staffId } = req.body;

    if (!['verified', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be "verified" or "rejected"'
      });
    }

    const updateData = {
      checkInStatus: status,
      'idVerification.verifiedAt': new Date(),
      'idVerification.verifiedBy': staffId || null
    };

    if (status === 'rejected' && rejectionReason) {
      updateData['idVerification.rejectionReason'] = rejectionReason;
    }

    const guest = await Guest.findByIdAndUpdate(
      guestId,
      updateData,
      { new: true }
    );

    if (!guest) {
      return res.status(404).json({
        success: false,
        message: 'Guest not found'
      });
    }

    res.status(200).json({
      success: true,
      message: `Guest ID ${status === 'verified' ? 'approved' : 'rejected'} successfully`,
      data: guest
    });
  } catch (error) {
    console.error('Review guest ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to review guest ID',
      error: error.message
    });
  }
};

// ==================== GUEST UPDATE / DELETE ====================

/**
 * Update guest
 */
export const updateGuest = async (req, res) => {
  try {
    const { guestId } = req.params;
    const { arrivalDate, checkoutDate, bookingId, roomType, propertyName, ...rest } = req.body;

    const allowedFields = ['fullName', 'email', 'mobileNumber', 'countryCode', 'roomNumber', 'bookingName', 'numberOfGuests', 'numberOfChildren', 'numberOfInfants'];
    const guestUpdateData = {};
    for (const field of allowedFields) {
      if (rest[field] !== undefined) guestUpdateData[field] = rest[field];
    }

    const guest = await Guest.findByIdAndUpdate(guestId, guestUpdateData, {
      new: true,
      runValidators: true
    });

    if (!guest) {
      return res.status(404).json({
        success: false,
        message: 'Guest not found'
      });
    }

    // Update linked Booking fields if provided
    const bookingUpdate = {};
    if (arrivalDate) bookingUpdate.arrivalDate = new Date(arrivalDate);
    if (checkoutDate) bookingUpdate.checkoutDate = new Date(checkoutDate);
    if (bookingId) bookingUpdate.bookingId = bookingId.trim();
    if (roomType) bookingUpdate.roomType = roomType;
    if (guestUpdateData.fullName) bookingUpdate.primaryGuestName = guestUpdateData.fullName;
    if (propertyName) bookingUpdate.propertyName = propertyName;
    if (guestUpdateData.numberOfGuests !== undefined) bookingUpdate.numberOfGuests = guestUpdateData.numberOfGuests;
    if (Object.keys(bookingUpdate).length > 0) {
      await Booking.findOneAndUpdate({ guestId }, bookingUpdate);
    }

    res.status(200).json({
      success: true,
      message: 'Guest updated successfully',
      data: guest
    });
  } catch (error) {
    console.error('Update guest error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update guest',
      error: error.message
    });
  }
};

/**
 * Delete guest (hard delete + cascade booking)
 */
export const deleteGuest = async (req, res) => {
  try {
    const { guestId } = req.params;

    const guest = await Guest.findById(guestId);
    if (!guest) {
      return res.status(404).json({ success: false, message: 'Guest not found' });
    }

    await Promise.all([
      Booking.deleteMany({ guestId: guest._id }),
      CheckIn.deleteMany({ guestId: guest._id }),
      ExperienceBooking.deleteMany({ guestId: guest._id }),
      SpaBooking.deleteMany({ guestId: guest._id }),
      Notification.deleteMany({ guestId: guest._id }),
      ServiceRequest.deleteMany({ guestId: guest._id }),
      DiningReservation.deleteMany({ guestId: guest._id }),
      TransportBooking.deleteMany({ guestId: guest._id }),
      ...(guest.bookingToken
        ? [Guest.deleteMany({ bookingToken: guest.bookingToken, _id: { $ne: guest._id } })]
        : []),
    ]);

    await Guest.findByIdAndDelete(guestId);

    res.status(200).json({ success: true, message: 'Guest deleted successfully' });
  } catch (error) {
    console.error('Delete guest error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete guest', error: error.message });
  }
};
