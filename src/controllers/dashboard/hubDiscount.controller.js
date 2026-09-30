import HubDiscount from '../../models/HubDiscount.model.js';

// ==================== SPA / DINING DISCOUNTS & PROMOTIONS ====================
// One CRUD set, bound to a department ('spa' | 'dining') so each hub only ever sees and touches
// its own discounts. Mirrors the Experience Hub discount handlers.

const pickFields = (body) => {
  const { name, discountType, value, maxCap, applyType, windowDays, startDate, endDate, itemIds, enabled } = body;
  const fields = { name, discountType, value, maxCap, applyType, windowDays, startDate, endDate, itemIds, enabled };
  // Only send what the client actually provided, so a partial PUT (e.g. just `enabled`) can't null the rest.
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
};

export const makeHubDiscountHandlers = (department) => ({
  list: async (req, res) => {
    try {
      const filter = { department };
      if (req.query.propertyId) filter.propertyId = req.query.propertyId;
      const discounts = await HubDiscount.find(filter).sort({ createdAt: -1 });
      res.status(200).json({ success: true, count: discounts.length, data: discounts });
    } catch (error) {
      console.error(`Get ${department} discounts error:`, error);
      res.status(500).json({ success: false, message: 'Failed to retrieve discounts', error: error.message });
    }
  },

  create: async (req, res) => {
    try {
      if (!req.body.propertyId) {
        return res.status(400).json({ success: false, message: 'propertyId is required' });
      }
      const discount = await HubDiscount.create({ ...pickFields(req.body), propertyId: req.body.propertyId, department });
      res.status(201).json({ success: true, message: 'Discount created', data: discount });
    } catch (error) {
      console.error(`Create ${department} discount error:`, error);
      res.status(500).json({ success: false, message: 'Failed to create discount', error: error.message });
    }
  },

  update: async (req, res) => {
    try {
      const discount = await HubDiscount.findOneAndUpdate(
        { _id: req.params.id, department },
        pickFields(req.body),
        { new: true, runValidators: true }
      );
      if (!discount) return res.status(404).json({ success: false, message: 'Discount not found' });
      res.status(200).json({ success: true, message: 'Discount updated', data: discount });
    } catch (error) {
      console.error(`Update ${department} discount error:`, error);
      res.status(500).json({ success: false, message: 'Failed to update discount', error: error.message });
    }
  },

  remove: async (req, res) => {
    try {
      const discount = await HubDiscount.findOneAndDelete({ _id: req.params.id, department });
      if (!discount) return res.status(404).json({ success: false, message: 'Discount not found' });
      res.status(200).json({ success: true, message: 'Discount deleted' });
    } catch (error) {
      console.error(`Delete ${department} discount error:`, error);
      res.status(500).json({ success: false, message: 'Failed to delete discount', error: error.message });
    }
  },
});
