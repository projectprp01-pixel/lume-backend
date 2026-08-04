import AppBanner from '../../models/AppBanner.model.js';

/**
 * Get app banners
 */
export const getActiveBanners = async (req, res) => {
  try {
    const { propertyId, bannerType } = req.query;

    const filter = {
      isActive: true,
      targetApp: { $in: ['guest-portal', 'all'] }
    };

    if (propertyId) filter.propertyId = propertyId;
    if (bannerType) filter.bannerType = bannerType;

    // Check date validity
    const now = new Date();
    filter.$or = [
      { displayFrom: { $exists: false } },
      { displayFrom: { $lte: now } }
    ];

    const banners = await AppBanner.find(filter).sort({ priority: 1, createdAt: 1 });

    res.status(200).json({
      success: true,
      count: banners.length,
      data: banners
    });
  } catch (error) {
    console.error('Get banners error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve banners',
      error: error.message
    });
  }
};
