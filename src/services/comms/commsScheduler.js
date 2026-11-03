import cron from 'node-cron';
import PropertySettings from '../../models/PropertySettings.model.js';
import Booking from '../../models/Booking.model.js';
import Guest from '../../models/Guest.model.js';
import CommsSend from '../../models/CommsSend.model.js';
import {
  COMMS_SCHEDULER_ENABLED, COMMS_TIMEZONE, COMMS_TICK_MINUTES, PROPERTY_NAME, GUEST_APP_URL,
} from '../../config/env.js';
import {
  STAGES, CHANNELS, normalizeMatrix, matrixNeedsSave, isWhatsappSendable, usedVariables, fillVariables,
  computeDueAt, applyQuietHours, formatDateForGuest,
} from './commsTemplates.js';
import { isEmailConfigured, sendGuestEmail } from './emailClient.js';
import { isWhatsappConfigured, sendTemplateMessage, fetchTemplateStatus } from './whatsappClient.js';

// Looks for guest messages that have come due and sends them, once.
//
// A template is "due" for a booking at an instant worked out from the booking's dates, the
// template's trigger/offset and its send time, read in the property's timezone and nudged out of
// quiet hours. It is then sendable for GRACE_MS. A booking made after that moment has already
// passed therefore simply never gets that message, which is the behaviour staff are told about.

const GRACE_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const STATUS_RECHECK_MS = 10 * 60 * 1000;

const escapeHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let running = false;

function phoneDigits(guest) {
  const cc = String(guest.countryCode || '').replace(/\D/g, '');
  let num = String(guest.mobileNumber || '').replace(/\D/g, '');
  if (!num) return '';
  // A number typed with its own country code already (and no separate code) shouldn't be doubled up.
  if (cc && num.startsWith(cc) && num.length > 10) return num;
  num = num.replace(/^0+/, '');
  const full = `${cc}${num}`;
  return full.length >= 8 && full.length <= 15 ? full : '';
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '') && !/@placeholder\.com$/i.test(email);
}

function guestLink(guest) {
  return guest.bookingToken && GUEST_APP_URL ? `${GUEST_APP_URL.replace(/\/+$/, '')}/?token=${guest.bookingToken}` : (GUEST_APP_URL || '');
}

function variablesFor(booking, guest) {
  return {
    guest_name: booking.primaryGuestName || guest.fullName || 'Guest',
    property_name: PROPERTY_NAME || booking.propertyName || '',
    checkin_date: formatDateForGuest(booking.arrivalDate, COMMS_TIMEZONE),
    checkout_date: formatDateForGuest(booking.checkoutDate, COMMS_TIMEZONE),
    booking_id: booking.bookingId,
    room_type: booking.roomType || '',
    webapp_link: guestLink(guest),
  };
}

const wrapPlainText = (text) =>
  `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#EDE6D6;font-family:Helvetica,Arial,sans-serif;">` +
  `<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:28px 24px;white-space:pre-wrap;font-size:14px;line-height:1.7;color:#4a4038;">${text}</div></body></html>`;

/** Decide whether this guest may receive this template on this channel. Returns a final skip reason, or ''. */
function skipReason(channel, tpl, guest) {
  if (channel === 'email') {
    if (!validEmail(guest.email)) return 'No valid email address on file';
    if (guest.commsOptOutEmail) return 'Guest unsubscribed from email';
    if (tpl.category === 'marketing' && !guest.emailOptIn) return 'Marketing email: guest has not opted in';
    return '';
  }
  if (!phoneDigits(guest)) return 'No valid mobile number on file';
  if (guest.commsOptOutWhatsapp) return 'Guest opted out of WhatsApp';
  if (tpl.category === 'marketing' && !guest.whatsappOptIn) return 'Marketing WhatsApp: guest has not opted in';
  return '';
}

// Inserts the row before sending; the unique index makes this the single gate against double-sends.
// A previously failed row is re-claimed for a retry once its back-off has passed.
async function claim(key, base) {
  try {
    return await CommsSend.create({ ...key, ...base, status: 'sending', attempts: 1, lastAttemptAt: new Date() });
  } catch (err) {
    if (err.code !== 11000) throw err;
    return CommsSend.findOneAndUpdate(
      { ...key, status: 'failed', attempts: { $lt: MAX_ATTEMPTS }, lastAttemptAt: { $lt: new Date(Date.now() - RETRY_MS) } },
      { $set: { status: 'sending', lastAttemptAt: new Date() }, $inc: { attempts: 1 } },
      { new: true },
    );
  }
}

async function recordSkip(key, base, reason) {
  try {
    await CommsSend.create({ ...key, ...base, status: 'skipped', reason });
  } catch (err) {
    if (err.code !== 11000) throw err;
  }
}

async function deliver(channel, tpl, booking, guest) {
  const values = variablesFor(booking, guest);
  if (channel === 'email') {
    const subject = fillVariables(tpl.subject || tpl.name, values);
    const html = tpl.html
      ? fillVariables(tpl.html, values, { escape: escapeHtml })
      : wrapPlainText(fillVariables(tpl.body, values, { escape: escapeHtml }));
    return sendGuestEmail({ to: guest.email, subject, html });
  }
  const waVars = Object.fromEntries(usedVariables(tpl.wa.submittedBody).map((k) => [k, values[k] ?? '']));
  return sendTemplateMessage({ to: phoneDigits(guest), templateName: tpl.wa.templateName, variables: waVars });
}

