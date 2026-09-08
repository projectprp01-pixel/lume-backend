import express from 'express';
import upload from '../middleware/upload.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { resetStaffPassword } from '../controllers/auth.controller.js';

// ==================== CHECK-IN HUB ====================
import {
  getDailyArrivals,
  getAllBookings,
  getSubmittedCheckIns,
  reviewCheckIn,
} from '../controllers/dashboard/checkin.controller.js';

// ==================== EXPERIENCE HUB ====================
import {
  getAllExperiences,
  getExperienceBookings,
  createManualBooking,
  cancelExperienceBooking,
  createExperience,
  updateExperience,
  deleteExperience,
  uploadExperienceImage,
} from '../controllers/dashboard/experience.controller.js';

// ==================== GUEST MANAGEMENT ====================
import {
  getAllGuests,
  getGuestByBookingId,
  addGuest,
  bulkImportGuests,
  reviewGuestID,
  updateGuest,
  deleteGuest,
} from '../controllers/dashboard/guest.controller.js';

// ==================== STAFF MANAGEMENT ====================
import {
  getAllStaff,
  addStaff,
  updateStaff,
  deleteStaff,
} from '../controllers/dashboard/staff.controller.js';

// ==================== RESTAURANT/DINING HUB ====================
import {
  getAllRestaurants,
  createRestaurant,
  updateRestaurant,
  deleteRestaurant,
  uploadDiningImage,
  getDiningReservations,
  cancelDiningReservation,
  createManualDiningReservation,
} from '../controllers/dashboard/restaurant.controller.js';

// ==================== APP BANNERS ====================
import {
  getAllBanners,
  uploadBannerImage,
  createBanner,
  updateBanner,
  deleteBanner,
} from '../controllers/dashboard/banner.controller.js';

// ==================== SPA HUB ====================
import {
  getAllSpaFacilities,
  createSpaFacility,
  updateSpaFacility,
  deleteSpaFacility,
  getSpaBookings,
  createManualSpaBooking,
  updateSpaBookingStatus,
  updateSpaBookingPayment,
  assignSpaBookingRoom,
  uploadSpaImage,
} from '../controllers/dashboard/spa.controller.js';

// ==================== ANALYTICS ====================
import { getAnalytics } from '../controllers/dashboard/analytics.controller.js';

// ==================== SERVICE REQUESTS ====================
import {
  getAllRequests,
  updateRequestStatus,
  addRequestReply,
} from '../controllers/dashboard/serviceRequest.controller.js';

// ==================== TRANSPORT HUB ====================
import {
  getTransportSettings,
  updateTransportSettings,
  getTransportBookings,
  cancelTransportBooking,
  createManualTransportBooking,
  getTransportUnseenCount,
  markTransportBookingsSeen,
} from '../controllers/dashboard/transport.controller.js';

// ==================== PROPERTY SETTINGS ====================
import {
  getPropertySettings,
  updatePropertySettings,
} from '../controllers/dashboard/propertySettings.controller.js';

// ==================== GUEST NOTIFICATIONS ====================
import { createGuestNotification } from '../controllers/dashboard/notification.controller.js';

const router = express.Router();

// All dashboard routes require a valid JWT
router.use(authenticate);

// ==================== CHECK-IN HUB ====================
router.get('/checkin/arrivals', getDailyArrivals);
router.get('/checkin/bookings', getAllBookings); // Get all bookings (not filtered by date)
router.get('/checkin/submitted', getSubmittedCheckIns);
router.put('/checkin/:checkInId/review', reviewCheckIn);

// ==================== EXPERIENCE HUB ====================
router.get('/experiences', getAllExperiences);
router.get('/experiences/bookings', getExperienceBookings);
router.post('/experiences/bookings/manual', createManualBooking);
router.put('/experiences/bookings/:bookingId/cancel', cancelExperienceBooking);
router.post('/experiences/upload-image', upload.single('image'), uploadExperienceImage);
router.post('/experiences', createExperience);
router.put('/experiences/:id', updateExperience);
router.delete('/experiences/:id', deleteExperience);

// ==================== GUEST MANAGEMENT ====================
router.get('/guests', getAllGuests);
router.get('/guests/by-booking/:bookingId', getGuestByBookingId);
router.post('/guests', addGuest);
router.post('/guests/bulk-import', bulkImportGuests);
router.put('/guests/:guestId/review', reviewGuestID);
router.put('/guests/:guestId', updateGuest);
router.delete('/guests/:guestId', deleteGuest);

// ==================== STAFF MANAGEMENT ====================
router.get('/staff', getAllStaff);
router.post('/staff', requireRole('Admin'), addStaff);
router.put('/staff/:id/password', requireRole('Admin'), resetStaffPassword);
router.put('/staff/:id', requireRole('Admin'), updateStaff);
router.delete('/staff/:id', requireRole('Admin'), deleteStaff);

// ==================== RESTAURANT/DINING HUB ====================
router.post('/restaurants/upload-image', upload.single('image'), uploadDiningImage);
router.get('/restaurants/reservations', getDiningReservations);
router.post('/restaurants/reservations', createManualDiningReservation);
router.put('/restaurants/reservations/:id/cancel', cancelDiningReservation);
router.get('/restaurants', getAllRestaurants);
router.post('/restaurants', createRestaurant);
router.put('/restaurants/:id', updateRestaurant);
router.delete('/restaurants/:id', deleteRestaurant);

// ==================== APP BANNERS ====================
router.get('/banners', getAllBanners);
router.post('/banners/upload', upload.single('image'), uploadBannerImage);
router.post('/banners', createBanner);
router.put('/banners/:id', updateBanner);
router.delete('/banners/:id', deleteBanner);

// ==================== SPA HUB ====================
router.post('/spa/upload-image', upload.single('image'), uploadSpaImage);
router.get('/spa', getAllSpaFacilities);
router.post('/spa', createSpaFacility);
router.put('/spa/:id', updateSpaFacility);
router.delete('/spa/:id', deleteSpaFacility);
router.get('/spa/bookings', getSpaBookings);
router.post('/spa/bookings', createManualSpaBooking);
router.put('/spa/bookings/:id/status', updateSpaBookingStatus);
router.put('/spa/bookings/:id/payment', updateSpaBookingPayment);
router.put('/spa/bookings/:id/room', assignSpaBookingRoom);

// ==================== ANALYTICS ====================
router.get('/analytics', getAnalytics);

// ==================== SERVICE REQUESTS ====================
router.get('/requests', getAllRequests);
router.put('/requests/:id/status', updateRequestStatus);
router.post('/requests/:id/reply', addRequestReply);

// ==================== TRANSPORT HUB ====================
router.get('/transport', getTransportSettings);
router.put('/transport', updateTransportSettings);
router.get('/transport/bookings/unseen-count', getTransportUnseenCount);
router.put('/transport/bookings/mark-seen', markTransportBookingsSeen);
router.get('/transport/bookings', getTransportBookings);
router.post('/transport/bookings/manual', createManualTransportBooking);
router.put('/transport/bookings/:id/cancel', cancelTransportBooking);

// ==================== PROPERTY SETTINGS ====================
router.get('/property-settings', getPropertySettings);
router.put('/property-settings', updatePropertySettings);

// ==================== GUEST NOTIFICATIONS ====================
router.post('/notifications', createGuestNotification);

export default router;
