#!/usr/bin/env node
// Changes a TEST reservation in Opera Cloud UAT, to exercise the PMS sync's update path.
//
//   node scripts/pms-uat-update-reservation.js --reservation=596889 --assign-room            -> dry run (shows the room it would pick)
//   node scripts/pms-uat-update-reservation.js --reservation=596889 --assign-room --apply    -> assigns a vacant, inspected room of the reservation's type
//   node scripts/pms-uat-update-reservation.js --reservation=596889 --assign-room=205 --apply -> assigns that specific room
//   node scripts/pms-uat-update-reservation.js --reservation=596889 --check-in --apply       -> checks the guest in
//
// Like pms-uat-create-reservation.js, this refuses to run unless OPERA_BASE_URL is an Oracle TEST gateway
// (oc-test.com). The sync itself stays read-only. Reads OPERA_* from .env.

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
} = process.env;

if (![OPERA_BASE_URL, OPERA_HOTEL_ID, OPERA_ENTERPRISE_ID, OPERA_SCOPE, OPERA_CLIENT_ID, OPERA_CLIENT_SECRET, OPERA_APP_KEY].every(Boolean)) {
  console.error('OPERA_* variables are missing from .env');
  process.exit(1);
}
if (!/\.oc-test\.com(\/|$)/.test(OPERA_BASE_URL)) {
  console.error(`Refusing to write: ${OPERA_BASE_URL} is not an Oracle test gateway (*.oc-test.com).`);
  process.exit(1);
}
const reservationId = args.reservation;
if (!reservationId || !(args['assign-room'] || args['check-in'])) {
  console.error('Usage: --reservation=<id> and --assign-room[=<room>] and/or --check-in  (add --apply to send)');
  process.exit(1);
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

const fail = (label, err) => {
  console.error(`\n${label} failed — HTTP ${err.response?.status ?? 'no response'}`);
  console.error(JSON.stringify(err.response?.data ?? err.message, null, 2).slice(0, 3000));
  process.exit(1);
};

const base = `${OPERA_BASE_URL}`;
const resUrl = `${base}/rsv/v1/hotels/${OPERA_HOTEL_ID}/reservations/${reservationId}`;
const summary = async () => {
  const { data } = await axios.get(resUrl, { headers });
  const r = data.reservations?.reservation?.[0] ?? data.reservations?.reservationInfo?.[0] ?? data;
  return { status: r.reservationStatus, roomType: r.roomStay?.roomRates?.[0]?.roomType, room: r.roomStay?.roomRates?.[0]?.roomId ?? r.roomStay?.roomId };
};

const before = await summary().catch((e) => fail('Reading the reservation', e));
console.log(`Reservation ${reservationId} before:`, before);
if (before.status && !['Reserved', 'InHouse', 'CheckedIn'].includes(before.status)) console.warn('Note: unexpected status', before.status);

if (args['assign-room']) {
  let roomId = args['assign-room'] === true ? null : String(args['assign-room']);
  if (!roomId) {
    const { data } = await axios.get(`${base}/fof/v1/hotels/${OPERA_HOTEL_ID}/rooms`, { headers, params: { limit: 200 } });
    const rooms = data.hotelRoomsDetails?.room ?? [];
    const pick = rooms.find((r) =>
      r.roomType?.roomType === before.roomType
      && r.housekeeping?.roomStatus?.frontOfficeStatus === 'Vacant'
      && ['Inspected', 'Clean'].includes(r.housekeeping?.roomStatus?.roomStatus));
    if (!pick) { console.error(`No vacant, ready ${before.roomType} room found.`); process.exit(1); }
    roomId = pick.roomId;
  }
  const body = { criteria: { hotelId: OPERA_HOTEL_ID, reservationIdList: [{ type: 'Reservation', id: String(reservationId) }], roomId } };
  console.log(`\nAssign room ${roomId}:`, JSON.stringify(body));
  if (args.apply) {
    await axios.post(`${base}/fof/v1/hotels/${OPERA_HOTEL_ID}/reservations/${reservationId}/roomAssignments`, body, { headers })
      .then((r) => console.log(`-> HTTP ${r.status}`)).catch((e) => fail('Room assignment', e));
  }
}

if (args['check-in']) {
  // roomId is the room Opera should expect on the reservation; the check-in fails if it doesn't match.
  const body = { reservation: { roomId: before.room, ignoreWarnings: true, printRegistration: false } };
  console.log('\nCheck in:', JSON.stringify(body));
  if (args.apply) {
    await axios.post(`${base}/fof/v1/hotels/${OPERA_HOTEL_ID}/reservations/${reservationId}/checkIns`, body, { headers })
      .then((r) => console.log(`-> HTTP ${r.status}`)).catch((e) => fail('Check-in', e));
  }
}

if (!args.apply) console.log('\nDry run — re-run with --apply to send.');
else console.log(`\nReservation ${reservationId} after:`, await summary().catch(() => 'unreadable'));
