import mongoose from 'mongoose';

const fbOrderingSettingsSchema = new mongoose.Schema({
  propertyId: { type: String, required: true, unique: true },
  opens: { type: String, default: '07:00' },
  closes: { type: String, default: '22:00' },
  paused: { type: Boolean, default: false },
  packagingCharge: { type: Number, default: 30 },
}, { timestamps: true });

const FbOrderingSettings = mongoose.model('FbOrderingSettings', fbOrderingSettingsSchema);

export default FbOrderingSettings;
