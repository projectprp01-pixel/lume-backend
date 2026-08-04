import Guest from '../../models/Guest.model.js';

/**
 * Get or create guest by booking token
 */
export const authenticateGuest = async (req, res) => {
  try {
    const { bookingToken, email, fullName, mobileNumber, countryCode } = req.body;

    let guest = await Guest.findOne({ email });

    if (!guest) {
      guest = await Guest.create({
        bookingToken,
        email,
        fullName,
        mobileNumber,
        countryCode: countryCode || '+91',
        guestType: 'new'
      });
    } else {
      // Update booking token if different
      if (guest.bookingToken !== bookingToken) {
        guest.bookingToken = bookingToken;
        await guest.save();
      }

      // Increment visit count if returning
      guest.totalVisits += 1;
      guest.lastVisit = new Date();
      guest.guestType = 'returning';
      await guest.save();
    }

    res.status(200).json({
      success: true,
      data: guest
    });
  } catch (error) {
    console.error('Guest auth error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to authenticate guest',
      error: error.message
    });
  }
};
