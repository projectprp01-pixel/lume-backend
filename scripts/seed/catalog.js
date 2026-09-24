/**
 * Catalog seed: everything a stay can be linked TO — Experiences, Spa, Transport, Dining, the
 * in-room F&B menu, banners and Property Settings (incl. the Guest App CMS blob). None of it
 * carries a booking ID; it is what the booked rows in stays.js point at, and it hands back
 * keyed handles (with their real Mongo _ids) so those rows and the Guest App blob reference
 * real documents rather than invented ids.
 */

import mongoose from 'mongoose';
import Experience from '../../src/models/Experience.model.js';
import ExperienceDiscount from '../../src/models/ExperienceDiscount.model.js';
import SpaFacility from '../../src/models/Spa.model.js';
import Transport from '../../src/models/Transport.model.js';
import Restaurant from '../../src/models/Restaurant.model.js';
import FbMenuCategory from '../../src/models/FbMenuCategory.model.js';
import FbMenuSubcategory from '../../src/models/FbMenuSubcategory.model.js';
import FbDish from '../../src/models/FbDish.model.js';
import FbOrderingSettings from '../../src/models/FbOrderingSettings.model.js';
import AppBanner from '../../src/models/AppBanner.model.js';
import PropertySettings from '../../src/models/PropertySettings.model.js';
import { PROPERTY_ID, PROPERTY_NAME, IMG, dayAt, isoDay } from './lib.js';

const oid = () => new mongoose.Types.ObjectId();
const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ---------------------------------------------------------------------------
// Experiences
// ---------------------------------------------------------------------------

// model: 'free' | 'flat' | 'person'
const EXPERIENCES = [
  { key: 'plantation', title: 'Guided Plantation Tour', short: 'Serene plantation walk', cat: 'Nature', img: IMG.plantation, dur: [90, 'minutes'], group: [1, 10], meet: 'Reception', model: 'free', price: 0, cutoff: 120, featured: true,
    slots: [['Morning', '08:00', 10]], inc: ['Naturalist guide for the duration', 'Bottled water'], exc: ['Transport to meeting point'], addons: [],
    full: "A gentle morning walk through 300 acres of coffee, pepper and cardamom with the resident naturalist — the resort's most-loved complimentary experience." },
  { key: 'photoshoot', title: 'Eternal Moments', short: 'Personalised photoshoot', cat: 'Culture', img: IMG.photo, dur: [2, 'hours'], group: [1, 4], meet: 'Reception', model: 'flat', price: 15000, cutoff: 1440,
    slots: [['Golden Hour', '17:00', 4]], inc: ['Professional photographer', 'Edited digital gallery'], exc: ['Printed albums'],
    addons: [{ name: 'Printed album', price: 2500, note: 'per booking', description: 'A curated printed album of your favourite shots from the shoot.' }],
    full: 'A private golden-hour photoshoot across the estate, with an edited gallery delivered within 48 hours.' },
  { key: 'etrails', title: 'Electric Trails', short: 'Eco-friendly village cycling', cat: 'Adventure', img: IMG.cycling, dur: [1, 'hours'], group: [1, 10], meet: 'Reception', model: 'person', price: 1000, cutoff: 120,
    slots: [['Sunrise', '06:30', 6], ['Morning', '08:00', 6]], inc: ['Naturalist guide for the duration', 'Helmets and safety equipment', 'Bottled water'], exc: ['Food and beverages'],
    addons: [{ name: 'Photography package', price: 1500, note: 'per booking', description: 'A photographer joins your ride to capture the trail.' }],
    full: 'Electric bicycles through the neighbouring Kodava villages, with stops at a coffee curing yard and a spice garden.' },
  { key: 'culturalshow', title: 'Cultural Show', short: 'Complimentary evening performance', cat: 'Culture', img: IMG.show, dur: [90, 'minutes'], group: [1, 10], meet: 'Amphitheatre', model: 'free', price: 0, cutoff: 0,
    slots: [['Evening', '19:00', 40]], inc: ['Seating', 'Welcome drink'], exc: ['Dinner'], addons: [],
    full: 'Kodava folk dance and music under the open sky, every evening.' },
  { key: 'bylakuppe', title: 'Bylakuppe Tibetan Settlement', short: 'Monastery and settlement visit', cat: 'Culture', img: IMG.monastery, dur: [3, 'hours'], group: [1, 6], meet: 'Reception', model: 'person', price: 3000, cutoff: 720,
    slots: [['Morning', '10:00', 6]], inc: ['Private vehicle', 'Guide'], exc: ['Meals'], addons: [],
    full: "A guided visit to the Namdroling Monastery and the Golden Temple in Asia's second-largest Tibetan settlement." },
  { key: 'coracle', title: 'Coracle Ride', short: 'Traditional river coracle ride', cat: 'Nature', img: IMG.coracle, dur: [45, 'minutes'], group: [1, 4], meet: 'Riverside dock', model: 'flat', price: 2500, cutoff: 120,
    slots: [['Morning', '09:00', 4]], inc: ['Life jackets', 'Boatman guide'], exc: [], addons: [],
    full: 'Glide down the Cauvery in a traditional round coracle, steered by a local boatman.' },
  { key: 'kidswalk', title: "Kids' Nature Walk", short: 'A guided walk made for young explorers', cat: 'Nature', img: IMG.kids, dur: [75, 'minutes'], group: [1, 12], meet: 'Reception', model: 'person', price: 600, cutoff: 240, featured: true,
    slots: [['Morning', '09:30', 12]], inc: ['Naturalist guide', 'Explorer kit', 'Juice and snacks'], exc: [], addons: [],
    full: 'A scavenger-hunt style walk through the estate for children aged 5–12, led by a naturalist.' },
  { key: 'abbey', title: 'Abbey Falls Trek', short: 'Guided waterfall trek', cat: 'Adventure', img: IMG.trek, dur: [3, 'hours'], group: [2, 8], meet: 'Reception', model: 'person', price: 1800, cutoff: 720,
    slots: [['Early Morning', '07:30', 8]], inc: ['Private vehicle', 'Trek guide', 'Packed breakfast'], exc: ['Personal expenses'], addons: [],
    full: 'A guided drive and trek to Abbey Falls through coffee estates, with a packed breakfast on the way.' },
  { key: 'pottery', title: 'Pottery Workshop', short: 'Hands-on clay workshop', cat: 'Culture', img: IMG.pottery, dur: [90, 'minutes'], group: [1, 8], meet: 'Craft Studio', model: 'person', price: 900, cutoff: 240,
    slots: [['Afternoon', '16:00', 8]], inc: ['Materials', 'Instructor', 'Firing and delivery of your piece'], exc: [], addons: [],
    full: 'Throw your own piece on the wheel with a local potter; it is fired and delivered to your room before you leave.' },
  { key: 'coffeetasting', title: 'Coffee Tasting & Roasting', short: 'From cherry to cup', cat: 'Nature', img: IMG.coffee, dur: [90, 'minutes'], group: [1, 10], meet: 'Curing Yard', model: 'person', price: 1200, cutoff: 240,
    slots: [['Afternoon', '15:00', 10]], inc: ['Estate guide', 'Tasting flight', '250g estate coffee to take home'], exc: [], addons: [],
    full: "Follow the bean from cherry to cup on the estate's own curing yard, ending with a guided cupping." },
  { key: 'meditation', title: 'Guided Forest Meditation', short: 'A quiet sunrise sit in the shola forest', cat: 'Wellness', img: IMG.meditation, dur: [60, 'minutes'], group: [1, 10], meet: 'Bonfire Deck', model: 'person', price: 500, cutoff: 480,
    slots: [['Sunrise', '06:00', 10]], inc: ['Instructor', 'Mats and cushions', 'Herbal tea'], exc: [], addons: [],
    full: 'A gentle guided meditation among the trees at first light.' },
];

