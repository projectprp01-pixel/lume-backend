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
        galleryCategories: settings?.galleryCategories || [],
        gallery: settings?.gallery || [],
        wifi: settings?.wifi || [],
        directory: settings?.directory || [],
        mapsLink: settings?.mapsLink || '',
        address: settings?.address || '',
        footerHeading: settings?.footerHeading || '',
        footerSubtext: settings?.footerSubtext || '',
        // Requests price sheet configured in the dashboard Guest App builder
        reqCategories: settings?.guestApp?.reqCategories || [],
        // The whole Guest App builder document (page visibility, home toggles, quick actions, hero
        // images, spotlight/events, curated experience + dining sections, request intro). The guest app
        // re-reads this every few seconds so a dashboard toggle shows up without a reload. Empty `{}`
        // until a property saves from the builder — the app falls back to its defaults.
        guestApp: settings?.guestApp || {},
        infantCategory: settings?.infantCategory || null,
        childCategory: settings?.childCategory || null,
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
