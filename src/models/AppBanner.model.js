import mongoose from 'mongoose';

const appBannerSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: String,
  imageUrl: {
    type: String,
    required: true
  },
  bannerType: {
    type: String,
    enum: ['home-carousel', 'promotional', 'announcement', 'seasonal'],
    required: true
  },
  targetApp: {
    type: String,
    enum: ['guest-portal', 'all'],
    default: 'guest-portal'
  },
  actionType: {
    type: String,
    enum: ['none', 'link', 'experience', 'restaurant'],
    default: 'none'
  },
  actionValue: String, // URL or ID depending on actionType
  propertyId: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  priority: {
    type: Number,
    default: 0 // Higher number = higher priority
  },
  tags: { type: [String], default: [] },
  buttonText: { type: String, default: 'Learn More' },
  isCustom: { type: Boolean, default: false },
  displayFrom: Date,
  displayUntil: Date,
  clickCount: {
    type: Number,
    default: 0
  },
  impressionCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for faster queries
appBannerSchema.index({ propertyId: 1 });
appBannerSchema.index({ isActive: 1 });
appBannerSchema.index({ bannerType: 1 });
appBannerSchema.index({ priority: -1 });

const AppBanner = mongoose.model('AppBanner', appBannerSchema);

export default AppBanner;
