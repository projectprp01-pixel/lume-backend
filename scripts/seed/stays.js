/**
 * Turns the cast (cast.js) into documents in EVERY collection that belongs to a stay.
 *
 * THE RULE, enforced structurally here: a stay's Booking ID is assigned exactly once (assignIds)
 * and every document built for that stay reads it off the stay object — no other code path
 * invents or formats a booking ID. verify.js then re-checks the database, not this code.
 */

import crypto from 'crypto';
import mongoose from 'mongoose';
import Guest from '../../src/models/Guest.model.js';
import Booking from '../../src/models/Booking.model.js';
import CheckIn from '../../src/models/CheckIn.model.js';
import ExperienceBooking from '../../src/models/ExperienceBooking.model.js';
import SpaBooking from '../../src/models/SpaBooking.model.js';
import TransportBooking from '../../src/models/TransportBooking.model.js';
import DiningReservation from '../../src/models/DiningReservation.model.js';
import FbOrder from '../../src/models/FbOrder.model.js';
import CheckoutFolio from '../../src/models/CheckoutFolio.model.js';
import Feedback from '../../src/models/Feedback.model.js';
import FeedbackSettings from '../../src/models/FeedbackSettings.model.js';
import ServiceRequest from '../../src/models/ServiceRequest.model.js';
import Notification from '../../src/models/Notification.model.js';
import {
  PROPERTY_ID, PROPERTY_NAME, NOW, dayAt, addMinutes, addHours, clampToNow, isoDay,
  insertMany, makeStayId, makeLineRef, slug,
} from './lib.js';
import { STAYS, REQUESTS, GENERIC_FAMILY } from './cast.js';

const RATE = { Cottage: 14000, 'Coffee Cottage': 15000, 'Lily Pool Cottage': 22000, 'River View Cottage': 18000, Villa: 26000, 'Pool Villa': 38000, Machaan: 16000, 'The Nest': 20000 };
const roomType = (r) => r.replace(/^~/, '').replace(/\s+\d+$/, '');
const roomNumber = (r) => (r.startsWith('~') ? '' : r);

const NOTES = {
  sharma: 'Anniversary stay — quiet table for dinner, please.',
  nair2: 'Honeymoon — flowers in the room on arrival.',
  rao_honey: 'Honeymoon — surprise dessert on the last evening.',
  verma: 'Birthday celebration on day 3 — cake arranged through Concierge.',
  iyer: 'Travelling with two children — cot and highchair needed.',
  menon: 'Two children under 8 — extra bed in the room.',
  malhotraext: 'Three-generation family trip; one guest uses a wheelchair — ground-floor rooms please.',
  chatterjee: 'Family reunion — would like adjoining rooms where possible.',
  kapoor: 'Early breakfast at 7 am, please.',
};
const RETURNING = new Set(['sharma', 'iyer', 'bhat', 'marshall', 'pai']);

const hm = (s) => s.split(':').map(Number);
const ah = (date, h) => clampToNow(addHours(date, h));

// ---------------------------------------------------------------------------
// 1. IDs — the only place a stay's Booking ID is created
// ---------------------------------------------------------------------------

function assignIds(cast) {
  const ordered = cast.map((c, i) => ({ ...c, _order: i })).sort((a, b) => a.arr - b.arr || a._order - b._order);
  return ordered.map((c, i) => {
    const arrival = dayAt(c.arr, 12);
    const rooms = c.rooms;
    const total = 1 + (c.others?.length ?? 0);
    const others = c.others ?? [];
    const filled = others.length >= total - 1 ? others : [...others, ...GENERIC_FAMILY(total).slice(others.length)];
    return {
      ...c,
      idx: i,
      total,
      others: filled.slice(0, total - 1),
      bookingId: makeStayId(arrival.getFullYear(), 10001 + i),
      arrival,
      checkout: dayAt(c.arr + c.n, 12),
      types: rooms.map(roomType),
      roomNumbers: rooms.map(roomNumber),
      assignedRooms: rooms.map(roomNumber).filter(Boolean),
    };
  });
}

