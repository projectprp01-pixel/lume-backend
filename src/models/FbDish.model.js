import mongoose from 'mongoose';

const fbDishSchema = new mongoose.Schema({
  subcategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'FbMenuSubcategory', required: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  price: { type: Number, required: true },
  dietType: { type: String, enum: ['Veg', 'Non-Veg', 'Vegan', 'Egg'], required: true },
  gstPercent: { type: Number, default: 5 },
  serves: { type: String, default: '1' },
  tags: { type: [String], default: [] },
  imageUrl: { type: String, default: '' },
  // No separate "published" flag — deliberately removed in product, see App Flow doc §9.
  inStock: { type: Boolean, default: true },
}, { timestamps: true });

fbDishSchema.index({ subcategoryId: 1 });

const FbDish = mongoose.model('FbDish', fbDishSchema);

export default FbDish;
