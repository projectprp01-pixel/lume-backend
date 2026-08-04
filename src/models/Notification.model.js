import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  guestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Guest', required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: {
    type: String,
    enum: ['info', 'success', 'warning', 'promo'],
    default: 'info'
  },
  read: { type: Boolean, default: false },
  relatedId: { type: String },
  relatedType: { type: String, enum: ['booking', 'request', 'general', 'spa-booking', 'check-in', 'transport-booking'] }
}, { timestamps: true });

notificationSchema.index({ guestId: 1 });
notificationSchema.index({ guestId: 1, read: 1 });

export default mongoose.model('Notification', notificationSchema);