async function seedExperiences() {
  const byKey = {};
  const docs = EXPERIENCES.map((e) => {
    const _id = oid();
    const [durValue, durUnit] = e.dur;
    const doc = {
      _id,
      title: e.title,
      shortDescription: e.short,
      fullDescription: e.full,
      category: e.cat,
      imageUrl: e.img,
      images: [{ image: e.img, title: e.title, description: e.short }],
      videos: [],
      duration: durUnit === 'minutes' && durValue >= 60 && durValue % 60 === 0
        ? { value: durValue / 60, unit: 'hours' }
        : { value: durValue, unit: durUnit },
      location: { name: e.meet },
      pricing: { basePrice: e.price, currency: 'INR', pricePerPerson: e.model === 'person' },
      groupSize: { min: e.group[0], max: e.group[1] },
      inclusions: e.inc,
      exclusions: e.exc,
      timeSlots: e.slots.map(([label, time, capacity]) => ({ label, time, capacity, available: capacity, dayType: 'weekday', active: true })),
      availability: 'daily',
      specificDays: [],
      advanceBookingRequired: { value: e.cutoff, unit: 'minutes' },
      cancellationPolicy: 'Free cancellation up to the cutoff time before the session starts.',
      isActive: true,
      isFeatured: !!e.featured,
      propertyId: PROPERTY_ID,
      tags: [e.cat],
      propertyScheduled: false,
      guestCanChooseGroupSize: true,
      blockedRanges: [],
      addOns: e.addons.map((a) => ({ name: a.name, type: 'Checkbox', description: a.description, note: a.note, price: a.price })),
      type: 'activity',
      ctaLabel: 'Book Now',
    };
    byKey[e.key] = { ...e, _id, doc };
    return doc;
  });
  await Experience.insertMany(docs);

  const discounts = await ExperienceDiscount.insertMany([
    { propertyId: PROPERTY_ID, name: 'Golden Hour Getaway', discountType: 'percent', value: 15, maxCap: 2000, applyType: 'window', windowDays: 3, startDate: isoDay(dayAt(-30)), activityIds: [byKey.coracle._id, byKey.photoshoot._id], enabled: true },
    { propertyId: PROPERTY_ID, name: 'Family Explorer', discountType: 'flat', value: 300, applyType: 'automatic', activityIds: [byKey.kidswalk._id, byKey.etrails._id], enabled: true },
  ]);
  return { byKey, discounts };
}

// ---------------------------------------------------------------------------
// Spa
// ---------------------------------------------------------------------------

