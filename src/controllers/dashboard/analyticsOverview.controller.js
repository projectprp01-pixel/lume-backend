import Booking from '../../models/Booking.model.js';
import CheckIn from '../../models/CheckIn.model.js';
import Feedback from '../../models/Feedback.model.js';
import FeedbackSettings from '../../models/FeedbackSettings.model.js';
import ServiceRequest from '../../models/ServiceRequest.model.js';
import Experience from '../../models/Experience.model.js'; // registers the schema populate() needs
import ExperienceBooking from '../../models/ExperienceBooking.model.js';
import SpaBooking from '../../models/SpaBooking.model.js';
import DiningReservation from '../../models/DiningReservation.model.js';
import TransportBooking from '../../models/TransportBooking.model.js';
import { requestScopeFilter } from './serviceRequest.controller.js';
import { guestIdStatus, bookingCheckinStatus } from './home.controller.js';

// ==================== ANALYTICS OVERVIEW (Analytics PRD) ====================
// Everything is computed here on every request from the collections that own the data — no
// stored copies. One response feeds both the overview cards and every detail chart, and the
// dashboard's Excel export is built from these very same arrays, so a chart and its sheet can
// never disagree. Guest Usage and Spotlight are deliberately absent: nothing records that
// behaviour yet (see the plan), and inventing numbers would be worse than showing none.

const DAY_MS = 86_400_000;
const MAX_DAYS = 731;
const TZ = 'Asia/Kolkata';
const IST = '+05:30';

const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const istDayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
const istDay = (d) => istDayFmt.format(d);

function shiftDay(ymd, n) {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function eachDay(from, to) {
  const days = [];
  for (let d = from; d <= to; d = shiftDay(d, 1)) days.push(d);
  return days;
}
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
const istBounds = (from, to) => ({
  start: new Date(`${from}T00:00:00.000${IST}`),
  end: new Date(`${to}T23:59:59.999${IST}`),
});
const utcBounds = (from, to) => ({
  start: new Date(`${from}T00:00:00.000Z`),
  end: new Date(`${to}T23:59:59.999Z`),
});
const pct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : null);
const round1 = (n) => Math.round(n * 10) / 10;

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ---------- 1. Total Revenue ----------
// SUM(amount) WHERE paid through the webapp (a gateway payment id exists). Staff-approved
// checkout settlements set `paid` without one, so Pay at Checkout is excluded exactly as the
// PRD requires. F&B in-room orders carry no gateway id and so are outside this number too.
const HUBS = ['experiences', 'spa', 'transport', 'dining'];
const HUB_LABEL = { experiences: 'Experiences', spa: 'Spa', transport: 'Transport', dining: 'Dining' };

async function revenueFor(propertyId, from, to) {
  const { start, end } = istBounds(from, to);
  const paid = {
    paymentStatus: 'paid',
    razorpayPaymentId: { $exists: true, $nin: [null, ''] },
    paidAt: { $gte: start, $lte: end },
  };
  const [exp, spa, trn, din] = await Promise.all([
    ExperienceBooking.find(paid, 'totalAmount paidAt experienceId').populate('experienceId', 'propertyId').lean(),
    SpaBooking.find({ ...paid, propertyId }, 'price paidAt').lean(),
    TransportBooking.find({ ...paid, propertyId }, 'amount paidAt').lean(),
    DiningReservation.find({ ...paid, propertyId }, 'amount paidAt').lean(),
  ]);

  const rows = [
    ...exp.filter((x) => x.experienceId?.propertyId === propertyId).map((x) => ({ hub: 'experiences', at: x.paidAt, amount: x.totalAmount })),
    ...spa.map((x) => ({ hub: 'spa', at: x.paidAt, amount: x.price })),
    ...trn.map((x) => ({ hub: 'transport', at: x.paidAt, amount: x.amount })),
    ...din.map((x) => ({ hub: 'dining', at: x.paidAt, amount: x.amount })),
  ].filter((r) => r.amount > 0);

  const byDay = Object.fromEntries(
    eachDay(from, to).map((d) => [d, { date: d, experiences: 0, spa: 0, transport: 0, dining: 0, total: 0, payments: 0 }])
  );
  const hubTotals = Object.fromEntries(HUBS.map((h) => [h, { hub: h, label: HUB_LABEL[h], amount: 0, payments: 0 }]));
  for (const r of rows) {
    const day = byDay[istDay(r.at)];
    if (!day) continue;
    day[r.hub] += r.amount;
    day.total += r.amount;
    day.payments += 1;
    hubTotals[r.hub].amount += r.amount;
    hubTotals[r.hub].payments += 1;
  }
  const series = Object.values(byDay);
  return {
    total: series.reduce((s, d) => s + d.total, 0),
    payments: series.reduce((s, d) => s + d.payments, 0),
    series,
    byHub: Object.values(hubTotals),
  };
}

