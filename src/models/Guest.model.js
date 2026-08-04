import mongoose from 'mongoose';
import crypto from 'crypto';

const guestSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address']
  },
  mobileNumber: {
    type: String,
    default: ''
  },
  countryCode: {
    type: String,
    default: '+91'
  },
  // For authentication (shared among guests in same booking)
  bookingToken: {
    type: String,
    sparse: true
    // Note: Not unique - co-guests share the same token
  },

  // Check-in status tracking
  checkInStatus: {
    type: String,
    enum: ['no-id-uploaded', 'verification-pending', 'verified', 'rejected'],
    default: 'no-id-uploaded'
  },

  // Room assignment
  roomNumber: {
    type: String,
    default: null
  },

  // Booking name (for grouping guests under same booking)
  bookingName: {
    type: String,
    default: null // Primary guest name or "Primary Name - Co Guest"
  },

  // Number of guests in the booking (including primary)
  numberOfGuests: {
    type: Number,
    default: 1
  },
  numberOfChildren: {
    type: Number,
    default: 0
  },
  numberOfInfants: {
    type: Number,
    default: 0
  },

  // ID verification details
  idVerification: {
    uploadedAt: Date,
    verifiedAt: Date,
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff'
    },
    rejectionReason: String,
    idFrontUrl: String,
    idBackUrl: String,
    idType: String
  },

  // Privacy consent
  consentGiven: {
    type: Boolean,
    default: false
  },
  consentTimestamp: Date,
  // Guest preferences and history
  preferences: {
    dietaryRestrictions: [String],
    roomPreferences: [String],
    activities: [String]
  },
  // Marketing and communication
  emailOptIn: {
    type: Boolean,
    default: false
  },
  // Guest type
  guestType: {
    type: String,
    enum: ['new', 'returning'],
    default: 'new'
  },
  lastVisit: Date,
  totalVisits: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Generate booking token before saving
guestSchema.pre('save', function(next) {
  if (!this.bookingToken) {
    // Generate a unique token using crypto
    this.bookingToken = crypto.randomBytes(32).toString('hex');
  }
  next();
});

// Index for faster queries
guestSchema.index({ email: 1 });
guestSchema.index({ mobileNumber: 1 });
guestSchema.index({ bookingToken: 1 });

const Guest = mongoose.model('Guest', guestSchema);

export default Guest;
