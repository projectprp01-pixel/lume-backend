import { Resend } from 'resend';
import { RESEND_API_KEY, EMAIL_FROM, COMMS_FROM_NAME } from '../../config/env.js';

// Guest-facing email through Resend. The sending address comes from env (EMAIL_FROM, on the
// client's verified Resend domain); the property can't point it somewhere else.

export function isEmailConfigured() {
  return !!RESEND_API_KEY && !!EMAIL_FROM;
}

/** "Name <addr>" — EMAIL_FROM wins if it already carries a name, otherwise COMMS_FROM_NAME is added. */
export function getFromHeader() {
  if (!EMAIL_FROM) return '';
  if (EMAIL_FROM.includes('<')) return EMAIL_FROM;
  return COMMS_FROM_NAME ? `${COMMS_FROM_NAME.replace(/[<>"]/g, '')} <${EMAIL_FROM}>` : EMAIL_FROM;
}

export function getEmailInfo() {
  const from = getFromHeader();
  const match = from.match(/^(.*?)\s*<(.+)>$/);
  return {
    configured: isEmailConfigured(),
    fromName: match ? match[1].replace(/^"|"$/g, '') : '',
    fromAddress: match ? match[2] : from,
  };
}

export async function sendGuestEmail({ to, subject, html }) {
  if (!isEmailConfigured()) return { ok: false, message: 'Email sending is not configured on the server.', retryable: false };
  try {
    const resend = new Resend(RESEND_API_KEY);
    const { data, error } = await resend.emails.send({ from: getFromHeader(), to: [to], subject, html });
    if (error) {
      // Resend validation/suppression/domain errors are not transient; only rate limits and 5xx are.
      const retryable = error.statusCode >= 500 || error.statusCode === 429;
      return { ok: false, message: error.message || 'Resend rejected the email', retryable };
    }
    return { ok: true, id: data?.id || '' };
  } catch (err) {
    return { ok: false, message: err?.message || 'Email send failed', retryable: true };
  }
}
