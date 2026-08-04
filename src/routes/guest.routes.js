import express from 'express';
import { authenticateGuest } from '../controllers/guest/auth.controller.js';
import { getGuestById, updateGuestPreferences, updateGuestContact } from '../controllers/guest/profile.controller.js';
import {
  getSpaFacilities,
  getSpaTimeSlots,
  createSpaBooking,
  getGuestSpaBookings,
  cancelSpaBooking,
} from '../controllers/guest/spa.controller.js';
import {
  getGuestTransport,
  createTransportBooking,
  cancelTransportBooking,
  getGuestTransportBookings,
} from '../controllers/guest/transport.controller.js';
import { getPropertySettings } from '../controllers/guest/propertySettings.controller.js';
import {
  getRestaurants,
  getDiningAvailability,
  createDiningReservation,
  getGuestDiningReservations,
  cancelDiningReservation,
} from '../controllers/guest/dining.controller.js';
import { getActiveBanners } from '../controllers/guest/banner.controller.js';
import { chatWithConcierge } from '../controllers/guest/chat.controller.js';
import { getGuestNotifications, markNotificationRead, markAllNotificationsRead } from '../controllers/guest/notification.controller.js';
import { createGuestRequest, getGuestRequests } from '../controllers/guest/request.controller.js';

const router = express.Router();

router.post('/auth', authenticateGuest);

router.get('/spa', getSpaFacilities);
router.get('/spa/timeslots', getSpaTimeSlots);
router.post('/spa/bookings', createSpaBooking);
router.get('/spa/bookings/guest/:guestId', getGuestSpaBookings);
router.delete('/spa/bookings/:id', cancelSpaBooking);

// NOTE: must be defined before router.get('/:id') to avoid route shadowing
router.get('/transport', getGuestTransport);

// Must be defined before /:id to prevent Express matching "property-settings" as an ObjectId
router.get('/property-settings', getPropertySettings);

// Must be defined before /:id — otherwise GET /requests is shadowed by GET /:id and 500s
router.post('/requests', createGuestRequest);
router.get('/requests', getGuestRequests);

router.get('/:id', getGuestById);
router.put('/:id/preferences', updateGuestPreferences);
router.put('/:id/contact', updateGuestContact);

router.get('/restaurants/all', getRestaurants);

router.get('/dining/availability', getDiningAvailability);
router.post('/dining/book', createDiningReservation);
router.get('/dining/reservations/guest/:guestId', getGuestDiningReservations);
router.delete('/dining/reservations/:id', cancelDiningReservation);

router.get('/banners/active', getActiveBanners);

router.post('/chat', chatWithConcierge);

router.get('/:guestId/notifications', getGuestNotifications);
router.put('/notifications/:notifId/read', markNotificationRead);
router.put('/:guestId/notifications/read-all', markAllNotificationsRead);

router.post('/transport/book', createTransportBooking);
router.delete('/transport/bookings/:id', cancelTransportBooking);
router.get('/transport/bookings/guest/:guestId', getGuestTransportBookings);

export default router;
