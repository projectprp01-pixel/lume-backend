import express from 'express';
import upload from '../middleware/upload.js';
import uploadVideo from '../middleware/uploadVideo.js';
import { authenticate, requireTier } from '../middleware/auth.js';
import { resetStaffPassword } from '../controllers/auth.controller.js';
import { lookupMainStayBooking, getStayActivity } from '../controllers/dashboard/mainStay.controller.js';

// ==================== CHECK-IN HUB ====================
import {
  getDailyArrivals,
  getAllBookings,
  getSubmittedCheckIns,
  reviewCheckIn,
  reviewGuestDocument,
  assignCheckInRoom,
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
  uploadExperienceVideo,
  setExperienceBookingPayment,
  assignExperienceBookingRoom,
  updateExperienceBlockDates,
  getExperienceDiscounts,
  createExperienceDiscount,
  updateExperienceDiscount,
  deleteExperienceDiscount,
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
  getStaffLog,
} from '../controllers/dashboard/staff.controller.js';
import {
  getAllDepartments,
  createDepartment,
  updateDepartment,
  toggleDepartmentAccess,
  deleteDepartment,
  getMyAccess,
} from '../controllers/dashboard/department.controller.js';

// ==================== RESTAURANT/DINING HUB ====================
import {
  getAllRestaurants,
  createRestaurant,
  updateRestaurant,
  deleteRestaurant,
  uploadDiningImage,
  uploadDiningMenuFile,
  updateRestaurantBlockDates,
  getDiningReservations,
  cancelDiningReservation,
  createManualDiningReservation,
  updateDiningReservationPayment,
  assignDiningReservationRoom,
} from '../controllers/dashboard/restaurant.controller.js';

// ==================== F&B IN-ROOM ORDERING ====================
import {
  getFbCategories,
  createFbCategory,
  updateFbCategory,
  deleteFbCategory,
  uploadFbCategoryImage,
  getFbSubcategories,
  createFbSubcategory,
  updateFbSubcategory,
  deleteFbSubcategory,
  getFbDishes,
  createFbDish,
  updateFbDish,
  deleteFbDish,
  uploadFbDishImage,
  bulkImportFbDishes,
} from '../controllers/dashboard/fbMenu.controller.js';
import {
  getFbOrders,
  updateFbOrderStage,
  getFbOrderingSettings,
  updateFbOrderingSettings,
} from '../controllers/dashboard/fbOrders.controller.js';

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
  getRequestDepartments,
  acceptRequest,
  completeRequest,
  rerouteRequest,
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
  uploadTransportImage,
  addTransportVehicle,
  updateTransportVehicle,
  deleteTransportVehicle,
  updateTransportOffering,
  updateTransportOfferingBlockDates,
  getTransportHubBookings,
  createTransportHubBooking,
  setTransportHubBookingPayment,
  assignTransportHubBookingRoom,
  cancelTransportHubBooking,
} from '../controllers/dashboard/transport.controller.js';

// ==================== PROPERTY SETTINGS ====================
import {
  getPropertySettings,
  updatePropertySettings,
  getGuestAppSettings,
  updateGuestAppSettings,
  uploadPropertySettingsImage,
} from '../controllers/dashboard/propertySettings.controller.js';

// ==================== COMMS HUB ====================
import { sendCommsTestEmail } from '../controllers/dashboard/comms.controller.js';

// ==================== GUEST NOTIFICATIONS ====================
import { createGuestNotification } from '../controllers/dashboard/notification.controller.js';

const router = express.Router();

// All dashboard routes require a valid JWT
router.use(authenticate);

// ==================== SHARED: STAY LOOKUP ====================
// Used by every hub's "Add Booking" dialog to verify/preview a staff-entered Booking ID
// before creating a Spa/Transport/Experience/Dining booking linked to it.
router.get('/bookings/lookup', lookupMainStayBooking);
// "Everything about this guest's stay, one fetch" — see getStayActivity's doc comment.
router.get('/bookings/:bookingId/activity', getStayActivity);

