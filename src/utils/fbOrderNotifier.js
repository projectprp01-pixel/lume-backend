import Notification from '../models/Notification.model.js';

// What the guest reads for each kitchen stage of an in-room dining order (stages as in FbOrder.model.js).
const STAGE_MESSAGES = {
  placed: { title: 'Order placed', type: 'info', message: 'We have received your in-room dining order. The kitchen will confirm it shortly.' },
  accepted: { title: 'Order accepted', type: 'info', message: 'The kitchen has accepted your order and is getting it ready.' },
  prepared: { title: 'Order ready', type: 'info', message: 'Your order has been prepared and is on its way to you.' },
  delivered: { title: 'Order delivered', type: 'success', message: 'Your order has been delivered. Enjoy your meal!' },
};

/**
 * Tell the guest where their in-room dining order is in the kitchen. Never throws: a failed
 * notification must not fail placing the order or the kitchen advancing it.
 */
export async function notifyFbOrderStage(order) {
  try {
    const msg = STAGE_MESSAGES[order.stage];
    if (!msg || !order.guestId) return;
    const ref = String(order._id).slice(-6).toUpperCase();
    await Notification.create({
      guestId: order.guestId,
      title: msg.title,
      message: `${msg.message} (Order #${ref})`,
      type: msg.type,
      relatedId: String(order._id),
      relatedType: 'fb-order',
    });
  } catch (error) {
    console.error('F&B order notification error:', error);
  }
}
