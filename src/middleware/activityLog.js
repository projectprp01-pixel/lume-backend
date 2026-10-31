import { logStaffAction } from '../utils/staffLog.js';

// Records every successful dashboard write in the Staff Log, keyed by "METHOD route-pattern"
// exactly as declared in dashboard.routes.js. Staff / department / password routes are not
// listed: their controllers already write richer entries via logStaffAction. Uploads and
// mark-seen are skipped on purpose — they are plumbing, not decisions worth auditing.
const ACTIONS = {
  'PUT /checkin/:checkInId/review': 'Reviewed a check-in',
  'PUT /checkin/:checkInId/guest/:guestNumber/review': 'Reviewed a guest ID document at check-in',
  'PUT /checkin/bookings/:bookingId/room': 'Assigned a room at check-in',

  'POST /experiences/discounts': 'Created an experience discount',
  'PUT /experiences/discounts/:id': 'Updated an experience discount',
  'DELETE /experiences/discounts/:id': 'Deleted an experience discount',
  'POST /experiences/bookings/manual': 'Added a manual experience booking',
  'PUT /experiences/bookings/:id': 'Edited an experience booking',
  'PUT /experiences/bookings/:bookingId/cancel': 'Cancelled an experience booking',
  'PUT /experiences/bookings/:id/payment': 'Updated experience booking payment',
  'PUT /experiences/bookings/:id/room': 'Assigned a room to an experience booking',
  'POST /experiences': 'Created an experience',
  'PUT /experiences/:id': 'Edited an experience',
  'PUT /experiences/:id/block-dates': 'Updated blocked dates for an experience',
  'DELETE /experiences/:id': 'Deleted an experience',

  'POST /guests': 'Added a guest',
  'POST /guests/bulk-import': 'Bulk imported guests',
  'PUT /guests/:guestId/review': 'Reviewed a guest ID',
  'PUT /guests/:guestId': 'Edited a guest',
  'DELETE /guests/:guestId': 'Deleted a guest',

  'POST /restaurants/discounts': 'Created a dining discount',
  'PUT /restaurants/discounts/:id': 'Updated a dining discount',
  'DELETE /restaurants/discounts/:id': 'Deleted a dining discount',
  'POST /restaurants/reservations': 'Added a manual dining reservation',
  'PUT /restaurants/reservations/:id': 'Edited a dining reservation',
  'PUT /restaurants/reservations/:id/cancel': 'Cancelled a dining reservation',
  'PUT /restaurants/reservations/:id/payment': 'Updated dining reservation payment',
  'PUT /restaurants/reservations/:id/room': 'Assigned a room to a dining reservation',
  'POST /restaurants': 'Created a restaurant',
  'PUT /restaurants/:id': 'Edited a restaurant',
  'PUT /restaurants/:id/block-dates': 'Updated blocked dates for a restaurant',
  'DELETE /restaurants/:id': 'Deleted a restaurant',

  'POST /fb-menu/categories': 'Created an F&B menu category',
  'PUT /fb-menu/categories/:id': 'Edited an F&B menu category',
  'DELETE /fb-menu/categories/:id': 'Deleted an F&B menu category',
  'POST /fb-menu/subcategories': 'Created an F&B menu subcategory',
  'PUT /fb-menu/subcategories/:id': 'Edited an F&B menu subcategory',
  'DELETE /fb-menu/subcategories/:id': 'Deleted an F&B menu subcategory',
  'POST /fb-menu/dishes': 'Created a dish',
  'POST /fb-menu/dishes/bulk-import': 'Bulk imported dishes',
  'PUT /fb-menu/dishes/:id': 'Edited a dish',
  'DELETE /fb-menu/dishes/:id': 'Deleted a dish',
  'PUT /fb-orders/:id/stage': 'Moved an in-room dining order to a new stage',
  'PUT /fb-ordering-settings': 'Updated F&B ordering settings',

  'PUT /checkout/bookings/:bookingId/approve': 'Approved a checkout',
  'PUT /checkout/bookings/:bookingId/checkout-time': 'Updated a checkout time',
  'PUT /feedback/settings': 'Updated feedback settings',

  'POST /banners': 'Created a banner',
  'PUT /banners/:id': 'Edited a banner',
  'DELETE /banners/:id': 'Deleted a banner',

  'POST /spa/discounts': 'Created a spa discount',
  'PUT /spa/discounts/:id': 'Updated a spa discount',
  'DELETE /spa/discounts/:id': 'Deleted a spa discount',
  'POST /spa': 'Created a spa facility',
  'PUT /spa/:id': 'Edited a spa facility',
  'DELETE /spa/:id': 'Deleted a spa facility',
  'POST /spa/bookings': 'Added a manual spa booking',
  'PUT /spa/bookings/:id': 'Edited a spa booking',
  'PUT /spa/bookings/:id/status': 'Changed a spa booking status',
  'PUT /spa/bookings/:id/payment': 'Updated spa booking payment',
  'PUT /spa/bookings/:id/room': 'Assigned a room to a spa booking',

  'PUT /requests/:id/accept': 'Accepted a guest request',
  'PUT /requests/:id/complete': 'Completed a guest request',
  'PUT /requests/:id/department': 'Rerouted a guest request to another department',
  'POST /requests/:id/reply': 'Replied to a guest request',

  'PUT /transport': 'Updated transport settings',
  'POST /transport/bookings/manual': 'Added a manual transport booking',
  'PUT /transport/bookings/:id/cancel': 'Cancelled a transport booking',
  'POST /transport/hub/vehicles': 'Added a transport vehicle',
  'PUT /transport/hub/vehicles/:vehicleId': 'Edited a transport vehicle',
  'DELETE /transport/hub/vehicles/:vehicleId': 'Deleted a transport vehicle',
  'PUT /transport/hub/offerings/:slot': 'Updated a transport offering',
  'PUT /transport/hub/offerings/:slot/block-dates': 'Updated blocked dates for a transport offering',
  'POST /transport/hub/bookings': 'Added a transport booking',
  'PUT /transport/hub/bookings/:id': 'Edited a transport booking',
  'PUT /transport/hub/bookings/:id/payment': 'Updated transport booking payment',
  'PUT /transport/hub/bookings/:id/room': 'Assigned a room to a transport booking',
  'PUT /transport/hub/bookings/:id/cancel': 'Cancelled a transport booking',

  'PUT /property-settings': 'Updated property settings',
  'PUT /property-settings/guest-app': 'Updated guest app settings',
  'POST /notifications': 'Sent a guest notification',
};

const NAME_FIELDS = ['name', 'title', 'dishName', 'guestName'];

export function activityLogger(req, res, next) {
  if (req.method === 'GET') return next();
  res.on('finish', () => {
    if (res.statusCode >= 400 || !req.staff || !req.route) return;
    const label = ACTIONS[`${req.method} ${req.route.path}`];
    if (!label) return;
    const field = NAME_FIELDS.find((f) => typeof req.body?.[f] === 'string' && req.body[f].trim());
    const detail = field ? ` — ${req.body[field].trim().slice(0, 80)}` : '';
    logStaffAction(req.staff.propertyId, req.staff, `${label}${detail}.`);
  });
  next();
}
