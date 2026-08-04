import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const staffSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    select: false // Don't include password in queries by default
  },
  role: {
    type: String,
    enum: ['Admin', 'Front Desk', 'Restaurant Manager', 'Spa Manager', 'Trainee'],
    default: 'Admin'
  },
  department: {
    type: String,
    enum: ['front-desk', 'housekeeping', 'food-beverage', 'spa', 'activities', 'management'],
  },
  propertyId: {
    type: String,
    required: true
  },
  propertyName: String,
  permissions: {
    canApproveCheckIns: {
      type: Boolean,
      default: false
    },
    canManageExperiences: {
      type: Boolean,
      default: false
    },
    canManageBookings: {
      type: Boolean,
      default: false
    },
    canManageGuests: {
      type: Boolean,
      default: false
    },
    canViewAnalytics: {
      type: Boolean,
      default: false
    },
    canManageStaff: {
      type: Boolean,
      default: false
    }
  },
  phone: String,
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: Date
}, {
  timestamps: true
});

// Hash password before saving
staffSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare passwords
staffSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Index for faster queries
staffSchema.index({ email: 1 });
staffSchema.index({ role: 1 });
staffSchema.index({ propertyId: 1 });
staffSchema.index({ isActive: 1 });

const Staff = mongoose.model('Staff', staffSchema);

export default Staff;
