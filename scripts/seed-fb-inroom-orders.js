/**
 * One-time dev seed: populate the F&B in-room ordering menu catalog and a batch
 * of realistic room-service orders, so the dashboard's Orders/Menu tabs have
 * something real to demo against (there is no guest-app ordering flow yet to
 * generate these organically — see docs/backend-fb.md §2).
 *
 * Orders are linked to real Guest/Booking documents already in the dev DB
 * (propertyId 'default') rather than invented guests, and items reference the
 * real FbDish documents created in the same run.
 *
 * Run once:
 *   node scripts/seed-fb-inroom-orders.js
 */

import mongoose from 'mongoose';
import { MONGODB_URI, MONGODB_DB_NAME } from '../src/config/env.js';
import Booking from '../src/models/Booking.model.js';
import FbMenuCategory from '../src/models/FbMenuCategory.model.js';
import FbMenuSubcategory from '../src/models/FbMenuSubcategory.model.js';
import FbDish from '../src/models/FbDish.model.js';
import FbOrder from '../src/models/FbOrder.model.js';
import FbOrderingSettings from '../src/models/FbOrderingSettings.model.js';

const PROPERTY_ID = 'default';

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB_NAME });
console.log('Connected to', MONGODB_DB_NAME);

// ---------------------------------------------------------------------------
// 1. Menu catalog — categories, subcategories, dishes
// ---------------------------------------------------------------------------

const existingCatCount = await FbMenuCategory.countDocuments({ propertyId: PROPERTY_ID });
if (existingCatCount > 0) {
  console.log(`FbMenuCategory already has ${existingCatCount} docs for '${PROPERTY_ID}' — skipping menu seed, reusing what's there.`);
} else {
  console.log('Seeding F&B menu catalog...');
}

async function ensureCategory(name, desc, openTime, closeTime) {
  let cat = await FbMenuCategory.findOne({ propertyId: PROPERTY_ID, name });
  if (!cat) cat = await FbMenuCategory.create({ propertyId: PROPERTY_ID, name, desc, openTime, closeTime });
  return cat;
}
async function ensureSubcategory(categoryId, name) {
  let sub = await FbMenuSubcategory.findOne({ categoryId, name });
  if (!sub) sub = await FbMenuSubcategory.create({ categoryId, name });
  return sub;
}
async function ensureDish(subcategoryId, dish) {
  let d = await FbDish.findOne({ subcategoryId, name: dish.name });
  if (!d) d = await FbDish.create({ subcategoryId, ...dish });
  return d;
}

const catBreakfast = await ensureCategory('Breakfast', 'Continental and Indian breakfast, served till late morning.', '07:00', '11:00');
const catDining = await ensureCategory('All Day Dining', 'Mains, soups, and snacks available through the day.', '11:00', '23:00');
const catBeverages = await ensureCategory('Beverages', 'Hot and cold beverages, available round the clock.', '00:00', '23:59');
const catDesserts = await ensureCategory('Desserts', 'Something sweet to end the meal, from the pastry kitchen.', '12:00', '23:00');

const subContinental = await ensureSubcategory(catBreakfast._id, 'Continental');
const subIndianBreakfast = await ensureSubcategory(catBreakfast._id, 'Indian');
const subMains = await ensureSubcategory(catDining._id, 'Mains');
const subSnacks = await ensureSubcategory(catDining._id, 'Snacks & Starters');
const subSoupsSalads = await ensureSubcategory(catDining._id, 'Soups & Salads');
const subHotBev = await ensureSubcategory(catBeverages._id, 'Hot Beverages');
const subColdBev = await ensureSubcategory(catBeverages._id, 'Cold Beverages & Juices');
const subClassicDesserts = await ensureSubcategory(catDesserts._id, 'Classic Desserts');

