import mongoose from 'mongoose';

const spaTreatmentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  price: { type: Number, required: true },
  duration: { type: Number, required: true }, // in minutes
  imageUrl: String,
  subtitle: String,
  pricingLabel: { type: String, default: 'Per person' },
  capacityMin: { type: Number, default: 1 },
  capacityMax: { type: Number, default: 2 },
  isActive: { type: Boolean, default: true },
  timeSlots: [{ label: String, startTime: String }],
  blockedDates: [Date]
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
  categories: [spaCategorySchema]
}, {
  timestamps: true
});

spaFacilitySchema.index({ propertyId: 1 });
spaFacilitySchema.index({ isActive: 1 });

const SpaFacility = mongoose.model('SpaFacility', spaFacilitySchema);

export default SpaFacility;
