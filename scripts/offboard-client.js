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
