import PropertySettings from '../../models/PropertySettings.model.js';

/**
 * Get property settings (public — only exposes guest-relevant fields)
 */
export const getPropertySettings = async (req, res) => {
  try {
    const { propertyId = 'default' } = req.query;
    const settings = await PropertySettings.findOne({ propertyId });
    res.status(200).json({
      success: true,
      data: {
        checkInTime: settings?.checkInTime || '14:00',
        checkOutTime: settings?.checkOutTime || '11:00',
        heroImage: settings?.heroImage || '',
        propertyName: settings?.propertyName || '',
        story: settings?.story || [],
        rules: settings?.rules || [],
        facilities: settings?.facilities || [],
      }
    });
  } catch (error) {
    console.error('Get property settings error:', error);
    res.status(200).json({
      success: true,
      data: { checkInTime: '14:00', checkOutTime: '11:00', heroImage: '', propertyName: '', story: [], rules: [], facilities: [] }
    });
  }
};
