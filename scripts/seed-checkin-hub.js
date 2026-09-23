/**
 * One-time dev seed: populate real Guest/Booking/CheckIn documents so the Check-in Hub
 * dashboard (property-dashboard's /checkin page) has something real to demo against —
 * multi-room/multi-guest bookings, a mix of not-submitted/submitted/approved/rejected guest
 * ID states, and arrival dates spread relative to today so the Today/Tomorrow/Next 7 days
 * filters all have something to show.
 *
 * Guest ID documents are real PDFs uploaded to Cloudflare R2 (not Cloudinary — see the
 * uploadToR2 switch in checkin.controller.js), reusing two small placeholder PDFs for every
 * guest rather than uploading hundreds of near-identical objects.
 *
 * Idempotent: re-running upserts by bookingId rather than duplicating documents.
 *
 * Run once:
 *   node scripts/seed-checkin-hub.js
 */

import mongoose from 'mongoose';
import { MONGODB_URI, MONGODB_DB_NAME } from '../src/config/env.js';
import Guest from '../src/models/Guest.model.js';
import Booking from '../src/models/Booking.model.js';
import CheckIn from '../src/models/CheckIn.model.js';
import { uploadToR2 } from '../src/utils/r2Upload.js';

const PROPERTY_ID = 'default';
const PROPERTY_NAME = 'Evolve Back Resort Coorg';

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB_NAME });
console.log('Connected to', MONGODB_DB_NAME);

// ---------------------------------------------------------------------------
// 1. A minimal, valid, single-blank-page PDF — used as the placeholder "uploaded ID" for
//    every seeded guest. Real guest uploads go through the same uploadToR2 path in
//    checkin.controller.js; this just stands in for an actual scanned ID during seeding.
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
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(body, 'utf-8');
}

console.log('Uploading placeholder ID PDFs to R2...');
const idFrontUrl = await uploadToR2(buildPlaceholderPdf('Sample ID - Front'), 'checkin-ids/seed', 'application/pdf', 'pdf');
const idBackUrl = await uploadToR2(buildPlaceholderPdf('Sample ID - Back'), 'checkin-ids/seed', 'application/pdf', 'pdf');
console.log('Front:', idFrontUrl);
console.log('Back:', idBackUrl);

// ---------------------------------------------------------------------------
// 2. Helpers
// ---------------------------------------------------------------------------

function isoOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

async function ensureGuest({ email, fullName, mobileNumber, countryCode, numberOfGuests, roomNumber, bookingName, checkInStatus }) {
  let guest = await Guest.findOne({ email });
  if (guest) {
    Object.assign(guest, { fullName, mobileNumber, countryCode, numberOfGuests, roomNumber, bookingName, checkInStatus });
    await guest.save();
    return guest;
  }
  guest = await Guest.create({
    email, fullName, mobileNumber, countryCode, numberOfGuests, roomNumber, bookingName, checkInStatus,
    consentGiven: true,
    consentTimestamp: new Date(),
  });
  return guest;
}

async function ensureBooking({ bookingId, guest, primaryGuestName, numberOfGuests, arrivalDate, nights, roomType, roomNumber, checkInStatus }) {
  const checkoutDate = new Date(arrivalDate);
  checkoutDate.setDate(checkoutDate.getDate() + nights);

  const update = {
    guestId: guest._id,
    primaryGuestName,
    propertyId: PROPERTY_ID,
    propertyName: PROPERTY_NAME,
    numberOfGuests,
    arrivalDate,
    checkoutDate,
    roomType,
    roomNumber,
    checkInStatus,
  };
  return Booking.findOneAndUpdate({ bookingId }, update, { upsert: true, new: true, setDefaultsOnInsert: true });
}

