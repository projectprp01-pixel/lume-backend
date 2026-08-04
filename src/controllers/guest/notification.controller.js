import Notification from '../../models/Notification.model.js';

/**
 * Get notifications for a guest
 */
export const getGuestNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ guestId: req.params.guestId })
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json({ success: true, count: notifications.length, data: notifications });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retrieve notifications', error: error.message });
  }
};

/**
 * Mark a single notification as read
 */
export const markNotificationRead = async (req, res) => {
  try {
    const notif = await Notification.findByIdAndUpdate(req.params.notifId, { read: true }, { new: true });
    if (!notif) return res.status(404).json({ success: false, message: 'Notification not found' });
    res.status(200).json({ success: true, data: notif });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update notification', error: error.message });
  }
};

/**
 * Mark all notifications as read for a guest
 */
export const markAllNotificationsRead = async (req, res) => {
  try {
    await Notification.updateMany({ guestId: req.params.guestId, read: false }, { read: true });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to mark notifications as read', error: error.message });
  }
};
