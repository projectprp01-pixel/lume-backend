import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// One deployment = one client. Nothing in here may fall back to another client's value:
// a required variable that's missing stops the server at boot (see the check at the bottom).

const list = (value) => (value || '').split(',').map((s) => s.trim()).filter(Boolean);

export const NODE_ENV = process.env.NODE_ENV;

export const MONGODB_URI = NODE_ENV === 'production'
  ? process.env.MONGODB_URI
  : process.env.MONGODB_URI_DEV;

// The database name lives in the URI path (mongodb+srv://host/<db>?...). Derived here so scripts
// and logs can still show it; the startup check below rejects a URI without one, because Mongo
// would otherwise silently fall back to a database called "test".
export const MONGODB_DB_NAME = MONGODB_URI?.match(/^mongodb(?:\+srv)?:\/\/[^/?]+\/([^/?]+)/)?.[1];

export const PORT = process.env.PORT || 3000;

export const JWT_SECRET = process.env.JWT_SECRET;

// ---- Property identity ----
export const PROPERTY_NAME = process.env.PROPERTY_NAME;

// ---- URLs & CORS ----
export const GUEST_APP_URL = process.env.GUEST_APP_URL;
export const DASHBOARD_APP_URL = process.env.DASHBOARD_APP_URL;
// Extra allowed origins (comma-separated, exact match) on top of GUEST_APP_URL / DASHBOARD_APP_URL.
export const CORS_ALLOWED_ORIGINS = list(process.env.CORS_ALLOWED_ORIGINS);

// ---- Payments ----
export const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
export const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

// ---- Email (Resend) ----
export const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Verified sender address on this client's Resend domain.
export const EMAIL_FROM = process.env.EMAIL_FROM;
// Comma-separated staff inbox(es) that receive booking/cancellation notification emails.
export const NOTIFY_EMAILS = list(process.env.NOTIFY_EMAILS);

// ---- AI concierge ----
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const AI_CONCIERGE_NAME = process.env.AI_CONCIERGE_NAME || 'Eva';
// Short description dropped into the concierge prompt, e.g. "a luxury resort in Coorg, India".
export const AI_PROPERTY_DESCRIPTION = process.env.AI_PROPERTY_DESCRIPTION || PROPERTY_NAME;

// ---- Media storage ----
export const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
export const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
export const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

// Cloudflare R2 (S3-compatible) — used for video uploads (Cloudinary bills video storage/bandwidth
// far more heavily than images, see the Experience Hub video-hosting discussion). R2_PUBLIC_URL is
// whatever serves the bucket's objects publicly — the bucket's r2.dev subdomain (with public access
// enabled) or a custom domain attached to the bucket. No trailing slash.
export const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
export const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
export const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

// ---- LeadSquared (optional integration — only this client's own account) ----
export const LSQ_API_HOST = process.env.LSQ_API_HOST || 'https://api.leadsquared.com';
export const LSQ_ACTIVITY_TYPE_ID = parseInt(process.env.LSQ_ACTIVITY_TYPE_ID);
export const LSQ_ACCESS_KEY = process.env.LSQ_ACCESS_KEY;
export const LSQ_SECRET_KEY = process.env.LSQ_SECRET_KEY;
// Exact dropdown label for this property in LeadSquared's mx_Custom_2 field.
export const LSQ_PROPERTY_NAME = process.env.LSQ_PROPERTY_NAME;

// ---- Startup validation ----
const REQUIRED = {
  [NODE_ENV === 'production' ? 'MONGODB_URI' : 'MONGODB_URI_DEV']: MONGODB_URI,
  JWT_SECRET,
  PROPERTY_NAME,
  GUEST_APP_URL,
  DASHBOARD_APP_URL,
};
const missing = Object.entries(REQUIRED).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  throw new Error(`Missing required environment variable(s): ${missing.join(', ')}. See .env.example.`);
}
if (!MONGODB_DB_NAME) {
  throw new Error(
    `${NODE_ENV === 'production' ? 'MONGODB_URI' : 'MONGODB_URI_DEV'} must include the database name in its path, e.g. mongodb+srv://host/my-db?retryWrites=true`
  );
}
