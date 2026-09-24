# Unified seed

```
npm run seed        # from E:\Coding\LUME\backend
```

Wipes and rebuilds the whole demo database in ~20 s, then **verifies the result against the
database itself** and writes `LAST_RUN_REPORT.md` (gitignored). Exit code is non-zero if the
booking-ID check fails.

## THE RULE — one Booking ID per stay, everywhere

> Whenever anyone says "seed", the data must be consistent across **every screen**: one stay has
> **one Booking ID** (`EB-YYYY-NNNNN`, `Booking.bookingId`) and every other record about that stay
> carries **that same ID** — Guests, Check-in, Experiences, Spa, Transport, F&B (dining + in-room),
> Requests, Checkout & Feedback, Notifications.

How each collection carries it:

| Collection | Field | Value |
|---|---|---|
| Booking | `bookingId` | the stay ID (assigned once, in `stays.js › assignIds`) |
| CheckIn, CheckoutFolio, Feedback, ServiceRequest | `bookingId` | the stay ID |
| SpaBooking, ExperienceBooking, TransportBooking, DiningReservation | `mainStayBookingId` | the stay ID |
| FbOrder; legacy refs on Transport/Dining/Experience bookings | `bookingId` / `mainBookingId` (ObjectId) | `_id` of that same Booking |
| Notification | text + `guestId` | names the stay ID; guest belongs to that stay |

A hub booking still needs its **own** unique reference (a guest can have several spa bookings that
must be individually cancelable), so it is always **`<stay ID>-<KIND>-<n>`**, e.g.
`EB-2026-10014-SPA-1`, `-EXP-`, `-TRN-`, `-DIN-`. The stay is therefore recognisable — and
searchable — in every hub. Guest name, guest, and room on every linked document match the stay.

`verify.js` enforces all of this and also fails on: a malformed/duplicate stay ID, any dangling
reference, a hub ref that doesn't start with its stay ID, any stray `EB-…` ID that isn't a real
stay, legacy `CKN-` / `SEEDCO-` / `BK-` IDs, and a room double-booked across overlapping stays.

**Never hand-write a booking ID in seed data.** Add stays to `cast.js`; IDs are assigned for you.
If you add a new collection that references a stay, add it to `stays.js` **and** to `verify.js`.

## Layout

| File | What it does |
|---|---|
| `cast.js` | The stays (who, when, rooms, what they booked/ordered, requests, reviews) — pure data, no IDs |
| `stays.js` | Assigns IDs, then builds every stay-linked document from the cast |
| `catalog.js` | Experiences, Spa, Transport, Dining, in-room menu, banners, Property Settings + Guest App blob |
| `people.js` | Departments, access matrix, Admin/GM/staff accounts, Staff Log |
| `verify.js` | The consistency check |
| `index.js` | Orchestrates: connect → guard → wipe → seed → verify → report |
| `lib.js` | ID formats, date helpers, image URLs |

Dates are relative to the day you run it (arrivals today, checkouts today/tomorrow, in-house,
upcoming, recently departed), so re-run it any time to refresh the demo.

## Safety

* Refuses to run unless the connected host is the **LUMEDB** cluster (`*.xgcb2yk.mongodb.net`).
  `--allow-any-host` overrides — only if you truly mean to wipe a different cluster.
* The connection string comes from `MONGODB_URI_DEV` in `.env` (non-production) — `.env` is gitignored.
* Guest emails are all `@example.com` and `notificationEmails` is left empty so nothing seeded can
  reach a real inbox.
* Seeded ID documents are two tiny placeholder PDFs uploaded to R2 once per run.

## Superseded — don't run

`seed-checkin-hub.js`, `seed-checkout-feedback.js`, `seed-fb-inroom-orders.js`,
`seed-departments-staff.js`, `seed-property-settings-*.js` in `scripts/` predate this seed and used
different ID schemes (`CKN-…`, `EB-2026-7…`, `SEEDCO-…`). Running them against the seeded database
re-introduces inconsistent IDs.
