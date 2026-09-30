import mongoose from 'mongoose';

// Discounts/promotions for the Spa and Dining hubs — same shape as ExperienceDiscount, plus a
// `department` discriminator so both hubs share one collection. `itemIds` are the tagged
// treatments (Spa — the treatment subdocument ids) or dining facilities (Dining — Restaurant ids).
const hubDiscountSchema = new mongoose.Schema({
  propertyId: { type: String, required: true },
  department: { type: String, enum: ['spa', 'dining'], required: true },
  name: { type: String, required: true },
  discountType: { type: String, enum: ['percent', 'flat'], default: 'percent' },
  value: { type: Number, default: 0 },
  maxCap: { type: Number },
  applyType: { type: String, enum: ['automatic', 'window'], default: 'automatic' },
  windowDays: { type: Number },
  startDate: { type: String },
  endDate: { type: String },
  itemIds: [{ type: String }],
  enabled: { type: Boolean, default: true },
}, { timestamps: true });

hubDiscountSchema.index({ propertyId: 1, department: 1 });

const HubDiscount = mongoose.model('HubDiscount', hubDiscountSchema);

export default HubDiscount;