// ---------- 2. Check-in Completion ----------
// COUNT(check-ins approved) / COUNT(total arrivals), by the arrival day the Check-in Hub uses.
async function checkinFor(propertyId, from, to) {
  const { start, end } = utcBounds(from, to);
  const filter = { arrivalDate: { $gte: start, $lte: end } };
  if (propertyId !== 'default') filter.propertyId = propertyId;
  const bookings = await Booking.find(filter, 'bookingId numberOfGuests arrivalDate').lean();
  const checkIns = await CheckIn.find({ bookingId: { $in: bookings.map((b) => b.bookingId) } })
    .sort({ submittedAt: -1 })
    .lean();
  const byBooking = new Map(checkIns.map((ci) => [ci.bookingId, ci])); // later wins, as in the hub

  const byDay = Object.fromEntries(
    eachDay(from, to).map((d) => [d, { date: d, arrivals: 0, approved: 0, submitted: 0, notDone: 0, rejected: 0, pct: null }])
  );
  const totals = { approved: 0, submitted: 0, notDone: 0, rejected: 0 };
  for (const b of bookings) {
    const docs = new Map((byBooking.get(b.bookingId)?.guestDocuments ?? []).map((d) => [d.guestNumber, d]));
    const status = bookingCheckinStatus(Array.from({ length: b.numberOfGuests }, (_, i) => guestIdStatus(docs.get(i + 1))));
    totals[status] += 1;
    const day = byDay[b.arrivalDate.toISOString().slice(0, 10)];
    if (day) {
      day.arrivals += 1;
      day[status] += 1;
    }
  }
  const series = Object.values(byDay).map((d) => ({ ...d, pct: pct(d.approved, d.arrivals) }));
  const arrivals = bookings.length;
  return { arrivals, ...totals, pct: pct(totals.approved, arrivals), series };
}

// ---------- 4. Feedback ----------
// Average rating and count of feedback submitted, sentiment from the property's live thresholds.
async function feedbackFor(propertyId, from, to) {
  const { start, end } = istBounds(from, to);
  const filter = { createdAt: { $gte: start, $lte: end } };
  if (propertyId !== 'default') filter.propertyId = propertyId;
  const [reviews, settings] = await Promise.all([
    Feedback.find(filter, 'rating createdAt googleClicked').lean(),
    FeedbackSettings.findOne({ propertyId }).lean(),
  ]);
  const negMax = settings?.negMax ?? 2;
  const posMin = settings?.posMin ?? 4;

  const byDay = Object.fromEntries(eachDay(from, to).map((d) => [d, { date: d, count: 0, sum: 0 }]));
  const distribution = [1, 2, 3, 4, 5].map((stars) => ({ stars, count: 0 }));
  const sentiment = { positive: 0, neutral: 0, negative: 0 };
  let googleClicks = 0;
  for (const r of reviews) {
    const day = byDay[istDay(r.createdAt)];
    if (day) {
      day.count += 1;
      day.sum += r.rating;
    }
    distribution[r.rating - 1].count += 1;
    sentiment[r.rating <= negMax ? 'negative' : r.rating >= posMin ? 'positive' : 'neutral'] += 1;
    if (r.googleClicked) googleClicks += 1;
  }
  const count = reviews.length;
  return {
    count,
    avg: count ? round1(reviews.reduce((s, r) => s + r.rating, 0) / count) : null,
    googleClicks,
    thresholds: { negMax, posMin },
    distribution,
    sentiment,
    series: Object.values(byDay).map((d) => ({
      date: d.date,
      count: d.count,
      avg: d.count ? round1(d.sum / d.count) : null,
    })),
  };
}

