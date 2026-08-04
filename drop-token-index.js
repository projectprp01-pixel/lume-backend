import mongoose from 'mongoose';
import { MONGODB_URI, MONGODB_DB_NAME } from './src/config/env.js';

const dropUniqueIndex = async () => {
  try {
    await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB_NAME });
    console.log('📦 Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('guests');

    // Drop the unique index on bookingToken
    try {
      await collection.dropIndex('bookingToken_1');
      console.log('✅ Dropped unique index on bookingToken');
    } catch (err) {
      if (err.code === 27) {
        console.log('⚠️  Index does not exist (already dropped)');
      } else {
        throw err;
      }
    }

    // Recreate as non-unique index
    await collection.createIndex({ bookingToken: 1 }, { sparse: true });
    console.log('✅ Recreated bookingToken index (non-unique)');

    console.log('🎉 Migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

dropUniqueIndex();
