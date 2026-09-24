import mongoose from 'mongoose';

// negMax: ratings from 1 up to and including this are Negative.
// posMin: ratings from this up to 5 are Positive. Anything between is Neutral.
const feedbackSettingsSchema = new mongoose.Schema({
  propertyId: { type: String, required: true, unique: true },
  negMax: { type: Number, default: 2, min: 1, max: 3 },
  posMin: { type: Number, default: 4, min: 3, max: 5 },
}, { timestamps: true });

const FeedbackSettings = mongoose.model('FeedbackSettings', feedbackSettingsSchema);

export default FeedbackSettings;
