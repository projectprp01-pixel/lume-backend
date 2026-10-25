import Booking from '../../models/Booking.model.js';
import Guest from '../../models/Guest.model.js';
import { propagateRoomToLinkedBookings } from '../../utils/mainStay.js';
import {
  OPERA_HOTEL_ID, OPERA_TIMEZONE, PROPERTY_NAME, OPERA_SYNC_ARRIVAL_DAYS, OPERA_SYNC_DEPARTURE_DAYS,
  OPERA_SYNC_NIGHTLY_DAYS, OPERA_SYNC_STALE_MINUTES,
} from '../../config/env.js';
import { searchReservations } from './operaClient.js';

// Booking.propertyId used by the manual Add Guest flow, so PMS rows show up in the same dashboard views.
const PROPERTY_ID = 'default';

// ---------- date helpers (windows are "today" in the property's timezone) ----------

const ymd = (date) => date.toLocaleDateString('en-CA', { timeZone: OPERA_TIMEZONE });
const addDays = (ymdStr, days) => {
  const d = new Date(`${ymdStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// ---------- Opera reservation -> Booking fields ----------

const STATUS_MAP = {
  checkedin: 'checked-in',
  inhouse: 'checked-in',
  checkedout: 'checked-out',
  cancelled: 'cancelled',
  noshow: 'cancelled',
};
export const mapStatus = (operaStatus) => STATUS_MAP[String(operaStatus ?? '').toLowerCase()] ?? 'confirmed';

// Opera stores phones as typed, e.g. "919739232763" (country code, no "+"). Guest.countryCode defaults to +91,
// so a 12-digit number starting 91 would otherwise be saved as +91 91973…; drop the duplicated prefix.
const indianMobile = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
};

/** Null when the reservation can't become a usable booking (no ID/dates, or an anonymised "Purge" profile). */
export function mapReservation(info) {
  const pmsBookingId = info.reservationIdList?.find((i) => i.type === 'Reservation')?.id;
  const stay = info.roomStay ?? {};
  const guest = info.reservationGuest ?? {};
  if (!pmsBookingId || !stay.arrivalDate || guest.nameType === 'Purge') return null;

  const arrivalDate = new Date(stay.arrivalDate);
  const departure = new Date(stay.departureDate || stay.arrivalDate);
  const adults = stay.adultCount || 0;
  const children = stay.childCount || 0;

  return {
    pmsBookingId: String(pmsBookingId),
    pmsModifiedAt: info.lastModifyDateTime ?? null,
    bookingStatus: mapStatus(info.computedReservationStatus || info.reservationStatus),
    arrivalDate,
    checkoutDate: departure < arrivalDate ? arrivalDate : departure,
    roomType: stay.roomType || null,
    roomNumber: stay.roomId ? String(stay.roomId) : null,
    numberOfGuests: Math.max(1, adults + children),
    numberOfChildren: children,
    guest: {
      fullName: [guest.givenName, guest.surname].filter(Boolean).join(' ').trim() || 'Guest',
      email: (guest.email || '').trim().toLowerCase(),
      mobileNumber: indianMobile(guest.phoneNumber),
    },
    pms: {
      confirmationNo: info.reservationIdList?.find((i) => i.type === 'Confirmation')?.id ?? null,
      reservationStatus: info.reservationStatus ?? null,
      ratePlanCode: stay.ratePlanCode ?? null,
      rateAmount: stay.rateAmount ?? null,
      profileId: guest.id ?? null,
    },
  };
}

// ---------- upsert ----------

const bookingId = () => `BK-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

async function createFromPms(m) {
  const g = m.guest;
  // Guest.email is required; Opera profiles without one get the same kind of placeholder co-guests use.
  const guest = await new Guest({
    fullName: g.fullName,
    email: g.email || `pms-${m.pmsBookingId}@placeholder.com`,
    mobileNumber: g.mobileNumber,
    roomNumber: m.roomNumber,
    numberOfGuests: m.numberOfGuests,
    numberOfChildren: m.numberOfChildren,
  }).save();

  try {
    const booking = await Booking.create({
      bookingId: bookingId(),
      guestId: guest._id,
      primaryGuestName: guest.fullName,
      propertyId: PROPERTY_ID,
      propertyName: PROPERTY_NAME,
      numberOfGuests: m.numberOfGuests,
      arrivalDate: m.arrivalDate,
      checkoutDate: m.checkoutDate,
      roomType: m.roomType,
      roomNumber: m.roomNumber,
      bookingStatus: m.bookingStatus,
      checkInStatus: 'pending',
      pmsBookingId: m.pmsBookingId,
      source: 'pms',
      pmsModifiedAt: m.pmsModifiedAt,
      pmsLastSyncedAt: new Date(),
      pmsSyncStatus: 'ok',
      metadata: { pms: m.pms },
    });

    // Co-guest placeholders sharing the primary's token, as the manual Add Guest flow creates them.
    if (m.numberOfGuests > 1) {
      const coGuests = [];
      for (let i = 2; i <= m.numberOfGuests; i++) {
        coGuests.push({
          fullName: `Guest ${i}`,
          email: `coguest${i}.${guest.bookingToken}@placeholder.com`,
          mobileNumber: '',
          countryCode: guest.countryCode,
          roomNumber: m.roomNumber,
          bookingName: `${guest.fullName} - Co Guest`,
          numberOfGuests: m.numberOfGuests,
          checkInStatus: 'no-id-uploaded',
          bookingToken: guest.bookingToken,
        });
      }
      await Guest.insertMany(coGuests);
    }
    return booking;
  } catch (err) {
    await Guest.deleteOne({ _id: guest._id }).catch(() => {});
    throw err;
  }
}

// Only a room Opera actually reports counts as a change.
const roomChanged = (existing, m) => Boolean(m.roomNumber) && (existing.roomNumber || null) !== m.roomNumber;

// PMS wins on these live fields; nothing else on the booking is touched.
async function updateFromPms(existing, m) {
  const set = {
    bookingStatus: m.bookingStatus,
    arrivalDate: m.arrivalDate,
    checkoutDate: m.checkoutDate,
    roomType: m.roomType,
    numberOfGuests: m.numberOfGuests,
    pmsModifiedAt: m.pmsModifiedAt,
    pmsLastSyncedAt: new Date(),
    pmsSyncStatus: 'ok',
    'metadata.pms': m.pms,
  };
  // An Opera reservation with no room yet must not wipe a room staff assigned in the Check-in Hub.
  if (m.roomNumber) set.roomNumber = m.roomNumber;
  await Booking.updateOne({ _id: existing._id }, { $set: set });

  if (roomChanged(existing, m)) {
    const guest = await Guest.findById(existing.guestId).select('bookingToken').lean();
    if (guest?.bookingToken) await Guest.updateMany({ bookingToken: guest.bookingToken }, { $set: { roomNumber: m.roomNumber } });
    await propagateRoomToLinkedBookings(existing.bookingId, m.roomNumber);
  }
}

/** Upserts mapped reservations keyed on {propertyId, pmsBookingId}. Returns counts. */
export async function upsertReservations(mapped) {
  const counts = { created: 0, updated: 0, unchanged: 0, skippedNew: 0, failed: 0 };
  const existing = await Booking.find({ propertyId: PROPERTY_ID, pmsBookingId: { $in: mapped.map((m) => m.pmsBookingId) } });
  const byPmsId = new Map(existing.map((b) => [b.pmsBookingId, b]));
  const unchangedIds = [];

  for (const m of mapped) {
    try {
      const current = byPmsId.get(m.pmsBookingId);
      if (!current) {
        // Don't back-fill finished/cancelled stays LUME never knew about.
        if (m.bookingStatus === 'checked-out' || m.bookingStatus === 'cancelled') { counts.skippedNew++; continue; }
        await createFromPms(m);
        counts.created++;
      } else if (current.pmsModifiedAt === m.pmsModifiedAt && current.bookingStatus === m.bookingStatus && !roomChanged(current, m)) {
        // Room is compared on every pass too, in case Opera doesn't bump lastModifyDateTime when a room is assigned.
        unchangedIds.push(current._id);
        counts.unchanged++;
      } else {
        await updateFromPms(current, m);
        counts.updated++;
      }
    } catch (err) {
      counts.failed++;
      console.error(`[PMS sync] reservation ${m.pmsBookingId} failed:`, err.message);
    }
  }

  if (unchangedIds.length) {
    await Booking.updateMany({ _id: { $in: unchangedIds } }, { $set: { pmsLastSyncedAt: new Date(), pmsSyncStatus: 'ok' } });
  }
  return counts;
}

// ---------- tiers ----------

/** Search queries for a tier, as of `today` (YYYY-MM-DD). Each is paged independently. */
export function tierQueries(tier, today) {
  if (tier === 'nightly') {
    return [{ arrivalStartDate: today, arrivalEndDate: addDays(today, OPERA_SYNC_NIGHTLY_DAYS) }];
  }
  return [
    { arrivalStartDate: today, arrivalEndDate: addDays(today, OPERA_SYNC_ARRIVAL_DAYS) }, // arriving soon
    { arrivalEndDate: today, departureStartDate: today }, // in-house
    { departureStartDate: addDays(today, -OPERA_SYNC_DEPARTURE_DAYS), departureEndDate: today }, // just departed
  ];
}

let running = false;

/**
 * One sync pass. `dryRun` fetches and maps but never touches the database. A failure is caught here —
 * logged, existing rows are flagged stale, and the next scheduled run retries.
 */
export async function runSync(tier = 'fast', { asOf, dryRun = false } = {}) {
  if (running) return { skipped: 'previous run still in progress' };
  running = true;
  const started = Date.now();
  try {
    const today = asOf || ymd(new Date());
    const byId = new Map();
    for (const query of tierQueries(tier, today)) {
      for (const info of await searchReservations(query)) {
        const m = mapReservation(info);
        if (m) byId.set(m.pmsBookingId, m);
      }
    }
    const mapped = [...byId.values()];
    const result = dryRun ? { dryRun: true, fetched: mapped.length, sample: mapped.slice(0, 3) } : await upsertReservations(mapped);
    console.log(`[PMS sync] ${tier} ${OPERA_HOTEL_ID} ${today}:`, dryRun ? `${mapped.length} fetched (dry run)` : JSON.stringify(result), `${Date.now() - started}ms`);
    return result;
  } catch (err) {
    console.error(`[PMS sync] ${tier} run failed:`, err.message);
    if (!dryRun) await markStale().catch((e) => console.error('[PMS sync] stale marking failed:', e.message));
    return { error: err.message };
  } finally {
    running = false;
  }
}

/** Rows whose last good sync is older than the freshness window, for live (not finished) stays. */
async function markStale() {
  const cutoff = new Date(Date.now() - OPERA_SYNC_STALE_MINUTES * 60 * 1000);
  await Booking.updateMany(
    { source: 'pms', pmsLastSyncedAt: { $lt: cutoff }, bookingStatus: { $in: ['confirmed', 'checked-in'] } },
    { $set: { pmsSyncStatus: 'stale' } }
  );
}
