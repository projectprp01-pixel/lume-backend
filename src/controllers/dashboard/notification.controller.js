import Notification from '../../models/Notification.model.js';

// ==================== GUEST NOTIFICATIONS ====================

export const createGuestNotification = async (req, res) => {
  try {
    const { guestId, title, message, type = 'info', relatedId, relatedType } = req.body;
    if (!guestId || !title || !message) {
      return res.status(400).json({ success: false, message: 'guestId, title, and message are required' });
    }
    const notification = await Notification.create({ guestId, title, message, type, relatedId, relatedType });
    res.status(201).json({ success: true, data: notification });
  } catch (error) {
    console.error('Create guest notification error:', error);
    res.status(500).json({ success: false, message: 'Failed to create notification', error: error.message });
  }
};
