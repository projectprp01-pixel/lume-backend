import AppBanner from '../../models/AppBanner.model.js';
import { uploadToCloudinary } from '../../utils/cloudinaryUpload.js';

// ==================== APP BANNERS ====================

/**
 * Get all banners
 */
export const getAllBanners = async (req, res) => {
  try {
    const { propertyId, isActive } = req.query;

    const filter = {};
    if (propertyId) filter.propertyId = propertyId;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

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

/**
 * Upload banner image to Cloudinary
 */
export const uploadBannerImage = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }
    const imageUrl = await uploadToCloudinary(req.file.buffer, 'banners');
    res.status(200).json({
      success: true,
      data: { imageUrl }
    });
  } catch (error) {
    console.error('Upload banner image error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload banner image',
      error: error.message
    });
  }
};

/**
 * Create banner
 */
export const createBanner = async (req, res) => {
  try {
    const banner = await AppBanner.create(req.body);

    res.status(201).json({
      success: true,
      message: 'Banner created successfully',
      data: banner
    });
  } catch (error) {
    console.error('Create banner error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create banner',
      error: error.message
    });
  }
};

/**
 * Update banner
 */
export const updateBanner = async (req, res) => {
  try {
    const { id } = req.params;

    const banner = await AppBanner.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true
    });

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Banner updated successfully',
      data: banner
    });
  } catch (error) {
    console.error('Update banner error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update banner',
      error: error.message
    });
  }
};

/**
 * Delete banner (soft delete)
 */
export const deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;

    const banner = await AppBanner.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    if (!banner) {
      return res.status(404).json({
        success: false,
        message: 'Banner not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Banner deleted successfully'
    });
  } catch (error) {
    console.error('Delete banner error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete banner',
      error: error.message
    });
  }
};
