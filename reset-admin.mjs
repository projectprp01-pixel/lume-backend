import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { MONGODB_URI, MONGODB_DB_NAME } from './src/config/env.js';

const NEW_PASSWORD = 'Admin@1234';

async function run() {
  await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB_NAME });
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  const staff = await db.collection('staffs').findOne({ role: 'Admin' });

  if (!staff) {
    console.log('No admin staff found.');
    process.exit(1);
  }

  const hashed = await bcrypt.hash(NEW_PASSWORD, 10);
  await db.collection('staffs').updateOne(
    { _id: staff._id },
    { $set: { password: hashed } }
  );

  console.log('✅ Password reset successfully');
  console.log(`   Email:    ${staff.email}`);
  console.log(`   Password: ${NEW_PASSWORD}`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
