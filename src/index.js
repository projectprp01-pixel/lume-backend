// Load environment variables FIRST (before any other imports)
import { NODE_ENV, PORT, GUEST_APP_URL, DASHBOARD_APP_URL } from './config/env.js';

import express from 'express';
import cors from 'cors';
import connectDB from './config/database.js';

// Import routes (after dotenv is loaded)
import checkinRoutes from './routes/checkin.routes.js';
import guestRoutes from './routes/guest.routes.js';
import experienceRoutes from './routes/experience.routes.js';
import bookingRoutes from './routes/booking.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import authRoutes from './routes/auth.routes.js';
// Connect to MongoDB
connectDB();

// Initialize Express app
const app = express();

// Middleware
// CORS configuration - allows all Vercel URLs (*.vercel.app) for easier preview deployments
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow localhost in development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    // Allow all Vercel preview and production URLs
    if (origin.includes('.vercel.app')) {
      return callback(null, true);
    }

    // Allow all Lovable preview and production URLs
    if (origin.includes('.lovable.app') || origin.includes('.lovableproject.com')) {
      return callback(null, true);
    }

    // Allow all evolveback.com subdomains
    if (origin.includes('evolveback.com')) {
      return callback(null, true);
    }

    // Allow specific configured URLs
    const allowedOrigins = [
      GUEST_APP_URL,
      DASHBOARD_APP_URL
    ].filter(Boolean);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.log('CORS blocked origin:', origin, '| Allowed env vars:', GUEST_APP_URL, DASHBOARD_APP_URL);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
};

app.use(cors(corsOptions));
// Explicitly handle preflight requests for all routes
app.options('*', cors(corsOptions));

// Increase body parser limits for image uploads (10MB)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/checkin', checkinRoutes);
app.use('/api/guests', guestRoutes);
app.use('/api/experiences', experienceRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/payments', paymentRoutes);

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
});
