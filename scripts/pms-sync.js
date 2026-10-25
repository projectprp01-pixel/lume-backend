#!/usr/bin/env node
// Runs one Opera -> LUME reservation sync pass on demand.
//
//   node scripts/pms-sync.js                          -> fast tier, DRY RUN (fetch + map only, no database)
//   node scripts/pms-sync.js --tier=nightly           -> nightly tier, dry run
//   node scripts/pms-sync.js --as-of=2024-04-16       -> pretend today is that date (UAT data is dated ~April 2024)
//   node scripts/pms-sync.js --write                  -> actually upsert into the database in MONGODB_URI_DEV / MONGODB_URI
//
// Reads OPERA_* (and the usual backend variables) from .env. A dry run needs only the OPERA_* variables.

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const write = Boolean(args.write);

// config/env.js refuses to load without the full backend config; a dry run doesn't use any of it.
if (!write) {
  for (const key of ['MONGODB_URI_DEV', 'MONGODB_URI', 'JWT_SECRET', 'PROPERTY_NAME', 'GUEST_APP_URL', 'DASHBOARD_APP_URL']) {
    process.env[key] ||= key.startsWith('MONGODB') ? 'mongodb://localhost/dry-run' : 'dry-run';
  }
}

const { MONGODB_DB_NAME } = await import('../src/config/env.js');
const { runSync } = await import('../src/services/opera/pmsSync.js');
const { isOperaConfigured } = await import('../src/services/opera/operaClient.js');

if (!isOperaConfigured()) {
  console.error('OPERA_* variables are missing from .env');
  process.exit(1);
}

let mongoose;
if (write) {
  mongoose = (await import('mongoose')).default;
  const { MONGODB_URI } = await import('../src/config/env.js');
  await mongoose.connect(MONGODB_URI);
  console.log(`Connected to database "${MONGODB_DB_NAME}" — writing.`);
}

const result = await runSync(args.tier === 'nightly' ? 'nightly' : 'fast', { asOf: args['as-of'], dryRun: !write });
console.log(JSON.stringify(result, null, 2));
if (mongoose) await mongoose.disconnect();
process.exit(result.error ? 1 : 0);
