import CheckIn from '../models/CheckIn.model.js';
import Booking from '../models/Booking.model.js';
import Guest from '../models/Guest.model.js';
import { uploadToCloudinary } from '../utils/cloudinaryUpload.js';
import { sendCheckInSubmittedEmail, toISTDate } from '../utils/emailService.js';

/**
 * Get guest details by token (for check-in)
 */
export const getBookingByToken = async (req, res) => {
  try {
    const { token } = req.params;

    // Find guest by booking token
    const guest = await Guest.findOne({ bookingToken: token });
    if (!guest) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired check-in link'
      });
    }

    // Look up real booking for this guest
    const booking = await Booking.findOne({ guestId: guest._id }).sort({ createdAt: -1 });

    const today = new Date();
    const defaultCheckout = new Date(today);
    defaultCheckout.setDate(defaultCheckout.getDate() + 2);

    res.status(200).json({
      success: true,
      data: {
        booking: {
          id: booking ? booking._id : `temp-${guest._id}`,
          bookingId: booking ? booking.bookingId : `EB-${guest._id.toString().slice(-8)}`,
          primaryGuestName: booking ? booking.primaryGuestName : guest.fullName,
          numberOfGuests: booking ? booking.numberOfGuests : (guest.numberOfGuests || 1),
          numberOfChildren: guest.numberOfChildren || 0,
          numberOfInfants: guest.numberOfInfants || 0,
          arrivalDate: booking ? booking.arrivalDate : today,
          checkoutDate: booking ? booking.checkoutDate : defaultCheckout,
          propertyName: booking ? booking.propertyName : 'The Lume Stay',
          roomType: booking ? booking.roomType : null,
          checkInStatus: booking ? booking.checkInStatus : 'pending'
        },
        guest: {
          id: guest._id,
          fullName: guest.fullName,
          email: guest.email,
          mobileNumber: guest.mobileNumber,
          countryCode: guest.countryCode,
          consentGiven: guest.consentGiven
        }
      }
    });
  } catch (error) {
    console.error('Get guest by token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve guest details',
      error: error.message
    });
  }
};

/**
 * Update guest consent
 */
export const updateConsent = async (req, res) => {
  try {
    const { guestId } = req.params;
    const { consentGiven } = req.body;

    const guest = await Guest.findByIdAndUpdate(
      guestId,
      {
        consentGiven,
        consentTimestamp: consentGiven ? new Date() : null
      },
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
      message: 'Consent updated successfully',
      data: { consentGiven: guest.consentGiven, consentTimestamp: guest.consentTimestamp }
    });
  } catch (error) {
    console.error('Update consent error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update consent',
      error: error.message
    });
  }
};

/**
 * Initialize or get check-in session
 */
export const initializeCheckIn = async (req, res) => {
  try {
    const { bookingId, guestId, totalGuests } = req.body;

    // Get guest to determine number of guests
    const guest = await Guest.findById(guestId);
    if (!guest) {
      return res.status(404).json({
        success: false,
        message: 'Guest not found'
      });
    }

    // Check if check-in already exists for this guest
    let checkIn = await CheckIn.findOne({ guestId });

    if (!checkIn) {
      // Create new check-in (skip booking lookup since we're using temp IDs)
      checkIn = await CheckIn.create({
        bookingId, // Store the temp ID as-is
        guestId,
        totalGuests: totalGuests || guest.numberOfGuests || 1,
        status: 'initiated'
      });

      console.log(`✅ Check-in session created for ${guest.fullName} (${guest.numberOfGuests} guests)`);
    } else if (checkIn.approvalStatus === 'rejected') {
      // Reset rejected check-in for resubmission
      checkIn.status = 'initiated';
      checkIn.approvalStatus = 'pending';
      checkIn.reviewNotes = '';
      checkIn.guestDocuments = [];
      checkIn.documentsCompleted = 0;
      await checkIn.save();
      console.log(`✅ Reset rejected check-in for resubmission: ${guest.fullName}`);
    } else {
      console.log(`✅ Existing check-in session found for ${guest.fullName}`);
      let dirty = false;
      // Update totalGuests if booking was edited and check-in not yet submitted
      if (totalGuests && checkIn.totalGuests !== totalGuests &&
          checkIn.status !== 'pending-review' && checkIn.status !== 'approved') {
        checkIn.totalGuests = totalGuests;
        checkIn.documentsCompleted = Math.min(checkIn.documentsCompleted, totalGuests);
        dirty = true;
        console.log(`✅ Updated totalGuests to ${totalGuests} for ${guest.fullName}`);
      }
      if (dirty) await checkIn.save();
    }

    res.status(200).json({
      success: true,
      data: checkIn
    });
  } catch (error) {
    console.error('Initialize check-in error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize check-in',
      error: error.message
    });
  }
};

