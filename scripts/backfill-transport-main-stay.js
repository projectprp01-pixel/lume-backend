/**
 * One-off backfill: set mainStayBookingId on TransportBooking documents created before the
 * guest/staff-manual transport paths started attaching it (those bookings linked to the stay only by
 * Booking._id, so they were missing from Stay Activity and the Checkout folio).
 *
 *   node scripts/backfill-transport-main-stay.js            # DRY RUN — reports, writes nothing
 *   node scripts/backfill-transport-main-stay.js --apply    # performs the updates
 *
 * A booking is only updated when its stay is unambiguous: it has a `bookingId` (Booking._id) that
 * resolves to a real Booking. Anything else (no bookingId, or a bookingId pointing at a Booking that no
 * longer exists) is reported and left untouched — a guest can have several stays, so guessing from
 * guestId would risk attaching a booking to the wrong one.
 *
 * Idempotent: bookings that already carry a mainStayBookingId are skipped, so re-running is safe.
 * Connects with the same env as the server (MONGODB_URI_DEV unless NODE_ENV=production).
 */
import mongoose from 'mongoose';
import { MONGODB_URI, MONGODB_DB_NAME, NODE_ENV } from '../src/config/env.js';
import Booking from '../src/models/Booking.model.js';
import TransportBooking from '../src/models/TransportBooking.model.js';

const apply = process.argv.includes('--apply');
const host = MONGODB_URI.match(/@([^/?]+)/)?.[1] ?? 'unknown host';

console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${host} / database "${MONGODB_DB_NAME}" (NODE_ENV=${NODE_ENV})`);
await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });

const missing = { $or: [{ mainStayBookingId: { $exists: false } }, { mainStayBookingId: null }, { mainStayBookingId: '' }] };
const candidates = await TransportBooking.find(missing).select('_id bookingId guestId guestName createdAt hubBooking').lean();
const total = await TransportBooking.countDocuments();

const stayIds = [...new Set(candidates.map((c) => c.bookingId).filter(Boolean).map(String))];
const stays = await Booking.find({ _id: { $in: stayIds } }).select('_id bookingId').lean();
const stayById = new Map(stays.map((s) => [String(s._id), s.bookingId]));

const updates = [];
const unresolved = [];
for (const c of candidates) {
  const stay = c.bookingId ? stayById.get(String(c.bookingId)) : null;
  if (stay) updates.push({ id: c._id, stay });
  else unresolved.push({ id: String(c._id), guest: c.guestName || '', reason: c.bookingId ? 'Booking no longer exists' : 'no bookingId to resolve from' });
}

console.log(`TransportBooking documents: ${total} total, ${candidates.length} without mainStayBookingId`);
console.log(`  resolvable (will ${apply ? 'be updated' : 'be updated with --apply'}): ${updates.length}`);
console.log(`  unresolvable (left untouched):        ${unresolved.length}`);
unresolved.forEach((u) => console.log(`    - ${u.id} "${u.guest}" — ${u.reason}`));

if (apply && updates.length) {
  const result = await TransportBooking.bulkWrite(
    updates.map((u) => ({ updateOne: { filter: { _id: u.id, ...missing }, update: { $set: { mainStayBookingId: u.stay } } } }))
  );
  console.log(`Updated ${result.modifiedCount} document(s).`);
} else if (!apply) {
  console.log('Dry run only — nothing written. Re-run with --apply to update.');
}

await mongoose.disconnect();
