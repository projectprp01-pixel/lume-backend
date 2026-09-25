import { Resend } from 'resend';
import { RESEND_API_KEY, EMAIL_FROM, NOTIFY_EMAILS } from '../config/env.js';

const NOTIFY_TO = NOTIFY_EMAILS;
const FROM = EMAIL_FROM;
const FOOTER = '\n---\nThis is an automated message. Please do not reply.';

async function sendNotificationEmail({ to, subject, text }) {
  const apiKey = RESEND_API_KEY;
  if (!apiKey) {
    console.error('[Resend] RESEND_API_KEY is not set — email not sent:', subject);
    return;
  }
  if (!to?.length) {
    console.error('[Resend] No recipients specified — email not sent:', subject);
    return;
  }
  const resend = new Resend(apiKey);
  console.log('[Resend] Attempting:', subject, '→', to.join(', '));
  const { data, error } = await resend.emails.send({ from: FROM, to, subject, text });
  if (error) {
    console.error('[Resend] Send failed for:', subject);
    console.error('[Resend] Error:', JSON.stringify(error, null, 2));
    console.error('[Resend] From:', FROM, '| To:', to.join(', '));
  } else {
    console.log('[Resend] Email sent OK — id:', data?.id, '| subject:', subject);
  }
}

function toIST(date) {
  return new Date(date).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function toISTDate(date) {
  return new Date(date).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export async function sendGuestBookingEmail({ mainBookingId, bookingType, guestName, activityName, bookingDateTime, checkInDate, propertyName }) {
  await sendNotificationEmail({
    to: NOTIFY_TO,
    subject: `[Lume] New Booking — ${bookingType} — ${guestName}`,
    text: [
      `[Lume] New Booking — ${bookingType} — ${guestName}`,
      '',
      `Guest Booking ID: ${mainBookingId || 'N/A'}`,
      `Guest Name:       ${guestName}`,
      `Activity:         ${activityName}`,
      `Booking Date:     ${bookingDateTime}`,
      `Check-in Date:    ${checkInDate}`,
      `Property:         ${propertyName}`,
      FOOTER,
    ].join('\n'),
  });
}

export async function sendStaffCancellationEmail({ mainBookingId, bookingType, guestName, bookingDateTime, checkInDate, staffName, staffEmail, cancelledAt, propertyName }) {
  await sendNotificationEmail({
    to: NOTIFY_TO,
    subject: `[Lume] Booking Cancelled — ${bookingType} — ${guestName}`,
    text: [
      `[Lume] Booking Cancelled — ${bookingType} — ${guestName}`,
      '',
      `Guest Booking ID:  ${mainBookingId || 'N/A'}`,
      `Guest Name:        ${guestName}`,
      `Booking Type:      ${bookingType}`,
      `Original Booking:  ${bookingDateTime}`,
      `Check-in Date:     ${checkInDate}`,
      `Property:          ${propertyName}`,
      '',
      `Cancelled By:      ${staffName} (${staffEmail})`,
      `Cancelled At:      ${toIST(cancelledAt)}`,
      FOOTER,
    ].join('\n'),
  });
}

export async function sendWriteToUsEmail({ mainBookingId, guestName, guestEmail, submittedAt, message, propertyName }) {
  await sendNotificationEmail({
    to: NOTIFY_TO,
    subject: `[Lume] Guest Message — ${guestName} — ${propertyName}`,
    text: [
      `[Lume] Guest Message — ${guestName} — ${propertyName}`,
      '',
      `Guest Booking ID: ${mainBookingId || 'N/A'}`,
      `Guest Name:       ${guestName}`,
      `Guest Email:      ${guestEmail}`,
      `Submitted At:     ${toIST(submittedAt)}`,
      `Property:         ${propertyName}`,
      '',
      'Message:',
      `"${message}"`,
      FOOTER,
    ].join('\n'),
  });
}

export async function sendCheckInSubmittedEmail({ mainBookingId, guestName, guestEmail, submittedAt, propertyName, checkInDate }) {
  await sendNotificationEmail({
    to: NOTIFY_TO,
    subject: `[Lume] Check-in Submitted — ${guestName} — ${propertyName}`,
    text: [
      `[Lume] Check-in Submitted — ${guestName} — ${propertyName}`,
      '',
      `Guest Booking ID: ${mainBookingId || 'N/A'}`,
      `Guest Name:       ${guestName}`,
      `Guest Email:      ${guestEmail}`,
      `Submitted At:     ${toIST(submittedAt)}`,
      `Check-in Date:    ${checkInDate}`,
      `Property:         ${propertyName}`,
      FOOTER,
    ].join('\n'),
  });
}

export async function sendNewStaffAddedEmail({ newStaffName, role, addedAt, addedByName, propertyName }) {
  await sendNotificationEmail({
    to: NOTIFY_TO,
    subject: `[Lume] New Staff Added — ${newStaffName} — ${propertyName}`,
    text: [
      `[Lume] New Staff Added — ${newStaffName} — ${propertyName}`,
      '',
      `New Staff Member: ${newStaffName}`,
      `Role:             ${role}`,
      `Added On:         ${toIST(addedAt)}`,
      `Added By:         ${addedByName}`,
      `Property:         ${propertyName}`,
      FOOTER,
    ].join('\n'),
  });
}

export { toISTDate };
