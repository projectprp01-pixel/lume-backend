import mongoose from 'mongoose';

const transportBookingSchema = new mongoose.Schema({
  // Required for the guest-facing Razorpay whole-stay flow (guest/transport.controller.js);
  // optional for dashboard-created Transport Hub bookings, which store guestName directly
  // instead — same pattern as SpaBooking.model.js.
  guestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Guest' },
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
  guestName: { type: String, default: '' },
  roomNumber: { type: String, default: '' },
  checkInDate: { type: Date, required: true },
  checkOutDate: { type: Date },
  nights: { type: Number },
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

  // ---- Transport Hub (dashboard) ----
  hubBooking: { type: Boolean, default: false }, // true = created via the Transport Hub, not the legacy guest flow
  ref: { type: String }, // display code, e.g. "EB-2026-78432"
  offeringSlot: { type: Number }, // 1-3; slot 4 (custom) never has a booking record
  vehicleId: { type: mongoose.Schema.Types.ObjectId },
  vehicleName: { type: String, default: '' }, // snapshot at booking time
  room: { type: String, default: '' }, // dashboard-assignable override, separate from roomNumber
  source: { type: String, enum: ['app', 'staff'], default: 'app' },
  addons: { type: [{ name: String, price: Number }], default: [] },
}, { timestamps: true });

transportBookingSchema.index({ propertyId: 1 });
transportBookingSchema.index({ guestId: 1 });
transportBookingSchema.index({ checkOutDate: 1 });

const TransportBooking = mongoose.model('TransportBooking', transportBookingSchema);

export default TransportBooking;
