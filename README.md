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
