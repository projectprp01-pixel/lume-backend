import mongoose from 'mongoose';

const wifiRowSchema = new mongoose.Schema({
  roomType: { type: String, default: '' },
  network: { type: String, default: '' },
  password: { type: String, default: '' },
}, { _id: false });

const directoryEntrySchema = new mongoose.Schema({
  name: { type: String, default: '' },
  meta: { type: String, default: '' },
  phone: { type: String, default: '' },
  style: { type: String, enum: ['normal', 'urgent', 'whatsapp'], default: 'normal' },
}, { _id: false });

const propertySettingsSchema = new mongoose.Schema({
  propertyId: { type: String, default: 'default', unique: true },
  checkInTime: { type: String, default: '14:00' },   // "HH:MM" 24-hour
  checkOutTime: { type: String, default: '11:00' },
  infantCategory: {
    enabled: { type: Boolean, default: true },
    ageMin:  { type: Number, default: 0 },
    ageMax:  { type: Number, default: 5 },
  },
  childCategory: {
    enabled: { type: Boolean, default: true },
    ageMin:  { type: Number, default: 6 },
    ageMax:  { type: Number, default: 11 },
  },
  notificationEmails: [{ type: String }],
  galleryCategories: { type: [String], default: ['Villas', 'Dining', 'Spa & Wellness', 'Estate & Grounds'] },
  gallery: [{
    photo: { type: String, required: true },
    category: { type: String, default: '' },
    featured: { type: Boolean, default: false },
  }],
  // WiFi credentials and staff/emergency directory shown to guests via the Guest App's WiFi
  // Details / Directory modals — plain arrays (no per-row _id) since the dashboard always edits
  // and saves the whole list at once, same convention as gallery above.
  wifi: { type: [wifiRowSchema], default: [] },
  directory: { type: [directoryEntrySchema], default: [] },
  // Guest App CMS config (page visibility, quick actions, spotlight/event cards, curated
  // experience/dining picks, request categories) — stored as one flexible blob rather than a
  // rigid sub-schema, per docs/backend-integration.md §4.7: this is content/config the dashboard
  // always reads and writes as a whole document, not transactional data queried piecemeal.
  guestApp: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

export default mongoose.model('PropertySettings', propertySettingsSchema);