// ==================== CHECK-IN HUB ====================
router.get('/checkin/arrivals', getDailyArrivals);
router.get('/checkin/bookings', getAllBookings); // Get all bookings (not filtered by date)
router.get('/checkin/submitted', getSubmittedCheckIns);
router.put('/checkin/:checkInId/review', reviewCheckIn);
router.put('/checkin/:checkInId/guest/:guestNumber/review', reviewGuestDocument);
router.put('/checkin/bookings/:bookingId/room', assignCheckInRoom);

// ==================== EXPERIENCE HUB ====================
router.get('/experiences', getAllExperiences);
router.get('/experiences/discounts', getExperienceDiscounts);
router.post('/experiences/discounts', createExperienceDiscount);
router.put('/experiences/discounts/:id', updateExperienceDiscount);
router.delete('/experiences/discounts/:id', deleteExperienceDiscount);
router.get('/experiences/bookings', getExperienceBookings);
router.post('/experiences/bookings/manual', createManualBooking);
router.put('/experiences/bookings/:bookingId/cancel', cancelExperienceBooking);
router.put('/experiences/bookings/:id/payment', setExperienceBookingPayment);
router.put('/experiences/bookings/:id/room', assignExperienceBookingRoom);
router.post('/experiences/upload-image', upload.single('image'), uploadExperienceImage);
router.post('/experiences/upload-video', uploadVideo.single('video'), uploadExperienceVideo);
router.post('/experiences', createExperience);
router.put('/experiences/:id', updateExperience);
router.put('/experiences/:id/block-dates', updateExperienceBlockDates);
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
// Staff Management itself is only accessible to Admin and GM — no other role can
// open this page at all, regardless of department (Staff Management PRD). Route-level
// requireTier gates who can reach these endpoints; canManageTier() in the controller
// enforces the finer "who can manage whom" rule per row. Staff Log is stricter still —
// Admin only, GM included in the lockout (PRD Step 5).
router.get('/staff', requireTier('Admin', 'GM'), getAllStaff);
router.post('/staff', requireTier('Admin', 'GM'), addStaff);
router.put('/staff/:id/password', requireTier('Admin', 'GM'), resetStaffPassword);
router.put('/staff/:id', requireTier('Admin', 'GM'), updateStaff);
router.delete('/staff/:id', requireTier('Admin', 'GM'), deleteStaff);
router.get('/staff/log', requireTier('Admin'), getStaffLog);
// Any authenticated staff member — not gated to Admin/GM — since this only ever
// returns the caller's OWN department/role slice of the matrix, not the roster or the
// full matrix (see getMyAccess's doc comment).
router.get('/staff/me/access', getMyAccess);

// ==================== DEPARTMENTS & ROLES ====================
router.get('/departments', requireTier('Admin', 'GM'), getAllDepartments);
router.post('/departments', requireTier('Admin', 'GM'), createDepartment);
router.put('/departments/:id', requireTier('Admin', 'GM'), updateDepartment);
router.put('/departments/:id/access', requireTier('Admin', 'GM'), toggleDepartmentAccess);
router.delete('/departments/:id', requireTier('Admin', 'GM'), deleteDepartment);

// ==================== RESTAURANT/DINING HUB ====================
router.post('/restaurants/upload-image', upload.single('image'), uploadDiningImage);
router.post('/restaurants/upload-menu', upload.single('file'), uploadDiningMenuFile);
router.get('/restaurants/reservations', getDiningReservations);
router.post('/restaurants/reservations', createManualDiningReservation);
router.put('/restaurants/reservations/:id/cancel', cancelDiningReservation);
router.put('/restaurants/reservations/:id/payment', updateDiningReservationPayment);
router.put('/restaurants/reservations/:id/room', assignDiningReservationRoom);
router.get('/restaurants', getAllRestaurants);
router.post('/restaurants', createRestaurant);
router.put('/restaurants/:id', updateRestaurant);
router.put('/restaurants/:id/block-dates', updateRestaurantBlockDates);
router.delete('/restaurants/:id', deleteRestaurant);

