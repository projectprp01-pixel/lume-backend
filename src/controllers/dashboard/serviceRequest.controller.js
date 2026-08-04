import Notification from '../../models/Notification.model.js';
import ServiceRequest from '../../models/ServiceRequest.model.js';

// ==================== SERVICE REQUESTS ====================

export const getAllRequests = async (req, res) => {
  try {
    const { status, department, propertyId } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (department) filter.department = department;
    if (propertyId) {
      // Legacy records (created before multi-property) have no propertyId — treat as 'default' (Coorg)
      filter.$or = propertyId === 'default'
        ? [{ propertyId: 'default' }, { propertyId: { $exists: false } }, { propertyId: null }]
        : [{ propertyId }];
    }

    const requests = await ServiceRequest.find(filter)
      .populate('guestId', 'fullName email mobileNumber')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: requests.length, data: requests });
  } catch (error) {
    console.error('Get requests error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve requests', error: error.message });
  }
};

export const updateRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, assignee, eta, notes } = req.body;

    const update = { status };
    if (assignee !== undefined) update.assignee = assignee;
    if (eta !== undefined) update.eta = eta;
    if (notes !== undefined) update.notes = notes;
    if (status === 'Completed') update.completedAt = new Date();

    const request = await ServiceRequest.findByIdAndUpdate(id, update, { new: true })
      .populate('guestId', 'fullName email');

    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    // Create notification for the guest on status change
    if (['Assigned', 'In-progress', 'Completed'].includes(status)) {
      const statusMessages = {
        'Assigned': `Your request for "${request.item}" has been assigned and will be handled shortly.`,
        'In-progress': `Your request for "${request.item}" is now being handled by our team.`,
        'Completed': `Your request for "${request.item}" has been completed. We hope it met your expectations!`
      };
      await Notification.create({
        guestId: request.guestId._id || request.guestId,
        title: `Request ${status}`,
        message: statusMessages[status],
        type: status === 'Completed' ? 'success' : 'info',
        relatedId: request._id.toString(),
        relatedType: 'request'
      });
    }

    res.status(200).json({ success: true, data: request });
  } catch (error) {
    console.error('Update request status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update request', error: error.message });
  }
};

export const addRequestReply = async (req, res) => {
  try {
    const { id } = req.params;
    const { body, sentBy = 'Front Desk' } = req.body;

    if (!body || !body.trim()) {
      return res.status(400).json({ success: false, message: 'Reply body is required' });
    }

    const request = await ServiceRequest.findByIdAndUpdate(
      id,
      {
        $push: { replies: { body: body.trim(), sentBy, sentAt: new Date() } },
        status: 'In-progress'
      },
      { new: true }
    ).populate('guestId', 'fullName email mobileNumber');

    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    res.status(200).json({ success: true, data: request });
  } catch (error) {
    console.error('Add request reply error:', error);
    res.status(500).json({ success: false, message: 'Failed to add reply', error: error.message });
  }
};
