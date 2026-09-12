import FbOrder from '../../models/FbOrder.model.js';
import FbOrderingSettings from '../../models/FbOrderingSettings.model.js';

const ORDER_STAGES = ['placed', 'accepted', 'prepared', 'delivered'];

export const getFbOrders = async (req, res) => {
  try {
    const { propertyId, stage, date, search } = req.query;
    const filter = {};
    if (propertyId) filter.propertyId = propertyId;
    if (stage) filter.stage = stage;
    if (date) {
      const start = new Date(`${date}T00:00:00`);
      const end = new Date(`${date}T23:59:59.999`);
      filter.createdAt = { $gte: start, $lte: end };
    }
    if (search) {
      const re = new RegExp(search, 'i');
      filter.$or = [{ guestName: re }, { room: re }];
    }
    const orders = await FbOrder.find(filter).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    console.error('Get F&B orders error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve orders', error: error.message });
  }
};

/**
 * Advance an order to the next stage, stamping timestamps[stage]. Stage is derived
 * server-side from the order's current stage — the client only asks to advance.
 */
export const updateFbOrderStage = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await FbOrder.findById(id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const currentIndex = ORDER_STAGES.indexOf(order.stage);
    if (currentIndex >= ORDER_STAGES.length - 1) {
      return res.status(400).json({ success: false, message: 'Order is already delivered' });
    }
    const nextStage = ORDER_STAGES[currentIndex + 1];
    order.stage = nextStage;
    order.timestamps = { ...order.timestamps, [nextStage]: new Date() };
    await order.save();

    res.status(200).json({ success: true, data: order });
  } catch (error) {
    console.error('Update F&B order stage error:', error);
    res.status(500).json({ success: false, message: 'Failed to update order stage', error: error.message });
  }
};

export const getFbOrderingSettings = async (req, res) => {
  try {
    const { propertyId = 'default' } = req.query;
    let settings = await FbOrderingSettings.findOne({ propertyId });
    if (!settings) settings = await FbOrderingSettings.create({ propertyId });
    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error('Get F&B ordering settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve settings', error: error.message });
  }
};

export const updateFbOrderingSettings = async (req, res) => {
  try {
    const { propertyId = 'default', opens, closes, paused, packagingCharge } = req.body;
    const update = {};
    if (opens !== undefined) update.opens = opens;
    if (closes !== undefined) update.closes = closes;
    if (paused !== undefined) update.paused = paused;
    if (packagingCharge !== undefined) update.packagingCharge = packagingCharge;

    const settings = await FbOrderingSettings.findOneAndUpdate(
      { propertyId },
      { $set: update, $setOnInsert: { propertyId } },
      { new: true, upsert: true, runValidators: true }
    );
    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    console.error('Update F&B ordering settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to update settings', error: error.message });
  }
};
