import mongoose from 'mongoose';

const fbMenuSubcategorySchema = new mongoose.Schema({
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'FbMenuCategory', required: true },
  name: { type: String, required: true },
}, { timestamps: true });

fbMenuSubcategorySchema.index({ categoryId: 1 });

const FbMenuSubcategory = mongoose.model('FbMenuSubcategory', fbMenuSubcategorySchema);

export default FbMenuSubcategory;
