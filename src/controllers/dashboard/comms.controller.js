import PropertySettings from '../../models/PropertySettings.model.js';
import CommsSend from '../../models/CommsSend.model.js';
import {
  COMMS_SCHEDULER_ENABLED, COMMS_TIMEZONE, PROPERTY_NAME,
} from '../../config/env.js';
import {
  STAGES, CHANNELS, TRIGGERS, VARIABLES, normalizeMatrix, matrixNeedsSave, mergeIncomingMatrix,
  waState, isWhatsappSendable, usedVariables,
} from '../../services/comms/commsTemplates.js';
import { getEmailInfo, sendGuestEmail } from '../../services/comms/emailClient.js';
import {
  getWhatsappInfo, isWhatsappConfigured, validateWhatsappBody, buildTemplateName, submitTemplate,
  fetchTemplateStatus, sendTemplateMessage,
} from '../../services/comms/whatsappClient.js';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const SAMPLE_VALUES = {
  guest_name: 'Mrinalini', property_name: PROPERTY_NAME || 'the property', checkin_date: '27 Jun 2026',
  checkout_date: '30 Jun 2026', booking_id: 'EB-2026-00000', room_type: 'Pool Villa', webapp_link: 'https://example.com',
};

async function loadSettings(propertyId) {
  return PropertySettings.findOneAndUpdate(
    { propertyId },
    { $setOnInsert: { propertyId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

function settingsOut(settings) {
  const s = settings.commsSettings?.toObject ? settings.commsSettings.toObject() : (settings.commsSettings || {});
  return {
    quietHoursEnabled: s.quietHoursEnabled !== false,
    quietStart: s.quietStart || '21:00',
    quietEnd: s.quietEnd || '08:00',
  };
}

// What the dashboard needs to explain itself without ever being able to change it.
function payload(settings, matrix) {
  return {
    matrix,
    settings: settingsOut(settings),
    meta: { timezone: COMMS_TIMEZONE, triggers: Object.fromEntries(STAGES.map((s) => [s, TRIGGERS[s]])), variables: VARIABLES },
  };
}

function findTemplate(matrix, id) {
  for (const stage of STAGES) {
    for (const channel of CHANNELS) {
      const tpl = matrix[stage][channel].find((t) => t.id === id);
      if (tpl) return { stage, channel, tpl };
    }
  }
  return null;
}

/** Messages + sending rules. Also stamps ids onto any template saved before they existed. */
export const getComms = async (req, res) => {
  try {
    const { propertyId = 'default' } = req.query;
    const settings = await loadSettings(propertyId);
    const matrix = normalizeMatrix(settings.comms);
    if (matrixNeedsSave(settings.comms, matrix)) {
      settings.comms = matrix;
      settings.markModified('comms');
      await settings.save();
    }
    res.status(200).json({ success: true, data: payload(settings, matrix) });
  } catch (error) {
    console.error('Get comms error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch Comms Hub', error: error.message });
  }
};

export const updateComms = async (req, res) => {
  try {
    const { propertyId = 'default' } = req.query;
    const { matrix: incoming, settings: incomingSettings } = req.body;
    const settings = await loadSettings(propertyId);

    if (incoming !== undefined) {
      // WhatsApp approval state is the server's: the client's copy of it is ignored (see mergeIncomingMatrix).
      settings.comms = mergeIncomingMatrix(normalizeMatrix(settings.comms), incoming);
      settings.markModified('comms');
    }
    if (incomingSettings !== undefined) {
      const { quietHoursEnabled, quietStart, quietEnd } = incomingSettings;
      if (quietStart !== undefined && !TIME_RE.test(quietStart)) return res.status(400).json({ success: false, message: 'Quiet hours start must be a time like 21:00' });
      if (quietEnd !== undefined && !TIME_RE.test(quietEnd)) return res.status(400).json({ success: false, message: 'Quiet hours end must be a time like 08:00' });
      const prev = settingsOut(settings);
      settings.commsSettings = {
        quietHoursEnabled: quietHoursEnabled !== undefined ? !!quietHoursEnabled : prev.quietHoursEnabled,
        quietStart: quietStart ?? prev.quietStart,
        quietEnd: quietEnd ?? prev.quietEnd,
      };
    }
    await settings.save();
    res.status(200).json({ success: true, data: payload(settings, normalizeMatrix(settings.comms)) });
  } catch (error) {
    console.error('Update comms error:', error);
    res.status(500).json({ success: false, message: 'Failed to save Comms Hub', error: error.message });
  }
};

/** Read-only view of the backend-owned senders: which number/address guests hear from. */
export const getCommsStatus = async (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      email: getEmailInfo(),
      whatsapp: getWhatsappInfo(),
      schedulerEnabled: COMMS_SCHEDULER_ENABLED,
      timezone: COMMS_TIMEZONE,
    },
  });
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const getCommsLog = async (req, res) => {
  try {
    const { propertyId = 'default', status, channel, search } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const filter = { propertyId };
    if (['sent', 'failed', 'skipped', 'sending'].includes(status)) filter.status = status;
    if (CHANNELS.includes(channel)) filter.channel = channel;
    if (search && String(search).trim()) {
      const rx = new RegExp(escapeRegex(String(search).trim()), 'i');
      filter.$or = [{ guestName: rx }, { bookingId: rx }, { templateName: rx }, { to: rx }];
    }
    const [rows, total] = await Promise.all([
      CommsSend.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      CommsSend.countDocuments(filter),
    ]);
    res.status(200).json({
      success: true,
      data: {
        total,
        rows: rows.map((r) => ({
          id: String(r._id), templateId: r.templateId, templateName: r.templateName, stage: r.stage, channel: r.channel,
          category: r.category, bookingId: r.bookingId, guestName: r.guestName, to: r.to, status: r.status,
          reason: r.reason, dueAt: r.dueAt, sentAt: r.sentAt, attempts: r.attempts, createdAt: r.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error('Get comms log error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch delivery log', error: error.message });
  }
};

async function withWhatsappTemplate(req, res, fn) {
  try {
    const { propertyId = 'default' } = req.query;
    const settings = await loadSettings(propertyId);
    const matrix = normalizeMatrix(settings.comms);
    const hit = findTemplate(matrix, req.params.templateId);
    if (!hit || hit.channel !== 'whatsapp') return res.status(404).json({ success: false, message: 'WhatsApp message not found. Save it first, then try again.' });
    if (!isWhatsappConfigured()) return res.status(409).json({ success: false, message: 'WhatsApp is not set up on the server yet. Ask the Lume team to connect the business number.' });
    const done = await fn({ settings, matrix, ...hit });
    if (done) return done;
    settings.comms = matrix;
    settings.markModified('comms');
    await settings.save();
    res.status(200).json({ success: true, data: { template: hit.tpl, state: waState(hit.tpl) } });
  } catch (error) {
    console.error('WhatsApp template action error:', error);
    res.status(500).json({ success: false, message: 'WhatsApp request failed', error: error.message });
  }
}

/** Submits the saved text to Meta for review. A resubmit gets a new versioned template name. */
export const submitWhatsappTemplate = (req, res) =>
  withWhatsappTemplate(req, res, async ({ tpl }) => {
    const { status, stale } = waState(tpl);
    if ((status === 'pending' || status === 'approved') && !stale) {
      return res.status(409).json({ success: false, message: status === 'approved' ? 'This message is already approved.' : 'This message is already with WhatsApp for review.' });
    }
    const problem = validateWhatsappBody(tpl.body);
    if (problem) return res.status(400).json({ success: false, message: problem });
    const unknown = usedVariables(tpl.body).filter((v) => !VARIABLES.includes(v));
    if (unknown.length) return res.status(400).json({ success: false, message: `Unknown variable: ${unknown.map((v) => `{{${v}}}`).join(', ')}` });

    const version = (tpl.wa?.version || 0) + 1;
    const name = buildTemplateName(tpl, version);
    const result = await submitTemplate({ name, body: tpl.body, category: tpl.category });
    if (!result.ok) return res.status(502).json({ success: false, message: result.message });
    const now = new Date().toISOString();
    tpl.wa = {
      templateName: name, version, status: result.status, reason: '',
      submittedBody: tpl.body, submittedCategory: tpl.category, submittedAt: now, lastCheckedAt: now,
    };
    return null;
  });

export const refreshWhatsappTemplate = (req, res) =>
  withWhatsappTemplate(req, res, async ({ tpl }) => {
    if (!tpl.wa?.templateName) return res.status(400).json({ success: false, message: 'This message has not been submitted yet.' });
    const result = await fetchTemplateStatus(tpl.wa.templateName);
    if (!result.ok) return res.status(502).json({ success: false, message: result.message });
    tpl.wa.status = result.status;
    tpl.wa.reason = result.reason;
    tpl.wa.lastCheckedAt = new Date().toISOString();
    return null;
  });

/** Sends the approved template to a number the staff member types, with sample values. */
export const sendWhatsappTest = (req, res) =>
  withWhatsappTemplate(req, res, async ({ tpl }) => {
    if (!isWhatsappSendable(tpl)) return res.status(409).json({ success: false, message: 'Only an approved, unedited message can be tested.' });
    const to = String(req.body.to || '').replace(/\D/g, '');
    if (to.length < 8 || to.length > 15) return res.status(400).json({ success: false, message: 'Enter the number with its country code, e.g. 919876543210.' });
    const vars = Object.fromEntries(usedVariables(tpl.wa.submittedBody).map((k) => [k, SAMPLE_VALUES[k] ?? '']));
    const result = await sendTemplateMessage({ to, templateName: tpl.wa.templateName, variables: vars });
    if (!result.ok) return res.status(502).json({ success: false, message: result.message });
    return res.status(200).json({ success: true, data: { id: result.id } });
  });

/**
 * Sends a fully-rendered Comms Hub email to a staff-supplied test address. The dashboard renders
 * the HTML client-side (the same markup the preview is built from) with sample values filled in.
 */
export const sendCommsTestEmail = async (req, res) => {
  try {
    const { to, subject, html } = req.body;
    if (!to || !subject || !html) {
      return res.status(400).json({ success: false, message: 'to, subject and html are required' });
    }
    const result = await sendGuestEmail({ to, subject: `[Test] ${subject}`, html });
    if (!result.ok) {
      console.error('[Resend] Comms test send failed:', result.message);
      return res.status(502).json({ success: false, message: result.message || 'Failed to send test email' });
    }
    res.status(200).json({ success: true, data: { id: result.id } });
  } catch (error) {
    console.error('Send comms test email error:', error);
    res.status(500).json({ success: false, message: 'Failed to send test email', error: error.message });
  }
};
