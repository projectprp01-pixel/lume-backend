import { Resend } from 'resend';
import { RESEND_API_KEY } from '../../config/env.js';

const FROM = 'info@lume-cxm.com';

/**
 * Sends a real, fully-rendered Comms Hub email template to a staff-supplied test address via
 * Resend — lets a staff member see exactly what a guest would receive before turning a template
 * on. The dashboard renders the HTML client-side (same markup the preview is built from) and
 * posts it here; this endpoint only relays it to Resend.
 */
export const sendCommsTestEmail = async (req, res) => {
  try {
    const { to, subject, html } = req.body;
    if (!to || !subject || !html) {
      return res.status(400).json({ success: false, message: 'to, subject and html are required' });
    }
    if (!RESEND_API_KEY) {
      return res.status(500).json({ success: false, message: 'Email sending is not configured on the server' });
    }
    const resend = new Resend(RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: [to],
      subject: `[Test] ${subject}`,
      html,
    });
    if (error) {
      console.error('[Resend] Comms test send failed:', error);
      return res.status(502).json({ success: false, message: error.message || 'Failed to send test email' });
    }
    res.status(200).json({ success: true, data: { id: data?.id } });
  } catch (error) {
    console.error('Send comms test email error:', error);
    res.status(500).json({ success: false, message: 'Failed to send test email', error: error.message });
  }
};
