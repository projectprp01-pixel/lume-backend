import axios from 'axios';
import { LSQ_API_HOST, LSQ_ACTIVITY_TYPE_ID, LSQ_ACCESS_KEY, LSQ_SECRET_KEY, PROPERTY_APP_URLS } from '../config/env.js';

const LSQ_HOST = LSQ_API_HOST;
const ACTIVITY_EVENT = LSQ_ACTIVITY_TYPE_ID;

function authQuery() {
  return `accessKey=${LSQ_ACCESS_KEY}&secretKey=${LSQ_SECRET_KEY}`;
}

async function getProspectId(email, mobileNumber) {
  // Use dedicated lookup endpoints — these return [] when not found (unlike Leads.Get POST)
  if (email) {
    const { data } = await axios.get(
      `${LSQ_HOST}/v2/LeadManagement.svc/Leads.GetByEmailaddress?${authQuery()}&emailaddress=${encodeURIComponent(email)}`
    );
    if (Array.isArray(data) && data.length > 0) {
      console.log(`[LSQ] Lead found by email (${email})`);
      return data[0].ProspectID;
    }
  }
  if (mobileNumber) {
    const normalised = mobileNumber.replace(/^\+/, '').replace(/^91(\d{10})$/, '$1');
    const { data } = await axios.get(
      `${LSQ_HOST}/v2/LeadManagement.svc/RetrieveLeadByPhoneNumber?${authQuery()}&phone=${normalised}`
    );
    if (Array.isArray(data) && data.length > 0) {
      console.log(`[LSQ] Lead found by phone (${normalised})`);
      return data[0].ProspectID;
    }
  }
  return null;
}

export async function pushGuestActivity(guest, booking) {
  if (!LSQ_ACCESS_KEY || !LSQ_SECRET_KEY) {
    console.warn('[LSQ] Missing credentials — skipping activity push');
    return 'no_credentials';
  }

  // Skip placeholder co-guest records — they share the primary guest's phone and would
  // falsely match (and pollute) the real lead's timeline.
  if (guest.email?.includes('@placeholder.com')) {
    console.log(`[LSQ] Skipping placeholder co-guest ${guest.fullName}`);
    return 'skipped_placeholder';
  }

  let prospectId;
  try {
    prospectId = await getProspectId(guest.email, guest.mobileNumber);
  } catch (err) {
    console.warn('[LSQ] Lead lookup failed:', err.response?.data || err.message);
    return 'failed';
  }

  if (!prospectId) {
    console.log(`[LSQ] No lead found for ${guest.email || guest.mobileNumber} — skipping activity push`);
    return 'not_found';
  }

  // mx_Custom_2 is a dropdown in LSQ — values must match exactly.
  // Update these strings once the LSQ team confirms the exact dropdown labels.
  const LSQ_PROPERTY_NAME = {
    'default': 'Evolve Back Resort Coorg',
    'kabini':  'Evolve Back Resort Kabini',
    'hampi':   'Evolve Back Resort Hampi',
  };

  const propertyId = booking?.propertyId || guest.propertyId || 'default';
  const guestAppUrl = PROPERTY_APP_URLS[propertyId] || PROPERTY_APP_URLS['default'];
  const lumeUrl = guest.bookingToken ? `${guestAppUrl}?token=${guest.bookingToken}` : '';

  const fields = [
    { SchemaName: 'mx_Custom_1',  Value: guest.fullName || '' },
    { SchemaName: 'mx_Custom_10', Value: guest.mobileNumber || '' },
    { SchemaName: 'mx_Custom_17', Value: guest.email || '' },
  ];

  const lsqPropertyName = LSQ_PROPERTY_NAME[propertyId];
  if (lsqPropertyName) fields.push({ SchemaName: 'mx_Custom_2', Value: lsqPropertyName });
  if (booking?.bookingId)     fields.push({ SchemaName: 'mx_Custom_3',  Value: booking.bookingId });
  if (booking?.roomType)      fields.push({ SchemaName: 'mx_Custom_4',  Value: booking.roomType });
  if (booking?.arrivalDate)   fields.push({ SchemaName: 'mx_Custom_5',  Value: new Date(booking.arrivalDate).toISOString().split('T')[0] });
  if (booking?.checkoutDate)  fields.push({ SchemaName: 'mx_Custom_6',  Value: new Date(booking.checkoutDate).toISOString().split('T')[0] });
  if (guest.numberOfGuests)   fields.push({ SchemaName: 'mx_Custom_15', Value: String(guest.numberOfGuests) });
  if (guest.numberOfChildren) fields.push({ SchemaName: 'mx_Custom_14', Value: String(guest.numberOfChildren) });
  if (lumeUrl)                fields.push({ SchemaName: 'mx_Custom_13', Value: lumeUrl });

  const payload = {
    RelatedProspectId: prospectId,
    ActivityEvent: ACTIVITY_EVENT,
    ActivityNote: `Guest added to Lume WebApp — ${lsqPropertyName || booking?.propertyName || ''}`,
    Fields: fields,
  };

  try {
    await axios.post(
      `${LSQ_HOST}/v2/ProspectActivity.svc/Create?${authQuery()}`,
      payload,
      { headers: { 'Content-Type': 'application/json' } }
    );
    console.log(`[LSQ] Activity pushed for prospect ${prospectId} (${guest.fullName})`);
    return 'pushed';
  } catch (err) {
    console.error('[LSQ] Activity push failed:', err.response?.data || err.message);
    return 'failed';
  }
}
