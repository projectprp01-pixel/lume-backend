import mongoose from 'mongoose';

const menuItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: String,
  category: {
    type: String,
    enum: ['appetizer', 'main-course', 'dessert', 'beverage', 'special'],
    required: true
  },
  price: Number,
  imageUrl: String,
  isVegetarian: Boolean,
  isVegan: Boolean,
  isGlutenFree: Boolean,
  spiceLevel: {
    type: String,
    enum: ['mild', 'medium', 'hot', 'extra-hot']
  },
  allergens: [String],
  isAvailable: {
    type: Boolean,
    default: true
  }
});

const restaurantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  cuisine: [String],
  imageUrl: {
    type: String,
    required: true
  },
  images: [String],
  location: {
    name: String,
    floor: String,
    description: String
  },
  propertyId: {
    type: String,
    required: true
  },
  openingHours: {
    breakfast: {
      start: String,
      end: String
    },
    lunch: {
      start: String,
      end: String
    },
    dinner: {
      start: String,
      end: String
    }
  },
  capacity: Number,
  ambiance: [String],
  specialties: [String],
  dressCode: String,
  menu: [menuItemSchema],
  isActive: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  averageRating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },
  contactNumber: String,
  reservationRequired: {
    type: Boolean,
    default: false
  },
  // F&B Hub fields
  facilityType: { type: String, enum: ['restaurant', 'intimate_dining'], default: 'restaurant' },
  subtitle: { type: String, default: '' },
  mealTimes: [{ type: String, enum: ['breakfast', 'lunch', 'dinner'] }],
  bookingMode: { type: String, enum: ['reservations', 'info-only'], default: 'info-only' },
  maxGuests: { type: Number },
  whatsIncluded: [String],
  guestNote: { type: String },
  price: { type: Number },
  pricingLabel: { type: String },
  tablesPerNight: { type: Number },
  blockedDates: [String],
}, {
  timestamps: true
});

// Index for faster queries
restaurantSchema.index({ propertyId: 1 });
restaurantSchema.index({ isActive: 1 });
restaurantSchema.index({ isFeatured: 1 });
restaurantSchema.index({ facilityType: 1 });

const Restaurant = mongoose.model('Restaurant', restaurantSchema);

export default Restaurant;
