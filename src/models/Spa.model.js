import mongoose from 'mongoose';

const spaTreatmentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  price: { type: Number }, // legacy single price — kept in sync with durations[0] for back-compat
  duration: { type: Number }, // legacy single duration (minutes) — kept in sync with durations[0]
  imageUrl: String,
  subtitle: String,
  pricingLabel: { type: String, default: 'Per person' },
  capacityMin: { type: Number, default: 1 },
  capacityMax: { type: Number, default: 2 },
  // isActive stays for the guest-app's existing bookable check; status is the richer
  // three-state field the dashboard UI needs (active/unavailable/hidden) and is kept
  // in sync with isActive below (isActive === true only when status === 'active').
  isActive: { type: Boolean, default: true },
  status: { type: String, enum: ['active', 'unavailable', 'hidden'], default: 'active' },
  timeSlots: [{ label: String, startTime: String }],
  blockedDates: [Date],
  included: [String],
  durations: [{ minutes: Number, price: Number }],
  addons: [{ name: String, description: String, price: Number }],
  mode: { type: String, enum: ['individual', 'group'], default: 'individual' },
  maxParticipants: Number
});

spaTreatmentSchema.pre('validate', function syncIsActive() {
  this.isActive = this.status === 'active';
});

const spaCategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  treatments: [spaTreatmentSchema]
});

const spaFacilitySchema = new mongoose.Schema({
  name: { type: String, required: true },
  subtitle: String,
  description: String,
  operatingHours: String,
  advanceBooking: String,
  listingImage: String,
  detailImage: String,
  isActive: { type: Boolean, default: true },
  propertyId: { type: String, required: true },
  timeSlots: { type: [String], default: ['09:00', '10:15', '11:30', '14:00', '15:15'] },
  maxBookingsPerSlot: { type: Number, default: 3 },
  therapistsAvailable: { type: Number, default: 1 },
  categories: [spaCategorySchema],
  blockedDates: [Date],
  gallery: [String],
  availableDays: { type: [String], default: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] }
}, {
  timestamps: true
});

spaFacilitySchema.index({ propertyId: 1 });
spaFacilitySchema.index({ isActive: 1 });

const SpaFacility = mongoose.model('SpaFacility', spaFacilitySchema);

export default SpaFacility;