const SPA_CATEGORIES = [
  { name: 'Ayurvedic Treatment', treatments: [
    { key: 'abhyanga', name: 'Abhyanga', status: 'active', desc: 'Full-body warm oil massage practised in Ayurveda for over 5,000 years.',
      included: ['Herbal oil selection', 'Steam bath access', 'Herbal tea after treatment'], durations: [{ minutes: 60, price: 1200 }, { minutes: 75, price: 1500 }], min: 1, max: 2,
      slots: [['Morning', '08:00'], ['Afternoon', '14:00'], ['Evening', '18:00']],
      addons: [{ name: 'Herbal steam bath', description: '20-minute Panchakarma steam to open pores and deepen the oil absorption.', price: 1500 },
               { name: 'Scalp & hair oil treatment', description: 'Warm brahmi oil worked into the scalp before the main treatment. Adds 15 minutes.', price: 1500 }] },
    { key: 'kati', name: 'Kati Basti', status: 'active', desc: 'Warm medicated oil bath for the lower back.',
      included: ['Medicated oil', 'Post-treatment rest area'], durations: [{ minutes: 30, price: 1800 }], min: 1, max: 1, slots: [['Morning', '09:00'], ['Afternoon', '14:00']], addons: [] },
    { key: 'shiro', name: 'Shiroabhyanga', status: 'unavailable', desc: 'Herbal oil massage for head, neck & shoulders.',
      included: ['Herbal oil selection'], durations: [{ minutes: 45, price: 1400 }], min: 1, max: 1, slots: [['Evening', '17:00']], addons: [] },
    { key: 'couples', name: 'Couples Ayurvedic Ritual', status: 'active', desc: 'Side-by-side Abhyanga for two, ending with a shared herbal steam.',
      included: ['Two therapists', 'Herbal steam for two', 'Ginger tea and jaggery'], durations: [{ minutes: 90, price: 4500 }], min: 2, max: 2, pricingLabel: 'Per couple',
      slots: [['Afternoon', '15:15'], ['Evening', '18:00']], addons: [] },
  ] },
  { name: 'Beauty Treatment', treatments: [
    { key: 'facial', name: 'Rejuvenating Facial', status: 'active', desc: 'A brightening facial using natural botanicals.',
      included: ['Cleansing', 'Steam', 'Botanical mask'], durations: [{ minutes: 50, price: 2800 }], min: 1, max: 1, slots: [['Morning', '10:00'], ['Afternoon', '15:00']],
      addons: [{ name: 'Eye treatment add-on', description: 'Cooling under-eye treatment.', price: 600 }] },
  ] },
  { name: 'Wellness Sessions', treatments: [
    { key: 'yoga', name: 'Sunrise Yoga Session', status: 'active', desc: 'Guided group yoga session as the sun comes up.',
      included: ['Yoga mats provided', 'Herbal tea after session'], durations: [{ minutes: 60, price: 800 }], min: 1, max: 12, mode: 'group', maxParticipants: 12, slots: [['Sunrise', '06:30']], addons: [] },
  ] },
];

