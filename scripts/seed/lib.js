/**
 * Shared helpers for the unified seed. See README.md in this folder for THE RULE this whole
 * seed is built around: one stay ⇒ one Booking ID, carried identically by every collection.
 */

export const PROPERTY_ID = 'default';
export const PROPERTY_NAME = 'Evolve Back Resort Coorg';

// ---------------------------------------------------------------------------
// Booking-ID rules — the single place the formats are defined.
// ---------------------------------------------------------------------------

/** Stay ID: what Booking.bookingId holds and every other collection points at. */
export const STAY_ID_RE = /^EB-\d{4}-\d{5}$/;
export const makeStayId = (year, n) => `EB-${year}-${String(n).padStart(5, '0')}`;

/**
 * A hub booking's OWN reference (Spa/Experience/Transport/Dining rows must stay individually
 * cancelable, and the schemas keep them unique) — but it always starts with the stay ID, so the
 * stay is recognisable, and searchable, in every hub. e.g. EB-2026-10007-SPA-1
 */
// The format itself lives in src/utils/hubRef.js so the API and the seed can never disagree.
import { HUB_KIND, makeLineRef } from '../../src/utils/hubRef.js';
export const KIND = HUB_KIND;
export { makeLineRef };

// ---------------------------------------------------------------------------
// Dates. Everything is anchored at LOCAL NOON so `toISOString().slice(0, 10)` (what the
// dashboard uses to show a date) is the same calendar day for any timezone from UTC-12 to
// UTC+11, including IST and the UTC servers this backend is deployed on.
// ---------------------------------------------------------------------------

export const NOW = new Date();

export function dayAt(offsetDays, hour = 12, minute = 0) {
  const d = new Date(NOW);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, minute, 0, 0);
  return d;
}
export const addMinutes = (date, mins) => new Date(date.getTime() + mins * 60000);
export const addHours = (date, h) => addMinutes(date, h * 60);
export const clampToNow = (date) => (date > NOW ? new Date(NOW) : date);
export const isoDay = (date) => {
  // Calendar day in local time (not UTC), matching dayAt().
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// ---------------------------------------------------------------------------
// Insert helper: honours explicit createdAt/updatedAt (Mongoose would otherwise stamp "now"),
// so history reads as history. Validation still runs.
// ---------------------------------------------------------------------------

export async function insertMany(Model, docs) {
  if (!docs.length) return [];
  const stamped = docs.map((d) => ({
    ...d,
    createdAt: d.createdAt ?? NOW,
    updatedAt: d.updatedAt ?? d.createdAt ?? NOW,
  }));
  return Model.insertMany(stamped, { timestamps: false });
}

export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');
export const money = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export const IMG = {
  hero: 'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800&q=80',
  plantation: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=600&q=80',
  photo: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=600&q=80',
  cycling: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=600&q=80',
  show: 'https://images.unsplash.com/photo-1504609773096-104ff2c73ba4?w=600&q=80',
  monastery: 'https://images.unsplash.com/photo-1601924638867-3ec2f0b16e9e?w=600&q=80',
  coracle: 'https://images.unsplash.com/photo-1502786129293-79981df4e689?w=600&q=80',
  kids: 'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=600&q=80',
  trek: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=600&q=80',
  pottery: 'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=600&q=80',
  coffee: 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=600&q=80',
  meditation: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&q=80',
  spa: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=800&q=80',
  spa2: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800&q=80',
  vehicle: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=600&q=80',
  dining1: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80',
  dining2: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80',
  dining3: 'https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?w=800&q=80',
  dining4: 'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?w=800&q=80',
  dining5: 'https://images.unsplash.com/photo-1590073242678-70ee3fc28f8e?w=800&q=80',
};
