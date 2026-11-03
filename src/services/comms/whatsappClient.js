import axios from 'axios';
import {
  WHATSAPP_ENABLED, WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_WABA_ID,
  WHATSAPP_API_VERSION, WHATSAPP_DISPLAY_NUMBER, WHATSAPP_DISPLAY_NAME,
} from '../../config/env.js';
import { usedVariables } from './commsTemplates.js';

// Thin wrapper over Meta's WhatsApp Cloud API. Credentials come from env only — the property can
// see which number it sends from (getWhatsappInfo) but never change it.

const base = () => `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;
const auth = () => ({ headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` }, timeout: 15000 });

export function isWhatsappConfigured() {
  return WHATSAPP_ENABLED && !!WHATSAPP_ACCESS_TOKEN && !!WHATSAPP_PHONE_NUMBER_ID && !!WHATSAPP_WABA_ID;
}

export function getWhatsappInfo() {
  return {
    configured: isWhatsappConfigured(),
    displayNumber: WHATSAPP_DISPLAY_NUMBER,
    displayName: WHATSAPP_DISPLAY_NAME,
  };
}

function metaError(err) {
  const e = err?.response?.data?.error;
  return {
    message: e ? `${e.message}${e.error_user_msg ? ` — ${e.error_user_msg}` : ''}` : (err?.message || 'WhatsApp request failed'),
    // 4xx from Meta (bad number, template problem, not opted in) won't fix itself on retry; 5xx/network will.
    retryable: !err?.response || err.response.status >= 500 || err.response.status === 429,
  };
}

const EXAMPLES = {
  guest_name: 'Mrinalini', property_name: 'Evolve Back', checkin_date: '27 Jun 2026', checkout_date: '30 Jun 2026',
  booking_id: 'EB-2026-48213', room_type: 'Pool Villa', webapp_link: 'https://app.example.com/?token=abc123',
};

/** Why Meta would refuse this body before we even ask — saves a round trip and a rejection. */
export function validateWhatsappBody(body) {
  const text = String(body || '').trim();
  if (!text) return 'Add the message text first.';
  if (text.length > 1024) return 'WhatsApp messages can be at most 1,024 characters.';
  if (/^\{\{[^}]*\}\}/.test(text)) return 'WhatsApp rejects a message that starts with a variable. Put some words first.';
  if (/\{\{[^}]*\}\}\s*$/.test(text)) return 'WhatsApp rejects a message that ends with a variable. Add some words after the last one.';
  if (/\n{3,}/.test(text)) return 'WhatsApp does not allow more than one blank line in a row.';
  return '';
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'message';

/** Meta template names: lowercase letters, digits, underscores. Versioned so a resubmit never collides. */
export function buildTemplateName(tpl, version) {
  return `${slug(tpl.name)}_${String(tpl.id).replace(/-/g, '').slice(0, 6)}_v${version}`;
}

export async function submitTemplate({ name, body, category }) {
  const vars = usedVariables(body);
  const component = { type: 'BODY', text: body };
  if (vars.length) {
    component.example = { body_text_named_params: vars.map((v) => ({ param_name: v, example: EXAMPLES[v] || 'Example' })) };
  }
  try {
    const { data } = await axios.post(`${base()}/${WHATSAPP_WABA_ID}/message_templates`, {
      name,
      language: 'en',
      category: category === 'marketing' ? 'MARKETING' : 'UTILITY',
      parameter_format: 'NAMED',
      components: [component],
    }, auth());
    return { ok: true, metaId: data.id, status: mapStatus(data.status) };
  } catch (err) {
    return { ok: false, ...metaError(err) };
  }
}

export function mapStatus(metaStatus) {
  switch (String(metaStatus || '').toUpperCase()) {
    case 'APPROVED': return 'approved';
    case 'REJECTED': return 'rejected';
    case 'PAUSED': case 'DISABLED': return 'paused';
    case 'PENDING': case 'IN_APPEAL': case 'PENDING_DELETION': default: return 'pending';
  }
}

export async function fetchTemplateStatus(name) {
  try {
    const { data } = await axios.get(`${base()}/${WHATSAPP_WABA_ID}/message_templates`, {
      ...auth(),
      params: { name, fields: 'name,status,rejected_reason,category' },
    });
    const hit = (data.data || []).find((t) => t.name === name);
    if (!hit) return { ok: false, message: 'Template not found in WhatsApp Manager.', retryable: false };
    const rejected = hit.rejected_reason && hit.rejected_reason !== 'NONE' ? hit.rejected_reason : '';
    return { ok: true, status: mapStatus(hit.status), reason: rejected };
  } catch (err) {
    return { ok: false, ...metaError(err) };
  }
}

/** `to` is digits only, with country code and no "+". */
export async function sendTemplateMessage({ to, templateName, variables }) {
  const parameters = Object.entries(variables).map(([k, v]) => ({
    type: 'text', parameter_name: k,
    // Meta rejects newlines/tabs and 4+ consecutive spaces inside a parameter value.
    text: String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim() || '-',
  }));
  try {
    const { data } = await axios.post(`${base()}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en' },
        ...(parameters.length ? { components: [{ type: 'body', parameters }] } : {}),
      },
    }, auth());
    return { ok: true, id: data?.messages?.[0]?.id || '' };
  } catch (err) {
    return { ok: false, ...metaError(err) };
  }
}
