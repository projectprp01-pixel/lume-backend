import mongoose from 'mongoose';

// Sentiment is intentionally NOT a field here — it's computed from `rating` against the
// property's live thresholds (FeedbackSettings) every time it's read (Checkout & Feedback PRD,
// Steps 6 and 9).
const feedbackSchema = new mongoose.Schema({
  propertyId: { type: String, required: true },
  // Booking.bookingId of the stay this review is for; guest name / room / stay dates are read
  // off that booking rather than duplicated here.
  bookingId: { type: String, required: true, unique: true },
  // Stars in half steps (0.5 to 5) — the guest app's rating control fills half a star at a time.
  rating: {
    type: Number,
    required: true,
    min: 0.5,
    max: 5,
    validate: { validator: (v) => Number.isInteger(v * 2), message: 'rating must be in steps of 0.5' },
  },
  review: { type: String, default: '' },
  // Private "how could we improve your stay" answer a guest gives after a low rating (at or below the
  // property's lowMax). Only ever surfaced in the dashboard's Feedback tab — never pushed externally.
  recoveryResponse: { type: String, default: '' },
  // Name of the review site (Google Reviews, Booking.com, ...) the guest was sent to after rating above
  // the threshold. Only the redirect is knowable — never whether they went on to post anything.
  redirectedTo: { type: String, default: '' },
  // Legacy: set by the old guest app when a guest tapped the Google Reviews link. No longer written.
  googleClicked: { type: Boolean, default: false },
}, { timestamps: true });

feedbackSchema.index({ propertyId: 1, createdAt: -1 });

const Feedback = mongoose.model('Feedback', feedbackSchema);

export default Feedback;
