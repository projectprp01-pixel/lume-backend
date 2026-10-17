#!/usr/bin/env node
// Deletes ALL guest-side data and keeps everything the property configures.
//
// DELETED (every document):  guests, bookings, check-ins (incl. ID document records), checkout folios,
//   experience / spa / transport bookings, dining reservations, in-room orders, service requests,
//   notifications, feedback.
// ALSO DELETED: every guest ID file in Cloudflare R2 - all objects under the `checkin-ids/` prefix of the
//   bucket (the only place check-in uploads go). Nothing else in the bucket is touched. Pass --skip-r2 to
//   leave the files in place.
// KEPT (never touched): property settings + the dashboard guest-app builder, experiences, spa, restaurants,
//   dining menu, transport, discounts, banners, feedback settings, F&B ordering settings, departments, staff,
//   staff activity logs - and anything else not listed below.
//
// Safe by default:
//   node scripts/wipe-guest-data.js                         -> DRY RUN: counts per collection, deletes nothing
//   node scripts/wipe-guest-data.js --yes --db-name=<name>  -> backs up to ./backups/, then deletes
// The connection string is read from the MONGODB_URI environment variable of YOUR shell (set it for this
// one command; the script never reads .env files). --db-name must equal the database you are connected to.
// R2 needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME in the same shell
// (the same values the backend uses on Railway).
//
//   PowerShell:  $env:MONGODB_URI="<prod uri>"; $env:R2_ACCOUNT_ID="..."; ...; node scripts/wipe-guest-data.js
//
// Order when --yes: backup (database JSON) -> delete R2 ID files -> delete database documents. A failure in an
// earlier step stops the script before the later ones, so the database is never wiped while files remain
// unreachable, and the JSON backup keeps every ID file URL.

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

const { EJSON } = mongoose.mongo.BSON; // ships with mongoose
const args = process.argv.slice(2);
const confirmed = args.includes('--yes');
const dbNameArg = (args.find((a) => a.startsWith('--db-name=')) || '').split('=')[1];
const skipBackup = args.includes('--no-backup');
const skipR2 = args.includes('--skip-r2');
const ID_PREFIX = 'checkin-ids/';

// Collection name patterns (Mongoose lower-cases + pluralises model names).
const DELETE = [
  /^guests$/,
  /^bookings$/,
  /^checkins$/,
  /^checkoutfolios$/,
  /^experiencebookings$/,
  /^spabookings$/,
  /^transportbookings$/,
  /^diningreservations$/,
  /^fborders$/,
  /^servicerequests$/,
  /^notifications$/,
  /^feedbacks?$/,
];

// ---- R2 (guest ID files) ----
const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
const r2Configured = !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME);
let r2 = null;
async function r2Client() {
  if (!r2) {
    const { S3Client } = await import('@aws-sdk/client-s3');
    r2 = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    });
  }
  return r2;
}
// Every object key under the ID prefix.
async function listIdKeys() {
  const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
  const client = await r2Client();
  const keys = [];
  let token;
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: R2_BUCKET_NAME, Prefix: ID_PREFIX, ContinuationToken: token }),
    );
    for (const o of res.Contents ?? []) keys.push(o.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}
async function deleteKeys(keys) {
  const { DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
  const client = await r2Client();
  let deleted = 0;
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    const res = await client.send(
      new DeleteObjectsCommand({ Bucket: R2_BUCKET_NAME, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }),
    );
    if (res.Errors?.length) {
      throw new Error(`R2 delete failed for ${res.Errors.length} files, e.g. ${res.Errors[0].Key}: ${res.Errors[0].Message}`);
    }
    deleted += batch.length;
  }
  return deleted;
}

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('Set MONGODB_URI in your shell for this command (see the header of this file).');
  process.exit(1);
}

await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
const db = mongoose.connection.db;
const dbName = db.databaseName;
console.log(`\nConnected to database: "${dbName}"\n`);

const all = (await db.listCollections().toArray()).map((c) => c.name).sort();
const plan = [];
for (const name of all) {
  const count = await db.collection(name).countDocuments();
  plan.push({ name, count, del: DELETE.some((re) => re.test(name)) });
}
const width = Math.max(...plan.map((p) => p.name.length)) + 2;
for (const p of plan) console.log(`  ${p.del ? 'DELETE' : 'keep  '}  ${p.name.padEnd(width)} ${p.count} docs`);
const toDelete = plan.filter((p) => p.del);
const total = toDelete.reduce((s, p) => s + p.count, 0);
console.log(`\n${toDelete.length} collections will be emptied (${total} documents). Everything marked "keep" is untouched.`);

let idKeys = [];
if (!skipR2) {
  if (!r2Configured) {
    console.log(
      '\nR2: not configured in this shell (need R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME). ' +
        'Set them, or pass --skip-r2 to leave the ID files.',
    );
    if (confirmed) {
      console.error('Refusing to delete without R2 access, so the ID files are not left behind.');
      await mongoose.disconnect();
      process.exit(1);
    }
  } else {
    idKeys = await listIdKeys();
    console.log(`\nR2: ${idKeys.length} ID files under "${ID_PREFIX}" in bucket "${R2_BUCKET_NAME}" will be deleted.`);
  }
}

if (!confirmed) {
  console.log('\nDRY RUN - nothing was deleted. Re-run with:  --yes --db-name=' + dbName);
  await mongoose.disconnect();
  process.exit(0);
}
if (dbNameArg !== dbName) {
  console.error(`\nRefusing to delete: --db-name must be exactly "${dbName}" (got "${dbNameArg ?? ''}").`);
  await mongoose.disconnect();
  process.exit(1);
}

if (!skipBackup) {
  const dir = path.resolve('backups', `guest-wipe-${dbName}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const p of toDelete) {
    const docs = await db.collection(p.name).find({}).toArray();
    fs.writeFileSync(path.join(dir, `${p.name}.json`), EJSON.stringify(docs, null, 2, { relaxed: false }));
  }
  console.log(`\nBackup written to ${dir}`);
}

if (!skipR2) {
  const n = await deleteKeys(idKeys); // a failure here aborts before any database document is deleted
  console.log(`  deleted ${String(n).padStart(6)}  R2 ID files`);
}

for (const p of toDelete) {
  const res = await db.collection(p.name).deleteMany({});
  console.log(`  deleted ${String(res.deletedCount).padStart(6)}  ${p.name}`);
}
console.log('\nDone. Guest data wiped; property configuration untouched.');
await mongoose.disconnect();
