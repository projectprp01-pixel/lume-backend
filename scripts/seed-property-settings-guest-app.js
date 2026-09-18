/**
 * One-time dev seed: populate the 'default' property's PropertySettings.guestApp blob so the
 * Guest App builder (Home/Experiences/Dining/Requests tabs) isn't empty on first load — this
 * content used to live only as frontend seed data (src/data/seed/guestApp.ts), never persisted
 * anywhere, until GET/PUT /api/dashboard/property-settings/guest-app was added.
 *
 * Mirrors that seed file's defaults exactly. Skips entirely if the property already has a
 * non-empty guestApp blob, so it never clobbers real edits made through the UI.
 *
 * Run once:
 *   node scripts/seed-property-settings-guest-app.js
 */

import mongoose from 'mongoose';
import { MONGODB_URI, MONGODB_DB_NAME } from '../src/config/env.js';
import PropertySettings from '../src/models/PropertySettings.model.js';

const PROPERTY_ID = 'default';

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB_NAME });
console.log('Connected to', MONGODB_DB_NAME);

const existing = await PropertySettings.findOne({ propertyId: PROPERTY_ID });
if (existing?.guestApp && Object.keys(existing.guestApp).length > 0) {
  console.log(`PropertySettings.guestApp already populated for '${PROPERTY_ID}' — skipping.`);
  await mongoose.disconnect();
  process.exit(0);
}

