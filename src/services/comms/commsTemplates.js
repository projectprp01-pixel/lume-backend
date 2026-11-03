import crypto from 'crypto';

// Pure helpers for the Comms Hub: what a template looks like, when it is due, how its variables
// are filled. No I/O in here, so the timing rules can be reasoned about (and tested) in isolation.

export const STAGES = ['prestay', 'instay', 'poststay'];
export const CHANNELS = ['email', 'whatsapp'];

// Which triggers each stage offers, and whether the trigger takes a day offset.
//   booking        — when the booking is created               (no offset)
//   before         — N days before the check-in date           (offset >= 0)
//   arrival        — on the check-in date                      (no offset)
//   after_checkin  — N days after the check-in date            (offset >= 1)
//   checkout       — on the check-out date                     (no offset)
//   after          — N days after the check-out date           (offset >= 0)
export const TRIGGERS = {
  prestay: { booking: { days: false }, before: { days: true, min: 0 } },
  instay: { arrival: { days: false }, after_checkin: { days: true, min: 1 }, checkout: { days: false } },
  poststay: { after: { days: true, min: 0 } },
};

// Variables a template body/subject may use. Anything else is left untouched.
export const VARIABLES = ['guest_name', 'property_name', 'checkin_date', 'checkout_date', 'booking_id', 'room_type', 'webapp_link'];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Templates saved before triggers existed only carry a `days` number whose meaning was fixed per
// stage; map that onto the closest trigger so nothing changes behaviour on first load.
function inferTrigger(stage, days) {
  if (stage === 'prestay') return days > 0 ? 'before' : 'booking';
  if (stage === 'instay') return days > 0 ? 'after_checkin' : 'arrival';
  return 'after';
}

export function normalizeTemplate(stage, channel, raw) {
  const t = { ...raw };
  if (!t.id || typeof t.id !== 'string') t.id = crypto.randomUUID();
  t.enabled = t.enabled !== false;
  t.name = String(t.name || '').trim() || (channel === 'email' ? 'Untitled email' : 'Untitled message');
  t.desc = String(t.desc || '');
  t.category = t.category === 'marketing' ? 'marketing' : 'utility';

  const days = Math.max(0, Math.floor(Number(t.days) || 0));
  const allowed = TRIGGERS[stage];
  t.trigger = allowed[t.trigger] ? t.trigger : inferTrigger(stage, days);
  const rule = allowed[t.trigger];
  t.days = rule.days ? Math.max(rule.min, days) : 0;
  t.time = TIME_RE.test(t.time) ? t.time : '10:00';
  // "booking" is event-driven: it goes out as soon as the booking exists, whatever time that is.
  if (t.trigger === 'booking') t.time = '00:00';

  t.body = String(t.body || '');
  if (channel === 'email') {
    t.subject = String(t.subject || '');
    // The dashboard renders the full HTML (incl. the web-app card) with {{variables}} left intact;
    // the scheduler fills it per guest. Absent on legacy rows — the sender falls back to the body.
    if (t.html !== undefined) t.html = String(t.html || '');
  } else {
    delete t.subject;
    delete t.html;
  }
  return t;
}

export function normalizeMatrix(raw) {
  const out = {};
  for (const stage of STAGES) {
    out[stage] = {};
    for (const channel of CHANNELS) {
      const list = Array.isArray(raw?.[stage]?.[channel]) ? raw[stage][channel] : [];
      out[stage][channel] = list.map((t) => normalizeTemplate(stage, channel, t));
    }
  }
  return out;
}

// True when normalizing changed anything that must be persisted (ids being the main one).
export function matrixNeedsSave(raw, normalized) {
  return JSON.stringify(raw ?? {}) !== JSON.stringify(normalized);
}

function findById(matrix, id) {
  for (const stage of STAGES) {
    for (const channel of CHANNELS) {
      const hit = (matrix?.[stage]?.[channel] || []).find((t) => t.id === id);
      if (hit) return hit;
    }
  }
  return null;
}

// Applies a matrix saved from the dashboard on top of what's stored. `wa` (Meta's approval state)
// is owned by the server — it only ever changes through the submit/refresh endpoints — so whatever
// the client sends for it is discarded and the stored value is kept by template id.
export function mergeIncomingMatrix(stored, incoming) {
  const merged = normalizeMatrix(incoming);
  for (const stage of STAGES) {
    for (const channel of CHANNELS) {
      for (const t of merged[stage][channel]) {
        const prev = findById(stored, t.id);
        if (channel === 'whatsapp') {
          if (prev?.wa) t.wa = prev.wa; else delete t.wa;
        }
      }
    }
  }
  return merged;
}