/**
 * Upload ID documents for a guest
 */
export const uploadGuestID = async (req, res) => {
  try {
    const { checkInId } = req.params;
    const { guestNumber, guestName, idType } = req.body;

    // Validate files — front is required, back is optional
    if (!req.files || !req.files.idFront) {
      return res.status(400).json({
        success: false,
        message: 'Front ID image is required'
      });
    }

    const idFront = req.files.idFront[0];
    const idBack = req.files.idBack ? req.files.idBack[0] : null;

    // Upload to Cloudinary in parallel
    const [idFrontUrl, idBackUrl] = await Promise.all([
      uploadToCloudinary(idFront.buffer, `checkin-ids/${checkInId}`),
      idBack ? uploadToCloudinary(idBack.buffer, `checkin-ids/${checkInId}`) : Promise.resolve(null),
    ]);

    // Find check-in and update
    const checkIn = await CheckIn.findById(checkInId);
    if (!checkIn) {
      return res.status(404).json({
        success: false,
        message: 'Check-in session not found'
      });
    }

    // Check if document already exists for this guest
    const existingDocIndex = checkIn.guestDocuments.findIndex(
      doc => doc.guestNumber === parseInt(guestNumber)
    );

    const documentData = {
      guestNumber: parseInt(guestNumber),
      guestName,
      idFrontUrl,
      idBackUrl,
      idType: idType || 'other',
      uploadedAt: new Date()
    };

    if (existingDocIndex !== -1) {
      // Update existing document
      checkIn.guestDocuments[existingDocIndex] = documentData;
    } else {
      // Add new document
      checkIn.guestDocuments.push(documentData);
      checkIn.documentsCompleted += 1;
    }

    // Update status if all documents uploaded
    if (checkIn.documentsCompleted === checkIn.totalGuests) {
      checkIn.status = 'documents-uploaded';
    }

    await checkIn.save();

    // Update or create guest record with ID info
    console.log(`\n📤 Processing ID upload for Guest #${guestNumber}`);
    console.log(`  Name: ${guestName}`);
    console.log(`  Check-in ID: ${checkInId}`);

    if (parseInt(guestNumber) === 1) {
      // Update primary guest
      console.log(`  → Updating PRIMARY guest (ID: ${checkIn.guestId})`);
      await Guest.findByIdAndUpdate(checkIn.guestId, {
        checkInStatus: 'verification-pending',
        'idVerification.uploadedAt': new Date(),
        'idVerification.idFrontUrl': idFrontUrl,
        'idVerification.idBackUrl': idBackUrl,
        'idVerification.idType': idType || 'other'
      });
      console.log(`  ✅ Primary guest updated successfully`);
    } else {
      console.log(`  → Processing CO-GUEST #${guestNumber}`);
      // Update or create co-guest record
      const primaryGuest = await Guest.findById(checkIn.guestId);
      if (primaryGuest) {
        // Try to find existing placeholder co-guest using token-based email
        const coGuestEmail = `coguest${guestNumber}.${primaryGuest.bookingToken}@placeholder.com`;
        console.log(`  Looking for co-guest with email: ${coGuestEmail}`);
        const existingCoGuest = await Guest.findOne({ email: coGuestEmail });

        if (existingCoGuest) {
          // Update existing placeholder
          await Guest.findByIdAndUpdate(existingCoGuest._id, {
            fullName: guestName || existingCoGuest.fullName, // Use provided name or keep placeholder
            checkInStatus: 'verification-pending',
            'idVerification.uploadedAt': new Date(),
            'idVerification.idFrontUrl': idFrontUrl,
            'idVerification.idBackUrl': idBackUrl,
            'idVerification.idType': idType || 'other'
          });
          console.log(`✅ Updated co-guest ${guestNumber}: ${guestName || existingCoGuest.fullName}`);
        } else {
          // Create new co-guest if placeholder doesn't exist (fallback)
          console.log(`  ⚠️  Placeholder not found, creating new co-guest`);
          await Guest.create({
            fullName: guestName || `Guest ${guestNumber}`,
            email: coGuestEmail, // Use token-based email
            mobileNumber: primaryGuest.mobileNumber,
            countryCode: primaryGuest.countryCode,
            roomNumber: primaryGuest.roomNumber,
            bookingName: `${primaryGuest.fullName} - Co Guest`,
            numberOfGuests: primaryGuest.numberOfGuests,
            checkInStatus: 'verification-pending',
            bookingToken: primaryGuest.bookingToken,
            idVerification: {
              uploadedAt: new Date(),
              idFrontUrl: idFrontUrl,
              idBackUrl: idBackUrl,
              idType: idType || 'other'
            }
          });
          console.log(`  ✅ Created new co-guest ${guestNumber}: ${guestName || `Guest ${guestNumber}`}`);
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'ID documents uploaded successfully',
      data: checkIn
    });
  } catch (error) {
    console.error('Upload guest ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload ID documents',
      error: error.message
    });
  }
};

