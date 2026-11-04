import mongoose from 'mongoose';

// The post-stay feedback flow (see utils/feedbackSettings.js). Deliberately no schema defaults: a
// settings document saved before this shape existed only has `negMax`, and resolveFeedbackSettings
// has to be able to tell "never set" from "set to the default".
const reviewSiteSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, default: '' },
  url: { type: String, default: '' },
  on: { type: Boolean, default: false },
  custom: { type: Boolean, default: false },
}, { _id: false });

const feedbackSettingsSchema = new mongoose.Schema({
  propertyId: { type: String, required: true, unique: true },
  // Ratings from 0.5 up to and including this are "low": the guest is asked what went wrong.
  lowMax: { type: Number, min: 1, max: 4 },
  prompt: { type: String },
  reviewSites: { type: [reviewSiteSchema], default: undefined },
}, { timestamps: true });

const FeedbackSettings = mongoose.model('FeedbackSettings', feedbackSettingsSchema);

export default FeedbackSettings;
