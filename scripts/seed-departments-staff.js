/**
 * Dev seed: fill Staff Management with the departments the AI request router can pick
 * from, and a Manager + Staff member in each. Idempotent — departments are matched by name
 * and staff by email, and anything that already exists is left untouched (existing
 * departments keep their access matrix). The department registry is rebuilt at the end so
 * the AI layer sees the new departments immediately.
 *
 * Seeded accounts are dev fixtures: `<slug>.manager@lume.test` / `<slug>.staff@lume.test`,
 * password from SEED_STAFF_PASSWORD (default below).
 *
 * Run: node scripts/seed-departments-staff.js
 */

import mongoose from 'mongoose';
import { MONGODB_URI, MONGODB_DB_NAME } from '../src/config/env.js';
import Department from '../src/models/Department.model.js';
import Staff from '../src/models/Staff.model.js';
import { syncDepartmentRegistry } from '../src/ai/departmentRegistry.js';

const PROPERTY_ID = 'default';
const PROPERTY_NAME = 'Evolve Back Resort Coorg';
const PASSWORD = process.env.SEED_STAFF_PASSWORD || 'Lume@1234';
const ROLES = ['Manager', 'Staff', 'Trainee'];

// name → { slug, hub }: `hub` is the extra hub that department's Manager/Staff work in,
// on top of Home + Requests (which every role gets — a department has to see its tickets).
const DEPARTMENTS = [
  { name: 'Front Desk', slug: 'frontdesk', hub: 'Check-in Hub' },
  { name: 'Concierge', slug: 'concierge', hub: 'Experiences' }, // also takes special-occasion requests
  { name: 'F & B', slug: 'fnb', hub: 'F&B' },
  { name: 'Housekeeping', slug: 'housekeeping' },
  { name: 'Laundry', slug: 'laundry' },
  { name: 'Maintenance', slug: 'maintenance' },
  { name: 'Spa & Wellness', slug: 'spa', hub: 'Spa' },
  { name: 'Transport', slug: 'transport', hub: 'Transport' },
];

const accessFor = (hub) => ({
  Manager: { Home: true, Requests: true, ...(hub && { [hub]: true }) },
  Staff: { Home: true, Requests: true, ...(hub && { [hub]: true }) },
  Trainee: { Home: true, Requests: true },
});

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB_NAME });
console.log('Connected to', MONGODB_DB_NAME);

for (const { name, slug, hub } of DEPARTMENTS) {
  let dept = await Department.findOne({ propertyId: PROPERTY_ID, name });
  if (dept) {
    console.log(`= department exists: ${name}`);
  } else {
    dept = await Department.create({ propertyId: PROPERTY_ID, name, roles: ROLES, access: accessFor(hub) });
    console.log(`+ department: ${name}`);
  }

  for (const role of ['Manager', 'Staff']) {
    const email = `${slug}.${role.toLowerCase()}@lume.test`;
    if (await Staff.exists({ email })) {
      console.log(`  = staff exists: ${email}`);
      continue;
    }
    await Staff.create({
      firstName: `${name} ${role}`,
      lastName: '',
      email,
      password: PASSWORD, // hashed by the Staff pre-save hook
      tier: 'Staff',
      department: name,
      role,
      propertyId: PROPERTY_ID,
      propertyName: PROPERTY_NAME,
    });
    console.log(`  + staff: ${email} (${role})`);
  }
}

const registry = await syncDepartmentRegistry(PROPERTY_ID);
console.log('Registry:', registry.departments.join(' | '), `(fallback: ${registry.fallback})`);
console.log(`Staff password: ${PASSWORD}`);
await mongoose.disconnect();