// ---------- 6. Request Resolution Rate ----------
// COUNT(requests resolved) / COUNT(requests submitted), scoped to what this viewer may see.
async function requestsFor(staff, propertyId, from, to) {
  const { start, end } = istBounds(from, to);
  const filter = { ...requestScopeFilter(staff, { propertyId }), createdAt: { $gte: start, $lte: end } };
  const requests = await ServiceRequest.find(filter, 'status department createdAt completedAt').lean();

  const byDay = Object.fromEntries(eachDay(from, to).map((d) => [d, { date: d, submitted: 0, resolved: 0, pct: null }]));
  const depts = {};
  const hours = [];
  for (const r of requests) {
    const resolved = r.status === 'Completed';
    const day = byDay[istDay(r.createdAt)];
    if (day) {
      day.submitted += 1;
      if (resolved) day.resolved += 1;
    }
    const d = (depts[r.department] ??= { department: r.department, total: 0, resolved: 0 });
    d.total += 1;
    if (resolved) d.resolved += 1;
    if (resolved && r.completedAt) hours.push((r.completedAt - r.createdAt) / 3_600_000);
  }
  const total = requests.length;
  const resolvedTotal = requests.filter((r) => r.status === 'Completed').length;
  const med = median(hours);
  return {
    total,
    resolved: resolvedTotal,
    open: total - resolvedTotal,
    pct: pct(resolvedTotal, total),
    medianHours: med == null ? null : round1(med),
    series: Object.values(byDay).map((d) => ({ ...d, pct: pct(d.resolved, d.submitted) })),
    byDepartment: Object.values(depts)
      .map((d) => ({ ...d, pct: pct(d.resolved, d.total) }))
      .sort((a, b) => b.total - a.total || a.department.localeCompare(b.department)),
  };
}

async function computeWindow(staff, propertyId, from, to) {
  const [revenue, checkin, feedback, requests] = await Promise.all([
    revenueFor(propertyId, from, to),
    checkinFor(propertyId, from, to),
    feedbackFor(propertyId, from, to),
    requestsFor(staff, propertyId, from, to),
  ]);
  return { revenue, checkin, feedback, requests };
}

async function earliestDay(propertyId) {
  const first = async (Model, field, filter = {}) => {
    const doc = await Model.findOne(filter, field).sort({ [field]: 1 }).lean();
    return doc?.[field] ? istDay(doc[field]) : null;
  };
  const bookingFilter = propertyId !== 'default' ? { propertyId } : {};
  const days = await Promise.all([
    first(Booking, 'arrivalDate', bookingFilter),
    first(Feedback, 'createdAt', bookingFilter),
    first(ServiceRequest, 'createdAt'),
    first(SpaBooking, 'paidAt', { propertyId, paidAt: { $ne: null } }),
    first(TransportBooking, 'paidAt', { propertyId, paidAt: { $ne: null } }),
    first(DiningReservation, 'paidAt', { propertyId, paidAt: { $ne: null } }),
    first(ExperienceBooking, 'paidAt', { paidAt: { $ne: null } }),
  ]);
  return days.filter(Boolean).sort()[0] ?? null;
}

export const getAnalyticsOverview = async (req, res) => {
  try {
    const { propertyId = 'default', range } = req.query;
    let { from, to } = req.query;

    if (!isYmd(to)) return res.status(400).json({ success: false, message: 'to must be yyyy-mm-dd' });
    if (range === 'all') {
      from = (await earliestDay(propertyId)) ?? to;
    } else if (!isYmd(from)) {
      return res.status(400).json({ success: false, message: 'from must be yyyy-mm-dd' });
    }
    if (from > to) return res.status(400).json({ success: false, message: 'from must not be after to' });
    if (daysBetween(from, to) > MAX_DAYS) from = shiftDay(to, -(MAX_DAYS - 1));

    const days = daysBetween(from, to);
    const current = await computeWindow(req.staff, propertyId, from, to);

    res.status(200).json({
      success: true,
      data: {
        range: { from, to, days },
        current,
      },
    });
  } catch (error) {
    console.error('Get analytics overview error:', error);
    res.status(500).json({ success: false, message: 'Failed to build analytics', error: error.message });
  }
};
