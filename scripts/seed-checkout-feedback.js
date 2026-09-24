/**
 * Dev seed for the Checkout & Feedback hub (property-dashboard's /checkout page).
 *
 * Creates real Guest/Booking documents whose checkoutDate falls today, yesterday and tomorrow
 * (so the Today/Tomorrow date filter and the "N more than yesterday" tile all have data), and
 * links real Spa / Experience / Transport / Dining bookings and in-room F&B orders to each stay
 * with a mix of paid and pending paymentStatus. The checkout folio is assembled from those at
 * read time (see checkout.controller.js), so Needs Approval vs Pre-approved is derived from
 * what the guest actually hasn't paid for — never seeded. A couple of manual extras (e.g. a
 * late check-out fee) and per-guest checkout-time overrides live in CheckoutFolio.
 *
 * Also seeds a spread of Feedback reviews across the last ~5 weeks covering every star rating
 * and both Google click-through states, and the default sentiment thresholds.
 *
 * Idempotent: re-running upserts bookings/guests by ID and RESETS the seeded hub bookings,
 * folios and reviews to their initial state (an approved checkout goes back to Needs Approval).
 * Every hub document this script creates carries a SEEDCO- reference, so only those are wiped.
 *
 * Needs at least one Experience, Spa facility and Restaurant already in the DB.
 *
 * Run:
 *   node scripts/seed-checkout-feedback.js
 */

import mongoose from 'mongoose';
import { MONGODB_URI, MONGODB_DB_NAME } from '../src/config/env.js';
import Guest from '../src/models/Guest.model.js';
import Booking from '../src/models/Booking.model.js';
import Experience from '../src/models/Experience.model.js';
import SpaFacility from '../src/models/Spa.model.js';
import Restaurant from '../src/models/Restaurant.model.js';
import SpaBooking from '../src/models/SpaBooking.model.js';
import ExperienceBooking from '../src/models/ExperienceBooking.model.js';
import TransportBooking from '../src/models/TransportBooking.model.js';
import DiningReservation from '../src/models/DiningReservation.model.js';
import FbOrder from '../src/models/FbOrder.model.js';
import CheckoutFolio from '../src/models/CheckoutFolio.model.js';
import Feedback from '../src/models/Feedback.model.js';
import FeedbackSettings from '../src/models/FeedbackSettings.model.js';

const PROPERTY_ID = 'default';
const PROPERTY_NAME = 'Evolve Back Resort Coorg';

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB_NAME });
console.log('Connected to', MONGODB_DB_NAME);

function dayAt(offsetDays, hour = 12) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function ensureGuest({ email, fullName, numberOfGuests }) {
  let guest = await Guest.findOne({ email });
  if (guest) return guest;
  return Guest.create({
    email, fullName, numberOfGuests,
    mobileNumber: '9800000000', countryCode: '+91',
    bookingName: fullName,
    consentGiven: true, consentTimestamp: new Date(),
  });
}

