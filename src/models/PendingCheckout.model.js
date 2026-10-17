import mongoose from 'mongoose';

// A guest's cart waiting for its payment. This is NOT a booking: nothing the guest or the property
// sees (bookings, availability, dashboard tables) is created until the Razorpay payment for
// `razorpayOrderId` has come through, at which point every item is booked as paid + confirmed in one go
// (see services/guestCheckout.js and payment.controller.js). A cart the guest abandons simply expires
// here (TTL below) and leaves no trace anywhere else.
const pendingCheckoutSchema = new mongoose.Schema({
  guestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Guest', required: true },
  // The exact booking requests the guest made: [{ kind: 'experience'|'spa'|'dining'|'transport', req: {...} }].
  // They are re-validated and re-priced from scratch when the payment lands.
  items: { type: [mongoose.Schema.Types.Mixed], required: true },
  amount: { type: Number, required: true }, // rupees, as priced by the server when the order was created
  currency: { type: String, default: 'INR' },
  razorpayOrderId: { type: String, index: true, unique: true, sparse: true },
  razorpayPaymentId: { type: String },
  status: {
    type: String,
    enum: ['created', 'processing', 'fulfilled', 'failed'],
    default: 'created',
    index: true,
  },
  // Filled once fulfilled: which bookings this payment produced.
  bookingRefs: [{ kind: String, id: mongoose.Schema.Types.ObjectId, _id: false }],
  failureReason: { type: String },
  refunded: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 7 }, // drop after 7 days
});

export default mongoose.model('PendingCheckout', pendingCheckoutSchema);
