import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const NODE_ENV = process.env.NODE_ENV;

export const MONGODB_URI = NODE_ENV === 'production'
  ? process.env.MONGODB_URI
  : process.env.MONGODB_URI_DEV;
if (!MONGODB_URI) {
  throw new Error('MONGODB_URI environment variable is required');
}

// MONGODB_URI_DEV has no database name in its path, so it must be pinned explicitly.
export const MONGODB_DB_NAME = 'evolve-back';

export const PORT = process.env.PORT || 3000;

export const JWT_SECRET = process.env.JWT_SECRET;

export const GUEST_APP_URL = process.env.GUEST_APP_URL;
export const DASHBOARD_APP_URL = process.env.DASHBOARD_APP_URL;

export const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
export const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

export const RESEND_API_KEY = process.env.RESEND_API_KEY;

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
export const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
export const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

export const LSQ_API_HOST = process.env.LSQ_API_HOST || 'https://api.leadsquared.com';
export const LSQ_ACTIVITY_TYPE_ID = parseInt(process.env.LSQ_ACTIVITY_TYPE_ID) || 277;
export const LSQ_ACCESS_KEY = process.env.LSQ_ACCESS_KEY;
export const LSQ_SECRET_KEY = process.env.LSQ_SECRET_KEY;

const PROPERTY_APP_URLS_DEFAULT = {
  default: 'https://webappcoorg.evolveback.com',
  kabini: 'https://webappkabini.evolveback.com',
  hampi: 'https://webapphampi.evolveback.com',
};
let propertyAppUrls = PROPERTY_APP_URLS_DEFAULT;
try {
  if (process.env.PROPERTY_APP_URLS) propertyAppUrls = JSON.parse(process.env.PROPERTY_APP_URLS);
} catch {}
export const PROPERTY_APP_URLS = propertyAppUrls;
