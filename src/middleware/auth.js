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
