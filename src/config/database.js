import mongoose from 'mongoose';
import { MONGODB_URI, MONGODB_DB_NAME } from './env.js';

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 2000; // 2s, 4s, 8s, 16s between the 5 attempts
const SERVER_SELECTION_TIMEOUT_MS = 10000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Never log the URI itself (it carries credentials) — host and database name are enough to diagnose.
const target = MONGODB_URI?.match(/@([^/?]+)/)?.[1] ?? 'unknown host';

const connectDB = async () => {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const conn = await mongoose.connect(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
      });

      console.log(`MongoDB Connected: ${conn.connection.host}`);
      return;
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        console.error(
          `[DB] FATAL: could not connect to MongoDB (${target}, database "${MONGODB_DB_NAME}") after ${MAX_ATTEMPTS} attempts. ` +
          `Last error: ${error.message}. Check that the database is up, MONGODB_URI(_DEV) is correct, and this host's IP is allowed on the cluster. Exiting.`
        );
        process.exit(1);
      }
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
      console.warn(`[DB] Connection attempt ${attempt}/${MAX_ATTEMPTS} to ${target} failed: ${error.message}. Retrying in ${delay / 1000}s…`);
      await sleep(delay);
    }
  }
};

export default connectDB;
