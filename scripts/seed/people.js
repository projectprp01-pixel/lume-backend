/**
 * Staff Management seed: departments (with their hub-access matrix), the founding Admin + GM,
 * a Manager and a Staff member per department, one deactivated account, and a Staff Log.
 *
 * Login accounts are dev fixtures on the fictional @lume.test domain:
 *   admin@lume.test  / Admin@1234         (Admin, founding)
 *   gm@lume.test     / Lume@1234          (GM, founding)
 *   <dept>.manager@lume.test / Lume@1234  (department Manager)
 *   <dept>.staff@lume.test   / Lume@1234  (department Staff)
 */

import Department from '../../src/models/Department.model.js';
import Staff from '../../src/models/Staff.model.js';
import StaffActivityLog from '../../src/models/StaffActivityLog.model.js';
import { syncDepartmentRegistry } from '../../src/ai/departmentRegistry.js';
import { PROPERTY_ID, PROPERTY_NAME, dayAt, insertMany } from './lib.js';

export const ADMIN_PASSWORD = 'Admin@1234';
export const STAFF_PASSWORD = 'Lume@1234';

const ROLES = ['Manager', 'Staff', 'Trainee'];

// Order matters: the FIRST department is the AI request router's fallback (Front Desk).
const DEPARTMENTS = [
  { name: 'Front Desk', slug: 'frontdesk', hubs: ['Check-in Hub', 'Guest Management', 'Checkout & Feedback', 'Notifications'], manager: ['Anjali', 'Rao'], staff: ['Vikram', 'Shetty'] },
  { name: 'Concierge', slug: 'concierge', hubs: ['Experiences', 'Guest Management'], manager: ['Deepa', 'Nair'], staff: ['Arun', 'Kumar'] },
  { name: 'F & B', slug: 'fnb', hubs: ['F&B'], manager: ['Chef Ramesh', 'Gowda'], staff: ['Suresh', 'Poovaiah'] },
  { name: 'Housekeeping', slug: 'housekeeping', hubs: [], manager: ['Lakshmi', 'Devi'], staff: ['Kavya', 'Bopanna'] },
  { name: 'Laundry', slug: 'laundry', hubs: [], manager: ['Mahesh', 'Naik'], staff: ['Ravi', 'Kumar'], inactiveStaff: true },
  { name: 'Maintenance', slug: 'maintenance', hubs: [], manager: ['Prakash', 'Ganapathy'], staff: ['Manju', 'Nath'] },
  { name: 'Spa & Wellness', slug: 'spa', hubs: ['Spa'], manager: ['Dr. Meera', 'Krishnan'], staff: ['Sneha', 'Iyer'] },
  { name: 'Transport', slug: 'transport', hubs: ['Transport'], manager: ['Kiran', 'Appaiah'], staff: ['Bharath', 'Ponnappa'] },
];

const accessFor = (hubs) => {
  const base = { Home: true, Requests: true };
  const granted = Object.fromEntries(hubs.map((h) => [h, true]));
  return {
    Manager: { ...base, ...granted, Notifications: true },
    Staff: { ...base, ...granted },
    Trainee: { ...base },
  };
};

export async function seedPeople() {
  const staff = {};

  const admin = await Staff.create({
    firstName: 'Lume', lastName: 'Admin', email: 'admin@lume.test', password: ADMIN_PASSWORD,
    tier: 'Admin', role: 'Admin', isFounding: true, propertyId: PROPERTY_ID, propertyName: PROPERTY_NAME,
    phone: '+91 98450 00001', lastLogin: dayAt(-1, 9, 30),
    permissions: { canApproveCheckIns: true, canManageExperiences: true, canManageBookings: true, canManageGuests: true, canViewAnalytics: true, canManageStaff: true },
  });
  const gm = await Staff.create({
    firstName: 'Priya', lastName: 'Menon', email: 'gm@lume.test', password: STAFF_PASSWORD,
    tier: 'GM', role: 'GM', isFounding: true, propertyId: PROPERTY_ID, propertyName: PROPERTY_NAME,
    phone: '+91 98450 00002', lastLogin: dayAt(0, 8, 45),
    permissions: { canApproveCheckIns: true, canManageExperiences: true, canManageBookings: true, canManageGuests: true, canViewAnalytics: true, canManageStaff: true },
  });
  staff.admin = admin;
  staff.gm = gm;

  let phone = 10;
  for (const d of DEPARTMENTS) {
    await Department.create({ propertyId: PROPERTY_ID, name: d.name, roles: ROLES, access: accessFor(d.hubs) });
    for (const [role, [firstName, lastName]] of [['Manager', d.manager], ['Staff', d.staff]]) {
      const isInactive = role === 'Staff' && d.inactiveStaff;
      staff[`${d.slug}.${role.toLowerCase()}`] = await Staff.create({
        firstName, lastName,
        email: `${d.slug}.${role.toLowerCase()}@lume.test`,
        password: STAFF_PASSWORD, // hashed by the Staff pre-save hook
        tier: 'Staff', department: d.name, role,
        propertyId: PROPERTY_ID, propertyName: PROPERTY_NAME,
        phone: `+91 98450 000${phone++}`,
        isActive: !isInactive,
      });
    }
  }
  const registry = await syncDepartmentRegistry(PROPERTY_ID);

  // Staff Log — append-only in the product; seeded as history from the past few weeks.
  const log = (daysAgo, hour, actor, actorRole, action) => ({ propertyId: PROPERTY_ID, actorStaffId: actor._id, actorName: `${actor.firstName} ${actor.lastName}`.trim(), actorRole, action, createdAt: dayAt(-daysAgo, hour, 15) });
  await insertMany(StaffActivityLog, [
    log(40, 10, admin, 'Admin', 'Created department Front Desk.'),
    log(40, 10, admin, 'Admin', 'Created department Concierge.'),
    log(39, 11, admin, 'Admin', 'Created departments F & B, Housekeeping, Laundry, Maintenance, Spa & Wellness and Transport.'),
    log(38, 9, admin, 'Admin', `Added GM account — ${gm.firstName} ${gm.lastName}.`),
    log(37, 15, gm, 'GM', 'Added Front Desk · Manager — Anjali Rao.'),
    log(37, 15, gm, 'GM', 'Added Concierge · Manager — Deepa Nair.'),
    log(36, 12, gm, 'GM', 'Granted Front Desk · Manager access to Checkout & Feedback.'),
    log(21, 17, gm, 'GM', 'Added Laundry · Staff — Ravi Kumar.'),
    log(9, 10, gm, 'GM', 'Deactivated Laundry · Staff — Ravi Kumar.'),
    log(3, 14, admin, 'Admin', 'Reset login password — Anjali Rao.'),
  ]);

  return { staff, registry, departments: DEPARTMENTS.map((d) => d.name) };
}
