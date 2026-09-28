# Evolve Back Backend API repo

Backend API for managing Guest App (unified pre-stay and in-stay) and Hotel Dashboard applications.

## Features

- **Unified Guest App**: Single app that handles both pre-stay (check-in) and in-stay (guest portal) functionality
- **Check-in Flow**: Handle guest check-ins with ID uploads to Cloudinary (FREE!)
- **Guest Portal**: Manage experiences, bookings, and Razorpay payments
- **Hotel Dashboard**: Complete property management system
- **MongoDB Integration**: All data stored in MongoDB
- **Cloudinary**: Free image storage (no AWS needed!)
- **Razorpay**: Payment processing for experience bookings

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# MongoDB Connection (from MongoDB Atlas)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/evolve-back

# Server Configuration
PORT=3000
NODE_ENV=development

# JWT Secret (generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_SECRET=your_secret_key_here

# Cloudinary Configuration (FREE! - from cloudinary.com)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Razorpay Configuration (from razorpay.com)
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=your_razorpay_secret

# Frontend URLs (for CORS)
GUEST_APP_URL=http://localhost:5173
DASHBOARD_APP_URL=http://localhost:5175
```

### 3. Start the Server

Development mode with auto-reload:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

The server will start on `http://localhost:3000`

## Free Services Setup

### MongoDB Atlas (FREE)
1. Sign up at https://www.mongodb.com/cloud/atlas
2. Create M0 FREE cluster (512 MB)
3. Get connection string

### Cloudinary (FREE)
1. Sign up at https://cloudinary.com/users/register/free
2. Get Cloud Name, API Key, and API Secret
3. FREE tier: 25 GB storage + 25 GB bandwidth/month

**Why Cloudinary?**
- ✅ Easier than AWS S3
- ✅ No credit card required
- ✅ FREE forever (25GB storage)
- ✅ Automatic image optimization
- ✅ Secure URLs included

### Razorpay (FREE Test Mode)
1. Sign up at https://razorpay.com/
2. Use Test Mode for development
3. 2% fee only on live transactions

## API Endpoints

### Check-in Flow

- `GET /api/checkin/booking/:token` - Get booking details by token
- `PUT /api/checkin/consent/:guestId` - Update guest consent
- `POST /api/checkin/initialize` - Initialize check-in session
- `POST /api/checkin/:checkInId/upload-id` - Upload guest ID documents (to Cloudinary)
- `POST /api/checkin/:checkInId/complete` - Complete check-in
- `GET /api/checkin/:checkInId/status` - Get check-in status

### Guest Portal

#### Experiences
- `GET /api/experiences` - Get all experiences (with filters)
- `GET /api/experiences/spotlight` - Get spotlight experiences
- `GET /api/experiences/crafted` - Get crafted experiences
- `GET /api/experiences/:id` - Get experience details
- `GET /api/experiences/:id/slots` - Get available time slots

#### Bookings
- `POST /api/bookings/create` - Create new booking
- `GET /api/bookings/guest/:guestId` - Get guest bookings
- `GET /api/bookings/:id` - Get booking details
- `PUT /api/bookings/:id/payment` - Update payment status
- `PUT /api/bookings/:id/cancel` - Cancel booking

#### Payments (Razorpay)
- `POST /api/payments/create-order` - Create Razorpay order
- `POST /api/payments/verify` - Verify payment
- `POST /api/payments/webhook` - Razorpay webhook
- `GET /api/payments/status/:bookingId` - Get payment status

#### Guest
- `POST /api/guests/auth` - Authenticate/create guest
- `GET /api/guests/:id` - Get guest details
- `PUT /api/guests/:id/preferences` - Update preferences
- `GET /api/guests/restaurants/all` - Get restaurants
- `GET /api/guests/banners/active` - Get active banners

### Hotel Dashboard

#### Check-in Hub
- `GET /api/dashboard/checkin/arrivals` - Get daily arrivals
- `GET /api/dashboard/checkin/submitted` - Get submitted check-ins
- `PUT /api/dashboard/checkin/:checkInId/review` - Approve/reject check-in