// WhatsApp can only send what Meta approved. If the text or category has been edited since the
// version Meta saw, it needs to be submitted again — and until then it must not send.
export function waState(tpl) {
  const wa = tpl.wa;
  if (!wa || !wa.status || wa.status === 'not_submitted') return { status: 'not_submitted', stale: false };
  const stale = wa.submittedBody !== tpl.body || wa.submittedCategory !== tpl.category;
  return { status: wa.status, stale };
}

export function isWhatsappSendable(tpl) {
  const { status, stale } = waState(tpl);
  return status === 'approved' && !stale && !!tpl.wa?.templateName;
}

// ---- Variables ----

export function usedVariables(text) {
  const out = [];
  String(text || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, k) => {
    const key = k.toLowerCase();
    if (!out.includes(key)) out.push(key);
    return m;
  });
  return out;
}

export function fillVariables(text, values, { escape } = {}) {
  return String(text || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, k) => {
    const key = k.toLowerCase();
    if (!VARIABLES.includes(key) || values[key] === undefined) return m;
    return escape ? escape(values[key]) : values[key];
  });
}

// ---- Timing ----

const dtfCache = new Map();
function dtf(tz) {
  if (!dtfCache.has(tz)) {
    dtfCache.set(tz, new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
  }
  return dtfCache.get(tz);
}

function partsInTz(date, tz) {
  const p = {};
  for (const { type, value } of dtf(tz).formatToParts(date)) p[type] = value;
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute };
}

/** 'YYYY-MM-DD' of an instant, read in the property's timezone. */
export function dateKeyInTz(date, tz) {
  const { y, m, d } = partsInTz(new Date(date), tz);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function addDaysToKey(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** The UTC instant at which wall-clock `dateKey` `HH:mm` happens in `tz`. */
export function zonedToUtc(dateKey, hhmm, tz) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offsetOf = (ms) => {
    const p = partsInTz(new Date(ms), tz);
    return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm) - Math.floor(ms / 60000) * 60000;
  };
  // Two passes settle the offset across a DST boundary.
  const first = guess - offsetOf(guess);
  return new Date(guess - offsetOf(first));
}

const toMins = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/** Pushes `due` out of the quiet window, if it lands in one. */
export function applyQuietHours(due, settings, tz) {
  if (!settings?.quietHoursEnabled) return due;
  const start = toMins(settings.quietStart || '21:00');
  const end = toMins(settings.quietEnd || '08:00');
  if (start === end) return due;
  const p = partsInTz(due, tz);
  const mins = p.hh * 60 + p.mm;
  const key = dateKeyInTz(due, tz);
  if (start > end) { // overnight window, e.g. 21:00 → 08:00
    if (mins >= start) return zonedToUtc(addDaysToKey(key, 1), settings.quietEnd, tz);
    if (mins < end) return zonedToUtc(key, settings.quietEnd, tz);
    return due;
  }
  if (mins >= start && mins < end) return zonedToUtc(key, settings.quietEnd, tz);
  return due;
}

/**
 * When this template becomes due for this booking, before quiet hours. Null if the booking lacks
 * the date the trigger hangs off.
 */
export function computeDueAt(tpl, booking, tz) {
  if (tpl.trigger === 'booking') return booking.createdAt ? new Date(booking.createdAt) : null;
  const arrival = booking.arrivalDate ? dateKeyInTz(booking.arrivalDate, tz) : null;
  const checkout = booking.checkoutDate ? dateKeyInTz(booking.checkoutDate, tz) : null;
  let key;
  switch (tpl.trigger) {
    case 'before': key = arrival && addDaysToKey(arrival, -tpl.days); break;
    case 'arrival': key = arrival; break;
    case 'after_checkin': key = arrival && addDaysToKey(arrival, tpl.days); break;
    case 'checkout': key = checkout; break;
    case 'after': key = checkout && addDaysToKey(checkout, tpl.days); break;
    default: key = null;
  }
  return key ? zonedToUtc(key, tpl.time, tz) : null;
}

export function formatDateForGuest(date, tz) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-GB', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' });
}
