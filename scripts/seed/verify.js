/**
 * Booking-ID consistency check. Runs against what is actually IN the database after seeding —
 * not against the seed's own data structures — so a bug in the builder can't hide itself.
 *
 * Fails (non-zero exit from index.js) if ANY of these break:
 *   1. Every Booking.bookingId has the stay format EB-YYYY-NNNNN and is unique.
 *   2. Every collection that points at a stay does so with a real Booking.bookingId.
 *   3. The ObjectId links (F&B orders, legacy transport/dining/experience refs) resolve to the
 *      SAME stay as the string link on the same document.
 *   4. Each hub booking's own ref starts with its stay ID.
 *   5. Guest name / guest / room on every linked document match the stay's Booking.
 *   6. No stray booking-looking ID anywhere (any EB-… ID must be a real stay; no CKN-/SEEDCO-/BK-).
 *   7. No room is double-booked for overlapping stays.
 */

import mongoose from 'mongoose';
import Booking from '../../src/models/Booking.model.js';
import Guest from '../../src/models/Guest.model.js';
import CheckIn from '../../src/models/CheckIn.model.js';
import ExperienceBooking from '../../src/models/ExperienceBooking.model.js';
import SpaBooking from '../../src/models/SpaBooking.model.js';
import TransportBooking from '../../src/models/TransportBooking.model.js';
import DiningReservation from '../../src/models/DiningReservation.model.js';
import FbOrder from '../../src/models/FbOrder.model.js';
import CheckoutFolio from '../../src/models/CheckoutFolio.model.js';
import Feedback from '../../src/models/Feedback.model.js';
import ServiceRequest from '../../src/models/ServiceRequest.model.js';
import Notification from '../../src/models/Notification.model.js';
import { STAY_ID_RE } from './lib.js';

const fbTotal = (o) => Math.round((o.items ?? []).reduce((s, i) => s + i.qty * i.price * (1 + (i.gstPercent || 0) / 100), 0) + (o.packagingCharge || 0));

