import Department from '../models/Department.model.js';
import DepartmentRegistry from '../models/DepartmentRegistry.model.js';

// Department registry — what the AI layer reads to know which departments exist.
//
// Source of truth stays Staff Management (the Department collection). This module keeps
// one denormalised document per property in sync with it (`syncDepartmentRegistry`,
// called from department.controller.js on every create/rename) and gives the AI layer a
// parsed, validated view of it (`getDepartmentRegistry`). Nothing here hardcodes a
// department name — add one in Staff Management and it is routable immediately.
//
// Fallback rule: the first department (oldest by creation) is always the fallback, used
// whenever the AI layer returns nothing, something unparseable, or a name that isn't in
// the registry.

export const NO_DEPARTMENT = 'Unassigned'; // only when a property has zero departments

/**
 * Normalise whatever is stored/handed in into `{ departments, fallback }`: trims names,
 * drops blanks and case-insensitive duplicates (first spelling wins), and forces
 * `fallback` to be the first department regardless of what the raw doc says.
 */
export function parseDepartmentRegistry(raw) {
  const seen = new Set();
  const departments = [];
  for (const entry of Array.isArray(raw?.departments) ? raw.departments : []) {
    const name = typeof entry === 'string' ? entry.trim() : '';
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    departments.push(name);
  }
  return { departments, fallback: departments[0] || NO_DEPARTMENT };
}

/** Rebuild the registry doc for a property from Staff Management's departments. */
export async function syncDepartmentRegistry(propertyId) {
  const departments = await Department.find({ propertyId }).sort({ createdAt: 1, _id: 1 }).lean();
  const parsed = parseDepartmentRegistry({ departments: departments.map((d) => d.name) });
  await DepartmentRegistry.findOneAndUpdate(
    { propertyId },
    { propertyId, departments: parsed.departments, fallback: parsed.fallback === NO_DEPARTMENT ? '' : parsed.fallback },
    { upsert: true, new: true }
  );
  return parsed;
}

/**
 * The parsed registry for a property. Self-heals: a property that has departments but no
 * registry doc yet (created before this existed) is built on first read.
 */
export async function getDepartmentRegistry(propertyId) {
  const doc = await DepartmentRegistry.findOne({ propertyId }).lean();
  if (doc && doc.departments?.length) return parseDepartmentRegistry(doc);
  return syncDepartmentRegistry(propertyId);
}

/**
 * Map a department name suggested by the AI layer (or anyone) onto a canonical name from
 * the registry. Case/whitespace-insensitive. Anything not in the registry → fallback.
 * Returns `{ department, matched }` so callers can tell a real match from a fallback.
 */
export function resolveDepartment(registry, candidate) {
  const wanted = typeof candidate === 'string' ? candidate.trim().toLowerCase() : '';
  const found = wanted && registry.departments.find((d) => d.toLowerCase() === wanted);
  return found ? { department: found, matched: true } : { department: registry.fallback, matched: false };
}
