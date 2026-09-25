// Read-only audit: does the database hold what the Analytics page needs?
// Run from /backend:  node scripts/analytics-audit.js [propertyId]
// Writes nothing — it only counts.
import mongoose from 'mongoose';
import { MONGODB_URI, MONGODB_DB_NAME } from '../src/config/env.js';
import ExperienceBooking from '../src/models/ExperienceBooking.model.js';
import SpaBooking from '../src/models/SpaBooking.model.js';
import TransportBooking from '../src/models/TransportBooking.model.js';
import DiningReservation from '../src/models/DiningReservation.model.js';
import Booking from '../src/models/Booking.model.js';
import CheckIn from '../src/models/CheckIn.model.js';
import Feedback from '../src/models/Feedback.model.js';
import ServiceRequest from '../src/models/ServiceRequest.model.js';
import AppBanner from '../src/models/AppBanner.model.js';

const propertyId = process.argv[2] || 'default';
// Same connection the app uses (the dev URI has no database name, so it must be pinned).
await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB_NAME });

const gateway = { paymentStatus: 'paid', razorpayPaymentId: { $exists: true, $nin: [null, ''] } };
const rows = [];
const add = (area, what, count, note = '') => rows.push({ area, what, count, note });

for (const [name, Model, extra] of [
  ['Experiences', ExperienceBooking, {}],
  ['Spa', SpaBooking, { propertyId }],
  ['Transport', TransportBooking, { propertyId }],
  ['Dining', DiningReservation, { propertyId }],
]) {
  add(`Revenue / ${name}`, 'paid (any way)', await Model.countDocuments({ ...extra, paymentStatus: 'paid' }));
  add(`Revenue / ${name}`, 'paid via gateway (counts)', await Model.countDocuments({ ...extra, ...gateway }));
  add(`Revenue / ${name}`, 'gateway-paid but NO paidAt', await Model.countDocuments({ ...extra, ...gateway, paidAt: { $in: [null] } }), 'these fall out of the daily chart');
}
const bookingFilter = propertyId !== 'default' ? { propertyId } : {};
add('Check-in', 'bookings', await Booking.countDocuments(bookingFilter));
add('Check-in', 'CheckIn documents', await CheckIn.countDocuments());
add('Feedback', 'reviews', await Feedback.countDocuments(bookingFilter));
add('Requests', 'requests', await ServiceRequest.countDocuments());
add('Requests', 'completed', await ServiceRequest.countDocuments({ status: 'Completed' }));
add('Requests', 'completed but NO completedAt', await ServiceRequest.countDocuments({ status: 'Completed', completedAt: null }), 'median resolve time skips these');
add('Spotlight', 'banners', await AppBanner.countDocuments({ propertyId }));
add('Spotlight', 'banners with impressions > 0', await AppBanner.countDocuments({ propertyId, impressionCount: { $gt: 0 } }), 'expected 0 until tracking ships');

console.table(rows);
await mongoose.disconnect();