// guestSpecs: array indexed by guest number (1 = primary), each either null (not-submitted, no
// document at all yet) or { name?, verified, rejectionReason? }.
async function ensureCheckIn({ bookingId, primaryGuest, totalGuests, guestSpecs, status, approvalStatus }) {
  let checkIn = await CheckIn.findOne({ guestId: primaryGuest._id, bookingId });
  if (!checkIn) {
    checkIn = new CheckIn({ bookingId, guestId: primaryGuest._id, totalGuests, status: 'initiated' });
  }

  checkIn.totalGuests = totalGuests;
  checkIn.guestDocuments = guestSpecs
    .map((spec, idx) => ({ spec, guestNumber: idx + 1 }))
    .filter(({ spec }) => spec !== null)
    .map(({ spec, guestNumber }) => ({
      guestNumber,
      guestName: guestNumber === 1 ? undefined : spec.name,
      idFrontUrl,
      idBackUrl,
      idType: 'passport',
      uploadedAt: new Date(),
      verified: !!spec.verified,
      rejectionReason: spec.rejectionReason,
      verifiedAt: spec.verified || spec.rejectionReason ? new Date() : undefined,
    }));
  checkIn.documentsCompleted = checkIn.guestDocuments.length;
  checkIn.status = status;
  checkIn.approvalStatus = approvalStatus;
  if (status !== 'initiated') checkIn.submittedAt = checkIn.submittedAt || new Date();
  if (status === 'approved') checkIn.completedAt = checkIn.completedAt || new Date();

  await checkIn.save();
  return checkIn;
}

// ---------------------------------------------------------------------------
// 3. Demo bookings — same cast as the frontend's reference seed (src/data/seed/checkin.ts in
//    property-dashboard), now as real linked Guest + Booking + CheckIn documents.
// ---------------------------------------------------------------------------

