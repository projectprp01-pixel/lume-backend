import mongoose from 'mongoose';

// One document per department (Staff Management PRD: "Departments and Roles Are Fully
// Custom" — there is no fixed department list, and no fixed role list within one).
// `access` is the hub-access matrix for this department: { [roleName]: { [hubName]: true } }.
// A role/hub pair absent from `access` is always "not granted" — never "not yet
// configured" — so a hub added to the product later, or a role that hasn't had its
// matrix touched yet, both default to fully off rather than needing a migration.
const departmentSchema = new mongoose.Schema({
  propertyId: { type: String, required: true },
  name: { type: String, required: true },
  roles: { type: [String], default: [] },
  access: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

departmentSchema.index({ propertyId: 1, name: 1 }, { unique: true });

const Department = mongoose.model('Department', departmentSchema);

export default Department;
