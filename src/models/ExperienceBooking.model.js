import mongoose from 'mongoose';

const experienceBookingSchema = new mongoose.Schema({
  bookingId: {
    type: String,
    required: true,
    unique: true
  },
  experienceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Experience',
    required: true
  },
  guestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Guest',
    required: true
  },
  // Main booking reference (hotel stay)
  mainBookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking'
  },
  mainStayBookingId: { type: String },
  // Booking details
  experienceName: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  timeSlot: {
    type: String,
    required: true
  },
  numberOfGuests: {
    type: Number,
    required: true,
    min: 1
  },
  // Pricing
  unitPrice: {
    type: Number,
    required: true
  },
  totalAmount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'INR'
  },
  // Payment
  paymentStatus: {
    type: String,
    enum: ['pending', 'processing', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentId: String,
  razorpayOrderId: String,
  razorpayPaymentId: String,
  razorpaySignature: String,
  paidAt: Date,
  // Status
  bookingStatus: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed', 'no-show'],
    default: 'pending'
  },
  cancellationReason: String,
  cancelledAt: Date,
  // Guest information
  guestName: String,
  guestEmail: String,
  guestPhone: String,
  specialRequests: String,
  // Confirmation
  confirmationSent: {
    type: Boolean,
    default: false
  },
  confirmationSentAt: Date,
  // Admin notes
  adminNotes: String
}, {
  timestamps: true
});

// Index for faster queries
experienceBookingSchema.index({ bookingId: 1 });
experienceBookingSchema.index({ experienceId: 1 });
experienceBookingSchema.index({ guestId: 1 });
experienceBookingSchema.index({ date: 1 });
experienceBookingSchema.index({ paymentStatus: 1 });
experienceBookingSchema.index({ bookingStatus: 1 });

const ExperienceBooking = mongoose.model('ExperienceBooking', experienceBookingSchema);

export default ExperienceBooking;