/**
 * Complete check-in (submit for review)
 */
export const completeCheckIn = async (req, res) => {
  try {
    const { checkInId } = req.params;
    const { guestNotes } = req.body;

    const checkIn = await CheckIn.findById(checkInId);
    if (!checkIn) {
      return res.status(404).json({
        success: false,
        message: 'Check-in session not found'
      });
    }

    // Validate all documents uploaded — use actual uploaded count as source of truth
    const actualUploaded = checkIn.guestDocuments?.length ?? 0;
    if (actualUploaded === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one guest ID document must be uploaded before completing check-in'
      });
    }
    // Sync documentsCompleted with reality if it drifted
    if (checkIn.documentsCompleted !== actualUploaded) {
      checkIn.documentsCompleted = actualUploaded;
    }

    // Update check-in status
    checkIn.status = 'pending-review';
    checkIn.submittedAt = new Date();
    if (guestNotes) checkIn.guestNotes = guestNotes;
    await checkIn.save();

    await Booking.findOneAndUpdate(
      { bookingId: checkIn.bookingId },
      { checkInStatus: 'submitted', checkInCompletedAt: new Date() }
    );

    Promise.all([
      Guest.findById(checkIn.guestId).lean(),
      Booking.findOne({ guestId: checkIn.guestId }).sort({ createdAt: -1 }).lean(),
    ]).then(([guest, mainStay]) => sendCheckInSubmittedEmail({
      mainBookingId: mainStay?.bookingId || null,
      guestName: guest?.fullName || 'Guest',
      guestEmail: guest?.email || '',
      submittedAt: checkIn.submittedAt,
      propertyName: mainStay?.propertyName || 'Evolve Back',
      checkInDate: mainStay ? toISTDate(mainStay.arrivalDate) : 'N/A',
    })).catch(emailErr => console.error('Failed to send check-in email:', emailErr));

    res.status(200).json({
      success: true,
      message: 'Check-in completed successfully',
      data: checkIn
    });
  } catch (error) {
    console.error('Complete check-in error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete check-in',
      error: error.message
    });
  }
};

/**
 * Get check-in status
 */
export const getCheckInStatus = async (req, res) => {
  try {
    const { checkInId } = req.params;

    const checkIn = await CheckIn.findById(checkInId).populate('guestId');

    if (!checkIn) {
      return res.status(404).json({
        success: false,
        message: 'Check-in not found'
      });
    }

    res.status(200).json({
      success: true,
      data: checkIn
    });
  } catch (error) {
    console.error('Get check-in status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve check-in status',
      error: error.message
    });
  }
};