// checkoutOffset: days from today (0 = today, -1 = yesterday, 1 = tomorrow).
async function ensureBooking(b) {
  const slug = b.bookingId.toLowerCase().replace(/[^a-z0-9]/g, '');
  const guest = await ensureGuest({
    email: `seed.co.${slug}@example.com`,
    fullName: b.guest,
    numberOfGuests: b.guests,
  });
  const status = b.checkoutOffset < 0 ? 'checked-out' : 'checked-in';
  await Booking.findOneAndUpdate(
    { bookingId: b.bookingId },
    {
      guestId: guest._id,
      primaryGuestName: b.guest,
      propertyId: PROPERTY_ID,
      propertyName: PROPERTY_NAME,
      numberOfGuests: b.guests,
      arrivalDate: dayAt(b.checkoutOffset - b.nights),
      checkoutDate: dayAt(b.checkoutOffset),
      roomNumber: b.room,
      roomType: b.room.replace(/\s*\d+.*$/, ''),
      bookingStatus: status,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

// kind: which hub the charge comes from — spa | exp | trn | din | fb (in-room F&B order) |
// manual (an extra charge staff added directly, not tied to any hub booking).
const item = (kind, name, price, paid) => ({ kind, name, price, paid });

// ---------------------------------------------------------------------------
// 1. Stays
// ---------------------------------------------------------------------------

const BOOKINGS = [
  // ---- Today ----
  { bookingId: 'EB-2026-78432', guest: 'Rohit & Meera Sharma', guests: 2, nights: 4, room: 'Cottage 112', checkoutOffset: 0,
    items: [item('exp', 'Coracle experience', 1700, true), item('spa', 'Spa — couples massage', 4500, false), item('fb', 'In-room dining', 2000, false)] },
  { bookingId: 'EB-2026-78511', guest: 'Neha Kapoor', guests: 1, nights: 2, room: 'Villa 4', checkoutOffset: 0, checkoutTime: '10:30',
    items: [item('spa', 'Spa — Wellness therapy session', 5100, true)] },
  { bookingId: 'EB-2026-78390', guest: 'The Iyer Family', guests: 4, nights: 5, room: 'Cottage 108', checkoutOffset: 0, checkoutTime: '12:00',
    items: [item('exp', "Kids' nature walk", 1200, false), item('din', 'Dining — Lanterns By The Forest', 6800, false), item('trn', 'Transport — Airport transfer', 3700, false)] },
  { bookingId: 'EB-2026-78455', guest: 'Karan Malhotra', guests: 1, nights: 3, room: 'Villa 7', checkoutOffset: 0, checkoutTime: '13:30',
    items: [item('fb', 'In-room dining', 2200, false), item('trn', 'Transport — Airport transfer', 2000, false)] },
  { bookingId: 'EB-2026-78467', guest: 'Divya Reddy', guests: 1, nights: 2, room: 'Cottage 105', checkoutOffset: 0, checkoutTime: '11:30',
    items: [item('spa', 'Spa — Ayurveda session', 6300, true)] },
  { bookingId: 'EB-2026-78478', guest: 'Anita & Vikram Rao', guests: 2, nights: 3, room: 'Villa 2', checkoutOffset: 0, checkoutTime: '09:30',
    items: [item('exp', 'Coracle ride', 2300, true), item('din', 'Dining — Moonlight For Two', 3300, true), item('manual', 'Late check-out fee', 4200, false)] },
  { bookingId: 'EB-2026-78489', guest: 'Sanjay Kumar', guests: 1, nights: 1, room: 'Cottage 101', checkoutOffset: 0, checkoutTime: '09:00',
    items: [item('fb', 'In-room dining', 1500, true)] },

  // ---- Tomorrow ----
  { bookingId: 'EB-2026-78601', guest: 'Pooja & Aman Bhatia', guests: 2, nights: 3, room: 'Pool Villa 2', checkoutOffset: 1,
    items: [item('spa', 'Spa — Ayurvedic Duo', 9400, false), item('exp', 'Nature trail', 1800, true)] },
  { bookingId: 'EB-2026-78612', guest: 'Thomas Weber', guests: 1, nights: 2, room: 'Cottage 110', checkoutOffset: 1,
    items: [item('fb', 'In-room dining', 3200, true)] },
  { bookingId: 'EB-2026-78623', guest: 'The Menon Family', guests: 5, nights: 4, room: 'Machaan 3', checkoutOffset: 1,
    items: [item('exp', 'Plantation tour', 4000, false), item('din', 'Dining — The Machan', 7200, false)] },
];

// Past stays — checked out already. Each carries a review below; their folios are fully settled.
const PAST = [
  { bookingId: 'EB-2026-77801', guest: 'Arjun & Sneha Nair', guests: 2, nights: 3, room: 'Pool Villa 1', checkoutOffset: -1 },
  { bookingId: 'EB-2026-77812', guest: 'Helena Rossi', guests: 1, nights: 2, room: 'Cottage 103', checkoutOffset: -1 },
  { bookingId: 'EB-2026-77823', guest: 'The Kulkarni Family', guests: 4, nights: 4, room: 'Cottage 109', checkoutOffset: -1 },
  { bookingId: 'EB-2026-77834', guest: 'Imran & Zoya Sheikh', guests: 2, nights: 2, room: 'Villa 5', checkoutOffset: -1 },
  { bookingId: 'EB-2026-77845', guest: 'David Cohen', guests: 1, nights: 3, room: 'Cottage 104', checkoutOffset: -1 },
  { bookingId: 'EB-2026-77701', guest: 'Lakshmi & Ravi Iyengar', guests: 2, nights: 3, room: 'Pool Villa 3', checkoutOffset: -3 },
  { bookingId: 'EB-2026-77712', guest: 'Priya Deshmukh', guests: 1, nights: 2, room: 'Villa 1', checkoutOffset: -4 },
  { bookingId: 'EB-2026-77723', guest: 'The Gupta Family', guests: 4, nights: 5, room: 'Cottage 111', checkoutOffset: -6 },
  { bookingId: 'EB-2026-77601', guest: 'Ethan & Chloe Marshall', guests: 2, nights: 4, room: 'Pool Villa 2', checkoutOffset: -9 },
  { bookingId: 'EB-2026-77612', guest: 'Sunita Bansal', guests: 1, nights: 2, room: 'Cottage 102', checkoutOffset: -12 },
  { bookingId: 'EB-2026-77623', guest: 'Rahul & Ananya Sethi', guests: 2, nights: 3, room: 'Villa 6', checkoutOffset: -16 },
  { bookingId: 'EB-2026-77501', guest: 'Marta Kowalski', guests: 1, nights: 3, room: 'Cottage 106', checkoutOffset: -21 },
  { bookingId: 'EB-2026-77512', guest: 'The Pillai Family', guests: 4, nights: 4, room: 'Machaan 1', checkoutOffset: -27 },
  { bookingId: 'EB-2026-77523', guest: 'Yusuf Khan', guests: 2, nights: 2, room: 'Villa 3', checkoutOffset: -34 },
].map((b, i) => ({
  ...b,
  items: [item('fb', 'In-room dining', 2400 + i * 350, true), item('spa', 'Spa — Massage', 3000 + i * 500, true)],
}));

for (const b of BOOKINGS) await ensureBooking(b);
for (const b of PAST) await ensureBooking(b);
console.log(`Upserted ${BOOKINGS.length + PAST.length} stays`);

// ---------------------------------------------------------------------------
// 2. Hub bookings linked to those stays (what the checkout folio is built from)
// ---------------------------------------------------------------------------

const allStays = [...BOOKINGS, ...PAST];
const allIds = allStays.map((b) => b.bookingId);

const [experience, spaFacility, restaurant, stays] = await Promise.all([
  Experience.findOne().lean(),
  SpaFacility.findOne().lean(),
  Restaurant.findOne({ facilityType: 'intimate_dining' }).lean().then((r) => r ?? Restaurant.findOne().lean()),
  Booking.find({ bookingId: { $in: allIds } }).lean(),
]);
if (!experience || !spaFacility || !restaurant) {
  throw new Error('Need at least one Experience, Spa facility and Restaurant in the DB to link seeded bookings to.');
}
const stayByBookingId = Object.fromEntries(stays.map((s) => [s.bookingId, s]));
const spaTreatment = spaFacility.categories?.[0]?.treatments?.[0];

await Promise.all([
  SpaBooking.deleteMany({ bookingId: /^SEEDCO-/ }),
  ExperienceBooking.deleteMany({ bookingId: /^SEEDCO-/ }),
  TransportBooking.deleteMany({ ref: /^SEEDCO-/ }),
  DiningReservation.deleteMany({ reservationRef: /^SEEDCO-/ }),
  FbOrder.deleteMany({ notes: /^SEEDCO-/ }),
  CheckoutFolio.deleteMany({ bookingId: { $in: allIds } }),
]);

let seq = 0;
const docs = { spa: [], exp: [], trn: [], din: [], fb: [], folio: [] };

function folioDocFor(bookingId) {
  let entry = docs.folio.find((f) => f.bookingId === bookingId);
  if (!entry) docs.folio.push((entry = { propertyId: PROPERTY_ID, bookingId, folio: [] }));
  return entry;
}

for (const b of allStays) {
  const stay = stayByBookingId[b.bookingId];
  const common = { mainStayBookingId: b.bookingId, guestId: stay.guestId, guestName: b.guest, propertyId: PROPERTY_ID };
  const payment = (paid) => ({ paymentStatus: paid ? 'paid' : 'pending', ...(paid ? { paidAt: new Date() } : {}) });
  const date = stay.arrivalDate;

  for (const it of b.items) {
    const ref = `SEEDCO-${++seq}`;
    if (it.kind === 'spa') {
      docs.spa.push({
        ...common, bookingId: ref, spaFacilityId: spaFacility._id, treatmentId: String(spaTreatment?._id ?? 'seed'),
        treatmentName: it.name.replace(/^Spa — /, ''), room: b.room, date, timeSlot: '11:00', price: it.price,
        status: 'Upcoming', source: 'staff', ...payment(it.paid),
      });
    } else if (it.kind === 'exp') {
      docs.exp.push({
        ...common, bookingId: ref, experienceId: experience._id, experienceName: it.name, date, timeSlot: '08:00',
        numberOfGuests: b.guests, unitPrice: it.price, totalAmount: it.price, bookingStatus: 'confirmed',
        room: b.room, source: 'staff', ...payment(it.paid),
      });
    } else if (it.kind === 'trn') {
      docs.trn.push({
        ...common, ref, hubBooking: true, roomNumber: b.room, room: b.room, checkInDate: date, amount: it.price,
        status: 'confirmed', vehicleName: it.name.replace(/^Transport — /, ''), source: 'staff', ...payment(it.paid),
      });
    } else if (it.kind === 'din') {
      docs.din.push({
        ...common, reservationRef: ref, facilityId: restaurant._id, facilityName: it.name.replace(/^Dining — /, ''),
        facilityType: restaurant.facilityType ?? 'restaurant', roomNumber: b.room, date: date.toISOString().slice(0, 10),
        numberOfGuests: b.guests, status: 'confirmed', amount: it.price, source: 'staff', ...payment(it.paid),
      });
    } else if (it.kind === 'fb') {
      // Single line item at the seeded amount, no GST/packaging, so the order total equals it.
      docs.fb.push({
        propertyId: PROPERTY_ID, guestId: stay.guestId, bookingId: stay._id, guestName: b.guest, room: b.room,
        items: [{ name: 'Room service', qty: 1, price: it.price, gstPercent: 0 }], packagingCharge: 0,
        stage: 'delivered', notes: ref, paymentStatus: it.paid ? 'paid' : 'pending',
      });
    } else {
      folioDocFor(b.bookingId).folio.push({ name: it.name, price: it.price, paid: it.paid });
    }
  }
}

// Per-guest checkout-time overrides (what the dashboard's edit pencil writes).
for (const b of BOOKINGS.filter((x) => x.checkoutTime)) {
  folioDocFor(b.bookingId).checkoutTimeOverride = b.checkoutTime;
}

await Promise.all([
  SpaBooking.insertMany(docs.spa),
  ExperienceBooking.insertMany(docs.exp),
  TransportBooking.insertMany(docs.trn),
  DiningReservation.insertMany(docs.din),
  FbOrder.insertMany(docs.fb),
  CheckoutFolio.insertMany(docs.folio),
]);
console.log(
  `Reset linked bookings: ${docs.spa.length} spa, ${docs.exp.length} experience, ${docs.trn.length} transport, ` +
  `${docs.din.length} dining, ${docs.fb.length} F&B orders, ${docs.folio.length} folio/time docs`
);

// ---------------------------------------------------------------------------
// 3. Feedback — ratings span every star, recovery responses on low ratings.
// ---------------------------------------------------------------------------

const REVIEWS = [
  // today's checkouts leaving feedback as they depart
  { bookingId: 'EB-2026-78432', hoursAfter: 1, rating: 5, googleClicked: true,
    review: 'The lakeside dinner on our anniversary was the highlight of the trip — the staff remembered without us asking twice. Would come back purely for that evening.' },
  { bookingId: 'EB-2026-78455', hoursAfter: 1, rating: 3, googleClicked: false,
    review: 'Room was lovely but the spa booking process felt disorganised — had to follow up twice to confirm my slot.' },
  { bookingId: 'EB-2026-78390', hoursAfter: 1, rating: 2,
    review: "Kids' activity was cancelled with no notice and no alternative offered. Disappointing for a trip we'd built around it.",
    recoveryResponse: 'A heads-up the evening before and a swap to the pottery workshop would have saved the day for the kids.' },

  // yesterday
  { bookingId: 'EB-2026-77801', hoursAfter: 2, rating: 5, googleClicked: true,
    review: 'Absolutely stunning property. The pool villa was private and quiet, and the team went out of their way for our honeymoon dinner.' },
  { bookingId: 'EB-2026-77812', hoursAfter: 3, rating: 4, googleClicked: false,
    review: 'Great coffee plantation views and a lovely cottage. Breakfast could have more variety.' },
  { bookingId: 'EB-2026-77823', hoursAfter: 2, rating: 1,
    review: 'Room was not ready at check-in despite confirmation and we waited almost two hours in the lobby with tired kids.',
    recoveryResponse: 'Having the room ready at the confirmed time, or at least a welcome drink and a quiet place to wait, would have changed the whole start of our stay.' },
  { bookingId: 'EB-2026-77834', hoursAfter: 4, rating: 4, googleClicked: true,
    review: 'Peaceful stay, loved the nature trail experience. Wifi was a bit patchy in the room.' },
  { bookingId: 'EB-2026-77845', hoursAfter: 2, rating: 3, googleClicked: false,
    review: 'Good food and a beautiful setting, but the in-room dining took over an hour to arrive both nights.' },

  // earlier this week / last week and older
  { bookingId: 'EB-2026-77701', hoursAfter: 3, rating: 5, googleClicked: true,
    review: "Best resort we have stayed at in India. The spa couple's ritual was unforgettable." },
  { bookingId: 'EB-2026-77712', hoursAfter: 1, rating: 4, googleClicked: false,
    review: 'Wonderful experience overall, the transport desk was very responsive for our Coorg tour.' },
  { bookingId: 'EB-2026-77723', hoursAfter: 5, rating: 3, googleClicked: false,
    review: 'The kids enjoyed the property but the pool water was quite cold in the mornings.' },
  { bookingId: 'EB-2026-77601', hoursAfter: 2, rating: 5, googleClicked: true,
    review: 'Exceptional hospitality from the front desk team, especially during our late arrival.' },
  { bookingId: 'EB-2026-77612', hoursAfter: 4, rating: 2,
    review: 'Billing dispute at checkout — we were charged for a spa session we had cancelled. Still unresolved.',
    recoveryResponse: 'Cancelled sessions should be removed from the bill automatically, and someone should have called back the same day.' },
  { bookingId: 'EB-2026-77623', hoursAfter: 3, rating: 4, googleClicked: true,
    review: 'Lovely cottage, attentive staff. The plantation walk with the naturalist was a highlight.' },
  { bookingId: 'EB-2026-77501', hoursAfter: 2, rating: 5, googleClicked: false,
    review: 'A perfect solo retreat. Quiet, beautiful and the food was outstanding.' },
  { bookingId: 'EB-2026-77512', hoursAfter: 6, rating: 3, googleClicked: false,
    review: 'Nice property, but our machaan had a lot of insects and the housekeeping was slow to respond.' },
  { bookingId: 'EB-2026-77523', hoursAfter: 3, rating: 4, googleClicked: true,
    review: 'Great value stay with wonderful staff. Would have loved a later checkout.' },
];

const stayByIdOffsets = Object.fromEntries(allStays.map((b) => [b.bookingId, b]));
await Feedback.deleteMany({ bookingId: { $in: REVIEWS.map((r) => r.bookingId) } });
await Feedback.insertMany(
  REVIEWS.map((r) => {
    const b = stayByIdOffsets[r.bookingId];
    // A review lands `hoursAfter` hours into the checkout day (clamped to "now" so nothing is
    // future-dated).
    const at = dayAt(b.checkoutOffset, 12);
    at.setHours(at.getHours() + r.hoursAfter);
    const createdAt = at > new Date() ? new Date() : at;
    return {
      propertyId: PROPERTY_ID,
      bookingId: r.bookingId,
      rating: r.rating,
      review: r.review,
      recoveryResponse: r.recoveryResponse ?? '',
      googleClicked: !!r.googleClicked,
      createdAt,
      updatedAt: createdAt,
    };
  })
);
console.log(`Reset ${REVIEWS.length} reviews`);

await FeedbackSettings.findOneAndUpdate(
  { propertyId: PROPERTY_ID },
  { $setOnInsert: { propertyId: PROPERTY_ID, negMax: 2, posMin: 4 } },
  { upsert: true }
);
console.log('Ensured default sentiment thresholds (Negative <= 2 stars, Positive >= 4 stars)');

await mongoose.disconnect();
console.log('Done');
