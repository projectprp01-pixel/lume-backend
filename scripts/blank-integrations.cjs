/**
 * Test-run safety net: forces every external-integration variable to an empty string so a dev/test
 * server cannot send real email, push to LeadSquared, call OpenAI/Razorpay, or write to R2/Cloudinary
 * — even though .env contains the real keys.
 *
 * Usage (from the backend root, any shell):
 *   node --require ./scripts/blank-integrations.cjs src/index.js
 *
 * Why a preload file rather than inline `VAR= node ...`: an empty-string env var is DELETED by
 * PowerShell/cmd, after which dotenv happily loads the real value from .env. Setting process.env here
 * runs before dotenv, and dotenv never overrides a variable that already exists (even an empty one),
 * so this behaves identically in bash, PowerShell and cmd.
 *
 * Database and auth settings (MONGODB_URI*, JWT_SECRET, PROPERTY_NAME, *_APP_URL) are left alone.
 */
const KEYS = [
  'RESEND_API_KEY', 'EMAIL_FROM', 'NOTIFY_EMAILS', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS',
  'LSQ_ACCESS_KEY', 'LSQ_SECRET_KEY', 'LSQ_EB_ALERT_EMAIL', 'LSQ_ADMIN_ALERT_EMAIL',
  'OPENAI_API_KEY',
  'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET',
  'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET',
  'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME',
  'KALEYRA_API_KEY', 'KALEYRA_ACCOUNT_SID', 'KALEYRA_SENDER_ID', 'KALEYRA_WA_FROM_NUMBER', 'KALEYRA_CALLBACK_URL',
];

for (const key of KEYS) process.env[key] = '';
console.log(`[blank-integrations] ${KEYS.length} integration variables forced empty for this process`);