export async function verify() {
  const violations = [];
  const bad = (msg) => violations.push(msg);

  const bookings = await Booking.find().lean();
  const stayIds = new Set(bookings.map((b) => b.bookingId));
  const byStay = new Map(bookings.map((b) => [b.bookingId, b]));
  const byObjectId = new Map(bookings.map((b) => [String(b._id), b]));

  // 1 — format + uniqueness
  if (stayIds.size !== bookings.length) bad(`Booking.bookingId is not unique (${bookings.length} bookings, ${stayIds.size} distinct IDs)`);
  for (const b of bookings) if (!STAY_ID_RE.test(b.bookingId)) bad(`Booking ${b._id} has a malformed stay ID "${b.bookingId}"`);

  const guests = new Map((await Guest.find().lean()).map((g) => [String(g._id), g]));
  for (const b of bookings) {
    const g = guests.get(String(b.guestId));
    if (!g) { bad(`${b.bookingId}: guestId does not resolve to a Guest`); continue; }
    if (g.numberOfGuests !== b.numberOfGuests) bad(`${b.bookingId}: Guest.numberOfGuests (${g.numberOfGuests}) ≠ Booking.numberOfGuests (${b.numberOfGuests})`);
    if (g.fullName !== b.primaryGuestName) bad(`${b.bookingId}: Guest.fullName "${g.fullName}" ≠ Booking.primaryGuestName "${b.primaryGuestName}"`);
  }

  const assignedRooms = (b) => (b.roomNumber ?? '').split(',').map((r) => r.trim()).filter(Boolean).join(', ');
  const stayField = async (label, Model, field, opts = {}) => {
    const docs = await Model.find().lean();
    for (const d of docs) {
      const id = d[field];
      const b = byStay.get(id);
      if (!b) { bad(`${label} ${d._id}: ${field}="${id}" is not a real stay Booking ID`); continue; }
      if (opts.guestName && d[opts.guestName] !== b.primaryGuestName) bad(`${label} ${d._id} (${id}): ${opts.guestName} "${d[opts.guestName]}" ≠ stay "${b.primaryGuestName}"`);
      if (opts.guestId && String(d.guestId) !== String(b.guestId)) bad(`${label} ${d._id} (${id}): guestId differs from the stay's guest`);
      if (opts.room && (d[opts.room] ?? '') !== assignedRooms(b)) bad(`${label} ${d._id} (${id}): ${opts.room} "${d[opts.room]}" ≠ stay rooms "${assignedRooms(b)}"`);
      if (opts.legacyObjectId && d[opts.legacyObjectId] && String(d[opts.legacyObjectId]) !== String(b._id)) bad(`${label} ${d._id} (${id}): ${opts.legacyObjectId} points at a different stay`);
      if (opts.refField) {
        const ref = d[opts.refField];
        if (!ref || !ref.startsWith(`${id}-${opts.refKind}-`)) bad(`${label} ${d._id}: ref "${ref}" does not start with its stay ID "${id}-${opts.refKind}-"`);
      }
    }
    return docs;
  };

  const [checkIns, spa, exp, trn, din, folios, feedback, requests] = await Promise.all([
    stayField('CheckIn', CheckIn, 'bookingId', { guestId: true }),
    stayField('SpaBooking', SpaBooking, 'mainStayBookingId', { guestName: 'guestName', guestId: true, room: 'room', refField: 'bookingId', refKind: 'SPA' }),
    stayField('ExperienceBooking', ExperienceBooking, 'mainStayBookingId', { guestName: 'guestName', guestId: true, room: 'room', legacyObjectId: 'mainBookingId', refField: 'bookingId', refKind: 'EXP' }),
    stayField('TransportBooking', TransportBooking, 'mainStayBookingId', { guestName: 'guestName', guestId: true, room: 'room', legacyObjectId: 'bookingId', refField: 'ref', refKind: 'TRN' }),
    stayField('DiningReservation', DiningReservation, 'mainStayBookingId', { guestName: 'guestName', guestId: true, legacyObjectId: 'bookingId', refField: 'reservationRef', refKind: 'DIN' }),
    stayField('CheckoutFolio', CheckoutFolio, 'bookingId'),
    stayField('Feedback', Feedback, 'bookingId'),
    stayField('ServiceRequest', ServiceRequest, 'bookingId', { guestName: 'guestName', guestId: true, room: 'roomNumber' }),
  ]);
  for (const d of din) {
    const b = byStay.get(d.mainStayBookingId);
    if (b && assignedRooms(b) !== (d.roomNumber ?? '')) bad(`DiningReservation ${d._id} (${d.mainStayBookingId}): roomNumber "${d.roomNumber}" ≠ stay rooms "${assignedRooms(b)}"`);
  }

  // 3 — F&B orders link only by Booking._id
  const fb = await FbOrder.find().lean();
  for (const o of fb) {
    const b = byObjectId.get(String(o.bookingId));
    if (!b) { bad(`FbOrder ${o._id}: bookingId does not resolve to a stay`); continue; }
    if (String(o.guestId) !== String(b.guestId)) bad(`FbOrder ${o._id} (${b.bookingId}): guestId differs from the stay's guest`);
    if (o.guestName !== b.primaryGuestName) bad(`FbOrder ${o._id} (${b.bookingId}): guestName "${o.guestName}" ≠ "${b.primaryGuestName}"`);
    if (o.room !== assignedRooms(b)) bad(`FbOrder ${o._id} (${b.bookingId}): room "${o.room}" ≠ "${assignedRooms(b)}"`);
  }
  // Notifications belong to the stay's guest
  const notifs = await Notification.find().lean();
  const guestToStay = new Map(bookings.map((b) => [String(b.guestId), b.bookingId]));
  for (const n of notifs) if (!guestToStay.has(String(n.guestId))) bad(`Notification ${n._id}: guestId matches no stay`);
  for (const n of notifs) {
    if (n.relatedType === 'booking' || n.relatedType === 'check-in') {
      const stay = guestToStay.get(String(n.guestId));
      // a booking-type notification about the stay itself must name this stay's ID
      if (/stay|check-in/i.test(n.message) && !n.message.includes(stay) && !/reference EB-/.test(n.message)) bad(`Notification ${n._id}: text does not mention its stay ID ${stay}`);
    }
  }

  // 6 — stray IDs anywhere
  const all = [bookings, checkIns, spa, exp, trn, din, folios, feedback, requests, fb, notifs];
  for (const docs of all) for (const d of docs) {
    const json = JSON.stringify(d);
    for (const m of json.match(/EB-\d{4}-\d{5}/g) ?? []) if (!stayIds.has(m)) bad(`Stray stay-style ID "${m}" found in ${d._id}`);
    if (/\b(CKN|SEEDCO|BK)-/.test(json)) bad(`Legacy-style booking ID found in ${d._id}`);
  }

  // 7 — room double-booking (cancelled stays release their rooms)
  const active = bookings.filter((b) => b.bookingStatus !== 'cancelled');
  const roomsOf = (b) => assignedRooms(b).split(', ').filter(Boolean);
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i]; const c = active[j];
      if (a.arrivalDate < c.checkoutDate && c.arrivalDate < a.checkoutDate) {
        const shared = roomsOf(a).filter((r) => roomsOf(c).includes(r));
        if (shared.length) bad(`Room clash: ${shared.join(', ')} is in both ${a.bookingId} (${a.primaryGuestName}) and ${c.bookingId} (${c.primaryGuestName})`);
      }
    }
  }

  // Per-stay summary for the report
  const count = (docs, field) => docs.reduce((m, d) => m.set(d[field], (m.get(d[field]) ?? 0) + 1), new Map());
  const cIn = count(checkIns, 'bookingId'); const cSpa = count(spa, 'mainStayBookingId'); const cExp = count(exp, 'mainStayBookingId');
  const cTrn = count(trn, 'mainStayBookingId'); const cDin = count(din, 'mainStayBookingId'); const cReq = count(requests, 'bookingId');
  const cFb = new Map(); for (const o of fb) { const id = byObjectId.get(String(o.bookingId))?.bookingId; cFb.set(id, (cFb.get(id) ?? 0) + 1); }
  const pending = new Map(bookings.map((b) => [b.bookingId, 0]));
  const add = (id, amt) => pending.set(id, (pending.get(id) ?? 0) + amt);
  spa.filter((x) => x.status !== 'Cancelled' && x.paymentStatus !== 'refunded' && x.paymentStatus !== 'paid').forEach((x) => add(x.mainStayBookingId, x.price));
  exp.filter((x) => x.bookingStatus !== 'cancelled' && x.paymentStatus !== 'refunded' && x.paymentStatus !== 'paid').forEach((x) => add(x.mainStayBookingId, x.totalAmount));
  trn.filter((x) => x.status !== 'cancelled' && x.paymentStatus !== 'paid').forEach((x) => add(x.mainStayBookingId, x.amount));
  din.filter((x) => x.status !== 'cancelled' && x.paymentStatus !== 'paid').forEach((x) => add(x.mainStayBookingId, x.amount ?? 0));
  fb.filter((x) => x.paymentStatus !== 'paid').forEach((x) => add(byObjectId.get(String(x.bookingId))?.bookingId, fbTotal(x)));
  folios.forEach((f) => f.folio.filter((l) => !l.paid).forEach((l) => add(f.bookingId, l.price)));
  const reviews = new Map(feedback.map((f) => [f.bookingId, f.rating]));

  const perStay = bookings
    .sort((a, b) => a.bookingId.localeCompare(b.bookingId))
    .map((b) => ({
      bookingId: b.bookingId, guest: b.primaryGuestName, arrival: b.arrivalDate, checkout: b.checkoutDate, status: b.bookingStatus,
      checkIn: b.checkInStatus, rooms: assignedRooms(b) || '—',
      cin: cIn.get(b.bookingId) ?? 0, exp: cExp.get(b.bookingId) ?? 0, spa: cSpa.get(b.bookingId) ?? 0, trn: cTrn.get(b.bookingId) ?? 0,
      din: cDin.get(b.bookingId) ?? 0, fb: cFb.get(b.bookingId) ?? 0, req: cReq.get(b.bookingId) ?? 0, pending: pending.get(b.bookingId) ?? 0, rating: reviews.get(b.bookingId),
    }));

  return {
    ok: violations.length === 0, violations, perStay,
    totals: { stays: bookings.length, checkIns: checkIns.length, exp: exp.length, spa: spa.length, trn: trn.length, din: din.length, fb: fb.length, folios: folios.length, feedback: feedback.length, requests: requests.length, notifications: notifs.length },
  };
}
