import Booking from '../models/Booking.model.js';

/**
 * The ONE place hub-document references are defined.
 *
 * A hub booking (Spa / Experience / Transport / Dining) needs its own unique reference — a guest can
 * hold several and each must be individually cancelable — but it always starts with the stay's
 * Booking ID so the stay is recognisable, and searchable, in every hub:
 *
 *     <stayId>-<KIND>-<n>      e.g.  EB-2026-10007-SPA-1
 *
 * n is a per-stay, per-kind counter starting at 1. The seed script imports makeLineRef from here, so
 * seeded and server-created refs cannot drift apart.
 */
export const HUB_KIND = { exp: 'EXP', spa: 'SPA', trn: 'TRN', din: 'DIN' };

export const makeLineRef = (stayId, kind, n) => `${stayId}-${HUB_KIND[kind]}-${n}`;

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MAX_ATTEMPTS = 5;

/** The stay a hub booking belongs to: the one it names, else the guest's most recent stay. */
export async function resolveStayIdForRef({ mainStayBookingId, guestId } = {}) {
  const named = String(mainStayBookingId ?? '').trim();
  if (named) return named;
  if (!guestId) return null;
  const stay = await Booking.findOne({ guestId }).sort({ createdAt: -1 }).select('bookingId').lean().catch(() => null);
  return stay?.bookingId ?? null;
}

// Next free counter for this stay + kind: highest existing "<stayId>-<KIND>-<n>" in `field`, plus one.
async function nextSequence(Model, field, stayId, kind) {
  const prefix = `${stayId}-${HUB_KIND[kind]}-`;
  const rows = await Model.find({ [field]: { $regex: `^${escapeRegex(prefix)}\\d+$` } }).select(field).lean();
  return rows.reduce((max, r) => Math.max(max, Number(String(r[field]).slice(prefix.length)) || 0), 0) + 1;
}

/**
 * Create a hub document with a server-generated `<stayId>-<KIND>-<n>` reference in `field`.
 *
 * Two creations racing for the same stay can pick the same n; where `field` has a unique index
 * (Experience/Spa `bookingId`) the loser gets a duplicate-key error and simply retries with the next n.
 * `field` is not unique for Transport `ref` / Dining `reservationRef`, so a race there could in theory
 * yield two identical refs — the documents themselves are still distinct (own _id).
 *
 * If no stay can be determined (a guest with no stay on file) there is nothing to prefix the ref with,
 * so it falls back to a clearly non-stay ref `<KIND>-<timestamp>-<rand>` rather than inventing a stay ID.
 */
export async function createWithHubRef({ Model, field, kind, stayId, data }) {
  if (!stayId) {
    const ref = `${HUB_KIND[kind]}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    return Model.create({ ...data, [field]: ref });
  }
  for (let attempt = 1; ; attempt++) {
    const n = await nextSequence(Model, field, stayId, kind);
    try {
      return await Model.create({ ...data, [field]: makeLineRef(stayId, kind, n) });
    } catch (error) {
      const duplicateRef = error?.code === 11000 && error?.keyPattern?.[field];
      if (!duplicateRef || attempt >= MAX_ATTEMPTS) throw error;
    }
  }
}
