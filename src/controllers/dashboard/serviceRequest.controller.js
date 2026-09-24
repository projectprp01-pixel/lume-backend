import Booking from '../../models/Booking.model.js';
import Notification from '../../models/Notification.model.js';
import ServiceRequest from '../../models/ServiceRequest.model.js';
import { getDepartmentRegistry, resolveDepartment } from '../../ai/departmentRegistry.js';
import {
  isGlobalViewer,
  canViewRequest,
  canAcceptRequest,
  canRerouteRequest,
  canCompleteRequest,
} from '../../utils/requestAccess.js';

// ==================== SERVICE REQUESTS ====================
// Requests Hub PRD. Identity always comes from the JWT (req.staff) — never from the
// client — so visibility and every action are enforced here, not just hidden in the UI.

const staffFullName = (staff) => `${staff.firstName} ${staff.lastName || ''}`.trim();

// Legacy records (created before multi-property) have no propertyId — treat as 'default' (Coorg)
const propertyFilter = (propertyId) =>
  propertyId === 'default'
    ? [{ propertyId: 'default' }, { propertyId: { $exists: false } }, { propertyId: null }]
    : [{ propertyId }];

const POPULATE_GUEST = ['guestId', 'fullName email mobileNumber'];
const IN_PROGRESS = ['Assigned', 'In-progress'];

async function loadRequest(req, res) {
  const request = await ServiceRequest.findById(req.params.id);
  // Someone outside the ticket's department gets the same answer as for a missing one.
  if (!request || !canViewRequest(req.staff, request)) {
    res.status(404).json({ success: false, message: 'Request not found' });
    return null;
  }
  return request;
}

async function notifyGuest(request, status) {
  const messages = {
    'In-progress': `Your request for "${request.item}" is now being handled by our team.`,
    Completed: `Your request for "${request.item}" has been completed. We hope it met your expectations!`,
  };
  await Notification.create({
    guestId: request.guestId._id || request.guestId,
    title: `Request ${status}`,
    message: messages[status],
    type: status === 'Completed' ? 'success' : 'info',
    relatedId: request._id.toString(),
    relatedType: 'request',
  });
}

/** Live department list (from the registry) for the re-route dropdown — any staff member may read it. */
export const getRequestDepartments = async (req, res) => {
  try {
    const propertyId = isGlobalViewer(req.staff) ? req.query.propertyId || req.staff.propertyId : req.staff.propertyId;
    const registry = await getDepartmentRegistry(propertyId || 'default');
    res.status(200).json({ success: true, data: registry });
  } catch (error) {
    console.error('Get request departments error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve departments', error: error.message });
  }
};

export const getAllRequests = async (req, res) => {
  try {
    const { status, department, propertyId } = req.query;
    const staff = req.staff;
    const filter = {};

    if (status && status !== 'all') filter.status = status;

    // Department staff/managers are pinned to their own department and property — the
    // query params can't widen it. Only GM/Admin see every department (and may narrow).
    if (isGlobalViewer(staff)) {
      if (department) filter.department = department;
      if (propertyId) filter.$or = propertyFilter(propertyId);
    } else {
      filter.department = staff.department || '__none__';
      filter.$or = propertyFilter(staff.propertyId);
    }

    const requests = await ServiceRequest.find(filter)
      .populate(...POPULATE_GUEST)
      .sort({ createdAt: -1 })
      .lean();

    // Older requests predate the bookingId field — resolve theirs from the guest's latest stay.
    const missing = requests.filter((r) => !r.bookingId && r.guestId?._id).map((r) => r.guestId._id);
    if (missing.length) {
      const bookings = await Booking.find({ guestId: { $in: missing } }).sort({ createdAt: 1 }).select('guestId bookingId').lean();
      const latest = new Map(bookings.map((b) => [String(b.guestId), b.bookingId])); // later docs overwrite earlier
      for (const r of requests) {
        if (!r.bookingId && r.guestId?._id) r.bookingId = latest.get(String(r.guestId._id)) || '';
      }
    }

    res.status(200).json({ success: true, count: requests.length, data: requests });
  } catch (error) {
    console.error('Get requests error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve requests', error: error.message });
  }
};

