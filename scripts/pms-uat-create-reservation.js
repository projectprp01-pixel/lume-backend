#!/usr/bin/env node
// Creates a TEST reservation in Opera Cloud UAT so the PMS sync has current guests to pull.
//
//   node scripts/pms-uat-create-reservation.js                      -> prints the request, sends nothing
//   node scripts/pms-uat-create-reservation.js --create             -> sends it
//   Options: --arrival=YYYY-MM-DD (default today, property timezone)  --nights=2  --adults=2  --children=0
//            --room-type=HPV  --rate-plan=MAP  --name="Asha Rao"  --email=a@b.com  --phone=9000000001
//
// This is the ONLY write path to Opera in this codebase. The sync itself (src/services/opera) stays read-only
// by design — see "Read-Only Policy" in the PMS docs. The script refuses to run unless OPERA_BASE_URL is an
// Oracle TEST gateway (oc-test.com), so it can never create a reservation in a production Opera.
// Reads OPERA_* from .env. Test guests are named "LUME TEST <name>" so they are easy to spot and clean up.

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : true];
}));

const {
  OPERA_BASE_URL, OPERA_HOTEL_ID, OPERA_ENTERPRISE_ID, OPERA_SCOPE, OPERA_CLIENT_ID, OPERA_CLIENT_SECRET, OPERA_APP_KEY,
  OPERA_TIMEZONE = 'Asia/Kolkata',
} = process.env;

if (![OPERA_BASE_URL, OPERA_HOTEL_ID, OPERA_ENTERPRISE_ID, OPERA_SCOPE, OPERA_CLIENT_ID, OPERA_CLIENT_SECRET, OPERA_APP_KEY].every(Boolean)) {
  console.error('OPERA_* variables are missing from .env');
  process.exit(1);
}
if (!/\.oc-test\.com(\/|$)/.test(OPERA_BASE_URL)) {
  console.error(`Refusing to write: ${OPERA_BASE_URL} is not an Oracle test gateway (*.oc-test.com).`);
  process.exit(1);
}

const today = new Date().toLocaleDateString('en-CA', { timeZone: OPERA_TIMEZONE });
const addDays = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const arrival = args.arrival || today;
const nights = parseInt(args.nights || '2');
const departure = addDays(arrival, nights);
const adults = String(args.adults || 2);
const children = String(args.children || 0);
const roomType = args['room-type'] || 'HPV';
const ratePlanCode = args['rate-plan'] || 'MAP';
const fullName = `LUME TEST ${args.name || 'Guest'}`.trim();
const [givenName, ...rest] = fullName.split(' ');
const surname = rest.join(' ');
const email = args.email || 'lume.test@example.com';
const phone = String(args.phone || '9000000001');

// Same codes the existing EBRC reservations use (guarantee HLD, market LEISURE, source PHONE).
const body = {
  reservations: {
    reservation: [{
      roomStay: {
        roomRates: [{
          rates: { rate: [{ base: { amountBeforeTax: '10000', currencyCode: 'INR' }, start: arrival, end: departure }] },
          guestCounts: { adults, children },
          roomType,
          ratePlanCode,
          start: arrival,
          end: departure,
          marketCode: 'LEISURE',
          sourceCode: 'PHONE',
          numberOfUnits: '1',
          roomTypeCharged: roomType,
          fixedRate: true,
        }],
        guestCounts: { adults, children },
        arrivalDate: arrival,
        departureDate: departure,
        guarantee: { guaranteeCode: 'HLD' },
      },
      // Opera needs an existing profile: its ID is filled in after the profile is created (step 1).
      reservationGuests: [{ profileInfo: { profileIdList: [{ type: 'Profile', id: '<created at send time>' }] }, primary: true }],
      reservationPaymentMethods: [{ paymentMethod: 'RZPY', folioView: '1' }],
      comments: [{ comment: { text: { value: 'Created by LUME UAT test script' }, commentTitle: 'LUME TEST', notificationLocation: 'RESERVATION', type: 'GEN', internal: true } }],
      hotelId: OPERA_HOTEL_ID,
      roomStayReservation: true,
      reservationStatus: 'Reserved',
    }],
  },
};

// Step 1 body: the guest profile (POST /crm/v1/profiles).
const profileBody = {
  profileDetails: {
    customer: { personName: [{ givenName, surname, nameType: 'PRIMARY', language: 'E' }], language: 'E' },
    emails: { emailInfo: [{ email: { emailAddress: email, type: 'EMAIL', primaryInd: true } }] },
    telephones: { telephoneInfo: [{ telephone: { phoneTechType: 'PHONE', phoneUseType: 'MOBILE', phoneNumber: phone, primaryInd: true } }] },
    profileType: 'Guest',
    statusCode: 'ACTIVE',
    registeredProperty: OPERA_HOTEL_ID,
  },
};

console.log(`Target: ${OPERA_BASE_URL} hotel ${OPERA_HOTEL_ID}`);
console.log(`Stay:   ${arrival} -> ${departure} (${nights} nights), ${adults} adults, ${roomType}/${ratePlanCode}, guest "${fullName}"`);

if (!args.create) {
  console.log('\nDry run — step 1, profile:\n' + JSON.stringify(profileBody, null, 2));
  console.log('\nStep 2, reservation:\n' + JSON.stringify(body, null, 2));
  console.log('\nRe-run with --create to send it.');
  process.exit(0);
}

const tokenRes = await axios.post(
  `${OPERA_BASE_URL}/oauth/v1/tokens`,
  new URLSearchParams({ grant_type: 'client_credentials', scope: OPERA_SCOPE }).toString(),
  {
    headers: {
      Authorization: `Basic ${Buffer.from(`${OPERA_CLIENT_ID}:${OPERA_CLIENT_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      enterpriseId: OPERA_ENTERPRISE_ID,
      'x-app-key': OPERA_APP_KEY,
    },
  }
);

const headers = {
  Authorization: `Bearer ${tokenRes.data.access_token}`,
  'x-hotelid': OPERA_HOTEL_ID,
  'x-app-key': OPERA_APP_KEY,
  'Content-Type': 'application/json',
};

try {
  let profileId = args['profile-id'];
  if (profileId) {
    console.log(`\nStep 1 skipped: reusing profile ${profileId}`);
  } else {
    const profileRes = await axios.post(`${OPERA_BASE_URL}/crm/v1/profiles`, profileBody, { headers });
    profileId = profileRes.headers.location?.split('/').filter(Boolean).pop()
      || profileRes.data?.profileIdList?.find((i) => i.type === 'Profile')?.id;
    console.log(`\nStep 1: profile created — HTTP ${profileRes.status}, profile ID ${profileId}`);
  }
  if (!profileId) throw new Error('Could not read the new profile ID.');

  body.reservations.reservation[0].reservationGuests[0].profileInfo.profileIdList[0].id = profileId;
  const res = await axios.post(`${OPERA_BASE_URL}/rsv/v1/hotels/${OPERA_HOTEL_ID}/reservations`, body, { headers });
  console.log(`Step 2: reservation created — HTTP ${res.status}`);
  console.log('Location:', res.headers.location);
  console.log(JSON.stringify(res.data, null, 2).slice(0, 3000));
} catch (err) {
  console.error(`\nHTTP ${err.response?.status ?? 'no response'}`);
  console.error(JSON.stringify(err.response?.data ?? err.message, null, 2).slice(0, 4000));
  process.exit(1);
}
