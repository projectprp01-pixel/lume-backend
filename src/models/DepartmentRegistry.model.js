import mongoose from 'mongoose';

// The single, AI-readable list of department names for a property — one document per
// property, rebuilt from the Department collection (Staff Management) whenever a
// department is created, renamed or removed. The AI layer never queries Department
// directly: it reads this document (see src/ai/departmentRegistry.js), so "which
// departments exist" has exactly one place to look.
//
// `departments` is ordered by when each department was created, and `fallback` is
// always its first entry: whenever the AI layer can't (or isn't asked to) pick a
// department, requests land in `fallback`.
const departmentRegistrySchema = new mongoose.Schema({
  propertyId: { type: String, required: true, unique: true },
  departments: { type: [String], default: [] },
  fallback: { type: String, default: '' },
}, { timestamps: true });

export default mongoose.model('DepartmentRegistry', departmentRegistrySchema);