async function seedSpa() {
  const treat = {};
  const categories = SPA_CATEGORIES.map((c) => ({
    _id: oid(),
    name: c.name,
    treatments: c.treatments.map((t) => {
      const _id = oid();
      const first = t.durations[0];
      treat[t.key] = {
        key: t.key, _id, name: t.name, categoryName: c.name, durations: t.durations, addons: t.addons,
        perCouple: t.pricingLabel === 'Per couple', group: t.mode === 'group', slots: t.slots, unavailable: t.status !== 'active',
      };
      return {
        _id,
        name: t.name,
        description: t.desc,
        price: first.price,
        duration: first.minutes,
        pricingLabel: t.pricingLabel ?? 'Per person',
        capacityMin: t.min,
        capacityMax: t.max,
        status: t.status,
        timeSlots: t.slots.map(([label, startTime]) => ({ label, startTime })),
        blockedDates: [],
        included: t.included,
        durations: t.durations,
        addons: t.addons,
        mode: t.mode ?? 'individual',
        maxParticipants: t.maxParticipants,
      };
    }),
  }));
  const facility = await SpaFacility.create({
    name: 'Amrutha Spa',
    subtitle: 'Ayurveda Centre',
    description: "Our expert masseurs and masseuses harness the ancient secrets of the world's oldest healing system to rejuvenate, regenerate and revitalize you.",
    operatingHours: '9:00 AM – 8:00 PM',
    advanceBooking: 'Bookings close 2 hours before the session',
    listingImage: IMG.spa,
    detailImage: IMG.spa2,
    isActive: true,
    propertyId: PROPERTY_ID,
    therapistsAvailable: 3,
    maxBookingsPerSlot: 3,
    categories,
    gallery: [IMG.spa, IMG.spa2],
    availableDays: ALL_DAYS,
  });
  return { facility, treat };
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

async function seedTransport() {
  const vehicles = [
    { key: 'innova', _id: oid(), name: 'Toyota Innova Crysta', type: 'SUV', capacity: 'Up to 6 guests', photoUrl: IMG.vehicle },
    { key: 'sedan', _id: oid(), name: 'Toyota Etios Sedan', type: 'Sedan', capacity: 'Up to 3 guests', photoUrl: IMG.vehicle },
    { key: 'tempo', _id: oid(), name: 'Tempo Traveller', type: 'Van', capacity: 'Up to 12 guests', photoUrl: IMG.vehicle },
  ];
  const v = Object.fromEntries(vehicles.map((x) => [x.key, x]));
  const prices = (m) => vehicles.map((x) => ({ vehicleId: x._id, price: m[x.key] }));

  const cityRows = {
    Bengaluru: { innova: 9500, sedan: 7000, tempo: 14000 },
    Mysuru: { innova: 5500, sedan: 4000, tempo: 8500 },
    Mangaluru: { innova: 8500, sedan: 6500, tempo: 12000 },
  };
  const allVehicleIds = vehicles.map((x) => x._id);
  const offerings = [
    { slot: 1, name: 'One Day Fare for Sightseeing', desc: 'Cab at disposal for the day. Guests choose which days of their stay.', structure: 'daily', flatRate: false, published: true,
      included: ['Driver and fuel', 'Up to 10 hours / 250 km'], vehiclePricing: prices({ innova: 4500, sedan: 3200, tempo: 6500 }), eligibleVehicles: allVehicleIds, cities: [], addons: [2], blockedRanges: [] },
    { slot: 2, name: 'Fare for Only Pickup and Drop from Preferred City', desc: 'Standalone pickup or drop-off, bookable at any time during the stay.', structure: 'p2p', flatRate: false, published: true,
      included: ['Driver and fuel', 'Tolls and parking'], vehiclePricing: [], eligibleVehicles: allVehicleIds,
      cities: Object.entries(cityRows).map(([name, m]) => ({ name, vehiclePrices: prices(m) })), addons: [], blockedRanges: [] },
    { slot: 3, name: 'Full Trip Cab', desc: 'One flat price covering a cab for your entire stay, including pickup and drop-off from the city.', structure: 'daily', flatRate: true, published: true,
      included: ['Driver and fuel', 'Pickup and drop-off', 'Sightseeing throughout the stay'], vehiclePricing: prices({ innova: 22000, sedan: 16000, tempo: 30000 }), eligibleVehicles: [v.innova._id, v.sedan._id], cities: [], addons: [], blockedRanges: [] },
    { slot: 4, name: 'Custom / On-Request', desc: 'Guests describe their need and the team arranges — no fixed pricing.', structure: 'custom', flatRate: false, published: true,
      included: [], vehiclePricing: [], eligibleVehicles: [], cities: [], addons: [], blockedRanges: [] },
  ].map((o) => ({ _id: oid(), ...o }));

  const doc = await Transport.create({
    propertyId: PROPERTY_ID,
    visible: true,
    pageTitle: 'How to Reach Evolve Back, Coorg',
    priceIncludes: [{ label: 'Private Innova Crysta with an experienced driver' }, { label: 'Fuel, tolls and parking' }, { label: 'Bottled water on board' }],
    sightseeingAttractions: [{ label: 'Abbey Falls' }, { label: "Raja's Seat" }, { label: 'Namdroling Monastery' }, { label: 'Dubare Elephant Camp' }],
    pricingTiers: [
      { fromNights: 1, toNights: 2, routeLabel: 'Bengaluru ⇄ Coorg', price: 15000 },
      { fromNights: 3, toNights: 5, routeLabel: 'Bengaluru ⇄ Coorg + sightseeing', price: 22000 },
    ],
    defaultPrice: 15000,
    heroDesc: 'Dedicated vehicles with experienced drivers',
    vehicles: vehicles.map(({ key, ...rest }) => rest),
    offerings,
  });
  const offeringBySlot = Object.fromEntries(offerings.map((o) => [o.slot, o]));
  const priceOf = (slot, vehicleKey, city) => {
    if (slot === 2) return cityRows[city ?? 'Bengaluru'][vehicleKey];
    return offeringBySlot[slot].vehiclePricing.find((p) => String(p.vehicleId) === String(v[vehicleKey]._id))?.price ?? 0;
  };
  return { doc, vehicles: v, offeringBySlot, priceOf };
}

// ---------------------------------------------------------------------------
// Dining (restaurants + intimate dining) and in-room F&B menu
// ---------------------------------------------------------------------------

const DINING = [
  { key: 'verandah', name: 'The Verandah', type: 'restaurant', subtitle: 'Multicuisine Restaurant', cuisine: ['Multi-cuisine', 'Coorgi specialities'], serves: ['breakfast', 'lunch', 'dinner'], tables: 14, price: 0, unit: 'à la carte', open: '07:00', close: '22:30', img: IMG.dining1,
    desc: 'All-day multi-cuisine restaurant with a Coorgi tasting menu each evening.', inc: ['Buffet breakfast', 'À la carte lunch & dinner'], addons: [], menus: [{ label: 'Food Menu', fileUrl: IMG.dining1 }] },
  { key: 'grill', name: 'Plantation Grill', type: 'restaurant', subtitle: 'Speciality Restaurant', cuisine: ['Grill & BBQ'], serves: ['dinner'], tables: 10, price: 0, unit: 'à la carte', open: '18:30', close: '23:00', img: IMG.dining4,
    desc: 'Open-air grill restaurant overlooking the plantation, dinner only.', inc: ['Live grill station'], addons: [], menus: [] },
  { key: 'deck', name: 'Private Deck Dining', type: 'intimate_dining', subtitle: 'Intimate Dining Experience', cuisine: ['Curated multi-course'], serves: ['dinner'], tables: 3, price: 4500, unit: 'per couple', open: '19:00', close: '21:30', img: IMG.dining2,
    desc: 'A private deck set up for two, overlooking the valley, with a curated 5-course menu.', inc: ['5-course tasting menu', 'Dedicated server', 'Candlelit setup'],
    addons: [{ name: 'Wine pairing', price: 1800, description: '3-glass wine pairing for two.' }, { name: 'Photography package', price: 1500, description: 'A resort photographer joins your dinner and delivers 15–20 edited shots within 24 hrs.' }],
    menus: [{ label: 'Food Menu', fileUrl: IMG.dining2 }, { label: 'Beverages Menu', fileUrl: IMG.dining3 }] },
  { key: 'riverside', name: 'Riverside Candlelight Dinner', type: 'intimate_dining', subtitle: 'Romantic Dining Experience', cuisine: ['Continental & Coorgi fusion'], serves: ['dinner'], tables: 2, price: 5200, unit: 'per couple', open: '19:30', close: '21:00', img: IMG.dining5,
    desc: 'Candlelit table set up by the riverbank with a private chef and server.', inc: ['4-course dinner', 'Private server', 'Bonfire on request'],
    addons: [{ name: 'Live acoustic musician', price: 3000, description: '30 min live set during dinner.' }], menus: [] },
  { key: 'chefs', name: "In-Villa Chef's Table", type: 'intimate_dining', subtitle: "Chef's Table Experience", cuisine: ["Chef's choice tasting menu"], serves: ['dinner'], tables: 2, price: 6800, unit: 'per table (up to 4)', open: '19:00', close: '22:00', img: IMG.dining3, active: false,
    desc: "The chef cooks and plates a tasting menu live in your villa's dining space.", inc: ['6-course tasting menu', 'Live plating by the chef'], addons: [], menus: [] },
];

async function seedDining() {
  const byKey = {};
  const docs = DINING.map((d) => {
    const _id = oid();
    const doc = {
      _id,
      name: d.name,
      description: d.desc,
      cuisine: d.cuisine,
      imageUrl: d.img,
      images: [d.img],
      propertyId: PROPERTY_ID,
      facilityType: d.type,
      subtitle: d.subtitle,
      mealTimes: d.serves,
      bookingMode: 'reservations',
      reservationRequired: true,
      whatsIncluded: d.inc,
      price: d.price,
      pricingLabel: d.unit,
      tablesPerNight: d.tables,
      openTime: d.open,
      closeTime: d.close,
      slots: d.type === 'intimate_dining' ? [{ name: 'Dinner', startTime: d.open, endTime: d.close, capacity: String(d.tables), active: true }] : [],
      blockedRanges: d.key === 'deck' ? [{ start: isoDay(dayAt(20)), end: isoDay(dayAt(22)) }] : [],
      availableDays: ALL_DAYS,
      addons: d.addons,
      menus: d.menus,
      isActive: d.active !== false,
      isFeatured: d.key === 'verandah' || d.key === 'deck',
    };
    byKey[d.key] = { ...d, _id, doc };
    return doc;
  });
  await Restaurant.insertMany(docs);
  return byKey;
}

const DISH_DEFS = [
  ['Breakfast', 'Continental and Indian breakfast, served till late morning.', '07:00', '11:00', [
    ['Continental', [
      ['Classic Eggs Benedict', 'Poached eggs, hollandaise, toasted muffin', 450, 'Egg', ['Popular']],
      ['Fresh Fruit Bowl', 'Seasonal fruits with honey drizzle', 280, 'Vegan', ['Healthy', 'Vegan']],
      ['Buttermilk Pancakes', 'Stacked pancakes, maple syrup, whipped butter', 340, 'Egg', []],
      ['Classic Omelette', 'Three-egg omelette with your choice of fillings', 300, 'Egg', []]]],
    ['Indian', [
      ['Masala Dosa', 'Crisp rice crepe, potato masala, sambar, chutney', 320, 'Veg', ['South Indian', 'Popular']],
      ['Akki Roti with Chutney', 'Coorgi rice flat bread, coconut chutney', 260, 'Veg', ['Local Speciality']],
      ['Idli Sambar', 'Steamed rice cakes, sambar, coconut chutney', 260, 'Veg', ['South Indian']],
      ['Paratha with Curd & Pickle', 'Stuffed griddle bread, choice of filling', 300, 'Veg', []]]]]],
  ['All Day Dining', 'Mains, soups, and snacks available through the day.', '11:00', '23:00', [
    ['Mains', [
      ['Pandi Curry', 'Traditional Coorgi pork curry with kachampuli', 620, 'Non-Veg', ['Local Speciality', 'Signature']],
      ['Paneer Butter Masala', 'Cottage cheese in a rich tomato gravy, with rice or naan', 480, 'Veg', []],
      ['Kori Gassi', 'Mangalorean chicken curry, coconut and byadagi chilli', 560, 'Non-Veg', ['Local Speciality']],
      ['Bamboo Shoot Pork Fry', 'Coorgi-style pork tossed with bamboo shoot and spices', 640, 'Non-Veg', ['Local Speciality', "Chef's Special"]],
      ['Vegetable Biryani', 'Slow-cooked basmati rice, seasonal vegetables, raita', 400, 'Veg', []],
      ['Grilled Fish with Lemon Butter', 'Catch of the day, lemon butter sauce, sautéed greens', 680, 'Non-Veg', [], false],
      ['Penne Arrabbiata', 'Penne pasta tossed in a spicy tomato-garlic sauce', 420, 'Veg', ['Spicy']]]],
    ['Snacks & Starters', [
      ['Coorgi Chicken Sandwich', 'Grilled chicken, herb mayo, multigrain bread', 380, 'Non-Veg', [], false],
      ['Veg Spring Rolls', 'Crisp rolls, sweet chilli dip', 300, 'Veg', []],
      ['Chicken Sukka Skewers', 'Char-grilled chicken skewers, Coorg spice rub', 420, 'Non-Veg', ["Chef's Special"]],
      ['Masala Peanuts & Banana Chips', 'Coorg-style spiced peanuts with home-made banana chips', 220, 'Vegan', ['Local Speciality']],
      ['Paneer Tikka', 'Char-grilled cottage cheese, mint chutney', 360, 'Veg', []]]],
    ['Soups & Salads', [
      ['Tomato Basil Soup', 'Roasted tomato and basil, cream drizzle', 240, 'Veg', []],
      ['Coorg Garden Salad', 'Estate greens, orange segments, honey-mustard dressing', 280, 'Vegan', ['Healthy']]]]]],
  ['Beverages', 'Hot and cold beverages, available round the clock.', '00:00', '23:59', [
    ['Hot Beverages', [
      ['Estate Filter Coffee', 'Single-estate Coorg coffee, brewed fresh', 150, 'Veg', ['Signature']],
      ['Masala Chai', 'Spiced Indian tea, brewed with fresh ginger and cardamom', 130, 'Veg', []],
      ['Hot Chocolate', 'Rich Belgian chocolate, steamed milk', 200, 'Veg', []]]],
    ['Cold Beverages & Juices', [
      ['Fresh Orange Juice', 'Cold-pressed, no added sugar', 220, 'Vegan', []],
      ['Watermelon Cooler', 'Fresh watermelon, mint, lime', 200, 'Vegan', []],
      ['Coorg Coffee Frappe', 'Estate coffee blended with ice cream and milk', 260, 'Veg', ['Signature']]]]]],
  ['Desserts', 'Something sweet to end the meal, from the pastry kitchen.', '12:00', '23:00', [
    ['Classic Desserts', [
      ['Chocolate Lava Cake', 'Warm molten centre, vanilla bean ice cream', 320, 'Egg', ["Chef's Special"]],
      ['Honey & Coffee Panna Cotta', 'Set cream dessert, estate coffee reduction', 280, 'Veg', ['Signature']],
      ['Gulab Jamun', 'Warm milk dumplings in cardamom syrup', 220, 'Veg', []]]]]],
];

async function seedFbMenu() {
  const dishes = {};
  for (const [catName, desc, openTime, closeTime, subs] of DISH_DEFS) {
    const cat = await FbMenuCategory.create({ propertyId: PROPERTY_ID, name: catName, desc, openTime, closeTime });
    for (const [subName, items] of subs) {
      const sub = await FbMenuSubcategory.create({ categoryId: cat._id, name: subName });
      for (const [name, description, price, dietType, tags, inStock = true] of items) {
        dishes[name] = await FbDish.create({ subcategoryId: sub._id, name, description, price, dietType, gstPercent: 5, serves: '1', tags, inStock });
      }
    }
  }
  await FbOrderingSettings.create({ propertyId: PROPERTY_ID, opens: '07:00', closes: '22:00', paused: false, packagingCharge: 30 });
  return dishes;
}

// ---------------------------------------------------------------------------
// Property Settings (+ Guest App CMS blob + Comms) and banners
// ---------------------------------------------------------------------------

const COMMS = {
  prestay: {
    email: [
      { name: 'Personalised Web App Intro', desc: 'Introduces the guest web app — check-in, transport, featured experiences, loyalty perks.', enabled: true, days: 5, subject: 'Your personalised guide to {{property_name}} is ready', body: '' },
      { name: 'Booking Confirmation', desc: 'Sent immediately after a booking is confirmed.', enabled: true, days: 0, subject: 'Your stay at Evolve Back Resort Coorg is confirmed', body: "Hi {{guest_name}},\n\nWe're delighted to confirm your upcoming stay at {{property_name}}. We'll be in touch closer to your arrival with check-in details.\n\nWarm regards,\n{{property_name}}" },
      { name: 'Pre-Arrival Info', desc: 'Sent a few days before arrival with directions and what to pack.', enabled: true, days: 3, subject: 'Getting ready for your stay at {{property_name}}', body: "Hi {{guest_name}},\n\nYour stay is just around the corner. Here's what you need to know before you arrive — directions, weather, and what to pack for the estate.\n\nSee you soon,\n{{property_name}}" },
    ],
    whatsapp: [{ name: 'Booking Confirmation (WhatsApp)', desc: 'Short confirmation nudge sent alongside the email.', enabled: true, days: 0, body: "Hi {{guest_name}}! Your booking at {{property_name}} is confirmed. We'll send check-in details closer to your arrival date." }],
  },
  instay: {
    email: [{ name: 'Mid-Stay Check-in', desc: 'Sent partway through longer stays to surface any issues early.', enabled: false, days: 2, subject: "How's your stay so far?", body: "Hi {{guest_name}},\n\nJust checking in to make sure everything at {{property_name}} is going smoothly. Reply here if there's anything we can do.\n\n{{property_name}}" }],
    whatsapp: [
      { name: 'Welcome Message', desc: 'Sent shortly after check-in with quick links to the guest app.', enabled: true, days: 0, body: 'Welcome to {{property_name}}, {{guest_name}}! Use the guest app to order room service, book experiences, or raise a request anytime.' },
      { name: 'Mid-Stay Check-in (WhatsApp)', desc: 'Casual check-in message for stays of 3+ nights.', enabled: true, days: 2, body: "Hi {{guest_name}}, hope you're enjoying your time at {{property_name}} so far! Let us know if you need anything." },
    ],
  },
  poststay: {
    email: [{ name: 'Thank You & Feedback Request', desc: 'Sent the day after checkout, links to the review flow.', enabled: true, days: 1, subject: 'Thank you for staying with us, {{guest_name}}', body: "Hi {{guest_name}},\n\nThank you for staying at {{property_name}}. We'd love to hear about your experience — it only takes a minute and helps us keep improving.\n\nWarm regards,\n{{property_name}}" }],
    whatsapp: [{ name: 'Thank You (WhatsApp)', desc: 'Short thank-you nudge sent the same day as the email.', enabled: false, days: 1, body: 'Thank you for staying with us, {{guest_name}}! We hope to welcome you back to {{property_name}} soon.' }],
  },
};

function buildGuestAppBlob({ exp, spa, dining }) {
  const s = (id) => String(id);
  return {
    pageEnabled: { experiences: true, dining: true, requests: true },
    heroImage: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80',
    homeToggles: { quickActions: true, expCallout: true, todaysPlan: true, spotlight: true, events: true, gallery: true },
    quickActions: {
      prestay: { transport: true, wifi: false, directory: false, facilities: false, inRoomDining: false, directions: true },
      instay: { transport: true, wifi: true, directory: true, facilities: true, inRoomDining: true, directions: false },
    },
    expCalloutItems: [
      { id: 'cal-1', sourceType: 'experience', sourceId: s(exp.kidswalk._id), stage: 'both', badge: 'Kids special' },
      { id: 'cal-2', sourceType: 'spa', sourceId: s(spa.treat.abhyanga._id), stage: 'instay' },
    ],
    spotlightItems: [{ id: 'sp-1', title: 'Ayurveda Centre', body: "Our expert masseurs and masseuses harness the ancient secrets of the world's oldest healing system to rejuvenate, regenerate and revitalize you.", image: 'https://images.unsplash.com/photo-1600334129128-685c5582fd35?w=600&q=80', ctaTarget: 'Spa', stage: 'both' }],
    eventItems: [{ id: 'ev-1', title: 'Loyalty Programme', subtext: 'Get 20% off on all experiences', details: 'Enroll in our loyalty programme to unlock 20% off all bookable experiences for the rest of your stay.', image: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=400&q=80', activeFrom: '', activeUntil: '', targetLink: '' }],
    expHero: { image: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=80', heading: 'Experiences', subtext: 'Everything available during your stay, ready to browse and book', ctaLabel: 'View All', ctaTarget: 'experience' },
    expSections: [
      { id: 1, heading: 'Ayurveda Centre', subtext: '', sourceType: 'spa', showViewAll: true, enabled: true, items: [{ id: 'gaxp-1-1', sourceId: s(spa.treat.abhyanga._id), badge: 'Popular' }, { id: 'gaxp-1-2', sourceId: s(spa.treat.couples._id), badge: '' }] },
      { id: 2, heading: 'Book Ahead', subtext: 'Everything available during your stay, ready to browse and book.', sourceType: 'experience', showViewAll: true, enabled: true, items: [{ id: 'gaxp-2-1', sourceId: s(exp.kidswalk._id), badge: 'Kids special' }, { id: 'gaxp-2-2', sourceId: s(exp.coracle._id), badge: '' }] },
      { id: 3, heading: 'Complimentary', subtext: '', sourceType: 'experience', showViewAll: true, enabled: true, items: [{ id: 'gaxp-3-1', sourceId: s(exp.plantation._id), badge: '' }, { id: 'gaxp-3-2', sourceId: s(exp.culturalshow._id), badge: '' }] },
    ],
    diningHero: {
      prestay: { image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80', heading: 'Dining at Coorg', subtext: 'Explore our restaurants and dining experiences, ready to book once you arrive', ctaLabel: 'Explore Dining' },
      instay: { image: 'https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?w=800&q=80', eyebrow: 'In-Room Dining', heading: 'Breakfast in bed, Dinner by the window', ctaLabel: 'Order Now' },
    },
    inRoomOrderingEnabled: true,
    diningSections: [
      { id: 1, heading: 'Outdoor Dining', subtext: '', enabled: true, items: [{ id: 'gad-1-1', restaurantId: s(dining.verandah._id) }, { id: 'gad-1-2', restaurantId: s(dining.grill._id) }] },
      { id: 2, heading: 'Intimate Dining', subtext: 'Private settings, curated menus, and evenings made to remember', enabled: true, items: [{ id: 'gad-2-1', restaurantId: s(dining.deck._id) }, { id: 'gad-2-2', restaurantId: s(dining.riverside._id) }] },
    ],
    reqCategories: [
      { id: 'rc-1', name: 'Housekeeping', subtext: 'Room clean, turndown, extra towels', icon: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=100&q=80', services: [
        { service: 'Extra towels or toiletries', cost: 'Complimentary' }, { service: 'Pillow or blanket preference', cost: 'Complimentary' }, { service: 'Room cleaning / turndown service', cost: 'Complimentary' },
        { service: 'Maintenance (broken fixture, faulty light, leaking tap)', cost: 'Complimentary' }, { service: 'Baby cot or extra bed', cost: 'Rs. 500 per extra bed' }] },
      { id: 'rc-2', name: 'Refreshments', subtext: 'Water bottles, tea, coffee, ice', icon: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=100&q=80', services: [
        { service: 'Bottled water (still)', cost: 'Complimentary' }, { service: 'Tea / coffee sachets restock', cost: 'Complimentary' }, { service: 'Ice bucket refill', cost: 'Complimentary' }, { service: 'Soft drinks / mixers', cost: 'Rs. 150 per bottle' }] },
      { id: 'rc-3', name: 'Transport', subtext: 'Golf cart, cab, airport drop', icon: 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=100&q=80', services: [
        { service: 'Golf cart within property', cost: 'Complimentary' }, { service: 'Local cab booking', cost: 'As per meter' }, { service: 'Airport drop', cost: 'Rs. 2,500 one-way' }] },
      { id: 'rc-4', name: 'Laundry', subtext: 'Pickup from your room', icon: 'https://images.unsplash.com/photo-1489274495757-95c7c837b101?w=100&q=80', services: [
        { service: 'Wash & fold, per kg', cost: 'Rs. 150' }, { service: 'Dry cleaning, per item', cost: 'Rs. 300' }, { service: 'Express service (same day)', cost: '+50% surcharge' }] },
      { id: 'rc-5', name: 'Baby & kids', subtext: 'Cot, highchair, extra blanket', icon: 'https://images.unsplash.com/photo-1522771930-78848d9293e8?w=100&q=80', services: [
        { service: 'Baby cot', cost: 'Rs. 500 per stay' }, { service: 'Highchair', cost: 'Complimentary' }, { service: 'Extra blanket', cost: 'Complimentary' }] },
      { id: 'rc-6', name: 'Special occasions', subtext: 'Decorations, cake, flowers', icon: 'https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=100&q=80', services: [
        { service: 'Room decoration', cost: 'Rs. 2,000 onwards' }, { service: 'Celebration cake (1 kg)', cost: 'Rs. 1,200' }, { service: 'Fresh flower arrangement', cost: 'Rs. 800 onwards' }] },
    ],
  };
}

async function seedPropertySettings({ exp, spa, dining }) {
  const comms = JSON.parse(JSON.stringify(COMMS));
  comms.prestay.email[0].webAppCard = {
    heroImage: '',
    heading: 'Help us welcome you smoothly through a personalised web app',
    subtext: "While you're in there, you'll also find everything you need for your stay: book experiences, order to your room, or reach the team in a tap",
    checkinCtaLabel: 'Check-in & See Recommendations',
    showTransportCta: true,
    transportCtaLabel: 'Transport options',
    experiencesHeading: 'Reserve a few favourites before you arrive',
    experiencesSubtext: 'These few of our most loved experiences, worth booking ahead',
    featuredExperienceIds: [String(exp.kidswalk._id), String(exp.coracle._id), String(exp.bylakuppe._id)],
    seeAllLabel: 'See everything available during your stay',
    showEventsSection: true,
  };

  const gallery = [
    ['photo-1611892440504-42a792e24d32', 'Villas', true], ['photo-1590490360182-c33d57733427', 'Villas'], ['photo-1590073242678-70ee3fc28f8e', 'Dining', true], ['photo-1517248135467-4c7edcad34c4', 'Dining'],
    ['photo-1544161515-4ab6ce6db874', 'Spa & Wellness', true], ['photo-1540555700478-4be289fbecef', 'Spa & Wellness'], ['photo-1447933601403-0c6688de566e', 'Estate & Grounds', true],
    ['photo-1592930092268-63d1acc4d1cf', 'Estate & Grounds'], ['photo-1571003123894-1f0594d2b5d9', 'Estate & Grounds'], ['photo-1578683010236-d716f9a3f461', 'Villas'],
  ].map(([p, category, featured]) => ({ photo: `https://images.unsplash.com/${p}?w=700&h=500&q=80&fit=crop`, category, featured: !!featured }));

  await PropertySettings.create({
    propertyId: PROPERTY_ID,
    propertyName: 'Evolve Back, Coorg',
    heroImage: IMG.hero,
    checkInTime: '14:00',
    checkOutTime: '11:00',
    mapsLink: 'https://maps.google.com/?q=Evolve+Back+Coorg',
    address: 'Galibeedu Village, Madikeri Taluk\nKodagu District, Karnataka 571201',
    story: [
      "Tucked into 300 acres of coffee and spice plantations in the hills of Coorg, Evolve Back Resort Coorg was built to feel like a coffee planter's estate — not a hotel dropped into one.",
      "Each villa opens onto its own private courtyard, and the estate's working coffee plantation still shapes the rhythm of the property: harvest season, the smell of drying beans, the naturalists who lead our morning walks.",
    ],
    rules: [
      { heading: 'Check-in / Check-out', body: 'Check-in from 2:00 PM. Check-out by 11:00 AM. Early check-in and late check-out are subject to availability.' },
      { heading: 'Pets', body: 'We regret that pets are not permitted on the property, with the exception of registered service animals.' },
      { heading: 'Smoking', body: 'All villas and indoor common areas are non-smoking. Designated smoking areas are available near the Bonfire Deck.' },
      { heading: 'Cancellation Policy', body: 'Free cancellation up to 7 days before arrival. Cancellations within 7 days are subject to a one-night charge.' },
      { heading: 'Children & Extra Beds', body: 'Children under 5 stay free. Extra beds are available on request for a nightly charge, subject to room capacity.' },
    ],
    facilities: [
      { name: 'Infinity Pool', timing: '6:00 AM – 8:00 PM', days: 'Daily', photo: 'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=500&q=80' },
      { name: 'Fitness Centre', timing: '5:30 AM – 9:00 PM', days: 'Daily', photo: 'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=500&q=80' },
      { name: 'Amrutha Spa', timing: '9:00 AM – 8:00 PM', days: 'Daily', photo: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=500&q=80' },
      { name: 'The Verandah Restaurant', timing: '7:00 AM – 10:30 PM', days: 'Daily', photo: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=500&q=80' },
      { name: 'Bonfire Deck', timing: '6:30 PM – 11:00 PM', days: 'Thu – Sun', photo: 'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?w=500&q=80' },
    ],
    // Left empty on purpose: seeded guests are fictional, and alert mail should only reach real
    // inboxes when someone configures them in Property Settings.
    notificationEmails: [],
    galleryCategories: ['Villas', 'Dining', 'Spa & Wellness', 'Estate & Grounds'],
    gallery,
    wifi: [
      { roomType: 'Coffee Cottage', network: 'EvolveBack-Coffee', password: 'coffee2026' },
      { roomType: 'Pool Villa', network: 'EvolveBack-Pool', password: 'poolvilla26' },
      { roomType: 'Villa', network: 'EvolveBack-Villa', password: 'villa2026' },
    ],
    directory: [
      { name: 'Front Desk', meta: '24 hours', phone: '+91 8272 265 000', style: 'normal' },
      { name: 'Housekeeping', meta: '6:00 AM – 11:00 PM', phone: '+91 8272 265 011', style: 'normal' },
      { name: 'Emergency / Security', meta: '24 hours', phone: '+91 8272 265 999', style: 'urgent' },
      { name: 'In-Room Dining', meta: '7:00 AM – 11:00 PM', phone: '+91 8272 265 022', style: 'normal' },
      { name: 'Amrutha Spa', meta: '9:00 AM – 8:00 PM', phone: '+91 8272 265 033', style: 'normal' },
      { name: 'Guest Relations (WhatsApp)', meta: 'Fastest response', phone: '+91 98765 43210', style: 'whatsapp' },
    ],
    guestApp: buildGuestAppBlob({ exp, spa, dining }),
    commsFromName: PROPERTY_NAME,
    comms,
  });
}

async function seedBanners(exp) {
  await AppBanner.insertMany([
    { title: 'Golden Hour on the Cauvery', description: 'Book a sunset coracle ride and save 15%.', imageUrl: IMG.coracle, bannerType: 'home-carousel', targetApp: 'guest-portal', actionType: 'experience', actionValue: String(exp.coracle._id), propertyId: PROPERTY_ID, isActive: true, priority: 3, buttonText: 'Book Now', tags: ['Offer'] },
    { title: 'Kids Love Coorg', description: 'A nature walk made for young explorers.', imageUrl: IMG.kids, bannerType: 'promotional', targetApp: 'guest-portal', actionType: 'experience', actionValue: String(exp.kidswalk._id), propertyId: PROPERTY_ID, isActive: true, priority: 2, buttonText: 'Learn More', tags: ['Family'] },
    { title: 'Monsoon at the Estate', description: 'The plantation is at its greenest — ask the concierge for a guided walk.', imageUrl: IMG.plantation, bannerType: 'seasonal', targetApp: 'guest-portal', actionType: 'none', propertyId: PROPERTY_ID, isActive: true, priority: 1, buttonText: 'Learn More', tags: ['Seasonal'] },
  ]);
}

// ---------------------------------------------------------------------------

export async function seedCatalog() {
  const exp = await seedExperiences();
  const spa = await seedSpa();
  const transport = await seedTransport();
  const dining = await seedDining();
  const dishes = await seedFbMenu();
  await seedPropertySettings({ exp: exp.byKey, spa, dining });
  await seedBanners(exp.byKey);
  return { exp: exp.byKey, discounts: exp.discounts, spa, transport, dining, dishes };
}
