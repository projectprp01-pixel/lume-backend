import mongoose from 'mongoose';

const priceIncludeSchema = new mongoose.Schema({
  label: { type: String, required: true }
}, { _id: true });

const attractionSchema = new mongoose.Schema({
  label: { type: String, required: true }
}, { _id: true });

const pricingTierSchema = new mongoose.Schema({
  fromNights: { type: Number, required: true },
  toNights: { type: Number, required: true },
  routeLabel: { type: String, required: true },
  price: { type: Number, required: true }
}, { _id: true });

const transportSchema = new mongoose.Schema({
  propertyId: { type: String, required: true, unique: true },
  visible: { type: Boolean, default: true },
  pageTitle: { type: String, default: 'How to Reach Evolve Back, Coorg' },
  introText: {
    type: String,
    default: 'Evolve Back, Coorg is just a 235 km (4.5 hour) drive from Bengaluru city. The resort is nestled in the heart of a 300-acre coffee plantation in Karadigodu village, Siddapur.'
  },
  transfersDescription: {
    type: String,
    default: 'We provide the finest vehicles (Private Innova Crysta) with experienced and courteous drivers to make your journey comfortable and memorable.'
  },
  priceIncludes: { type: [priceIncludeSchema], default: [] },
  sightseeingIntro: {
    type: String,
    default: 'The vehicle is at your disposal throughout your stay for sightseeing in and around Coorg.'
  },
  sightseeingAttractions: { type: [attractionSchema], default: [] },
  pricingTiers: { type: [pricingTierSchema], default: [] },
  defaultPrice: { type: Number, default: 15000 },
  customRequest: {
    active: { type: Boolean, default: true },
    descriptionText: {
      type: String,
      default: "If you're looking for transfers from any other location apart from Bangalore, please Write to Us. Our team will review your request and respond to you on your registered email address, latest within the next 4 hours."
    }
  },
  stopovers: {
    active: { type: Boolean, default: true },
    subtitleText: { type: String, default: 'Plan a break on your way here' },
    externalUrl: { type: String, default: '' }
  }
}, { timestamps: true });

transportSchema.index({ propertyId: 1 });

const Transport = mongoose.model('Transport', transportSchema);

export default Transport;