const dishDefs = [
  [subContinental, { name: 'Classic Eggs Benedict', description: 'Poached eggs, hollandaise, toasted muffin', price: 450, dietType: 'Egg', gstPercent: 5, serves: '1', tags: ['Popular'] }],
  [subContinental, { name: 'Fresh Fruit Bowl', description: 'Seasonal fruits with honey drizzle', price: 280, dietType: 'Vegan', gstPercent: 5, serves: '1', tags: ['Healthy', 'Vegan'] }],
  [subContinental, { name: 'Buttermilk Pancakes', description: 'Stacked pancakes, maple syrup, whipped butter', price: 340, dietType: 'Egg', gstPercent: 5, serves: '1', tags: [] }],
  [subContinental, { name: 'Classic Omelette', description: 'Three-egg omelette with your choice of fillings', price: 300, dietType: 'Egg', gstPercent: 5, serves: '1', tags: [] }],
  [subIndianBreakfast, { name: 'Masala Dosa', description: 'Crisp rice crepe, potato masala, sambar, chutney', price: 320, dietType: 'Veg', gstPercent: 5, serves: '1', tags: ['South Indian', 'Popular'] }],
  [subIndianBreakfast, { name: 'Akki Roti with Chutney', description: 'Coorgi rice flat bread, coconut chutney', price: 260, dietType: 'Veg', gstPercent: 5, serves: '1', tags: ['Local Speciality'] }],
  [subIndianBreakfast, { name: 'Idli Sambar', description: 'Steamed rice cakes, sambar, coconut chutney', price: 260, dietType: 'Veg', gstPercent: 5, serves: '1', tags: ['South Indian'] }],
  [subIndianBreakfast, { name: 'Paratha with Curd & Pickle', description: 'Stuffed griddle bread, choice of filling', price: 300, dietType: 'Veg', gstPercent: 5, serves: '1', tags: [] }],
  [subMains, { name: 'Pandi Curry', description: 'Traditional Coorgi pork curry with kachampuli', price: 620, dietType: 'Non-Veg', gstPercent: 5, serves: '1-2', tags: ['Local Speciality', 'Signature'] }],
  [subMains, { name: 'Paneer Butter Masala', description: 'Cottage cheese in a rich tomato gravy, with rice or naan', price: 480, dietType: 'Veg', gstPercent: 5, serves: '1-2', tags: [] }],
  [subMains, { name: 'Kori Gassi', description: 'Mangalorean chicken curry, coconut and byadagi chilli', price: 560, dietType: 'Non-Veg', gstPercent: 5, serves: '1-2', tags: ['Local Speciality'] }],
  [subMains, { name: 'Bamboo Shoot Pork Fry', description: 'Coorgi-style pork tossed with bamboo shoot and spices', price: 640, dietType: 'Non-Veg', gstPercent: 5, serves: '1-2', tags: ['Local Speciality', "Chef's Special"] }],
  [subMains, { name: 'Vegetable Biryani', description: 'Slow-cooked basmati rice, seasonal vegetables, raita', price: 400, dietType: 'Veg', gstPercent: 5, serves: '1', tags: [] }],
  [subMains, { name: 'Grilled Fish with Lemon Butter', description: 'Catch of the day, lemon butter sauce, sautéed greens', price: 680, dietType: 'Non-Veg', gstPercent: 5, serves: '1', tags: [] }],
  [subMains, { name: 'Penne Arrabbiata', description: 'Penne pasta tossed in a spicy tomato-garlic sauce', price: 420, dietType: 'Veg', gstPercent: 5, serves: '1', tags: ['Spicy'] }],
  [subSnacks, { name: 'Coorgi Chicken Sandwich', description: 'Grilled chicken, herb mayo, multigrain bread', price: 380, dietType: 'Non-Veg', gstPercent: 5, serves: '1', tags: [] }],
  [subSnacks, { name: 'Veg Spring Rolls', description: 'Crisp rolls, sweet chilli dip', price: 300, dietType: 'Veg', gstPercent: 5, serves: '2', tags: [] }],
  [subSnacks, { name: 'Chicken Sukka Skewers', description: 'Char-grilled chicken skewers, Coorg spice rub', price: 420, dietType: 'Non-Veg', gstPercent: 5, serves: '1-2', tags: ["Chef's Special"] }],
  [subSnacks, { name: 'Masala Peanuts & Banana Chips', description: "Coorg-style spiced peanuts with home-made banana chips", price: 220, dietType: 'Vegan', gstPercent: 5, serves: '2', tags: ['Local Speciality'] }],
  [subSnacks, { name: 'Paneer Tikka', description: 'Char-grilled cottage cheese, mint chutney', price: 360, dietType: 'Veg', gstPercent: 5, serves: '1-2', tags: [] }],
  [subSoupsSalads, { name: 'Tomato Basil Soup', description: 'Roasted tomato and basil, cream drizzle', price: 240, dietType: 'Veg', gstPercent: 5, serves: '1', tags: [] }],
  [subSoupsSalads, { name: 'Coorg Garden Salad', description: 'Estate greens, orange segments, honey-mustard dressing', price: 280, dietType: 'Vegan', gstPercent: 5, serves: '1', tags: ['Healthy'] }],
  [subHotBev, { name: 'Estate Filter Coffee', description: 'Single-estate Coorg coffee, brewed fresh', price: 150, dietType: 'Veg', gstPercent: 5, serves: '1', tags: ['Signature'] }],
  [subHotBev, { name: 'Masala Chai', description: 'Spiced Indian tea, brewed with fresh ginger and cardamom', price: 130, dietType: 'Veg', gstPercent: 5, serves: '1', tags: [] }],
  [subHotBev, { name: 'Hot Chocolate', description: 'Rich Belgian chocolate, steamed milk', price: 200, dietType: 'Veg', gstPercent: 5, serves: '1', tags: [] }],
  [subColdBev, { name: 'Fresh Orange Juice', description: 'Cold-pressed, no added sugar', price: 220, dietType: 'Vegan', gstPercent: 5, serves: '1', tags: [] }],
  [subColdBev, { name: 'Watermelon Cooler', description: 'Fresh watermelon, mint, lime', price: 200, dietType: 'Vegan', gstPercent: 5, serves: '1', tags: [] }],
  [subColdBev, { name: 'Coorg Coffee Frappe', description: 'Estate coffee blended with ice cream and milk', price: 260, dietType: 'Veg', gstPercent: 5, serves: '1', tags: ['Signature'] }],
  [subClassicDesserts, { name: 'Chocolate Lava Cake', description: 'Warm molten centre, vanilla bean ice cream', price: 320, dietType: 'Egg', gstPercent: 5, serves: '1', tags: ["Chef's Special"] }],
  [subClassicDesserts, { name: 'Honey & Coffee Panna Cotta', description: 'Set cream dessert, estate coffee reduction', price: 280, dietType: 'Veg', gstPercent: 5, serves: '1', tags: ['Signature'] }],
  [subClassicDesserts, { name: 'Gulab Jamun', description: 'Warm milk dumplings in cardamom syrup', price: 220, dietType: 'Veg', gstPercent: 5, serves: '2', tags: [] }],
];