async function syncPendingWhatsappStatuses(settings, matrix) {
  if (!isWhatsappConfigured()) return false;
  let changed = false;
  for (const tpl of matrix.prestay.whatsapp.concat(matrix.instay.whatsapp, matrix.poststay.whatsapp)) {
    const wa = tpl.wa;
    if (!wa || wa.status !== 'pending' || !wa.templateName) continue;
    if (wa.lastCheckedAt && Date.now() - new Date(wa.lastCheckedAt).getTime() < STATUS_RECHECK_MS) continue;
    const res = await fetchTemplateStatus(wa.templateName);
    wa.lastCheckedAt = new Date().toISOString();
    if (res.ok) { wa.status = res.status; wa.reason = res.reason || ''; }
    changed = true;
  }
  return changed;
}

async function runForProperty(settings, now) {
  let matrix = normalizeMatrix(settings.comms);
  let dirty = matrixNeedsSave(settings.comms, matrix);
  if (await syncPendingWhatsappStatuses(settings, matrix)) dirty = true;
  if (dirty) {
    settings.comms = matrix;
    settings.markModified('comms');
    await settings.save();
  }

  const emailOn = isEmailConfigured();
  const waOn = isWhatsappConfigured();
  const active = [];
  for (const stage of STAGES) {
    for (const channel of CHANNELS) {
      for (const tpl of matrix[stage][channel]) {
        if (!tpl.enabled) continue;
        if (channel === 'email' && !emailOn) continue;
        if (channel === 'whatsapp' && !(waOn && isWhatsappSendable(tpl))) continue;
        active.push({ stage, channel, tpl });
      }
    }
  }
  if (!active.length) return { sent: 0, failed: 0, skipped: 0 };

  const day = 24 * 60 * 60 * 1000;
  const bookings = await Booking.find({
    bookingStatus: { $ne: 'cancelled' },
    $or: [
      { arrivalDate: { $gte: new Date(now - 60 * day), $lte: new Date(+now + 180 * day) } },
      { checkoutDate: { $gte: new Date(now - 60 * day) } },
      { createdAt: { $gte: new Date(now - 2 * day) } },
    ],
  }).lean();
  if (!bookings.length) return { sent: 0, failed: 0, skipped: 0 };

  const guests = await Guest.find({ _id: { $in: bookings.map((b) => b.guestId) } }).lean();
  const guestById = new Map(guests.map((g) => [String(g._id), g]));
  const quiet = settings.commsSettings?.toObject ? settings.commsSettings.toObject() : settings.commsSettings;

  const tally = { sent: 0, failed: 0, skipped: 0 };
  for (const booking of bookings) {
    const guest = guestById.get(String(booking.guestId));
    if (!guest) continue;
    for (const { stage, channel, tpl } of active) {
      let due = computeDueAt(tpl, booking, COMMS_TIMEZONE);
      if (!due) continue;
      due = applyQuietHours(due, quiet, COMMS_TIMEZONE);
      if (+now < +due || +now - +due > GRACE_MS) continue;

      const key = { templateId: tpl.id, bookingId: booking.bookingId, channel };
      const base = {
        propertyId: settings.propertyId, templateName: tpl.name, stage, category: tpl.category,
        guestName: booking.primaryGuestName || guest.fullName, dueAt: due,
        to: channel === 'email' ? guest.email : (phoneDigits(guest) ? `+${phoneDigits(guest)}` : ''),
      };

      const reason = skipReason(channel, tpl, guest);
      if (reason) { await recordSkip(key, base, reason); tally.skipped++; continue; }

      const row = await claim(key, base);
      if (!row) continue; // already sent/skipped, or a retry that isn't due yet

      const res = await deliver(channel, tpl, booking, guest);
      if (res.ok) {
        await CommsSend.updateOne({ _id: row._id }, { $set: { status: 'sent', sentAt: new Date(), providerMessageId: res.id, reason: '' } });
        tally.sent++;
      } else {
        await CommsSend.updateOne({ _id: row._id }, {
          $set: { status: 'failed', reason: String(res.message || 'Send failed').slice(0, 500), ...(res.retryable ? {} : { attempts: MAX_ATTEMPTS }) },
        });
        tally.failed++;
        console.error(`[Comms] ${channel} to ${booking.bookingId} failed:`, res.message);
      }
    }
  }
  return tally;
}

export async function runCommsTick(now = new Date()) {
  if (running) return;
  running = true;
  try {
    const all = await PropertySettings.find({});
    for (const settings of all) {
      const t = await runForProperty(settings, now);
      if (t.sent || t.failed || t.skipped) console.log(`[Comms] ${settings.propertyId}: ${t.sent} sent, ${t.failed} failed, ${t.skipped} skipped`);
    }
  } catch (err) {
    console.error('[Comms] tick failed:', err);
  } finally {
    running = false;
  }
}

/** Starts the scheduler when COMMS_SCHEDULER_ENABLED=true. Safe to call unconditionally. */
export function startCommsScheduler() {
  if (!COMMS_SCHEDULER_ENABLED) return;
  cron.schedule(`*/${COMMS_TICK_MINUTES} * * * *`, () => runCommsTick());
  console.log(`[Comms] scheduler started: every ${COMMS_TICK_MINUTES} min, times read in ${COMMS_TIMEZONE}`);
  setTimeout(() => runCommsTick(), 15000);
}
