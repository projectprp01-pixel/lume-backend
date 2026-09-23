import jwt from 'jsonwebtoken';
import Staff from '../models/Staff.model.js';
import { JWT_SECRET } from '../config/env.js';

export const authenticate = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }
  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const staff = await Staff.findById(decoded.staffId);
    if (!staff || !staff.isActive) {
      return res.status(403).json({ success: false, message: 'Account inactive or not found' });
    }
    req.staff = staff;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.staff?.role)) {
    return res.status(403).json({ success: false, message: 'Insufficient permissions' });
  }
  next();
};

// Gate on the account-level tier (Admin/GM/Staff), not the free-form department role —
// used for Staff Management itself, which the PRD hard-gates to specific tiers
// regardless of department (see Staff Management PRD, "Staff Management's Own Access").
// Finer-grained "who can manage whom" (Admin vs GM vs the target account's own tier)
// is data-dependent and enforced in the controller, not here.
export const requireTier = (...tiers) => (req, res, next) => {
  if (!tiers.includes(req.staff?.tier)) {
    return res.status(403).json({ success: false, message: 'Insufficient permissions' });
  }
  next();
};