#### Experience Hub
- `GET /api/dashboard/experiences/bookings` - Get experience bookings
- `POST /api/dashboard/experiences/bookings/manual` - Create manual booking
- `POST /api/dashboard/experiences` - Create experience
- `PUT /api/dashboard/experiences/:id` - Update experience
- `DELETE /api/dashboard/experiences/:id` - Delete experience

#### Guest Management
- `GET /api/dashboard/guests` - Get all guests
- `POST /api/dashboard/guests` - Add guest
- `POST /api/dashboard/guests/bulk-import` - Bulk import guests

#### Staff Management
- `GET /api/dashboard/staff` - Get all staff
- `POST /api/dashboard/staff` - Add staff
- `PUT /api/dashboard/staff/:id` - Update staff

#### Restaurant Management
- `GET /api/dashboard/restaurants` - Get all restaurants
- `POST /api/dashboard/restaurants` - Create restaurant
- `PUT /api/dashboard/restaurants/:id` - Update restaurant

#### App Banners
- `GET /api/dashboard/banners` - Get all banners
- `POST /api/dashboard/banners` - Create banner
- `PUT /api/dashboard/banners/:id` - Update banner

#### Analytics
- `GET /api/dashboard/analytics` - Get dashboard analytics

## Data Models

- **Guest** - Guest profiles with consent tracking
- **Booking** - Hotel bookings from PMS
- **CheckIn** - Check-in sessions with ID uploads
- **Experience** - Available experiences with pricing
- **ExperienceBooking** - Guest experience bookings
- **Restaurant** - Restaurant listings with menus
- **Staff** - Hotel staff with permissions
- **AppBanner** - App banners and promotions

## Testing the API

### Using cURL

```bash
# Health check
curl http://localhost:3000/health

# Get experiences
curl http://localhost:3000/api/experiences

# Get daily arrivals
curl http://localhost:3000/api/dashboard/checkin/arrivals?date=2025-10-28
```

### Using Postman

Import the endpoints from this README or test directly.

## Error Handling

All endpoints return responses in this format:

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful"
}
```

**Error:**
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error (development only)"
}
```

## Security

- CORS enabled for specified frontend URLs
- JWT for authentication (to be implemented)
- Cloudinary secure URLs with transformations
- Razorpay signature verification
- Input validation on all endpoints

## New Client Onboarding

LUME is multi-tenant by convention: **backend** and **property-dashboard** are the only two
active apps (`guest/` and `property/` in the monorepo are old and unused), and every client gets
their own MongoDB database and R2 bucket — not their own cluster. A new client's database is
just a new database name on the existing Atlas cluster (Mongo creates it automatically on first
write); no cluster provisioning needed. R2, on the other hand, is one bucket per client, created
manually per client. `scripts/onboard-client.js` / `scripts/offboard-client.js` automate the parts
that can be automated (local env files, the Mongo database); everything else below is a manual
step on an external dashboard.

### Onboarding — step by step

1. **Back up your current `backend/.env`** before you do anything else, in case you overwrite it
   later in this process:
   ```bash
   cp backend/.env backend/.env.bak
   ```
2. **Generate the scaffold**, from `backend/`:
   ```bash
   npm run onboard -- <slug> "<Display Name>"
   # e.g.
   npm run onboard -- leela "The Leela Palace Bengaluru"
   ```
   `<slug>` becomes the Mongo database name and the dashboard's session-cookie prefix — lowercase
   letters, digits and hyphens only. This creates `clients/<slug>/` at the repo root (gitignored):
   `backend.env`, `property-dashboard.env.local`, `CHECKLIST.md`. It auto-fills the property name,
   a Mongo URI pointing at a new `<slug>` / `<slug>-dev` database on your existing cluster, a fresh
   `JWT_SECRET`, a unique `SESSION_COOKIE_NAME`, and reuses your `R2_ACCOUNT_ID`. Everything else
   is left blank for the steps below.