const guestApp = {
  pageEnabled: { experiences: true, dining: true, requests: true },
  heroImage: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80',
  homeToggles: { quickActions: true, expCallout: true, todaysPlan: true, spotlight: true, events: true, gallery: true },
  quickActions: {
    prestay: { transport: true, wifi: false, directory: false, facilities: false, inRoomDining: false, directions: true },
    instay: { transport: true, wifi: true, directory: true, facilities: true, inRoomDining: true, directions: false },
  },
  expCalloutItems: [
    { id: 'cal-1', sourceType: 'experience', sourceId: '69e75fe5afc402f5210293f3', stage: 'both', badge: 'Kids special' },
    { id: 'cal-2', sourceType: 'spa', sourceId: '69e36ca6612b102e6cdc99cd', stage: 'instay' },
  ],
  spotlightItems: [
    {
      id: 'sp-1',
      title: 'Ayurveda Centre',
      body: "Our expert masseurs and masseuses harness the ancient secrets of the world's oldest healing system to rejuvenate, regenerate and revitalize you.",
      image: 'https://images.unsplash.com/photo-1600334129128-685c5582fd35?w=600&q=80',
      ctaTarget: 'Spa',
      stage: 'both',
    },
  ],
  eventItems: [
    {
      id: 'ev-1',
      title: 'Loyalty Programme',
      subtext: 'Get 20% off on all experiences',
      details: 'Enroll in our loyalty programme to unlock 20% off all bookable experiences for the rest of your stay.',
      image: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=400&q=80',
      activeFrom: '',
      activeUntil: '',
      targetLink: '',
    },
  ],
  expHero: {
    image: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=80',
    heading: 'Experiences',
    subtext: 'Everything available during your stay, ready to browse and book',
    ctaLabel: 'View All',
    ctaTarget: 'experience',
  },
  expSections: [
    {
      id: 1,
      heading: 'Ayurveda Centre',
      subtext: '',
      sourceType: 'spa',
      showViewAll: true,
      enabled: true,
      items: [
        { id: 'gaxp-1-1', sourceId: '69e36ca6612b102e6cdc99cd', badge: 'Popular' },
        { id: 'gaxp-1-2', sourceId: '69e36ca6612b102e6cdc99fd', badge: '' },
      ],
    },
    {
      id: 2,
      heading: 'Book Ahead',
      subtext: 'Everything available during your stay, ready to browse and book.',
      sourceType: 'experience',
      showViewAll: true,
      enabled: true,
      items: [{ id: 'gaxp-2-1', sourceId: '69e75fe5afc402f5210293f3', badge: 'Kids special' }],
    },
    {
      id: 3,
      heading: 'Complimentary',
      subtext: '',
      sourceType: 'experience',
      showViewAll: true,
      enabled: true,
      items: [{ id: 'gaxp-3-1', sourceId: '6a3a3c4d30adfb06d21118f8', badge: '' }],
    },
  ],
  diningHero: {
    prestay: {
      image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80',
      heading: 'Dining at Coorg',
      subtext: 'Explore our restaurants and dining experiences, ready to book once you arrive',
      ctaLabel: 'Explore Dining',
    },
    instay: {
      image: 'https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?w=800&q=80',
      eyebrow: 'In-Room Dining',
      heading: 'Breakfast in bed, Dinner by the window',
      ctaLabel: 'Order Now',
    },
  },
  inRoomOrderingEnabled: true,
  diningSections: [
    {
      id: 1,
      heading: 'Outdoor Dining',
      subtext: '',
      enabled: true,
      items: [
        { id: 'gad-1-1', restaurantId: '69e37b52612b102e6cdc9fdc' },
        { id: 'gad-1-2', restaurantId: '69e37bd5612b102e6cdca0e5' },
      ],
    },
    {
      id: 2,
      heading: 'Intimate Dining',
      subtext: 'Private settings, curated menus, and evenings made to remember',
      enabled: true,
      items: [
        { id: 'gad-2-1', restaurantId: '69e2399a612b102e6cdc42b0' },
        { id: 'gad-2-2', restaurantId: '69db9825046b8d5e58886aef' },
      ],
    },
  ],
  reqCategories: [
    {
      id: 'rc-1',
      name: 'Housekeeping',
      subtext: 'Room clean, turndown, extra towels',
      icon: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=100&q=80',
      services: [
        { service: 'Extra towels or toiletries', cost: 'Complimentary' },
        { service: 'Pillow or blanket preference', cost: 'Complimentary' },
        { service: 'Room cleaning / turndown service', cost: 'Complimentary' },
        { service: 'Maintenance (broken fixture, faulty light, leaking tap)', cost: 'Complimentary' },
        { service: 'Baby cot or extra bed', cost: 'Rs. 500 per extra bed' },
      ],
    },
    {
      id: 'rc-2',
      name: 'Refreshments',
      subtext: 'Water bottles, tea, coffee, ice',
      icon: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=100&q=80',
      services: [
        { service: 'Bottled water (still)', cost: 'Complimentary' },
        { service: 'Tea / coffee sachets restock', cost: 'Complimentary' },
        { service: 'Ice bucket refill', cost: 'Complimentary' },
        { service: 'Soft drinks / mixers', cost: 'Rs. 150 per bottle' },
      ],
    },
    {
      id: 'rc-3',
      name: 'Transport',
      subtext: 'Golf cart, cab, airport drop',
      icon: 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=100&q=80',
      services: [
        { service: 'Golf cart within property', cost: 'Complimentary' },
        { service: 'Local cab booking', cost: 'As per meter' },
        { service: 'Airport drop', cost: 'Rs. 2,500 one-way' },
      ],
    },
    {
      id: 'rc-4',
      name: 'Laundry',
      subtext: 'Pickup from your room',
      icon: 'https://images.unsplash.com/photo-1489274495757-95c7c837b101?w=100&q=80',
      services: [
        { service: 'Wash & fold, per kg', cost: 'Rs. 150' },
        { service: 'Dry cleaning, per item', cost: 'Rs. 300' },
        { service: 'Express service (same day)', cost: '+50% surcharge' },
      ],
    },
    {
      id: 'rc-5',
      name: 'Baby & kids',
      subtext: 'Cot, highchair, extra blanket',
      icon: 'https://images.unsplash.com/photo-1522771930-78848d9293e8?w=100&q=80',
      services: [
        { service: 'Baby cot', cost: 'Rs. 500 per stay' },
        { service: 'Highchair', cost: 'Complimentary' },
        { service: 'Extra blanket', cost: 'Complimentary' },
      ],
    },
    {
      id: 'rc-6',
      name: 'Special occasions',
      subtext: 'Decorations, cake, flowers',
      icon: 'https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=100&q=80',
      services: [
        { service: 'Room decoration', cost: 'Rs. 2,000 onwards' },
        { service: 'Celebration cake (1 kg)', cost: 'Rs. 1,200' },
        { service: 'Fresh flower arrangement', cost: 'Rs. 800 onwards' },
      ],
    },
  ],
};

await PropertySettings.findOneAndUpdate(
  { propertyId: PROPERTY_ID },
  { $set: { guestApp } },
  { upsert: true, new: true, setDefaultsOnInsert: true }
);
console.log(`Seeded guestApp CMS blob for '${PROPERTY_ID}'.`);

await mongoose.disconnect();
process.exit(0);
