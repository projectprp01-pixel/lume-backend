import Booking from '../../models/Booking.model.js';
import Feedback from '../../models/Feedback.model.js';
import FeedbackSettings from '../../models/FeedbackSettings.model.js';
import { activeReviewSite, resolveFeedbackSettings } from '../../utils/feedbackSettings.js';

// ==================== GUEST FEEDBACK (post-checkout "Before you go" screen) ====================
// The guest app rates in half-star steps. At or below the property's lowMax the guest is asked what
// went wrong and that answer is saved with the rating; above it the rating is saved the moment they
// lift their finger and they are sent to the one review site the property has switched on.

const MAX_RESPONSE_LENGTH = 1000;

async function settingsFor(propertyId) {
  const own = await FeedbackSettings.findOne({ propertyId }).lean();
  return resolveFeedbackSettings(own ?? (propertyId !== 'default' ? await FeedbackSettings.findOne({ propertyId: 'default' }).lean() : null));
}

// The only part of a review site the guest app needs — and only when it is usable.
const publicSite = (site) => (site ? { name: site.name, url: site.url.trim() } : null);

/**
 * What the feedback screen needs before it draws anything.
 * Query: bookingId (required)
 * -> { lowMax, prompt, reviewSite: { name, url } | null, submitted }
 */
export const getFeedbackConfig = async (req, res) => {
  try {
    const { bookingId } = req.query;
    if (!bookingId) return res.status(400).json({ success: false, message: 'bookingId is required' });

    const booking = await Booking.findOne({ bookingId }).lean();
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const propertyId = booking.propertyId || 'default';
    const [settings, existing] = await Promise.all([
      settingsFor(propertyId),
      Feedback.exists({ bookingId }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        lowMax: settings.lowMax,
        prompt: settings.prompt,
        reviewSite: publicSite(activeReviewSite(settings)),
        submitted: !!existing,
      },
    });
  } catch (error) {
    console.error('Get feedback config error:', error);
    res.status(500).json({ success: false, message: 'Failed to load feedback settings', error: error.message });
  }
};

/**
 * Save a guest's rating.
 * Body: { bookingId, rating (0.5-5, steps of 0.5), response? (only kept for a low rating) }
 * One rating per stay: the first one wins, later calls return it unchanged with created: false.
 * -> { created, low, reviewSite: { name, url } | null }  (reviewSite only for a rating above lowMax)
 */
export const submitFeedback = async (req, res) => {
  try {
    const { bookingId, rating, response } = req.body;
    if (!bookingId) return res.status(400).json({ success: false, message: 'bookingId is required' });
    if (typeof rating !== 'number' || !(rating >= 0.5 && rating <= 5) || !Number.isInteger(rating * 2)) {
      return res.status(400).json({ success: false, message: 'rating must be between 0.5 and 5 in steps of 0.5' });
    }

    const booking = await Booking.findOne({ bookingId }).lean();
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    const propertyId = booking.propertyId || 'default';
    const settings = await settingsFor(propertyId);
    const low = rating <= settings.lowMax;
    const site = low ? null : activeReviewSite(settings);
    // The written answer only exists for a low rating; for a high one the guest is never asked.
    const recoveryResponse = low && typeof response === 'string' ? response.trim().slice(0, MAX_RESPONSE_LENGTH) : '';

    // bookingId is unique, so a second submission (double tap, back button, another device) loses the race
    // cleanly instead of overwriting the first rating.
    let created = true;
    try {
      await Feedback.create({ propertyId, bookingId, rating, recoveryResponse, redirectedTo: site?.name ?? '' });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      created = false;
    }

    res.status(created ? 201 : 200).json({
      success: true,
      data: { created, low, reviewSite: created ? publicSite(site) : null },
    });
  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({ success: false, message: 'Failed to save feedback', error: error.message });
  }
};
