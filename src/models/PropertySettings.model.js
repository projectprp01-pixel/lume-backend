import mongoose from 'mongoose';

const propertySettingsSchema = new mongoose.Schema({
  propertyId: { type: String, default: 'default', unique: true },
  checkInTime: { type: String, default: '14:00' },   // "HH:MM" 24-hour
  checkOutTime: { type: String, default: '11:00' },
  infantCategory: {
    enabled: { type: Boolean, default: true },
    ageMin:  { type: Number, default: 0 },
    ageMax:  { type: Number, default: 5 },
  },
  childCategory: {
    enabled: { type: Boolean, default: true },
    ageMin:  { type: Number, default: 6 },
    ageMax:  { type: Number, default: 11 },
  },
  notificationEmails: [{ type: String }],
}, { timestamps: true });

export default mongoose.model('PropertySettings', propertySettingsSchema);
