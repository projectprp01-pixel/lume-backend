/**
 * One-time, additive migration: backfill the new `tier` field on every existing Staff
 * document that predates it (Staff Management PRD's three-tier model — Admin/GM/Staff
 * replacing the old fixed `role` enum as the account-level authority discriminator).
 *
 * Deliberately conservative: only SETS `tier` where it's missing. Never touches
 * `role`, `department`, or any other field on an existing document — those stay
 * exactly as they were, since `role`/`department` are now free-form strings and the
 * old enum values remain perfectly valid ones.
 *
 * Mapping: legacy role 'Admin' -> tier 'Admin'. Everything else -> tier 'Staff' (there
 * was no GM concept in the old schema, so nothing maps to 'GM' — an Admin creates the
 * property's first GM for real, through the dashboard, once this migration has run).
 *
 * Idempotent: re-running only affects documents still missing `tier`.
 *
 * Run once:
 *   node scripts/migrate-staff-tier.js
 */

import mongoose from 'mongoose';
import { MONGODB_URI, MONGODB_DB_NAME } from '../src/config/env.js';
import Staff from '../src/models/Staff.model.js';

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB_NAME });
console.log('Connected to', MONGODB_DB_NAME);

const missingTier = await Staff.find({ tier: { $exists: false } }, { firstName: 1, lastName: 1, role: 1, department: 1, propertyId: 1 });
console.log(`Found ${missingTier.length} staff document(s) without a tier.`);

for (const s of missingTier) {
  const tier = s.role === 'Admin' ? 'Admin' : 'Staff';
  await Staff.updateOne({ _id: s._id }, { $set: { tier } });
  console.log(`  ${s.firstName} ${s.lastName} (${s.propertyId}) — role "${s.role}" -> tier "${tier}"`);
}

console.log('Done.');
await mongoose.disconnect();
