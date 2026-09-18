/**
 * One-time dev seed: populate the 'default' property's PropertySettings.gallery /
 * galleryCategories so the dashboard's Property Settings → Gallery tab (and the Guest App
 * builder's Photos preview, which now reads the same live data) isn't empty on first load —
 * these fields were previously only frontend seed data (src/data/seed/propertySettings.ts),
 * never persisted anywhere, until the real gallery endpoints were added.
 *
 * Skips entirely if the property already has any gallery photos, so it never clobbers real
 * edits made through the UI.
 *
 * Run once:
 *   node scripts/seed-property-settings-gallery.js
 */

import mongoose from 'mongoose';
import { MONGODB_URI, MONGODB_DB_NAME } from '../src/config/env.js';
import PropertySettings from '../src/models/PropertySettings.model.js';

const PROPERTY_ID = 'default';

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB_NAME });
console.log('Connected to', MONGODB_DB_NAME);

const existing = await PropertySettings.findOne({ propertyId: PROPERTY_ID });
if (existing?.gallery?.length) {
  console.log(`PropertySettings.gallery already has ${existing.gallery.length} photo(s) for '${PROPERTY_ID}' — skipping.`);
  await mongoose.disconnect();
  process.exit(0);
}

const galleryCategories = ['Villas', 'Dining', 'Spa & Wellness', 'Estate & Grounds'];
const gallery = [
  { photo: 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=700&h=500&q=80&fit=crop', category: 'Villas', featured: true },
  { photo: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=500&h=700&q=80&fit=crop', category: 'Villas' },
  { photo: 'https://images.unsplash.com/photo-1590073242678-70ee3fc28f8e?w=600&h=600&q=80&fit=crop', category: 'Dining', featured: true },
  { photo: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=700&h=460&q=80&fit=crop', category: 'Dining' },
  { photo: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=500&h=680&q=80&fit=crop', category: 'Spa & Wellness', featured: true },
  { photo: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=650&h=500&q=80&fit=crop', category: 'Spa & Wellness' },
  { photo: 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=700&h=470&q=80&fit=crop', category: 'Estate & Grounds', featured: true },
  { photo: 'https://images.unsplash.com/photo-1592930092268-63d1acc4d1cf?w=520&h=700&q=80&fit=crop', category: 'Estate & Grounds' },
  { photo: 'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=600&h=600&q=80&fit=crop', category: 'Estate & Grounds' },
  { photo: 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=700&h=500&q=80&fit=crop', category: 'Villas' },
];

await PropertySettings.findOneAndUpdate(
  { propertyId: PROPERTY_ID },
  { $set: { galleryCategories, gallery } },
  { upsert: true, new: true, setDefaultsOnInsert: true }
);
console.log(`Seeded ${gallery.length} gallery photos for '${PROPERTY_ID}'.`);

await mongoose.disconnect();
process.exit(0);
