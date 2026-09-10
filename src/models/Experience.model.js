import mongoose from 'mongoose';

const timeSlotSchema = new mongoose.Schema({
  time: {
    type: String,
    required: true // e.g., "07:00 AM"
  },
  endTime: String, // e.g., "08:30 AM"
  label: String,  // e.g., "Morning Walk"
  capacity: {
    type: Number,
    required: true,
    min: 0
  },
  available: {
    type: Number,
    required: true,
    min: 0
  },
  priceModifier: {
    type: Number,
    default: 0 // percentage modifier for this slot
  },
  // Which days this slot runs on — property-dashboard's Weekday (Mon-Fri) / Weekend (Sat-Sun)
  // split under the Experience Hub's Time Slots editor.
  dayType: {
    type: String,
    enum: ['weekday', 'weekend'],
    default: 'weekday'
  },
  // Staff can hide a slot from guests without deleting it (property-dashboard's per-slot toggle).
  active: {
    type: Boolean,
    default: true
  }
});

const experienceSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  shortDescription: {
    type: String,
    default: ''
  },
  fullDescription: {
    type: String,
    default: ''
  },
  // Free-form now (was a fixed enum) — the Experience Hub dashboard lets staff add their own
  // categories on the fly (see property-dashboard's "+ Add Category"), so this can't be a closed
  // list. Existing enum values above are preserved as the common defaults elsewhere still expect.
  category: {
    type: String,
    required: true
  },
  imageUrl: {
    type: String,
    default: ''
  },
  // Each entry is either a legacy bare URL string (pre-caption documents) or an object carrying
  // { image, title, description } — for videos, also { url: <playable link>, image: <thumbnail> }.
  // Mixed (not a subdocument schema) so old string entries keep loading instead of getting cast
  // into empty subdocuments — property-dashboard's toMediaItem() normalizes either shape on read.
  images: [mongoose.Schema.Types.Mixed],
  videos: [mongoose.Schema.Types.Mixed],
  duration: {
    value: Number,
    unit: {
      type: String,
      enum: ['minutes', 'hours', 'days']
    }
  },
  location: {
    name: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  pricing: {
    basePrice: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: 'INR'
    },
    pricePerPerson: {
      type: Boolean,
      default: true
    }
  },
  groupSize: {
    min: {
      type: Number,
      default: 1
    },
    max: {
      type: Number,
      default: 10
    }
  },
  inclusions: [String],
  exclusions: [String],
  requirements: [String],
  timeSlots: [timeSlotSchema],
  availability: {
    type: String,
    enum: ['daily', 'specific-days', 'on-request'],
    default: 'daily'
  },
  specificDays: [Number], // 0-6, Sunday-Saturday
  advanceBookingRequired: {
    value: Number,
    unit: {
      type: String,
      // 'minutes' added for the Experience Hub dashboard's Cutoff Timing field, which is always
      // expressed in minutes (see property-dashboard's dashboardAPI.experiences adapter).
      enum: ['minutes', 'hours', 'days']
    }
  },
  cancellationPolicy: String,
  isActive: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  propertyId: {
    type: String,
    required: true
  },
  tags: [String],
  // For spotlight carousel
  isSpotlight: {
    type: Boolean,
    default: false
  },
  spotlightOrder: Number,
  // For crafted experiences
  isCrafted: {
    type: Boolean,
    default: false
  },
  craftedOrder: Number,

  // Extended scheduling & display fields
  propertyScheduled: { type: Boolean, default: false },
  guestCanChooseGroupSize: { type: Boolean, default: true },
  capacityUnit: { type: String, default: '' },
  blackoutDates: [Date],
  // Date-range blocking used by the Experience Hub dashboard (distinct from the single-date
  // blackoutDates above, which predates it and is left untouched for whatever still reads it).
  blockedRanges: [{ start: String, end: String }],
  slotsPerSession: { type: Number, default: 1 },
  bookingsPerDay: { type: Number, default: 10 },
  pricingLabel: { type: String, default: '' },
  durationDisplayText: { type: String, default: '' },
  peopleAccommodatedMin: Number,
  peopleAccommodatedMax: Number,
  addOns: [{
    name: String,
    type: { type: String, enum: ['Checkbox', 'Counter'] },
    description: String,
    note: String,
    price: { type: Number, default: 0 }
  }],

  // For linked listings (shortcuts to other sections)
  type: { type: String, enum: ['activity', 'linked'], default: 'activity' },
  ctaLabel: { type: String, default: 'Book Now' },
  redirectPath: String
}, {
  timestamps: true
});

// Index for faster queries
experienceSchema.index({ category: 1 });
experienceSchema.index({ isActive: 1 });
experienceSchema.index({ isFeatured: 1 });
experienceSchema.index({ isSpotlight: 1 });
experienceSchema.index({ isCrafted: 1 });
experienceSchema.index({ propertyId: 1 });

const Experience = mongoose.model('Experience', experienceSchema);

export default Experience;
