import { arrivalDayForGuest, loadEligibleDiscounts } from '../../utils/discounts.js';

/**
 * Discounts & promotions currently available to a guest (public — guest app uses it to show
 * struck-through prices). Query: guestId (optional; lets "cutoff before check-in" discounts be
 * evaluated against that guest's arrival), propertyId (optional).
 */
export const getGuestDiscounts = async (req, res) => {
  try {
    const { guestId, propertyId } = req.query;
    const checkInDay = await arrivalDayForGuest(guestId);
    const discounts = await loadEligibleDiscounts({ propertyId, checkInDay });
    res.status(200).json({ success: true, data: discounts });
  } catch (error) {
    console.error('Get guest discounts error:', error);
    // Never block the guest app on promotions — an empty list just means full prices.
    res.status(200).json({ success: true, data: [] });
  }
};
