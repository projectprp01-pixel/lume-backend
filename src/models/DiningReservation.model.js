import mongoose from 'mongoose';

const diningReservationSchema = new mongoose.Schema({
  facilityId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  facilityName:   { type: String, required: true },
  facilityType:   { type: String, enum: ['restaurant', 'intimate_dining'], required: true },
  guestId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Guest' },
  bookingId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
  mainStayBookingId: { type: String },
  guestName:      { type: String, required: true },
  roomNumber:     { type: String, default: '' },
  date:           { type: String, required: true }, // "YYYY-MM-DD"
  numberOfGuests: { type: Number, required: true },
  status:         { type: String, enum: ['pending', 'confirmed', 'cancelled'], default: 'pending' },
  propertyId:     { type: String, required: true },
  // Payment fields (intimate dining)
  amount:            { type: Number },
  razorpayOrderId:   { type: String },
  razorpayPaymentId: { type: String },
  razorpaySignature: { type: String },
  paymentStatus: {
    type: String,
    enum: ['pending', 'processing', 'paid', 'failed'],
    default: 'pending',
  },
  paidAt: { type: Date },
}, { timestamps: true });

diningReservationSchema.index({ facilityId: 1 });
diningReservationSchema.index({ date: 1 });
diningReservationSchema.index({ status: 1 });
diningReservationSchema.index({ propertyId: 1 });

const DiningReservation = mongoose.model('DiningReservation', diningReservationSchema);

export default DiningReservation;
