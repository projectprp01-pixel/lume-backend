import jwt from 'jsonwebtoken';
import Staff from '../models/Staff.model.js';
import { JWT_SECRET } from '../config/env.js';
import { logStaffAction } from '../utils/staffLog.js';

export const loginStaff = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const staff = await Staff.findOne({ email: email.toLowerCase().trim() }).select('+password');
    if (!staff) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!staff.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated' });
    }

    if (!staff.password) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await staff.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    staff.lastLogin = new Date();
    await staff.save();

    const token = jwt.sign(
      { staffId: staff._id, role: staff.role, propertyId: staff.propertyId },
      JWT_SECRET
    );

    res.status(200).json({
      success: true,
      token,
      staff: {
        _id: staff._id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        email: staff.email,
        tier: staff.tier,
        department: staff.department,
        role: staff.role,
        isFounding: staff.isFounding,
        propertyId: staff.propertyId,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed', error: error.message });
  }
};

export const getCurrentStaff = async (req, res) => {
  const staff = req.staff;
  res.status(200).json({
    success: true,
    staff: {
      _id: staff._id,
      firstName: staff.firstName,
      lastName: staff.lastName,
      email: staff.email,
      tier: staff.tier,
      department: staff.department,
      role: staff.role,
      isFounding: staff.isFounding,
      propertyId: staff.propertyId,
    },
  });
};

export const resetStaffPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }

    const targetStaff = await Staff.findById(id);
    if (!targetStaff) {
      return res.status(404).json({ success: false, message: 'Staff not found' });
    }

    targetStaff.password = newPassword;
    await targetStaff.save();

    await logStaffAction(targetStaff.propertyId, req.staff, `Reset login password — ${targetStaff.firstName} ${targetStaff.lastName}.`);

    res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset password', error: error.message });
  }
};
