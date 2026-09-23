import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const staffSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true
  },
  // Not required: the dashboard only ever collects one "Full name" field (Staff
  // Management PRD) and splits it into firstName/(rest) purely so this model keeps its
  // existing firstName/lastName shape — a single-word name (or a test account like
  // "employee_1") has nothing to put here, and that's fine.
  lastName: {
    type: String,
    default: ''
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
  // Three tiers, not two (Staff Management PRD): Admin has full account-level authority
  // over everyone, including other Admins and every GM. GM has full day-to-day
  // operational access but can't touch Admin accounts. "Staff" is everyone else,
  // scoped to one department by that department's hub-access matrix (see
  // Department.model.js). Defaults to 'Staff' so a doc written before this field
  // existed (tier missing) is never silently treated as more privileged than it was.
  tier: {
    type: String,
    enum: ['Admin', 'GM', 'Staff'],
    default: 'Staff',
  },
  // Free-form role name within `department` — e.g. "Manager", "Trainee", or any
  // custom name a property defines in Departments & Roles. Only meaningful when
  // tier === 'Staff'; kept as a plain String (not an enum) because roles are fully
  // custom per property, not a fixed list.
  role: {
    type: String,
  },
  // Free-form department name, matching a Department.name for this propertyId. Only
  // meaningful when tier === 'Staff' — Admin/GM aren't scoped to a department. Not a
  // fixed enum for the same reason as `role`.
  department: {
    type: String,
  },
  // True only for the two founding Admin/GM accounts a property starts with — purely
  // a display flag ("System · Admin" / "System · GM" in the dashboard), never a
  // permission. See Staff Management PRD, Step 1.
  isFounding: {
    type: Boolean,
    default: false,
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
staffSchema.index({ tier: 1 });
staffSchema.index({ propertyId: 1 });
staffSchema.index({ isActive: 1 });

const Staff = mongoose.model('Staff', staffSchema);

export default Staff;
