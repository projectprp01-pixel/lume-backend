import jwt from 'jsonwebtoken';
import Staff from '../models/Staff.model.js';
import { JWT_SECRET } from '../config/env.js';
import { canManageTier, logStaffAction } from '../utils/staffLog.js';

export const loginStaff = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const staff = await Staff.findOne({ email: email.toLowerCase().trim() }).select('+password');
    // Specific reasons on purpose (product decision: tell staff what went wrong). `code` lets the
    // UI react without string-matching the message.
    if (!staff) {
      return res.status(401).json({ success: false, code: 'EMAIL_NOT_FOUND', message: 'No account found with this email address.' });
    }

    if (!staff.isActive) {
      return res.status(403).json({ success: false, code: 'ACCOUNT_DEACTIVATED', message: 'This account has been deactivated. Contact your administrator.' });
    }

    if (!staff.password) {
      return res.status(401).json({ success: false, code: 'NO_PASSWORD_SET', message: 'No password is set for this account. Ask an administrator to set one.' });
    }

    const isMatch = await staff.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, code: 'WRONG_PASSWORD', message: 'Incorrect password. Please try again.' });
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

    if (!canManageTier(req.staff.tier, targetStaff.tier)) {
      return res.status(403).json({ success: false, message: `A ${req.staff.tier} cannot reset this account's password.` });
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
