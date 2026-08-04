/**
 * One-time migration: confirm all free (totalAmount: 0) experience bookings
 * that were stuck in 'pending' status because they never went through payment.
 *
 * Run once:
 *   MONGODB_URI=<your-uri> node scripts/confirm-free-experience-bookings.js
 */

import mongoose from 'mongoose';
import ExperienceBooking from '../src/models/ExperienceBooking.model.js';
import { MONGODB_URI, MONGODB_DB_NAME } from '../src/config/env.js';

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB_NAME });
console.log('Connected to MongoDB');

const result = await ExperienceBooking.updateMany(
  { totalAmount: 0, bookingStatus: 'pending' },
  { $set: { bookingStatus: 'confirmed', paymentStatus: 'paid' } }
);

console.log(`Done. ${result.modifiedCount} free experience bookings confirmed.`);
await mongoose.disconnect();
