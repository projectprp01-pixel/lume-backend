# Backend — standing rules

## Seeding (do this every time "seed" is mentioned)
Run `npm run seed` (see `scripts/seed/README.md`). **One stay = one Booking ID (`EB-YYYY-NNNNN`),
identical across EVERY screen and collection** — Guests, Check-in, Experiences, Spa, Transport, F&B,
Requests, Checkout & Feedback, Notifications. Hub bookings keep their own unique ref but always as
`<stay ID>-<SPA|EXP|TRN|DIN>-<n>`. Never hand-write booking IDs in seed data — add stays to
`scripts/seed/cast.js`; `stays.js` assigns IDs and `verify.js` must pass. Seed everything (staff,
catalog, stays, check-in through checkout), not one section. Finish by reporting what was seeded.

Do not run the older `scripts/seed-*.js` — they use inconsistent ID schemes.

## Database
Local dev connects via `MONGODB_URI_DEV` in `.env` (gitignored) → cluster LUMEDB. Never commit
credentials, and never paste them into docs or memory.