const BOOKINGS = [
  {
    bookingId: 'CKN-ROHIT-SHARMA', primaryGuest: 'Rohit Sharma', email: 'seed.rohit.sharma@example.com',
    dayOffset: 0, nights: 3, roomType: 'Cottage', roomNumber: 'Cottage 112', totalGuests: 2,
    guestSpecs: [{ verified: false }, { name: 'Meera Sharma', verified: false }],
  },
  {
    bookingId: 'CKN-DIVYA-REDDY', primaryGuest: 'Divya Reddy', email: 'seed.divya.reddy@example.com',
    dayOffset: 0, nights: 2, roomType: 'Cottage', roomNumber: null, totalGuests: 1,
    guestSpecs: [{ verified: false }],
  },
  {
    bookingId: 'CKN-KARAN-MALHOTRA', primaryGuest: 'Karan Malhotra', email: 'seed.karan.malhotra@example.com',
    dayOffset: 1, nights: 4, roomType: 'Villa', roomNumber: null, totalGuests: 2,
    guestSpecs: [null, null],
  },
  {
    bookingId: 'CKN-IYER-FAMILY', primaryGuest: 'The Iyer Family', email: 'seed.iyer.family@example.com',
    dayOffset: 0, nights: 5, roomType: 'Pool Villa, Coffee Cottage', roomNumber: 'Pool Villa 1, ',
    totalGuests: 7,
    guestSpecs: [
      null,
      { name: 'Lakshmi Iyer', verified: false },
      { name: 'Ramesh Iyer', verified: true },
      { name: 'Kavitha Iyer', verified: false, rejectionReason: 'The uploaded ID photo is blurry — please re-upload a clearer image of the document.' },
      { name: 'Arjun Iyer', verified: true },
      { name: 'Divya Iyer', verified: true },
      { name: 'Master Vihaan Iyer', verified: false },
    ],
  },
  {
    bookingId: 'CKN-MALHOTRA-EXTENDED', primaryGuest: 'The Malhotra Extended Family', email: 'seed.malhotra.extended@example.com',
    dayOffset: 4, nights: 6, roomType: 'Pool Villa, Lily Pool Cottage, River View Cottage, Villa, Machaan',
    roomNumber: 'Pool Villa 2, Lily Pool Cottage 1, River View Cottage 1, Villa 7, Machaan 1',
    totalGuests: 10,
    guestSpecs: [
      { verified: true }, { name: 'Sunita Malhotra', verified: true },
      { name: 'Vikram Malhotra', verified: true }, { name: 'Anjali Malhotra', verified: true },
      { name: 'Rohan Malhotra', verified: true }, { name: 'Priya Malhotra', verified: false },
      { name: 'Master Aryan Malhotra', verified: true },
      { name: 'Deepak Malhotra', verified: true }, { name: 'Nisha Malhotra', verified: true },
      { name: 'Karthik Malhotra', verified: true },
    ],
  },
  {
    bookingId: 'CKN-VERMA-REUNION', primaryGuest: 'Verma Family Reunion', email: 'seed.verma.reunion@example.com',
    dayOffset: 2, nights: 4, roomType: 'Machaan, The Nest', roomNumber: 'Machaan 3, ',
    totalGuests: 8,
    guestSpecs: [
      { verified: true }, { name: 'Ritu Verma', verified: true },
      { name: 'Kabir Verma', verified: true }, { name: 'Ishaan Verma', verified: false },
      { name: 'Meenal Verma', verified: false }, null, null, null,
    ],
  },
  {
    bookingId: 'CKN-NEHA-KAPOOR', primaryGuest: 'Neha Kapoor', email: 'seed.neha.kapoor@example.com',
    dayOffset: 9, nights: 2, roomType: 'Villa', roomNumber: 'Villa 4', totalGuests: 1,
    guestSpecs: [{ verified: true }],
  },
  {
    bookingId: 'CKN-JAMES-WHITFIELD', primaryGuest: 'James Whitfield', email: 'seed.james.whitfield@example.com',
    dayOffset: -3, nights: 3, roomType: 'Pool Villa', roomNumber: 'Pool Villa 3', totalGuests: 1,
    guestSpecs: [{ verified: true }],
  },

  // --- Additional scenarios ---

  // All guests rejected, arriving today — full-red state, not just one rejection among approvals.
  {
    bookingId: 'CKN-NAIR-FAMILY', primaryGuest: 'The Nair Family', email: 'seed.nair.family@example.com',
    dayOffset: 0, nights: 3, roomType: 'Villa', roomNumber: 'Villa 9', totalGuests: 4,
    guestSpecs: [
      { verified: false, rejectionReason: 'ID photo is upside down — please re-upload.' },
      { name: 'Anitha Nair', verified: false, rejectionReason: 'Document is expired.' },
      { name: 'Ravi Nair', verified: false, rejectionReason: 'Name on ID does not match booking name.' },
      { name: 'Master Dev Nair', verified: false, rejectionReason: 'Only a partial scan was uploaded.' },
    ],
  },
  // Fully approved, arriving today — adds to today's "Fully Approved" pool.
  {
    bookingId: 'CKN-RAO-COUPLE', primaryGuest: 'Ananya & Vikram Rao', email: 'seed.rao.couple@example.com',
    dayOffset: 0, nights: 2, roomType: 'Coffee Cottage', roomNumber: 'Coffee Cottage 108', totalGuests: 2,
    guestSpecs: [{ verified: true }, { name: 'Vikram Rao', verified: true }],
  },
  // No room type on record at all yet — exercises the empty Room Assignment state.
  {
    bookingId: 'CKN-DEEPIKA-NAMBIAR', primaryGuest: 'Deepika Nambiar', email: 'seed.deepika.nambiar@example.com',
    dayOffset: 0, nights: 1, roomType: '', roomNumber: '', totalGuests: 1,
    guestSpecs: [{ verified: false }],
  },
  // Two guests, two separate single-guest rooms, both already approved, arriving tomorrow.
  {
    bookingId: 'CKN-SOLANKI-COUPLE', primaryGuest: 'Kabir & Meera Solanki', email: 'seed.solanki.couple@example.com',
    dayOffset: 1, nights: 3, roomType: 'Cottage, Villa', roomNumber: 'Cottage 105, Villa 4', totalGuests: 2,
    guestSpecs: [{ verified: true }, { name: 'Meera Solanki', verified: true }],
  },
  // Fresh submission awaiting review, arriving tomorrow.
  {
    bookingId: 'CKN-FARAH-SHEIKH', primaryGuest: 'Farah Sheikh', email: 'seed.farah.sheikh@example.com',
    dayOffset: 1, nights: 2, roomType: 'Lily Pool Cottage', roomNumber: null, totalGuests: 1,
    guestSpecs: [{ verified: false }],
  },
  // 6 guests, 3 rooms all resolved, right at the edge of the "Next 7 days" window (today+6).
  {
    bookingId: 'CKN-CHATTERJEE-REUNION', primaryGuest: 'The Chatterjee Reunion', email: 'seed.chatterjee.reunion@example.com',
    dayOffset: 6, nights: 5, roomType: 'Machaan, The Nest, River View Cottage',
    roomNumber: 'Machaan 2, The Nest 1, River View Cottage 2', totalGuests: 6,
    guestSpecs: [
      { verified: true }, { name: 'Ritwik Chatterjee', verified: true },
      { name: 'Sohini Chatterjee', verified: false }, { name: 'Abir Chatterjee', verified: false },
      null, null,
    ],
  },
  // Mostly approved but one rejection at a mid-range arrival date — red overrides green again,
  // this time on a 5-guest/2-room booking rather than the Iyer example.
  {
    bookingId: 'CKN-BHATTACHARYA-FAMILY', primaryGuest: 'The Bhattacharya Family', email: 'seed.bhattacharya.family@example.com',
    dayOffset: 5, nights: 4, roomType: 'Pool Villa, Coffee Cottage', roomNumber: 'Pool Villa 4, Coffee Cottage 101',
    totalGuests: 5,
    guestSpecs: [
      { verified: true }, { name: 'Sourav Bhattacharya', verified: true },
      { name: 'Mitali Bhattacharya', verified: true },
      { name: 'Ishani Bhattacharya', verified: false, rejectionReason: 'Back of the ID was not included — please upload both sides.' },
      { name: 'Master Rian Bhattacharya', verified: true },
    ],
  },
];

