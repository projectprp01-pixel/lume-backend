import mongoose from 'mongoose';

const fbMenuCategorySchema = new mongoose.Schema({
  propertyId: { type: String, required: true },
  name: { type: String, required: true },
  desc: { type: String, default: '' },
  openTime: { type: String, default: '07:00' },
  closeTime: { type: String, default: '22:00' },
  imageUrl: { type: String, default: '' },
}, { timestamps: true });

fbMenuCategorySchema.index({ propertyId: 1 });

const FbMenuCategory = mongoose.model('FbMenuCategory', fbMenuCategorySchema);

export default FbMenuCategory;