// ==================== F&B IN-ROOM ORDERING ====================
router.get('/fb-menu/categories', getFbCategories);
router.post('/fb-menu/categories', createFbCategory);
router.post('/fb-menu/categories/upload-image', upload.single('image'), uploadFbCategoryImage);
router.put('/fb-menu/categories/:id', updateFbCategory);
router.delete('/fb-menu/categories/:id', deleteFbCategory);

router.get('/fb-menu/subcategories', getFbSubcategories);
router.post('/fb-menu/subcategories', createFbSubcategory);
router.put('/fb-menu/subcategories/:id', updateFbSubcategory);
router.delete('/fb-menu/subcategories/:id', deleteFbSubcategory);

router.get('/fb-menu/dishes', getFbDishes);
router.post('/fb-menu/dishes', createFbDish);
router.post('/fb-menu/dishes/upload-image', upload.single('image'), uploadFbDishImage);
router.post('/fb-menu/dishes/bulk-import', bulkImportFbDishes);
router.put('/fb-menu/dishes/:id', updateFbDish);
router.delete('/fb-menu/dishes/:id', deleteFbDish);

router.get('/fb-orders', getFbOrders);
router.put('/fb-orders/:id/stage', updateFbOrderStage);
router.get('/fb-ordering-settings', getFbOrderingSettings);
router.put('/fb-ordering-settings', updateFbOrderingSettings);

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
// Visibility and every action are enforced per-request from the JWT identity (see
// utils/requestAccess.js) — there is deliberately no free-form "set status" endpoint.
router.get('/requests', getAllRequests);
router.get('/requests/departments', getRequestDepartments);
router.put('/requests/:id/accept', acceptRequest);
router.put('/requests/:id/complete', completeRequest);
router.put('/requests/:id/department', rerouteRequest);
router.post('/requests/:id/reply', addRequestReply);

// ==================== TRANSPORT HUB ====================
router.get('/transport', getTransportSettings);
router.put('/transport', updateTransportSettings);
router.get('/transport/bookings/unseen-count', getTransportUnseenCount);
router.put('/transport/bookings/mark-seen', markTransportBookingsSeen);
router.get('/transport/bookings', getTransportBookings);
router.post('/transport/bookings/manual', createManualTransportBooking);
router.put('/transport/bookings/:id/cancel', cancelTransportBooking);

// ---- Transport Hub: fleet, offerings, hub bookings (additive) ----
router.post('/transport/hub/upload-image', upload.single('image'), uploadTransportImage);
router.post('/transport/hub/vehicles', addTransportVehicle);
router.put('/transport/hub/vehicles/:vehicleId', updateTransportVehicle);
router.delete('/transport/hub/vehicles/:vehicleId', deleteTransportVehicle);
router.put('/transport/hub/offerings/:slot', updateTransportOffering);
router.put('/transport/hub/offerings/:slot/block-dates', updateTransportOfferingBlockDates);
router.get('/transport/hub/bookings', getTransportHubBookings);
router.post('/transport/hub/bookings', createTransportHubBooking);
router.put('/transport/hub/bookings/:id/payment', setTransportHubBookingPayment);
router.put('/transport/hub/bookings/:id/room', assignTransportHubBookingRoom);
router.put('/transport/hub/bookings/:id/cancel', cancelTransportHubBooking);

// ==================== PROPERTY SETTINGS ====================
router.get('/property-settings', getPropertySettings);
router.put('/property-settings', updatePropertySettings);
router.post('/property-settings/upload-image', upload.single('image'), uploadPropertySettingsImage);
router.get('/property-settings/guest-app', getGuestAppSettings);
router.put('/property-settings/guest-app', updateGuestAppSettings);

// ==================== COMMS HUB ====================
router.post('/comms/send-test', sendCommsTestEmail);

// ==================== GUEST NOTIFICATIONS ====================
router.post('/notifications', createGuestNotification);

export default router;