const dishByName = {};
for (const [sub, def] of dishDefs) {
  const d = await ensureDish(sub._id, def);
  dishByName[def.name] = d;
}
console.log(`Menu ready: 4 categories, 8 subcategories, ${Object.keys(dishByName).length} dishes.`);

// Mark a couple of items out of stock today, matching how a real kitchen would run out mid-service.
await FbDish.updateOne({ _id: dishByName['Coorgi Chicken Sandwich']._id }, { $set: { inStock: false } });
await FbDish.updateOne({ _id: dishByName['Grilled Fish with Lemon Butter']._id }, { $set: { inStock: false } });

await FbOrderingSettings.findOneAndUpdate(
  { propertyId: PROPERTY_ID },
  { $setOnInsert: { propertyId: PROPERTY_ID, opens: '07:00', closes: '22:00', paused: false, packagingCharge: 30 } },
  { upsert: true }
);

// ---------------------------------------------------------------------------
// 2. Real guests to attach orders to
// ---------------------------------------------------------------------------

const existingOrderCount = await FbOrder.countDocuments({ propertyId: PROPERTY_ID });
if (existingOrderCount > 0) {
  console.log(`FbOrder already has ${existingOrderCount} docs for '${PROPERTY_ID}'. Continuing will add more on top — Ctrl+C now to abort.`);
}

// Hand-picked from real `default`-property bookings (checked against the full name list —
// excludes obvious test/placeholder rows like "Prachet Test 11", "rr", "miirty").
const CURATED_GUEST_NAMES = [
  'Vivek Chawla', 'Karthik Kumar B S', 'Simin Khan', 'Akshay M B', 'Omkar Manjunath',
  'Siddhartha Tiku', 'Rashmi Singh', 'Pranjul Agarwal', 'Vivin Lithesh V G', 'Santhosh Kumar',
  'Reshma Maradugu', 'Karthik Joshi', 'Dishit Parsana', 'Yash Tantia', 'Kavita Behal',
  'Vishal Amin', 'Harini Paranthaman', 'Sudhakar Reddy Papadasu',
];

