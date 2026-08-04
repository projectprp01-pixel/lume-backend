import Booking from '../../models/Booking.model.js';
import Guest from '../../models/Guest.model.js';

/**
 * Get guest by ID
 */
export const getGuestById = async (req, res) => {
  try {
    const guest = await Guest.findById(req.params.id);

    if (!guest) {
      return res.status(404).json({
        success: false,
        message: 'Guest not found'
      });
    }

    res.status(200).json({
      success: true,
      data: guest
    });
  } catch (error) {
    console.error('Get guest error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve guest',
      error: error.message
    });
  }
};

/**
 * Update guest preferences
 */
export const updateGuestPreferences = async (req, res) => {
  try {
    const { preferences, whatsappOptIn, emailOptIn } = req.body;

    const guest = await Guest.findByIdAndUpdate(
      req.params.id,
      {
        preferences,
        whatsappOptIn,
        emailOptIn
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
      data: guest
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update preferences',
      error: error.message
    });
  }
};

/**
 * Update guest contact info (phone/email) from guest app
 */
export const updateGuestContact = async (req, res) => {
  try {
    const { mobileNumber, email, fullName } = req.body;
    const updateData = {};
    if (mobileNumber !== undefined) updateData.mobileNumber = mobileNumber;
    if (email !== undefined) updateData.email = email.toLowerCase().trim();
    if (fullName !== undefined) updateData.fullName = fullName.trim();

    const guest = await Guest.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    if (!guest) {
      return res.status(404).json({ success: false, message: 'Guest not found' });
    }
    // Keep Booking.primaryGuestName in sync when name changes
    if (fullName !== undefined) {
      await Booking.findOneAndUpdate(
        { guestId: req.params.id },
        { primaryGuestName: fullName.trim() },
        { sort: { createdAt: -1 } }
      );
    }
    res.status(200).json({ success: true, data: guest });
  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json({ success: false, message: 'Failed to update contact', error: error.message });
  }
};
