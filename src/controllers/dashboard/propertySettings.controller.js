import mongoose from 'mongoose';
import PropertySettings from '../../models/PropertySettings.model.js';
import { uploadToR2 } from '../../utils/r2Upload.js';

// ==================== PROPERTY SETTINGS ====================

// Gallery photos are a subdocument array — Mongo gives each one an `_id`, but the dashboard's
// PsGalleryItem type (and every gallery mutation it does — delete, recategorize, feature) keys
// off a plain `id: string`. Reshape on the way out so the frontend never has to know about `_id`.
function serialize(settings) {
  const obj = settings.toObject();
  return {
    ...obj,
    gallery: (obj.gallery || []).map((g) => ({
      id: String(g._id),
      photo: g.photo,
      category: g.category,
      featured: !!g.featured,
    })),
  };
}

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
    res.status(200).json({ success: true, data: serialize(settings) });
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
    const allowed = ['checkInTime', 'checkOutTime', 'infantCategory', 'childCategory', 'notificationEmails', 'galleryCategories', 'wifi', 'directory', 'heroImage', 'propertyName', 'story', 'rules', 'facilities'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    // Gallery is saved as a whole list (add/delete/recategorize/feature all land here together) —
    // simplest correct approach given the dashboard always sends the full, current list. Existing
    // photos keep their Mongo _id (round-tripped as `id`); newly-added ones (client-side temp ids
    // like `gal-<timestamp>`) get a fresh _id assigned here.
    if (req.body.gallery !== undefined) {
      updates.gallery = req.body.gallery.map((item) => ({
        ...(mongoose.isValidObjectId(item.id) ? { _id: item.id } : {}),
        photo: item.photo,
        category: item.category ?? '',
        featured: !!item.featured,
      }));
    }
    const settings = await PropertySettings.findOneAndUpdate(
      { propertyId },
      { $set: updates },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );
    res.status(200).json({ success: true, data: serialize(settings) });
  } catch (error) {
    console.error('Update property settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to update settings', error: error.message });
  }
};

/**
 * Get the Guest App CMS config blob (page visibility, quick actions, spotlight/event cards,
 * curated experience/dining picks, request categories, hero content for each tab).
 */
export const getGuestAppSettings = async (req, res) => {
  try {
    const { propertyId = 'default' } = req.query;
    const settings = await PropertySettings.findOneAndUpdate(
      { propertyId },
      { $setOnInsert: { propertyId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(200).json({ success: true, data: settings.guestApp ?? {} });
  } catch (error) {
    console.error('Get guest app settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch guest app settings', error: error.message });
  }
};

/**
 * Replace the Guest App CMS config blob wholesale — the dashboard always edits a full local copy
 * and saves it in one shot (same pattern as the gallery list above), so there's no reason to
 * diff/merge fields here.
 */
export const updateGuestAppSettings = async (req, res) => {
  try {
    const { propertyId = 'default' } = req.query;
    const settings = await PropertySettings.findOneAndUpdate(
      { propertyId },
      { $set: { guestApp: req.body } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(200).json({ success: true, data: settings.guestApp ?? {} });
  } catch (error) {
    console.error('Update guest app settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to update guest app settings', error: error.message });
  }
};

/**
 * Upload a property settings image (currently just gallery photos) to R2.
 */
export const uploadPropertySettingsImage = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'No image file provided' });
    }
    const imageUrl = await uploadToR2(req.file.buffer, 'property-settings/gallery', req.file.mimetype);
    res.status(200).json({ success: true, data: { imageUrl } });
  } catch (error) {
    console.error('Upload property settings image error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload image', error: error.message });
  }
};
