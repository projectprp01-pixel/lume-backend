import mongoose from 'mongoose';

const transportBookingSchema = new mongoose.Schema({
  guestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Guest', required: true },
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
  guestName: { type: String, default: '' },
  roomNumber: { type: String, default: '' },
  checkInDate: { type: Date, required: true },
  checkOutDate: { type: Date, required: true },
  nights: { type: Number, required: true },
  amount: { type: Number, required: true },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled'],
    default: 'pending'
  },
  propertyId: { type: String, required: true },
  razorpayOrderId:   { type: String },
  razorpayPaymentId: { type: String },
  razorpaySignature:  { type: String },
  paymentStatus: {
    type: String,
    enum: ['pending', 'processing', 'paid', 'failed'],
    default: 'pending'
  },
  paidAt: { type: Date },
  staffSeen: { type: Boolean, default: false },
}, { timestamps: true });

transportBookingSchema.index({ propertyId: 1 });
transportBookingSchema.index({ guestId: 1 });
transportBookingSchema.index({ checkOutDate: 1 });

const TransportBooking = mongoose.model('TransportBooking', transportBookingSchema);

export default TransportBooking;
