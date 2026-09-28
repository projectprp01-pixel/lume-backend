#!/usr/bin/env node
// Undoes a mistaken onboard-client.js run. By default it only deletes the local
// clients/<slug>/ scaffold (env files + CHECKLIST.md) — safe, local, reversible by
// just re-running onboard. It never touches backend/.env or property-dashboard/.env.local
// even if you already copied the scaffold into place; restore/edit those by hand.
//
// Optionally, with --drop-db, it will also drop the <slug> and <slug>-dev MongoDB
// databases on the shared cluster — this is destructive and irreversible, so it always
// does a dry run first (listing what's actually in there) and only drops when you pass
// --yes as well.
//
// Usage:
//   node scripts/offboard-client.js <slug>                  # delete local scaffold only
//   node scripts/offboard-client.js <slug> --drop-db         # dry run: show what's in the DBs
//   node scripts/offboard-client.js <slug> --drop-db --yes   # actually drop the DBs too
//   npm run offboard -- <slug> [--drop-db] [--yes]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..'); // backend/scripts -> backend -> repo root
const BACKEND_DIR = path.join(REPO_ROOT, 'backend');

const args = process.argv.slice(2);
const rawSlug = args.find((a) => !a.startsWith('-'));
const dropDb = args.includes('--drop-db');
const confirmed = args.includes('--yes');

if (!rawSlug || rawSlug === '--help' || rawSlug === '-h') {
  console.error('Usage: node scripts/offboard-client.js <slug> [--drop-db] [--yes]');
  console.error('Example: node scripts/offboard-client.js leela --drop-db --yes');
  process.exit(1);
}

const slug = rawSlug.trim().toLowerCase();
if (!/^[a-z0-9-]+$/.test(slug)) {
  console.error(`Invalid slug "${rawSlug}" — expected the same lowercase/digits/hyphens slug you passed to onboard-client.js.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. Remove the local scaffold — always safe, always done.
// ---------------------------------------------------------------------------
const scaffoldDir = path.join(REPO_ROOT, 'clients', slug);
if (fs.existsSync(scaffoldDir)) {
  const files = fs.readdirSync(scaffoldDir);
  fs.rmSync(scaffoldDir, { recursive: true, force: true });
  console.log(`Removed clients/${slug}/ (${files.join(', ')})`);
} else {
  console.log(`No clients/${slug}/ scaffold found — nothing to remove there.`);
}

console.log(
  `\nNote: this does not touch backend/.env or property-dashboard/.env.local. If you already\n` +
  `copied the ${slug} scaffold into either of those, edit/restore them by hand.`
);

if (!dropDb) {
  console.log('\nDone. Pass --drop-db if the Mongo databases for this client also need to go.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 2. Optional: drop the <slug> / <slug>-dev databases on the shared cluster.
//    Destructive + shared infrastructure, so: dry run by default, real drop only
//    with --yes, and always list what's actually in each database first.
// ---------------------------------------------------------------------------
const { default: mongoose } = await import('mongoose');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

function buildMongoUri(sourceUri, dbName) {
  if (!sourceUri) return '';
  const m = sourceUri.match(/^(mongodb(?:\+srv)?):\/\/([^:]+):([^@]+)@([^/?]+)\/[^/?]*(\?.*)?$/);
  if (!m) return '';
  const [, scheme, user, pass, host, query] = m;
  return `${scheme}://${user}:${pass}@${host}/${dbName}${query || ''}`;
}

const existingBackendEnv = parseEnvFile(path.join(BACKEND_DIR, '.env'));
const sourceMongoUri = existingBackendEnv.MONGODB_URI_DEV || existingBackendEnv.MONGODB_URI || '';
const clusterHost = sourceMongoUri.match(/@([^/?]+)/)?.[1];

if (!sourceMongoUri) {
  console.error('\nCould not read a Mongo URI from backend/.env locally — cannot reach the cluster to drop databases.');
  process.exit(1);
}

async function inspectAndMaybeDrop(dbName) {
  const uri = buildMongoUri(sourceMongoUri, dbName);
  const conn = await mongoose.createConnection(uri).asPromise();
  try {
    const collections = await conn.db.listCollections().toArray();
    if (collections.length === 0) {
      console.log(`\n"${dbName}" on ${clusterHost}: does not exist or is already empty.`);
      return;
    }
    console.log(`\n"${dbName}" on ${clusterHost}:`);
    let total = 0;
    for (const { name } of collections) {
      const count = await conn.db.collection(name).countDocuments();
      total += count;
      console.log(`  - ${name}: ${count} document(s)`);
    }
    if (!confirmed) {
      console.log(`  (dry run — ${total} document(s) total would be permanently deleted with --yes)`);
      return;
    }
    await conn.dropDatabase();
    console.log(`  DROPPED "${dbName}" — ${total} document(s) permanently deleted.`);
  } finally {
    await conn.close();
  }
}
