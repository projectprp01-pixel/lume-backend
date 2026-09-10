import mongoose from 'mongoose';

// Experience Hub discounts/promotions — the prototype's Discounts & Promotions tab.
// No prior model existed for this (Experience.model.js has no discount sub-schema); see
// docs/backend-integration.md's Experiences section, "Discounts CRUD" row.
const experienceDiscountSchema = new mongoose.Schema({
  propertyId: { type: String, required: true },
  name: { type: String, required: true },
  discountType: { type: String, enum: ['percent', 'flat'], default: 'percent' },
  value: { type: Number, default: 0 },
  maxCap: { type: Number },
  applyType: { type: String, enum: ['automatic', 'window'], default: 'automatic' },
  windowDays: { type: Number },
  startDate: { type: String },
  endDate: { type: String },
  activityIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Experience' }],
  enabled: { type: Boolean, default: true },
}, { timestamps: true });

experienceDiscountSchema.index({ propertyId: 1 });

const ExperienceDiscount = mongoose.model('ExperienceDiscount', experienceDiscountSchema);

export default ExperienceDiscount;
