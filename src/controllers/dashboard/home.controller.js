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
import { buildFolios, dayRange, parseLocalDate } from './checkout.controller.js';
import { requestScopeFilter } from './serviceRequest.controller.js';

// ==================== HOME (summary only, never a list) ====================
// Home keeps no copy of anything: every number is computed here, on every request, from the
// same collections and with the same rules as the hub it summarises (App Flow PDF, "Home").
// Counts only — no guest names, request text or individual reviews ever leave this endpoint.

const DAY_MS = 86_400_000;

// Same per-guest rule as the Check-in Hub (toCheckinGuests): no document = not submitted;
// a rejection reason = rejected; verified = approved; anything else = submitted.
export function guestIdStatus(doc) {
  if (!doc) return 'not-submitted';
  if (doc.rejectionReason) return 'rejected';
  return doc.verified ? 'approved' : 'submitted';
}

// Same booking roll-up as the Check-in Hub's computeCheckinStatus.
export function bookingCheckinStatus(statuses) {
  if (statuses.length === 0) return 'notDone';
  if (statuses.includes('rejected')) return 'rejected';
  if (statuses.every((s) => s === 'approved')) return 'approved';
  if (statuses.includes('not-submitted')) return 'notDone';
  return 'submitted';
}

async function arrivalsSummary(propertyId, date) {
  // The Check-in Hub buckets a booking into a day by the date part of its stored arrivalDate.
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start.getTime() + DAY_MS);
  const filter = { arrivalDate: { $gte: start, $lt: end } };
  if (propertyId !== 'default') filter.propertyId = propertyId;

  const bookings = await Booking.find(filter, 'bookingId numberOfGuests').lean();
  const checkIns = await CheckIn.find({ bookingId: { $in: bookings.map((b) => b.bookingId) } })
    .sort({ submittedAt: -1 })
    .lean();
  // Later documents win, exactly as the hub's Map(bookingId -> CheckIn) does.
  const checkInByBooking = new Map(checkIns.map((ci) => [ci.bookingId, ci]));

  const counts = { approved: 0, submitted: 0, notDone: 0, rejected: 0 };
  let totalGuests = 0;
  let approvedGuests = 0;
  for (const b of bookings) {
    const docs = new Map((checkInByBooking.get(b.bookingId)?.guestDocuments ?? []).map((d) => [d.guestNumber, d]));
    const statuses = Array.from({ length: b.numberOfGuests }, (_, i) => guestIdStatus(docs.get(i + 1)));
    counts[bookingCheckinStatus(statuses)] += 1;
    totalGuests += statuses.length;
    approvedGuests += statuses.filter((s) => s === 'approved').length;
  }

  return {
    total: bookings.length,
    ...counts,
    completionPct: totalGuests > 0 ? Math.round((approvedGuests / totalGuests) * 100) : 0,
  };
}

async function departuresSummary(propertyId, date) {
  const { start, end } = dayRange(parseLocalDate(date));
  const filter = { bookingStatus: { $ne: 'cancelled' }, checkoutDate: { $gte: start, $lte: end } };
  if (propertyId !== 'default') filter.propertyId = propertyId;

  const bookings = await Booking.find(filter).lean();
  const folios = await buildFolios(bookings);
  // Pending is whatever folio lines are still unpaid — the Checkout Hub's own derivation.
  const needsApproval = bookings.filter((b) => (folios[b.bookingId] ?? []).some((l) => !l.paid)).length;
  return { total: bookings.length, needsApproval, preApproved: bookings.length - needsApproval };
}

// Guests currently staying: every non-cancelled, not-yet-checked-out booking whose stay spans
// today, counted in guests (Booking.numberOfGuests), not bookings.
async function inHouseGuests(propertyId, date) {
  const { start, end } = dayRange(parseLocalDate(date));
  const match = {
    bookingStatus: { $nin: ['cancelled', 'checked-out'] },
    arrivalDate: { $lte: end },
    checkoutDate: { $gte: start },
  };
  if (propertyId !== 'default') match.propertyId = propertyId;
  const [row] = await Booking.aggregate([
    { $match: match },
    { $group: { _id: null, guests: { $sum: '$numberOfGuests' } } },
  ]);
  return row?.guests ?? 0;
}

async function requestsSummary(staff, propertyId) {
  const filter = requestScopeFilter(staff, { propertyId });
  filter.status = { $ne: 'Completed' };
  const open = await ServiceRequest.find(filter, 'status department').lean();

  const byDept = {};
  for (const r of open) byDept[r.department] = (byDept[r.department] ?? 0) + 1;
  return {
    new: open.filter((r) => r.status === 'Pending').length,
    inProgress: open.filter((r) => r.status !== 'Pending').length,
    byDepartment: Object.entries(byDept)
      .map(([department, count]) => ({ department, open: count }))
      .sort((a, b) => b.open - a.open || a.department.localeCompare(b.department)),
  };
}

// Negative = rating at or under the property's own Negative threshold (the Feedback tab's
// computeSentiment), over the same "this week" window that tab uses.
async function negativeReviewsThisWeek(propertyId) {
  const settings = await FeedbackSettings.findOne({ propertyId }).lean();
  const negMax = settings?.negMax ?? 2;
  const filter = { rating: { $lte: negMax }, createdAt: { $gt: new Date(Date.now() - 7 * DAY_MS) } };
  if (propertyId !== 'default') filter.propertyId = propertyId;
  return Feedback.countDocuments(filter);
}

// Each hub's own bookings query, minus cancelled. These four hubs each hold their own
// illustrative dates, so this is real-but-not-strictly-same-day by design (PRD, Step 2).
async function activitiesSummary(propertyId) {
  const [experiences, spa, fb, transport] = await Promise.all([
    ExperienceBooking.find({ bookingStatus: { $ne: 'cancelled' } }, 'experienceId')
      .populate('experienceId', 'propertyId')
      .lean()
      .then((rows) => rows.filter((r) => r.experienceId?.propertyId === propertyId).length),
    SpaBooking.countDocuments({ propertyId, status: { $ne: 'Cancelled' }, paymentStatus: { $ne: 'refunded' } }),
    DiningReservation.countDocuments({ propertyId, status: { $ne: 'cancelled' } }),
    TransportBooking.countDocuments({
      propertyId,
      hubBooking: true,
      offeringSlot: { $in: [1, 2, 3] },
      status: { $ne: 'cancelled' },
    }),
  ]);
  return { experiences, spa, fb, transport };
}

export const getHomeSummary = async (req, res) => {
  try {
    const { propertyId = 'default', date } = req.query;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) {
      return res.status(400).json({ success: false, message: 'date must be yyyy-mm-dd' });
    }

    const [inHouse, arrivals, departures, requests, negativeReviews, activities] = await Promise.all([
      inHouseGuests(propertyId, date),
      arrivalsSummary(propertyId, date),
      departuresSummary(propertyId, date),
      requestsSummary(req.staff, propertyId),
      negativeReviewsThisWeek(propertyId),
      activitiesSummary(propertyId),
    ]);

    res.status(200).json({
      success: true,
      data: { inHouse, arrivals, departures, requests, negativeReviews, activities },
    });
  } catch (error) {
    console.error('Get home summary error:', error);
    res.status(500).json({ success: false, message: 'Failed to build the home summary', error: error.message });
  }
};
