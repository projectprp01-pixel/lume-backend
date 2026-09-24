import mongoose from 'mongoose';

const fbOrderItemSchema = new mongoose.Schema({
  dishId: { type: mongoose.Schema.Types.ObjectId, ref: 'FbDish' },
  name: { type: String, required: true },
  qty: { type: Number, required: true },
  price: { type: Number, required: true },
  gstPercent: { type: Number, default: 0 },
}, { _id: false });

const fbOrderSchema = new mongoose.Schema({
  propertyId: { type: String, required: true },
  guestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Guest' },
  room: { type: String, default: '' },
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
  guestName: { type: String, default: 'Guest' },
  items: { type: [fbOrderItemSchema], default: [] },
  // Property-level setting at time of order, snapshotted so past orders don't reprice.
  packagingCharge: { type: Number, default: 30 },
  notes: { type: String },
  stage: { type: String, enum: ['placed', 'accepted', 'prepared', 'delivered'], default: 'placed' },
  // Room-service orders are billed to the room and settled at checkout — Checkout & Feedback
  // counts an order still 'pending' toward the guest's pending amount, and Approve marks it paid.
  paymentStatus: { type: String, enum: ['pending', 'paid'], default: 'pending' },
  timestamps: {
    placed: { type: Date },
    accepted: { type: Date },
    prepared: { type: Date },
    delivered: { type: Date },
  },
}, { timestamps: true });

fbOrderSchema.index({ propertyId: 1 });
fbOrderSchema.index({ stage: 1 });

const FbOrder = mongoose.model('FbOrder', fbOrderSchema);

export default FbOrder;