const candidateBookings = await Booking.find({
  propertyId: PROPERTY_ID,
  primaryGuestName: { $in: CURATED_GUEST_NAMES },
}).sort({ arrivalDate: -1 }).lean();

// De-dupe by guest name, keep the most recent booking per guest.
const seenNames = new Set();
const guestPool = [];
for (const b of candidateBookings) {
  if (seenNames.has(b.primaryGuestName)) continue;
  seenNames.add(b.primaryGuestName);
  guestPool.push(b);
}
if (guestPool.length < 10) {
  throw new Error(`Only matched ${guestPool.length}/${CURATED_GUEST_NAMES.length} curated guest names in propertyId '${PROPERTY_ID}' — data may have changed.`);
}
console.log(`Matched ${guestPool.length}/${CURATED_GUEST_NAMES.length} curated guests to attach orders to.`);

const roomLabels = [
  'Villa 1', 'Villa 2', 'Villa 3', 'Villa 4', 'Villa 5', 'Villa 6',
  'Cottage 1', 'Cottage 2', 'Cottage 3', 'Cottage 4',
  'Suite 1', 'Suite 2', 'Suite 3',
  'Pool Villa 2', 'Pool Villa 5', 'Pool Villa 7',
  'Luxury Pool Villa 1', 'Luxury Pool Villa 3',
];

const guests = guestPool.map((b, i) => ({
  guestId: b.guestId,
  bookingId: b._id,
  guestName: b.primaryGuestName,
  room: roomLabels[i % roomLabels.length],
}));

// ---------------------------------------------------------------------------
// 3. Build realistic orders across the last few days, spread through meal times
// ---------------------------------------------------------------------------

const STAGES = ['placed', 'accepted', 'prepared', 'delivered'];