3. **Open `clients/<slug>/CHECKLIST.md`** — it lists exactly what's left, matching steps 4–8 here.
4. **Create the client's Cloudflare R2 bucket** (Cloudflare dashboard → R2):
   - New bucket, suggested name `lume-<slug>`.
   - New API token scoped to just that bucket (Object Read & Write) — don't reuse another
     client's token.
   - Enable public access (r2.dev subdomain, or a custom domain).
   - Fill `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` into
     `clients/<slug>/backend.env`.
5. **Create the client's Cloudinary account/credentials** and fill `CLOUDINARY_CLOUD_NAME`,
   `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
6. **Verify the client's sending domain in Resend**, create a scoped API key, and fill
   `RESEND_API_KEY`, `EMAIL_FROM`, `NOTIFY_EMAILS`.
7. **Get an OpenAI API key** for this client's AI concierge and fill `OPENAI_API_KEY` (optionally
   customize `AI_CONCIERGE_NAME` / `AI_PROPERTY_DESCRIPTION`).
8. **Get the client's own Razorpay keys** and fill `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`. Fill
   the `LSQ_*` LeadSquared vars too, only if this client uses LSQ — otherwise leave them blank.
9. **Copy the scaffold into place** now that steps 4–8 are filled in:
   ```bash
   cp clients/leela/backend.env backend/.env
   cp clients/leela/property-dashboard.env.local property-dashboard/.env.local
   ```
   (Or, for a Railway/Vercel deploy instead of local: paste each file's contents into that
   service's Variables tab.)
10. **Deploy** backend and property-dashboard as separate Railway/Vercel services.
11. **Fill in the URL variables that only exist after step 10** — `GUEST_APP_URL`,
    `DASHBOARD_APP_URL`, `CORS_ALLOWED_ORIGINS` (backend), `BACKEND_URL` (property-dashboard) —
    then redeploy (property-dashboard inlines `NEXT_PUBLIC_*` at build time, so it needs a rebuild).

### Offboarding — step by step

Use this to undo a mistaken onboard. How far you need to go depends on how far through the steps
above you got before realizing the mistake.

## Deployment

### Free Hosting Options

**Railway (Recommended)**
1. Sign up at https://railway.app/
2. Connect GitHub repo
3. Add environment variables
4. Auto-deploy!

**Render**
1. Sign up at https://render.com/
2. Create Web Service
3. Add environment variables
4. Deploy

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use strong JWT secret
- [ ] Use MongoDB Atlas production cluster
- [ ] Set up Cloudinary production account
- [ ] Switch to Razorpay live mode
- [ ] Configure CORS for production URLs
- [ ] Set up error logging (Sentry)
- [ ] Enable HTTPS
- [ ] Set up monitoring

## Cost Breakdown

**Development (FREE):**
- MongoDB: $0 (M0 free tier)
- Cloudinary: $0 (25GB free)
- Razorpay: $0 (test mode)
- Railway: $0 ($5 credit/month)
**Total: $0/month** ✅

**Production (Low traffic):**
- MongoDB: $0 (M0 sufficient)
- Cloudinary: $0 (free tier)
- Razorpay: 2% per transaction
- Railway: ~$5-10/month
**Total: ~$5-10/month + transaction fees**

## Support

For detailed setup instructions, see:
- **START_HERE.md** - Quick start guide
- **FREE_SETUP_GUIDE.md** - Complete free setup
- **../README.md** - Main documentation

## License

Proprietary - Evolve Back Resorts

## Known gaps / TODO

- **Legacy `/api/bookings/create` does not set `mainStayBookingId`.** Bookings made through it are missing
  from Stay Activity and the Checkout folio, which match on that field. This is the third round of
  the same fix (transport, then guest Experience/Spa/Dining, now this one). Deferred on purpose; fix is one line in `src/controllers/booking.controller.js`
  (`mainStayBookingId: stayId`, from `resolveGuestStayId`). It may also be simplest to retire this router
  if no client uses it — `POST /api/experiences/bookings` supersedes it.
- Existing transport bookings that predate the mainStayBookingId fix can be repaired with
  `node scripts/backfill-transport-main-stay.js` (dry run) then `--apply`.
