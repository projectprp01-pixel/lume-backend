import mongoose from 'mongoose';

const guestDocumentSchema = new mongoose.Schema({
  guestNumber: {
    type: Number,
    required: true
  },
  guestName: String,
  idFrontUrl: {
    type: String,
    required: true
  },
  idBackUrl: {
    type: String,
    default: null
  },
  idType: {
    type: String,
    enum: ['passport', 'drivers-license', 'national-id', 'other'],
    default: 'other'
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  verified: {
    type: Boolean,
    default: false
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff'
  },
  verifiedAt: Date,
  rejectionReason: String
});

const checkInSchema = new mongoose.Schema({
  bookingId: {
    type: String, // Changed to String to support temp IDs like "temp-xxx"
    required: true
  },
  guestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Guest',
    required: true
  },
  status: {
    type: String,
    enum: ['initiated', 'documents-uploaded', 'pending-review', 'approved', 'rejected', 'completed'],
    default: 'initiated'
  },
  guestDocuments: [guestDocumentSchema],
  totalGuests: {
    type: Number,
    required: true
  },
  documentsCompleted: {
    type: Number,
    default: 0
  },
  // Review by hotel staff
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff'
  },
  reviewedAt: Date,
  reviewNotes: String,
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'needs-resubmission'],
    default: 'pending'
  },
  // Notes from guest during check-in submission
  guestNotes: {
    type: String,
    default: null
  },
  // Timeline
  initiatedAt: {
    type: Date,
    default: Date.now
  },
  submittedAt: Date,
  completedAt: Date
}, {
  timestamps: true
});

// Index for faster queries
checkInSchema.index({ bookingId: 1 });
checkInSchema.index({ guestId: 1 });
checkInSchema.index({ status: 1 });
checkInSchema.index({ approvalStatus: 1 });

const CheckIn = mongoose.model('CheckIn', checkInSchema);

export default CheckIn;
