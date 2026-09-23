import mongoose from 'mongoose';

// Append-only admin action log backing Staff Management's Staff Log tab (Staff
// Management PRD, Step 5 — "Admin access required"). Written by staff.controller.js /
// department.controller.js on every mutation; never updated or deleted from the API,
// matching the PRD's "not editable or deletable, including by Admins."
const staffActivityLogSchema = new mongoose.Schema({
  propertyId: { type: String, required: true },
  actorStaffId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  actorName: { type: String, required: true },
  // Display label at the time of the action — "Admin", "GM", or "{department} · {role}"
  // — kept as a plain string so the log stays readable even if the actor's own role
  // changes or the account is later removed.
  actorRole: { type: String, required: true },
  action: { type: String, required: true },
}, { timestamps: true });

staffActivityLogSchema.index({ propertyId: 1, createdAt: -1 });

const StaffActivityLog = mongoose.model('StaffActivityLog', staffActivityLogSchema);

export default StaffActivityLog;
