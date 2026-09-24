import mongoose from 'mongoose';

const folioLineSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  paid: { type: Boolean, default: false },
}, { _id: true });

// One document per stay, keyed by Booking.bookingId. Deliberately stores NO pending amount
// and NO status — both are derived from each line's own `paid` flag wherever they're shown
// (Checkout & Feedback PRD, Step 2), so there is never a second copy that could drift out of
// sync when a charge is added or settled.
const checkoutFolioSchema = new mongoose.Schema({
  propertyId: { type: String, required: true },
  bookingId: { type: String, required: true, unique: true },
  folio: { type: [folioLineSchema], default: [] },
  // "HH:MM" 24-hour, set only when staff edit a specific guest's checkout time (late checkout
  // already approved elsewhere). Unset means "use the property's standard checkOutTime".
  checkoutTimeOverride: { type: String, default: null },
}, { timestamps: true });

checkoutFolioSchema.index({ propertyId: 1 });

const CheckoutFolio = mongoose.model('CheckoutFolio', checkoutFolioSchema);

export default CheckoutFolio;