function at(dayOffset, hour, minute) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}
function addMinutes(date, mins) {
  return new Date(date.getTime() + mins * 60000);
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function pickItems(names) {
  return names.map((name) => {
    const dish = dishByName[name];
    return {
      dishId: dish._id,
      name: dish.name,
      qty: 1,
      price: dish.price,
      gstPercent: dish.gstPercent,
    };
  });
}

const BREAKFAST_COMBOS = [
  ['Masala Dosa', 'Estate Filter Coffee'],
  ['Classic Eggs Benedict', 'Fresh Orange Juice'],
  ['Akki Roti with Chutney', 'Masala Chai'],
  ['Idli Sambar', 'Estate Filter Coffee'],
  ['Buttermilk Pancakes', 'Hot Chocolate'],
  ['Fresh Fruit Bowl'],
  ['Classic Omelette', 'Estate Filter Coffee'],
  ['Paratha with Curd & Pickle', 'Masala Chai'],
];
const LUNCH_DINNER_COMBOS = [
  ['Pandi Curry', 'Akki Roti with Chutney'],
  ['Paneer Butter Masala', 'Vegetable Biryani'],
  ['Kori Gassi', 'Vegetable Biryani'],
  ['Bamboo Shoot Pork Fry', 'Masala Peanuts & Banana Chips'],
  ['Penne Arrabbiata', 'Coorg Garden Salad'],
  ['Paneer Tikka', 'Tomato Basil Soup'],
  ['Chicken Sukka Skewers', 'Fresh Orange Juice'],
  ['Veg Spring Rolls', 'Watermelon Cooler'],
  ['Vegetable Biryani', 'Gulab Jamun'],
];
const EVENING_SNACK_COMBOS = [
  ['Estate Filter Coffee', 'Chocolate Lava Cake'],
  ['Masala Chai', 'Gulab Jamun'],
  ['Coorg Coffee Frappe'],
  ['Honey & Coffee Panna Cotta', 'Masala Chai'],
  ['Watermelon Cooler'],
];

const NOTES = [
  'One portion on the milder side, please — served separately if possible.',
  'No onion, no garlic in this order — allergy.',
  'Please send extra napkins and cutlery for two.',
  'Guest requested it be sent out as soon as ready, celebrating an anniversary tonight.',
  'Less spicy than usual, and no coriander garnish please.',
  'Please knock softly — infant sleeping in the room.',
];

function comboPoolForHour(hour) {
  if (hour >= 6 && hour < 11) return BREAKFAST_COMBOS;
  if (hour >= 11 && hour < 16) return LUNCH_DINNER_COMBOS;
  if (hour >= 16 && hour < 19) return EVENING_SNACK_COMBOS;
  if (hour >= 19 && hour < 23) return LUNCH_DINNER_COMBOS;
  return EVENING_SNACK_COMBOS;
}

const now = new Date();
const docs = [];
let guestCursor = 0;
function nextGuest() {
  const guest = guests[guestCursor % guests.length];
  guestCursor++;
  return guest;
}
function finalizeOrder({ placedAt, timestamps, stage, comboPool }) {
  const guest = nextGuest();
  const items = pickItems(pick(comboPool));
  const withNote = Math.random() < 0.28;
  return {
    _id: new mongoose.Types.ObjectId(),
    propertyId: PROPERTY_ID,
    guestId: guest.guestId,
    bookingId: guest.bookingId,
    guestName: guest.guestName,
    room: guest.room,
    items,
    packagingCharge: 30,
    notes: withNote ? pick(NOTES) : undefined,
    stage,
    timestamps,
    createdAt: placedAt,
    updatedAt: timestamps[stage] ?? placedAt,
    __v: 0,
  };
}

// Day -2 and Day -1 are fully in the past regardless of what time it is "now" —
// safe to lay out a complete day of service, all the way through delivered.
const PAST_DAY_HOURS = [8, 9, 13, 17, 20, 21];
for (const dayOffset of [-2, -1]) {
  for (const hour of PAST_DAY_HOURS) {
    const minute = pick([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
    const placedAt = at(dayOffset, hour, minute);
    const acceptedAt = addMinutes(placedAt, 2 + Math.floor(Math.random() * 3));
    const preparedAt = addMinutes(acceptedAt, 14 + Math.floor(Math.random() * 12));
    const deliveredAt = addMinutes(preparedAt, 7 + Math.floor(Math.random() * 9));
    docs.push(
      finalizeOrder({
        placedAt,
        timestamps: { placed: placedAt, accepted: acceptedAt, prepared: preparedAt, delivered: deliveredAt },
        stage: 'delivered',
        comboPool: comboPoolForHour(hour),
      })
    );
  }
}

// Today: never write a timestamp later than the real "now" — derive each order's stage from
// how far its own placed→accepted→prepared→delivered progression has actually gotten by now,
// rather than assigning a stage up front (that's what produced 7pm "prepared" orders at 8am).
const openTime = at(0, 7, 0);
const minutesSinceOpen = Math.floor((now - openTime) / 60000);
if (minutesSinceOpen < 15) {
  console.log("Ordering opened less than 15 minutes ago — skipping today's live orders, nothing would realistically exist yet.");
} else {
  const agoCandidates = [95, 70, 45, 25, 12, 5].filter((mins) => mins < minutesSinceOpen);
  for (const minsAgo of agoCandidates) {
    const placedAt = addMinutes(now, -minsAgo);
    const acceptedAt = addMinutes(placedAt, 2 + Math.floor(Math.random() * 3));
    const preparedAt = addMinutes(acceptedAt, 14 + Math.floor(Math.random() * 12));
    const deliveredAt = addMinutes(preparedAt, 7 + Math.floor(Math.random() * 9));

    const timestamps = { placed: placedAt };
    let stage = 'placed';
    if (acceptedAt <= now) { timestamps.accepted = acceptedAt; stage = 'accepted'; }
    if (stage === 'accepted' && preparedAt <= now) { timestamps.prepared = preparedAt; stage = 'prepared'; }
    if (stage === 'prepared' && deliveredAt <= now) { timestamps.delivered = deliveredAt; stage = 'delivered'; }

    docs.push(finalizeOrder({ placedAt, timestamps, stage, comboPool: comboPoolForHour(placedAt.getHours()) }));
  }
}

// Drop `notes` key entirely when undefined so it matches how the model would store it (field just absent).
for (const d of docs) {
  if (d.notes === undefined) delete d.notes;
}

await mongoose.connection.collection('fborders').insertMany(docs);
console.log(`Inserted ${docs.length} F&B orders for propertyId '${PROPERTY_ID}'.`);

const stageCounts = docs.reduce((acc, d) => { acc[d.stage] = (acc[d.stage] || 0) + 1; return acc; }, {});
console.log('Stage breakdown:', stageCounts);

await mongoose.disconnect();
console.log('Done.');