/** Accept a New ticket. First accept wins; the acceptor becomes the only one who can complete it. */
export const acceptRequest = async (req, res) => {
  try {
    const request = await loadRequest(req, res);
    if (!request) return;
    const staff = req.staff;

    if (!canAcceptRequest(staff, request)) {
      return res.status(403).json({ success: false, message: 'You cannot accept this request.' });
    }

    // Atomic: only flips if it is still Pending, so two people clicking at once can't both win.
    const updated = await ServiceRequest.findOneAndUpdate(
      { _id: request._id, status: 'Pending' },
      {
        status: 'In-progress',
        assignee: staffFullName(staff),
        acceptedBy: {
          staffId: staff._id,
          name: staffFullName(staff),
          department: staff.tier === 'Staff' ? staff.department : null,
          acceptedAt: new Date(),
        },
      },
      { new: true }
    ).populate(...POPULATE_GUEST);

    if (!updated) {
      const current = await ServiceRequest.findById(request._id).lean();
      const by = current?.acceptedBy?.name || current?.assignee;
      return res.status(409).json({
        success: false,
        message: by ? `Already accepted by ${by}.` : 'This request is no longer new.',
      });
    }

    await notifyGuest(updated, 'In-progress');
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error('Accept request error:', error);
    res.status(500).json({ success: false, message: 'Failed to accept request', error: error.message });
  }
};

/** Mark an accepted ticket completed — its acceptor, that acceptor's department manager, or GM/Admin. */
export const completeRequest = async (req, res) => {
  try {
    const request = await loadRequest(req, res);
    if (!request) return;
    const staff = req.staff;

    if (!IN_PROGRESS.includes(request.status)) {
      return res.status(409).json({
        success: false,
        message: request.status === 'Completed' ? 'This request is already completed.' : 'Accept this request before completing it.',
      });
    }
    if (!canCompleteRequest(staff, request)) {
      const by = request.acceptedBy?.name || request.assignee || 'the person who accepted it';
      return res.status(403).json({
        success: false,
        message: `Only ${by}, their department manager, or the GM/Admin can mark this request completed.`,
      });
    }

    const updated = await ServiceRequest.findOneAndUpdate(
      { _id: request._id, status: { $in: IN_PROGRESS } },
      { status: 'Completed', completedAt: new Date() },
      { new: true }
    ).populate(...POPULATE_GUEST);
    if (!updated) {
      return res.status(409).json({ success: false, message: 'This request is already completed.' });
    }

    await notifyGuest(updated, 'Completed');
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error('Complete request error:', error);
    res.status(500).json({ success: false, message: 'Failed to complete request', error: error.message });
  }
};

/**
 * Fix a wrong tag. Allowed for the ticket's CURRENT department's manager, or GM/Admin
 * (the fallback when that department has no manager). The target must be a live
 * department from the registry. A ticket someone had already accepted goes back to New,
 * so the new department's staff can pick it up — the old acceptor's department no longer
 * owns it.
 */
export const rerouteRequest = async (req, res) => {
  try {
    const request = await loadRequest(req, res);
    if (!request) return;
    const staff = req.staff;

    if (!canRerouteRequest(staff, request)) {
      return res.status(403).json({ success: false, message: 'Only this department’s manager or the GM can re-route a request.' });
    }
    if (request.status === 'Completed') {
      return res.status(409).json({ success: false, message: 'Completed requests can’t be re-routed.' });
    }

    const registry = await getDepartmentRegistry(request.propertyId || 'default');
    const { department, matched } = resolveDepartment(registry, req.body?.department);
    if (!matched) {
      return res.status(400).json({ success: false, message: 'Unknown department.' });
    }
    if (department === request.department) {
      await request.populate(...POPULATE_GUEST);
      return res.status(200).json({ success: true, data: request });
    }

    const reset = IN_PROGRESS.includes(request.status)
      ? {
          status: 'Pending',
          assignee: '',
          acceptedBy: { staffId: null, name: '', department: null, acceptedAt: null },
        }
      : {};

    const updated = await ServiceRequest.findOneAndUpdate(
      { _id: request._id, status: { $ne: 'Completed' } },
      {
        department,
        routing: { source: 'manual', confidencePct: null, reason: `Re-routed from ${request.department}`, routedBy: staffFullName(staff) },
        ...reset,
      },
      { new: true }
    ).populate(...POPULATE_GUEST);
    if (!updated) {
      return res.status(409).json({ success: false, message: 'Completed requests can’t be re-routed.' });
    }

    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error('Reroute request error:', error);
    res.status(500).json({ success: false, message: 'Failed to re-route request', error: error.message });
  }
};

export const addRequestReply = async (req, res) => {
  try {
    const { body } = req.body;
    if (!body || !body.trim()) {
      return res.status(400).json({ success: false, message: 'Reply body is required' });
    }

    const request = await loadRequest(req, res);
    if (!request) return;

    request.replies.push({ body: body.trim(), sentBy: staffFullName(req.staff), sentAt: new Date() });
    await request.save();
    await request.populate(...POPULATE_GUEST);

    res.status(200).json({ success: true, data: request });
  } catch (error) {
    console.error('Add request reply error:', error);
    res.status(500).json({ success: false, message: 'Failed to add reply', error: error.message });
  }
};