function deriveStatus(guestSpecs, totalGuests) {
  const submitted = guestSpecs.filter(Boolean);
  const anyRejected = submitted.some((g) => g.rejectionReason);
  const allApproved = submitted.length === totalGuests && submitted.every((g) => g.verified);
  if (anyRejected) return { status: 'rejected', approvalStatus: 'rejected', bookingStatus: 'rejected' };
  if (allApproved) return { status: 'approved', approvalStatus: 'approved', bookingStatus: 'approved' };
  if (submitted.length === 0) return { status: 'initiated', approvalStatus: 'pending', bookingStatus: 'pending' };
  return { status: 'documents-uploaded', approvalStatus: 'pending', bookingStatus: 'submitted' };
}

let count = 0;
for (const b of BOOKINGS) {
  const arrivalDate = isoOffset(b.dayOffset);
  const { status, approvalStatus, bookingStatus } = deriveStatus(b.guestSpecs, b.totalGuests);

  const primaryGuest = await ensureGuest({
    email: b.email,
    fullName: b.primaryGuest,
    mobileNumber: '9800000000',
    countryCode: '+91',
    numberOfGuests: b.totalGuests,
    roomNumber: b.roomNumber,
    bookingName: b.primaryGuest,
    checkInStatus: status === 'approved' ? 'verified' : status === 'rejected' ? 'rejected' : status === 'initiated' ? 'no-id-uploaded' : 'verification-pending',
  });

  await ensureBooking({
    bookingId: b.bookingId,
    guest: primaryGuest,
    primaryGuestName: b.primaryGuest,
    numberOfGuests: b.totalGuests,
    arrivalDate,
    nights: b.nights,
    roomType: b.roomType,
    roomNumber: b.roomNumber,
    checkInStatus: bookingStatus,
  });

  await ensureCheckIn({
    bookingId: b.bookingId,
    primaryGuest,
    totalGuests: b.totalGuests,
    guestSpecs: b.guestSpecs,
    status,
    approvalStatus,
  });

  count++;
  console.log(`Seeded ${b.bookingId} — ${b.primaryGuest} (${status})`);
}

console.log(`\nDone. Seeded/updated ${count} Check-in Hub bookings for propertyId '${PROPERTY_ID}'.`);
await mongoose.disconnect();
