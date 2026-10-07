import ExperienceDiscount from '../models/ExperienceDiscount.model.js';
import HubDiscount from '../models/HubDiscount.model.js';
import Booking from '../models/Booking.model.js';

// Guest-side view of the dashboard's Discounts & Promotions (Experience / Spa / Dining hubs).
// Discounts were only ever stored; this is what makes them reach guests — both the struck-through
// price the app shows (GET /guests/discounts) and the amount actually charged at booking time.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// "YYYY-MM-DD" for a date in the property's timezone (Asia/Kolkata), so date-only comparisons match
// what staff typed into the dashboard's <input type="date">.
export const istDay = (d = new Date()) => new Date(new Date(d).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

const dayDiff = (fromDay, toDay) => Math.round((Date.parse(toDay) - Date.parse(fromDay)) / 86400000);

// Is this discount currently valid for a guest arriving on `checkInDay` ("YYYY-MM-DD" or null)?
export const isEligible = (d, today, checkInDay) => {
  if (!d.enabled) return false;
  if (d.startDate && today < d.startDate) return false;
  if (d.endDate && today > d.endDate) return false;
  if (d.applyType === 'window') {
    // "Stops applying N days before check-in": needs a known arrival to evaluate.
    if (!checkInDay) return false;
    if (dayDiff(today, checkInDay) < (d.windowDays ?? 0)) return false;
  }
  return true;
};

// The latest stay's arrival day for a guest (null if unknown).
export const arrivalDayForGuest = async (guestId) => {
  if (!guestId) return null;
  const booking = await Booking.findOne({ guestId }).sort({ createdAt: -1 }).select('arrivalDate').lean().catch(() => null);
  return booking?.arrivalDate ? istDay(booking.arrivalDate) : null;
};

// All eligible discounts, normalised to one shape: { id, kind, name, discountType, value, maxCap, itemIds }.
export const loadEligibleDiscounts = async ({ propertyId, checkInDay }) => {
  const filter = { enabled: true };
  if (propertyId) filter.propertyId = propertyId;
  const [exp, hub] = await Promise.all([ExperienceDiscount.find(filter).lean(), HubDiscount.find(filter).lean()]);
  const today = istDay();
  const all = [
    ...exp.map((d) => ({ ...d, kind: 'experience', itemIds: (d.activityIds || []).map(String) })),
    ...hub.map((d) => ({ ...d, kind: d.department, itemIds: (d.itemIds || []).map(String) })),
  ];
  return all
    .filter((d) => isEligible(d, today, checkInDay))
    .map((d) => ({
      id: String(d._id),
      kind: d.kind,
      name: d.name,
      discountType: d.discountType,
      value: d.value,
      maxCap: d.maxCap ?? null,
      itemIds: d.itemIds,
    }));
};

export const discountAmount = (d, price) => {
  if (!(price > 0)) return 0;
  let off = d.discountType === 'flat' ? d.value : (price * d.value) / 100;
  if (d.discountType === 'percent' && d.maxCap) off = Math.min(off, d.maxCap);
  return Math.max(0, Math.min(Math.round(off), price));
};

// Best single discount for an item (no stacking): { discount, amount } or null.
export const bestDiscountFor = (discounts, kind, itemId, price) => {
  let best = null;
  for (const d of discounts) {
    if (d.kind !== kind || !d.itemIds.includes(String(itemId))) continue;
    const amount = discountAmount(d, price);
    if (amount > 0 && (!best || amount > best.amount)) best = { discount: d, amount };
  }
  return best;
};
