import mongoose from 'mongoose';

const spaBookingSchema = new mongoose.Schema({
  bookingId: { type: String, unique: true, required: true },
  spaFacilityId: { type: mongoose.Schema.Types.ObjectId, ref: 'SpaFacility', required: true },
  treatmentId: { type: String, required: true },
  treatmentName: { type: String, required: true },
  categoryName: { type: String },
  guestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Guest' },
  mainBookingId: { type: String },
  guestName: { type: String, required: true },
  numberOfGuests: { type: Number, default: 1 },
  room: { type: String },
  date: { type: Date, required: true },
  timeSlot: { type: String, required: true },
  duration: { type: Number },
  price: { type: Number, required: true },
  propertyId: { type: String, required: true },
  status: {
    type: String,
    enum: ['Pending', 'Upcoming', 'In Progress', 'Completed', 'Cancelled'],
    default: 'Pending'
  },
  specialRequests: { type: String },
  adminNotes: { type: String },
  addons: [{ name: String, price: Number }],
  source: { type: String, enum: ['app', 'staff'], default: 'app' },
  paymentStatus: {
    type: String,
    enum: ['pending', 'processing', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  razorpayOrderId: { type: String },
  razorpayPaymentId: { type: String },
  razorpaySignature: { type: String },
  paidAt: { type: Date },
  currency: { type: String, default: 'INR' },
}, { timestamps: true });

spaBookingSchema.index({ spaFacilityId: 1, date: 1 });
spaBookingSchema.index({ propertyId: 1 });
spaBookingSchema.index({ status: 1 });

const SpaBooking = mongoose.model('SpaBooking', spaBookingSchema);

export default SpaBooking;
