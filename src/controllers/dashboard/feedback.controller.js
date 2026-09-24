import Booking from '../../models/Booking.model.js';
import Feedback from '../../models/Feedback.model.js';
import FeedbackSettings from '../../models/FeedbackSettings.model.js';

// ==================== FEEDBACK (Checkout & Feedback hub, "Feedback" tab) ====================
// Sentiment is not stored on a review — the client computes it from `rating` and the current
// thresholds returned by getFeedbackSettings (PRD, Steps 6 and 9).

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
        googleClicked: !!r.googleClicked,
        createdAt: r.createdAt,
      };
    });

    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    console.error('Get feedback error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve feedback', error: error.message });
  }
};

export const getFeedbackSettings = async (req, res) => {
  try {
    const { propertyId = 'default' } = req.query;
    const settings = await FeedbackSettings.findOneAndUpdate(
      { propertyId },
      { $setOnInsert: { propertyId } },
      { new: true, upsert: true }
    );
    res.status(200).json({ success: true, data: { propertyId, negMax: settings.negMax, posMin: settings.posMin } });
  } catch (error) {
    console.error('Get feedback settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve feedback settings', error: error.message });
  }
};

export const updateFeedbackSettings = async (req, res) => {
  try {
    const { propertyId = 'default', negMax, posMin } = req.body;
    const current = await FeedbackSettings.findOne({ propertyId }).lean();
    const nextNeg = negMax ?? current?.negMax ?? 2;
    const nextPos = posMin ?? current?.posMin ?? 4;

    if (!Number.isInteger(nextNeg) || nextNeg < 1 || nextNeg > 3) {
      return res.status(400).json({ success: false, message: 'Negative threshold must be 1, 2 or 3' });
    }
    if (!Number.isInteger(nextPos) || nextPos < 3 || nextPos > 5) {
      return res.status(400).json({ success: false, message: 'Positive threshold must be 3, 4 or 5' });
    }
    // The two boundaries can never cross — Negative's top can't reach Positive's floor.
    if (nextNeg >= nextPos) {
      return res.status(400).json({ success: false, message: 'Negative threshold must be below the Positive threshold' });
    }

    const settings = await FeedbackSettings.findOneAndUpdate(
      { propertyId },
      { $set: { negMax: nextNeg, posMin: nextPos }, $setOnInsert: { propertyId } },
      { new: true, upsert: true, runValidators: true }
    );
    res.status(200).json({ success: true, data: { propertyId, negMax: settings.negMax, posMin: settings.posMin } });
  } catch (error) {
    console.error('Update feedback settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to update feedback settings', error: error.message });
  }
};
