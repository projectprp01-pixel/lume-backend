import Booking from '../../models/Booking.model.js';
import Feedback from '../../models/Feedback.model.js';
import FeedbackSettings from '../../models/FeedbackSettings.model.js';
import {
  MAX_PROMPT_LENGTH,
  resolveFeedbackSettings,
  sanitizeReviewSites,
} from '../../utils/feedbackSettings.js';

// ==================== FEEDBACK (Checkout & Feedback hub, "Feedback" tab) ====================
// Whether a review is "low" is not stored on it — the client compares `rating` to the property's
// current lowMax (returned by getFeedbackSettings), so changing the threshold re-sorts everything.

export const getFeedback = async (req, res) => {
  try {
    const { propertyId = 'default' } = req.query;
    const filter = propertyId !== 'default' ? { propertyId } : {};
    const reviews = await Feedback.find(filter).sort({ createdAt: -1 }).limit(500).lean();

    const bookings = await Booking.find({ bookingId: { $in: reviews.map((r) => r.bookingId) } }).lean();
    const bookingMap = Object.fromEntries(bookings.map((b) => [b.bookingId, b]));

    const data = reviews.map((r) => {
      const b = bookingMap[r.bookingId];
      return {
        _id: r._id,
        bookingId: r.bookingId,
        guestName: b?.primaryGuestName ?? 'Guest',
        room: b?.roomNumber ?? '',
        arrivalDate: b?.arrivalDate ?? null,
        checkoutDate: b?.checkoutDate ?? null,
        rating: r.rating,
        review: r.review,
        recoveryResponse: r.recoveryResponse,
        // Legacy reviews recorded a Google click instead of a redirect.
        redirectedTo: r.redirectedTo || (r.googleClicked ? 'Google Reviews' : ''),
        createdAt: r.createdAt,
      };
    });

    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    console.error('Get feedback error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve feedback', error: error.message });
  }
};

const settingsPayload = (propertyId, doc) => ({ propertyId, ...resolveFeedbackSettings(doc) });

export const getFeedbackSettings = async (req, res) => {
  try {
    const { propertyId = 'default' } = req.query;
    const doc = await FeedbackSettings.findOne({ propertyId }).lean();
    res.status(200).json({ success: true, data: settingsPayload(propertyId, doc) });
  } catch (error) {
    console.error('Get feedback settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve feedback settings', error: error.message });
  }
};

// Partial update: send any of { lowMax, prompt, reviewSites }.
export const updateFeedbackSettings = async (req, res) => {
  try {
    const { propertyId = 'default', lowMax, prompt, reviewSites } = req.body;
    const set = {};

    if (lowMax !== undefined) {
      if (!Number.isInteger(lowMax) || lowMax < 1 || lowMax > 4) {
        return res.status(400).json({ success: false, message: 'Low-rating threshold must be 1, 2, 3 or 4 stars' });
      }
      set.lowMax = lowMax;
    }
    if (prompt !== undefined) {
      const text = String(prompt).trim();
      if (!text) {
        return res.status(400).json({ success: false, message: 'Add the question guests see when they leave a low rating' });
      }
      if (text.length > MAX_PROMPT_LENGTH) {
        return res.status(400).json({ success: false, message: `The question can be at most ${MAX_PROMPT_LENGTH} characters` });
      }
      set.prompt = text;
    }
    if (reviewSites !== undefined) {
      const { error, sites } = sanitizeReviewSites(reviewSites);
      if (error) return res.status(400).json({ success: false, message: error });
      set.reviewSites = sites;
    }

    const doc = await FeedbackSettings.findOneAndUpdate(
      { propertyId },
      { $set: set, $setOnInsert: { propertyId } },
      { new: true, upsert: true, runValidators: true }
    ).lean();
    res.status(200).json({ success: true, data: settingsPayload(propertyId, doc) });
  } catch (error) {
    console.error('Update feedback settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to update feedback settings', error: error.message });
  }
};
