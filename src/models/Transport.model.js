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

// ===== Transport Hub (dashboard) — fleet, offerings, bookings =====
// Additive to the legacy "How to Reach" fields above; unrelated to that guest-facing flow.

const vehicleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, default: 'Sedan' },
  capacity: { type: String, default: '' }, // free text, e.g. "Up to 4 guests"
  photoUrl: { type: String, default: '' }
}, { _id: true });

const vehiclePriceSchema = new mongoose.Schema({
  vehicleId: { type: mongoose.Schema.Types.ObjectId, required: true },
  price: { type: Number, default: 0 }
}, { _id: false });

const cityPricingSchema = new mongoose.Schema({
  name: { type: String, required: true },
  vehiclePrices: { type: [vehiclePriceSchema], default: [] }
}, { _id: false });

const blockedRangeSchema = new mongoose.Schema({
  start: { type: String, required: true }, // ISO date string, e.g. "2026-09-01"
  end: { type: String, required: true }
}, { _id: false });

const offeringSchema = new mongoose.Schema({
  slot: { type: Number, required: true, min: 1, max: 4 }, // fixed slot, matches SERVICE_TYPE_META
  name: { type: String, required: true },
  desc: { type: String, default: '' },
  structure: { type: String, enum: ['daily', 'p2p', 'custom'], required: true },
  flatRate: { type: Boolean, default: false },
  published: { type: Boolean, default: true },
  included: { type: [String], default: [] },
  vehiclePricing: { type: [vehiclePriceSchema], default: [] },
  eligibleVehicles: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  cities: { type: [cityPricingSchema], default: [] },
  addons: { type: [Number], default: [] }, // other offering slot numbers attachable as add-ons
  blockedRanges: { type: [blockedRangeSchema], default: [] }
}, { _id: true });

const DEFAULT_OFFERINGS = [
  { slot: 1, name: 'One Day Fare for Sightseeing', desc: 'Cab at disposal for the day. Guests choose which days of their stay.', structure: 'daily', flatRate: false },
  { slot: 2, name: 'Fare for Only Pickup and Drop from Preferred City', desc: 'Standalone pickup or drop-off, bookable at any time during the stay.', structure: 'p2p', flatRate: false },
  { slot: 3, name: 'Full Trip Cab', desc: 'One flat price covering a cab for your entire stay, including pickup and drop-off from the city.', structure: 'daily', flatRate: true },
  { slot: 4, name: 'Custom / On-Request', desc: 'Guests describe their need and the team arranges — no fixed pricing.', structure: 'custom', flatRate: false },
];

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
  },

  // ---- Transport Hub ----
  heroImage: { type: String, default: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600' },
  heroDesc: { type: String, default: 'Dedicated vehicles with experienced drivers' },
  vehicles: { type: [vehicleSchema], default: [] },
  offerings: { type: [offeringSchema], default: () => DEFAULT_OFFERINGS.map((o) => ({ ...o })) }
}, { timestamps: true });

transportSchema.index({ propertyId: 1 });

export { DEFAULT_OFFERINGS };

const Transport = mongoose.model('Transport', transportSchema);

export default Transport;
