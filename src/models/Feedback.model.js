import mongoose from 'mongoose';

// Sentiment is intentionally NOT a field here — it's computed from `rating` against the
// property's live thresholds (FeedbackSettings) every time it's read (Checkout & Feedback PRD,
// Steps 6 and 9).
const feedbackSchema = new mongoose.Schema({
  propertyId: { type: String, required: true },
  // Booking.bookingId of the stay this review is for; guest name / room / stay dates are read
  // off that booking rather than duplicated here.
  bookingId: { type: String, required: true, unique: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  review: { type: String, default: '' },
  // Private "how could we have made this better" answer a guest gives after a low rating.
  // Only ever surfaced in the dashboard's Feedback tab — never linked or pushed externally.
  recoveryResponse: { type: String, default: '' },
  // Set by the guest app when the guest taps the Google Reviews link. Only the click is
  // knowable — never whether they went on to post anything.
  googleClicked: { type: Boolean, default: false },
}, { timestamps: true });

feedbackSchema.index({ propertyId: 1, createdAt: -1 });

const Feedback = mongoose.model('Feedback', feedbackSchema);

export default Feedback;
