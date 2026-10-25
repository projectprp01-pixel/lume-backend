import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema({
  bookingId: {
    type: String,
    required: true,
    unique: true
  },
  guestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Guest',
    required: true
  },
  primaryGuestName: {
    type: String,
    required: true
  },
  propertyId: {
    type: String,
    required: true
  },
  propertyName: {
    type: String,
    required: true
  },
  numberOfGuests: {
    type: Number,
    required: true,
    min: 1
  },
  arrivalDate: {
    type: Date,
    required: true
  },
  checkoutDate: {
    type: Date,
    required: true
  },
  roomType: String,
  roomNumber: String,
  bookingStatus: {
    type: String,
    enum: ['confirmed', 'checked-in', 'checked-out', 'cancelled'],
    default: 'confirmed'
  },
  checkInStatus: {
    type: String,
    enum: ['pending', 'in-progress', 'submitted', 'approved', 'rejected'],
    default: 'pending'
  },
  checkInCompletedAt: Date,
  // From PMS - populated automatically
  pmsBookingId: String,
  // 'manual' = staff-entered (Add Guest / bulk import); 'pms' = created by the Opera sync, which only ever writes these rows.
  source: {
    type: String,
    enum: ['manual', 'pms'],
    default: 'manual'
  },
  pmsLastSyncedAt: Date,
  // Opera's own lastModifyDateTime for the reservation, used to skip unchanged rows.
  pmsModifiedAt: String,
  pmsSyncStatus: {
    type: String,
    enum: ['ok', 'stale', 'error']
  },
  totalAmount: Number,
  specialRequests: String,
  metadata: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

// Index for faster queries
bookingSchema.index({ bookingId: 1 });
bookingSchema.index({ guestId: 1 });
bookingSchema.index({ arrivalDate: 1 });
bookingSchema.index({ checkInStatus: 1 });
bookingSchema.index({ propertyId: 1, arrivalDate: 1 });
// One row per Opera reservation per property; manual rows (no pmsBookingId) are excluded.
bookingSchema.index(
  { propertyId: 1, pmsBookingId: 1 },
  { unique: true, partialFilterExpression: { pmsBookingId: { $type: 'string' } } }
);

const Booking = mongoose.model('Booking', bookingSchema);

export default Booking;
