import PropertySettings from '../../models/PropertySettings.model.js';

// ==================== PROPERTY SETTINGS ====================

/**
 * Get property settings (creates with defaults if not found)
 */
export const getPropertySettings = async (req, res) => {
  try {
    const { propertyId = 'default' } = req.query;
    const settings = await PropertySettings.findOneAndUpdate(
      { propertyId },
      { $setOnInsert: { propertyId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error('Get property settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch settings', error: error.message });
  }
};

/**
 * Update property settings
 */
export const updatePropertySettings = async (req, res) => {
  try {
    const { propertyId = 'default' } = req.query;
    const allowed = ['checkInTime', 'checkOutTime', 'infantCategory', 'childCategory', 'notificationEmails'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const settings = await PropertySettings.findOneAndUpdate(
      { propertyId },
      { $set: updates },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error('Update property settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to update settings', error: error.message });
  }
};
