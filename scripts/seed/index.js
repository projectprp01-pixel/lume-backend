/**
 * Unified seed — ONE command that (re)builds the whole demo database with a single Booking ID
 * per stay, carried identically through every screen (Guests, Check-in, Experiences, Spa,
 * Transport, F&B, Requests, Checkout & Feedback, Notifications).
 *
 *   npm run seed                 # wipe + reseed the database MONGODB_URI(_DEV) points at
 *   npm run seed -- --allow-any-host   # ONLY if you really mean to wipe a different cluster
 *
 * This WIPES every collection the app owns, then rebuilds it. As a guard it refuses to run
 * unless the connected host is the LUMEDB cluster (or you pass --allow-any-host), so it can't
 * clobber an older cluster that still holds real guest data by accident.
 *
 * Read README.md in this folder before changing anything: the Booking-ID rule is the point.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { MONGODB_URI, MONGODB_DB_NAME } from '../../src/config/env.js';

import AppBanner from '../../src/models/AppBanner.model.js';
import Booking from '../../src/models/Booking.model.js';
import CheckIn from '../../src/models/CheckIn.model.js';
import CheckoutFolio from '../../src/models/CheckoutFolio.model.js';
import Department from '../../src/models/Department.model.js';
import DepartmentRegistry from '../../src/models/DepartmentRegistry.model.js';
import DiningReservation from '../../src/models/DiningReservation.model.js';
import Experience from '../../src/models/Experience.model.js';
import ExperienceBooking from '../../src/models/ExperienceBooking.model.js';
import ExperienceDiscount from '../../src/models/ExperienceDiscount.model.js';
import FbDish from '../../src/models/FbDish.model.js';
import FbMenuCategory from '../../src/models/FbMenuCategory.model.js';
import FbMenuSubcategory from '../../src/models/FbMenuSubcategory.model.js';
import FbOrder from '../../src/models/FbOrder.model.js';
import FbOrderingSettings from '../../src/models/FbOrderingSettings.model.js';
import Feedback from '../../src/models/Feedback.model.js';
import FeedbackSettings from '../../src/models/FeedbackSettings.model.js';
import Guest from '../../src/models/Guest.model.js';
import Notification from '../../src/models/Notification.model.js';
import PropertySettings from '../../src/models/PropertySettings.model.js';
import Restaurant from '../../src/models/Restaurant.model.js';
import ServiceRequest from '../../src/models/ServiceRequest.model.js';
import SpaBooking from '../../src/models/SpaBooking.model.js';
import SpaFacility from '../../src/models/Spa.model.js';
import Staff from '../../src/models/Staff.model.js';
import StaffActivityLog from '../../src/models/StaffActivityLog.model.js';
import Transport from '../../src/models/Transport.model.js';
import TransportBooking from '../../src/models/TransportBooking.model.js';

import { NOW, money, isoDay } from './lib.js';
import { seedPeople, ADMIN_PASSWORD, STAFF_PASSWORD } from './people.js';
import { seedCatalog } from './catalog.js';
import { seedStays } from './stays.js';
import { verify } from './verify.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALLOWED_HOST = /xgcb2yk\.mongodb\.net$/; // the LUMEDB cluster
const allowAnyHost = process.argv.includes('--allow-any-host');

// Every collection the seed owns. If you add a model to the app, add it here too.
const OWNED = [
  AppBanner, Booking, CheckIn, CheckoutFolio, Department, DepartmentRegistry, DiningReservation, Experience,
  ExperienceBooking, ExperienceDiscount, FbDish, FbMenuCategory, FbMenuSubcategory, FbOrder, FbOrderingSettings,
  Feedback, FeedbackSettings, Guest, Notification, PropertySettings, Restaurant, ServiceRequest, SpaBooking,
  SpaFacility, Staff, StaffActivityLog, Transport, TransportBooking,
];

const t0 = Date.now();
await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB_NAME, serverSelectionTimeoutMS: 20000 });
const host = mongoose.connection.host;
console.log(`Connected → ${host} / ${mongoose.connection.name}`);

if (!ALLOWED_HOST.test(host) && !allowAnyHost) {
  console.error(`\nREFUSING to wipe "${host}": it is not the LUMEDB cluster.\nCheck MONGODB_URI_DEV in .env (or pass --allow-any-host if you truly mean it).`);
  await mongoose.disconnect();
  process.exit(2);
}

// ---- wipe ------------------------------------------------------------------------------------
const known = new Set(OWNED.map((m) => m.collection.name));
const existing = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name);
const unknown = existing.filter((n) => !known.has(n) && !n.startsWith('system.'));
for (const M of OWNED) await M.deleteMany({});
// Make sure the unique indexes exist before inserting. Booking and ExperienceBooking declare
// bookingId as both `unique: true` and a separate plain index, which Mongo rejects as a
// duplicate — the unique one is created first, so that particular error is safe to ignore.
await Promise.all(OWNED.map((M) => M.init().catch((e) => { if (e.code !== 86) throw e; })));
const bookingIdx = await Booking.collection.indexes();
if (!bookingIdx.some((i) => i.key.bookingId === 1 && i.unique)) throw new Error('Booking.bookingId unique index is missing — refusing to seed without it.');
console.log(`Wiped ${OWNED.length} collections.${unknown.length ? ` (Left untouched — not owned by the seed: ${unknown.join(', ')})` : ''}`);

// ---- seed ------------------------------------------------------------------------------------
const people = await seedPeople();
console.log(`Staff: ${Object.keys(people.staff).length} accounts across ${people.departments.length} departments`);
const catalog = await seedCatalog();
console.log(`Catalog: ${Object.keys(catalog.exp).length} experiences, spa (${Object.keys(catalog.spa.treat).length} treatments), transport, ${Object.keys(catalog.dining).length} dining venues, ${Object.keys(catalog.dishes).length} in-room dishes`);
const built = await seedStays({ catalog, people });
if (built.violations.length) {
  console.error('\nThe cast has items outside their stay window — fix cast.js:\n - ' + built.violations.join('\n - '));
}
console.log(`Stays: ${built.stays.length} (ID range ${built.stays[0].bookingId} … ${built.stays.at(-1).bookingId}); ID PDFs via ${built.ids.where}`);

// ---- verify (against the database itself) --------------------------------------------------
const result = await verify();
const problems = [...built.violations, ...result.violations];

// ---- report ----------------------------------------------------------------------------------
const d = (x) => isoDay(new Date(x));
const rows = result.perStay.map((s) =>
  `| ${s.bookingId} | ${s.guest} | ${d(s.arrival)} → ${d(s.checkout)} | ${s.status} | ${s.checkIn} | ${s.rooms} | ${s.exp} | ${s.spa} | ${s.trn} | ${s.din} | ${s.fb} | ${s.req} | ${s.pending ? money(s.pending) : '—'} | ${s.rating ?? '—'} |`);
const t = result.totals;
const report = `# Seed report

Generated ${NOW.toISOString()} · database \`${host}\` / \`${mongoose.connection.name}\`

## Booking-ID consistency: ${problems.length === 0 ? 'PASS ✅' : `FAIL ❌ (${problems.length})`}

${problems.length === 0
  ? `All ${t.stays} stays use one ID (\`EB-YYYY-NNNNN\`). Every check-in, hub booking, F&B order, folio, review, request and notification resolves to a real stay by that ID; hub refs start with it; guest, name and room match on every linked document; no stray or legacy IDs; no room double-booked.`
  : problems.map((p) => `- ${p}`).join('\n')}

## What was seeded

| Collection | Documents |
|---|---|
| Stays (Booking) / Guests | ${t.stays} / ${t.stays} |
| Check-ins | ${t.checkIns} |
| Experience bookings | ${t.exp} |
| Spa bookings | ${t.spa} |
| Transport bookings | ${t.trn} |
| Dining reservations | ${t.din} |
| In-room F&B orders | ${t.fb} |
| Checkout folios / time overrides | ${t.folios} |
| Reviews | ${t.feedback} |
| Guest requests | ${t.requests} |
| Guest notifications | ${t.notifications} |

Plus (no booking ID): ${Object.keys(catalog.exp).length} experiences + 2 discounts, Amrutha Spa (${Object.keys(catalog.spa.treat).length} treatments), transport fleet + 4 offerings, ${Object.keys(catalog.dining).length} dining venues, in-room menu (${Object.keys(catalog.dishes).length} dishes), 3 banners, Property Settings (guest-app CMS, gallery, wifi, directory, comms), ${people.departments.length} departments, ${Object.keys(people.staff).length} staff accounts, staff log.

## Logins (dev fixtures)

| Account | Email | Password |
|---|---|---|
| Admin (founding) | admin@lume.test | ${ADMIN_PASSWORD} |
| GM (founding) | gm@lume.test | ${STAFF_PASSWORD} |
| Department Manager / Staff | \`<dept>.manager@lume.test\` / \`<dept>.staff@lume.test\` — dept ∈ frontdesk, concierge, fnb, housekeeping, laundry, maintenance, spa, transport | ${STAFF_PASSWORD} |

## Every stay, with what is linked to its ID

Counts are documents that carry that stay's ID. "Pending" is what the Checkout hub will show as still owed.

| Booking ID | Guest | Stay | Status | Check-in | Rooms | Exp | Spa | Trn | Din | F&B | Req | Pending | ★ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
${rows.join('\n')}
`;
fs.writeFileSync(path.join(__dirname, 'LAST_RUN_REPORT.md'), report);

console.log(`\nBooking-ID consistency: ${problems.length === 0 ? 'PASS' : 'FAIL'}`);
if (problems.length) console.error(problems.slice(0, 40).map((p) => ` - ${p}`).join('\n') + (problems.length > 40 ? `\n ...and ${problems.length - 40} more` : ''));
console.table(t);
console.log(`Report: scripts/seed/LAST_RUN_REPORT.md   (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

await mongoose.disconnect();
process.exit(problems.length ? 1 : 0);