function stayStatus(s) {
  if (s.cancelled) return 'cancelled';
  if (s.arr + s.n < 0) return 'checked-out';
  if (s.arr < 0) return 'checked-in';
  return 'confirmed'; // arriving today or later — front desk checks them in on arrival
}

function checkInState(s) {
  const chars = s.ci === 'all' ? 'A'.repeat(s.total) : s.ci;
  if (chars.length !== s.total) throw new Error(`Stay "${s.key}": ci "${s.ci}" has ${chars.length} chars for ${s.total} guests`);
  const submitted = [...chars].filter((c) => c !== '-').length;
  const anyRejected = chars.includes('R');
  const allApproved = submitted === s.total && [...chars].every((c) => c === 'A');
  const arrived = s.arr < 0 && !s.cancelled;
  let status; let approval; let bookingCheckIn; let guestCheckIn;
  if (submitted === 0) { status = null; approval = 'pending'; bookingCheckIn = 'pending'; guestCheckIn = 'no-id-uploaded'; }
  else if (anyRejected) { status = 'rejected'; approval = 'rejected'; bookingCheckIn = 'rejected'; guestCheckIn = 'rejected'; }
  else if (allApproved) { status = arrived ? 'completed' : 'approved'; approval = 'approved'; bookingCheckIn = 'approved'; guestCheckIn = 'verified'; }
  else { status = 'documents-uploaded'; approval = 'pending'; bookingCheckIn = 'submitted'; guestCheckIn = 'verification-pending'; }
  return { chars, status, approval, bookingCheckIn, guestCheckIn };
}

// ---------------------------------------------------------------------------
// 2. Placeholder ID documents (real files on R2 when configured, else a public stand-in)
// ---------------------------------------------------------------------------

function buildPlaceholderPdf(label) {
  const stream = `BT /F1 18 Tf 50 700 Td (${label}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(body.length); body += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xrefStart = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(body, 'utf-8');
}

async function placeholderIds() {
  try {
    const { uploadToR2 } = await import('../../src/utils/r2Upload.js');
    const front = await uploadToR2(buildPlaceholderPdf('Sample ID - Front (seed data)'), 'checkin-ids/seed', 'application/pdf', 'pdf');
    const back = await uploadToR2(buildPlaceholderPdf('Sample ID - Back (seed data)'), 'checkin-ids/seed', 'application/pdf', 'pdf');
    return { front, back, where: 'R2' };
  } catch (err) {
    const stand = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
    return { front: stand, back: stand, where: `public stand-in (R2 upload failed: ${err.message})` };
  }
}

// ---------------------------------------------------------------------------
// 3. The builder
// ---------------------------------------------------------------------------

export async function seedStays({ catalog, people }) {
  const { exp, spa, transport, dining, dishes } = catalog;
  const staff = people.staff;
  const stays = assignIds(STAYS);
  const ids = await placeholderIds();

  const violations = [];
  const guests = [];
  const bookings = [];

  // ---- Guests + Bookings -------------------------------------------------------------------
  for (const s of stays) {
    const ci = checkInState(s);
    s.ci_ = ci;
    s.status = stayStatus(s);
    const roomTypeStr = s.types.join(', ');
    // Booking.roomNumber keeps a slot per room (an unassigned one is left blank), same as the
    // Check-in Hub expects; hub bookings show only the rooms that are actually assigned.
    s.roomLabel = s.assignedRooms.join(', ');
    s.roomTypeStr = roomTypeStr;
    s.roomNumberStr = s.roomNumbers.every((r) => !r) ? '' : s.roomNumbers.join(', ');

    const created = clampToNow(dayAt(Math.min(s.arr - 10 - (s.idx % 15), -1 - (s.idx % 6)), 11, (s.idx * 7) % 60));
    s.createdAt = created;
    const guestDoc = {
      _id: new mongoose.Types.ObjectId(),
      fullName: s.name,
      email: `${slug(s.name)}@example.com`,
      mobileNumber: `9845${String(100000 + s.idx * 7919).slice(-6)}`,
      countryCode: s.cc ?? '+91',
      bookingToken: crypto.randomBytes(32).toString('hex'),
      checkInStatus: ci.guestCheckIn,
      roomNumber: s.roomNumberStr || null,
      bookingName: s.name,
      numberOfGuests: s.total,
      numberOfChildren: s.kids ?? 0,
      numberOfInfants: 0,
      consentGiven: ci.status !== null,
      consentTimestamp: ci.status !== null ? ah(created, 24) : undefined,
      preferences: { dietaryRestrictions: [], roomPreferences: [], activities: [] },
      emailOptIn: s.idx % 3 !== 0,
      guestType: RETURNING.has(s.key) ? 'returning' : 'new',
      totalVisits: RETURNING.has(s.key) ? 2 + (s.idx % 3) : 0,
      lastVisit: RETURNING.has(s.key) ? dayAt(-220, 12) : undefined,
      createdAt: created,
    };
    if (ci.status !== null) {
      guestDoc.idVerification = {
        uploadedAt: ah(created, 30),
        idFrontUrl: ids.front, idBackUrl: ids.back, idType: (s.cc ?? '+91') === '+91' ? 'national-id' : 'passport',
        ...(ci.chars[0] === 'A' ? { verifiedAt: ah(created, 40), verifiedBy: staff['frontdesk.staff']._id } : {}),
        ...(ci.chars[0] === 'R' ? { rejectionReason: (s.rej ?? [])[0] ?? 'Please re-upload a clearer image.' } : {}),
      };
    }
    guests.push(guestDoc);
    s.guest = guestDoc;

    const rate = s.types.reduce((sum, t) => sum + (RATE[t] ?? 15000), 0);
    const arrivedNow = s.arr < 0 && !s.cancelled;
    bookings.push({
      _id: new mongoose.Types.ObjectId(),
      bookingId: s.bookingId, // ← the one and only ID for this stay
      guestId: guestDoc._id,
      primaryGuestName: s.name,
      propertyId: PROPERTY_ID,
      propertyName: PROPERTY_NAME,
      numberOfGuests: s.total,
      arrivalDate: s.arrival,
      checkoutDate: s.checkout,
      roomType: roomTypeStr,
      roomNumber: s.roomNumberStr,
      bookingStatus: s.status,
      checkInStatus: ci.bookingCheckIn,
      checkInCompletedAt: arrivedNow && ci.status === 'completed' ? dayAt(s.arr, 14, 20) : undefined,
      totalAmount: rate * s.n,
      specialRequests: NOTES[s.key],
      metadata: { seed: 'unified', seedKey: s.key },
      createdAt: created,
    });
    s.booking = bookings[bookings.length - 1];
  }
  await insertMany(Guest, guests);
  await insertMany(Booking, bookings);

  // ---- Check-in documents ------------------------------------------------------------------
  const checkIns = [];
  for (const s of stays) {
    const { chars, status, approval } = s.ci_;
    if (status === null) continue;
    const reviewer = staff['frontdesk.staff']._id;
    let rejIdx = 0;
    const docs = [];
    [...chars].forEach((c, i) => {
      if (c === '-') return;
      docs.push({
        guestNumber: i + 1,
        guestName: i === 0 ? undefined : s.others[i - 1],
        idFrontUrl: ids.front, idBackUrl: ids.back,
        idType: (s.cc ?? '+91') === '+91' ? 'national-id' : 'passport',
        uploadedAt: ah(s.createdAt, 30),
        verified: c === 'A',
        ...(c === 'A' ? { verifiedBy: reviewer, verifiedAt: ah(s.createdAt, 40) } : {}),
        ...(c === 'R' ? { rejectionReason: (s.rej ?? [])[rejIdx++] ?? 'Please re-upload a clearer image.', verifiedBy: reviewer, verifiedAt: ah(s.createdAt, 40) } : {}),
      });
    });
    const reviewed = status === 'approved' || status === 'completed' || status === 'rejected';
    checkIns.push({
      _id: new mongoose.Types.ObjectId(),
      bookingId: s.bookingId, // ← same stay ID
      guestId: s.guest._id,
      status,
      guestDocuments: docs,
      totalGuests: s.total,
      documentsCompleted: docs.length,
      approvalStatus: approval,
      ...(reviewed ? { reviewedBy: reviewer, reviewedAt: ah(s.createdAt, 40) } : {}),
      initiatedAt: ah(s.createdAt, 24),
      submittedAt: ah(s.createdAt, 30),
      ...(status === 'completed' ? { completedAt: dayAt(s.arr, 14, 20) } : {}),
      createdAt: ah(s.createdAt, 24),
    });
    s.checkIn = checkIns[checkIns.length - 1];
  }
  await insertMany(CheckIn, checkIns);

  // ---- Hub bookings ------------------------------------------------------------------------
  const out = { exp: [], spa: [], trn: [], din: [], fb: [], folio: [], feedback: [], requests: [], notifications: [] };
  const counters = {};
  const nextRef = (s, kind) => { const k = `${s.bookingId}:${kind}`; counters[k] = (counters[k] ?? 0) + 1; return makeLineRef(s.bookingId, kind, counters[k]); };

  for (const s of stays) {
    const past = s.arr + s.n < 0;
    const common = { mainStayBookingId: s.bookingId, guestId: s.guest._id, guestName: s.name };

    const guardTime = (it, at, isTransport) => {
      if (isTransport) return;
      const arrivalAt = dayAt(s.arr, 14, 0);
      const checkoutAt = dayAt(s.arr + s.n, 11, 0);
      if (at < arrivalAt) violations.push(`${s.bookingId} (${s.key}): ${it.kind}:${it.key ?? ''} on day ${it.d} at ${isoDay(at)} ${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')} is before arrival (14:00)`);
      if (at > checkoutAt) violations.push(`${s.bookingId} (${s.key}): ${it.kind}:${it.key ?? ''} on day ${it.d} is after checkout (11:00)`);
    };

    for (const it of s.items) {
      if (it.d < 0 || it.d > s.n) violations.push(`${s.bookingId} (${s.key}): item day ${it.d} outside 0..${s.n}`);
      const source = it.s ?? 'app';
      const cancelled = !!it.x || !!s.cancelled;
      const madeAt = source === 'app'
        ? clampToNow(dayAt(Math.min(s.arr - 2 - (s.idx % 5), it.d + s.arr - 1, -0), 10 + (s.idx % 6), (s.idx * 13) % 60))
        : clampToNow(dayAt(s.arr + it.d, 9, 30));
      const createdAt = madeAt < s.createdAt ? ah(s.createdAt, 1) : madeAt;
      // Spa and Experience bookings can be 'refunded'; Transport and Dining schemas have no such
      // status, so a cancelled one there simply stays 'pending' (it is excluded from the folio).
      const payment = (paid, price, canRefund = true) => {
        const isPaid = past ? !cancelled : paid;
        const status = cancelled ? (isPaid && canRefund ? 'refunded' : 'pending') : isPaid ? 'paid' : 'pending';
        const paidAt = status === 'paid' || status === 'refunded' ? clampToNow(source === 'app' ? addMinutes(createdAt, 5) : dayAt(s.arr + it.d, 10)) : undefined;
        return { paymentStatus: status, ...(paidAt ? { paidAt } : {}), _isPaid: isPaid, _price: price };
      };
      const razorpay = (ref, pay) => (source === 'app' && pay.paymentStatus !== 'pending' ? { razorpayOrderId: `order_seed_${ref}`, razorpayPaymentId: `pay_seed_${ref}` } : {});
      const strip = ({ _isPaid, _price, ...rest }) => rest;

      if (it.kind === 'exp') {
        const e = exp[it.key];
        const slotIdx = it.slot ?? 0;
        const [label, time] = e.slots[slotIdx];
        const [h, m] = hm(time);
        const at = dayAt(s.arr + it.d, h, m);
        guardTime(it, at);
        const g = Math.min(it.g ?? Math.min(s.total, e.group[1]), e.group[1]);
        const addons = (it.addons ?? []).map((n) => { const a = e.addons.find((x) => x.name === n); if (!a) throw new Error(`Experience ${it.key} has no addon "${n}"`); return { name: a.name, price: a.price }; });
        const base = e.model === 'person' ? e.price * g : e.price;
        const total = base + addons.reduce((x, a) => x + a.price, 0);
        const ref = nextRef(s, 'exp');
        const pay = payment(e.price === 0 ? true : it.paid ?? source === 'app', total);
        out.exp.push({
          bookingId: ref, experienceId: e._id, guestId: s.guest._id, mainBookingId: s.booking._id, mainStayBookingId: s.bookingId,
          experienceName: e.title, date: dayAt(s.arr + it.d, 12), timeSlot: time, numberOfGuests: g,
          unitPrice: e.price, totalAmount: total, currency: 'INR',
          ...strip(pay), ...razorpay(ref, pay),
          bookingStatus: cancelled ? 'cancelled' : at < NOW ? 'completed' : 'confirmed',
          ...(cancelled ? { cancelledAt: clampToNow(addHours(createdAt, 20)), cancellationReason: 'Cancelled by the guest' } : {}),
          guestName: s.name, guestEmail: s.guest.email, guestPhone: s.guest.mobileNumber,
          room: s.roomLabel, source, addons, confirmationSent: true, confirmationSentAt: createdAt,
          createdAt, _stay: s, _label: label,
        });
      } else if (it.kind === 'spa') {
        const t = spa.treat[it.key];
        const slotIdx = it.slot ?? 0;
        const [, time] = t.slots[slotIdx];
        const [h, m] = hm(time);
        const at = dayAt(s.arr + it.d, h, m);
        guardTime(it, at);
        const dur = t.durations[it.dur ?? 0];
        const g = t.perCouple ? 2 : it.g ?? 1;
        const addons = (it.addons ?? []).map((n) => { const a = t.addons.find((x) => x.name === n); if (!a) throw new Error(`Spa ${it.key} has no addon "${n}"`); return { name: a.name, price: a.price }; });
        const price = (t.perCouple ? dur.price : dur.price * g) + addons.reduce((x, a) => x + a.price, 0);
        const ref = nextRef(s, 'spa');
        const pay = payment(it.paid ?? source === 'app', price);
        out.spa.push({
          bookingId: ref, spaFacilityId: spa.facility._id, treatmentId: String(t._id), treatmentName: t.name, categoryName: t.categoryName,
          guestId: s.guest._id, mainStayBookingId: s.bookingId, guestName: s.name, numberOfGuests: g, room: s.roomLabel,
          date: dayAt(s.arr + it.d, 12), timeSlot: time, duration: dur.minutes, price, propertyId: PROPERTY_ID,
          status: cancelled ? 'Cancelled' : addMinutes(at, dur.minutes) < NOW ? 'Completed' : at < NOW ? 'In Progress' : 'Upcoming',
          addons, source, ...strip(pay), ...razorpay(ref, pay), currency: 'INR', createdAt,
          _stay: s,
        });
      } else if (it.kind === 'trn') {
        const off = transport.offeringBySlot[it.slot];
        const vehicle = transport.vehicles[it.vehicle];
        const amount = transport.priceOf(it.slot, it.vehicle, it.city);
        const ref = nextRef(s, 'trn');
        const pay = payment(it.paid ?? source === 'app', amount, false);
        const service = dayAt(s.arr + it.d, 12);
        out.trn.push({
          hubBooking: true, ref, mainStayBookingId: s.bookingId, guestId: s.guest._id, bookingId: s.booking._id,
          guestName: s.name, roomNumber: s.roomLabel, room: s.roomLabel,
          checkInDate: it.slot === 3 ? s.arrival : service, ...(it.slot === 3 ? { checkOutDate: s.checkout, nights: s.n } : {}),
          amount, status: cancelled ? 'cancelled' : 'confirmed', propertyId: PROPERTY_ID,
          offeringSlot: it.slot, vehicleId: vehicle._id, vehicleName: it.city ? `${vehicle.name} — ${it.city}` : vehicle.name,
          source, addons: [], staffSeen: past, ...strip(pay), ...razorpay(ref, pay), createdAt, _stay: s,
        });
      } else if (it.kind === 'din') {
        const f = dining[it.key];
        const at = dayAt(s.arr + it.d, f.type === 'intimate_dining' ? 19 : 13, 0);
        guardTime({ ...it, kind: 'din' }, at);
        const g = f.type === 'intimate_dining' ? Math.min(it.g ?? 2, 4) : it.g ?? s.total;
        const addons = (it.addons ?? []).map((n) => { const a = f.addons.find((x) => x.name === n); if (!a) throw new Error(`Dining ${it.key} has no addon "${n}"`); return { name: a.name, price: a.price }; });
        const amount = f.price + addons.reduce((x, a) => x + a.price, 0);
        const ref = nextRef(s, 'din');
        const pay = payment(amount === 0 ? true : it.paid ?? source === 'app', amount, false);
        out.din.push({
          facilityId: f._id, facilityName: f.name, facilityType: f.type, guestId: s.guest._id, bookingId: s.booking._id,
          mainStayBookingId: s.bookingId, reservationRef: ref, guestName: s.name, roomNumber: s.roomLabel,
          date: isoDay(dayAt(s.arr + it.d, 12)), numberOfGuests: g, status: cancelled ? 'cancelled' : 'confirmed', propertyId: PROPERTY_ID,
          amount, source, addons, ...strip(pay), ...razorpay(ref, pay), createdAt, _stay: s,
        });
      }
    }

    // ---- In-room dining orders (billed to the room; linked by Booking._id, same stay) -------
    let orderIdx = 0;
    for (const f of s.fb ?? []) {
      let hour = f.hour;
      if (f.d === 0 && hour < 15) hour = 19; // nobody orders room service before they arrive
      let placed;
      if (f.ago != null) {
        // A live order placed `ago` minutes ago — this is what fills the F&B Orders board's
        // Placed / Accepted / Prepared columns (stage is derived from how long ago it was).
        placed = addMinutes(NOW, -f.ago);
        if (placed < dayAt(s.arr, 14)) violations.push(`${s.bookingId} (${s.key}): live order placed before arrival`);
      } else {
        placed = dayAt(s.arr + f.d, hour, (s.idx * 11 + orderIdx * 17) % 50);
        const guardMax = addMinutes(NOW, -(60 + orderIdx * 12)); // history is already delivered
        if (placed > guardMax) placed = guardMax;
      }
      orderIdx++;
      const accepted = addMinutes(placed, 3);
      const prepared = addMinutes(accepted, 20);
      const delivered = addMinutes(prepared, 12);
      const timestamps = { placed };
      let stage = 'placed';
      if (accepted <= NOW) { timestamps.accepted = accepted; stage = 'accepted'; }
      if (stage === 'accepted' && prepared <= NOW) { timestamps.prepared = prepared; stage = 'prepared'; }
      if (stage === 'prepared' && delivered <= NOW) { timestamps.delivered = delivered; stage = 'delivered'; }
      out.fb.push({
        propertyId: PROPERTY_ID, guestId: s.guest._id, bookingId: s.booking._id, guestName: s.name, room: s.roomLabel,
        items: f.dishes.map((name) => {
          const d = dishes[name];
          if (!d) throw new Error(`Unknown dish "${name}" in ${s.key}`);
          return { dishId: d._id, name: d.name, qty: 1, price: d.price, gstPercent: d.gstPercent };
        }),
        packagingCharge: 30, ...(f.note ? { notes: f.note } : {}), stage,
        paymentStatus: past || f.paid ? 'paid' : 'pending',
        timestamps, createdAt: placed, updatedAt: timestamps[stage] ?? placed, _stay: s,
      });
    }

    // ---- Folio extras + checkout-time override --------------------------------------------
    if ((s.manual?.length ?? 0) > 0 || s.co) {
      out.folio.push({
        propertyId: PROPERTY_ID, bookingId: s.bookingId,
        folio: (s.manual ?? []).map(([name, price, paid]) => ({ name, price, paid })),
        checkoutTimeOverride: s.co ?? null, createdAt: dayAt(s.arr + s.n - 1, 12), _stay: s,
      });
    }

    // ---- Review -------------------------------------------------------------------------------
    if (s.rv) {
      const [rating, review, googleClicked, recoveryResponse, hoursAfter] = s.rv;
      const at = clampToNow(addHours(dayAt(s.arr + s.n, 12), hoursAfter ?? 2 + (s.idx % 4)));
      out.feedback.push({ propertyId: PROPERTY_ID, bookingId: s.bookingId, rating, review, recoveryResponse: recoveryResponse ?? '', googleClicked: !!googleClicked, createdAt: at, _stay: s });
    }
  }

  // ---- Service requests --------------------------------------------------------------------
  const byKey = Object.fromEntries(stays.map((s) => [s.key, s]));
  for (const r of REQUESTS) {
    const s = byKey[r.stay];
    if (!s) throw new Error(`REQUEST references unknown stay "${r.stay}"`);
    const placed = r.when.ago != null ? addMinutes(NOW, -r.when.ago) : dayAt(r.when.d, r.when.h, (s.idx * 7) % 50);
    if (placed < dayAt(s.arr, 14) || placed > NOW) violations.push(`${s.bookingId} (${s.key}): request "${r.item.slice(0, 30)}…" at ${placed.toISOString()} is outside the stay`);
    const by = r.by ? staff[r.by] : null;
    const acceptedAt = by ? addMinutes(placed, 6) : null;
    const done = r.status === 'Completed' ? addMinutes(placed, r.doneAfter ?? 30) : null;
    const byName = by ? `${by.firstName} ${by.lastName}`.trim() : '';
    const sla = addMinutes(placed, r.priority === 'High' ? 30 : 90);
    out.requests.push({
      item: r.item, category: r.category, department: r.dept, guestId: s.guest._id, guestName: s.name, roomNumber: s.roomLabel,
      status: r.status, priority: r.priority ?? 'Normal', source: r.source ?? 'Chat', guestComment: r.item,
      aiSummary: `${s.name.split(' ').slice(-1)[0]}: ${r.item.replace(/\.$/, '')}.`.slice(0, 160),
      actionables: [`Route to ${r.dept}`, r.status === 'Completed' ? 'Confirm with guest' : 'Update guest on ETA'],
      assignee: byName,
      acceptedBy: by ? { staffId: by._id, name: byName, department: by.department ?? null, acceptedAt } : { staffId: null, name: '', department: null, acceptedAt: null },
      bookingId: s.bookingId, // ← same stay ID (shown in the Requests Hub)
      routing: r.manual
        ? { source: 'manual', confidencePct: null, reason: 'Re-routed from Front Desk', routedBy: `${staff['frontdesk.manager'].firstName} ${staff['frontdesk.manager'].lastName}` }
        : { source: 'ai', confidencePct: r.ai ?? null, reason: r.reason ?? '', routedBy: '' },
      eta: done ? 'Done' : r.priority === 'High' ? '30 min' : '1 hr', slaDue: sla, completedAt: done, propertyId: PROPERTY_ID,
      replies: done ? [{ body: 'All done — please let us know if you need anything else.', sentAt: done, sentBy: byName || 'Front Desk' }] : [],
      createdAt: placed, updatedAt: done ?? acceptedAt ?? placed, _stay: s,
    });
  }

  // ---- Persist hub docs (strip helper fields) ---------------------------------------------
  const clean = (docs) => docs.map(({ _stay, _label, ...rest }) => rest);
  const insertedExp = await insertMany(ExperienceBooking, clean(out.exp));
  const insertedSpa = await insertMany(SpaBooking, clean(out.spa));
  const insertedTrn = await insertMany(TransportBooking, clean(out.trn));
  const insertedDin = await insertMany(DiningReservation, clean(out.din));
  await insertMany(FbOrder, clean(out.fb));
  await insertMany(CheckoutFolio, clean(out.folio));
  await insertMany(Feedback, clean(out.feedback));
  await FeedbackSettings.create({ propertyId: PROPERTY_ID, negMax: 2, posMin: 4 });
  await insertMany(ServiceRequest, clean(out.requests));

  // ---- Guest notifications (each states the stay's Booking ID in its text) -----------------
  const fmt = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const notif = (s, at, title, message, type, relatedType, relatedId) => ({
    guestId: s.guest._id, title, message, type, read: at < addHours(NOW, -48), relatedType, relatedId: String(relatedId), createdAt: at,
  });
  for (const s of stays) {
    const stayRange = `${fmt(s.arrival)} – ${fmt(s.checkout)}`;
    if (s.cancelled) {
      out.notifications.push(notif(s, addHours(s.createdAt, 2), 'Booking cancelled', `Your stay ${s.bookingId} (${stayRange}) has been cancelled. Any prepaid bookings are being refunded.`, 'warning', 'booking', s.booking._id));
      continue;
    }
    out.notifications.push(notif(s, s.createdAt, 'Booking confirmed', `Your stay ${s.bookingId} at ${PROPERTY_NAME} is confirmed for ${stayRange}.`, 'success', 'booking', s.booking._id));
    if (s.checkIn && s.ci_.approval === 'approved') out.notifications.push(notif(s, ah(s.createdAt, 40), 'Check-in approved', `Your online check-in for ${s.bookingId} is approved — we look forward to welcoming you.`, 'success', 'check-in', s.checkIn._id));
    if (s.checkIn && s.ci_.approval === 'rejected') out.notifications.push(notif(s, ah(s.createdAt, 40), 'Check-in needs attention', `Some documents for ${s.bookingId} need to be re-uploaded. Open Check-in to see what to fix.`, 'warning', 'check-in', s.checkIn._id));
  }
  const relType = { exp: 'booking', spa: 'spa-booking', trn: 'transport-booking', din: 'booking' };
  const titleOf = { exp: 'Experience confirmed', spa: 'Spa booking confirmed', trn: 'Transport confirmed', din: 'Dining reservation confirmed' };
  const attach = (kind, docs, inserted, refKey, nameOf) => docs.forEach((d, i) => {
    if (d.source !== 'app' || d.status === 'cancelled' || d.bookingStatus === 'cancelled' || d.status === 'Cancelled') return;
    out.notifications.push(notif(d._stay, d.createdAt, titleOf[kind], `${nameOf(d)} is confirmed — reference ${d[refKey]}.`, 'success', relType[kind], inserted[i]._id));
  });
  attach('exp', out.exp, insertedExp, 'bookingId', (d) => `${d.experienceName} on ${fmt(d.date)}`);
  attach('spa', out.spa, insertedSpa, 'bookingId', (d) => `${d.treatmentName} on ${fmt(d.date)}`);
  attach('trn', out.trn, insertedTrn, 'ref', (d) => `Transport (${d.vehicleName})`);
  attach('din', out.din, insertedDin, 'reservationRef', (d) => `${d.facilityName} on ${fmt(new Date(`${d.date}T12:00:00`))}`);
  await insertMany(Notification, out.notifications.map(({ _stay, ...rest }) => rest));

  return { stays, out, ids, violations };
}
