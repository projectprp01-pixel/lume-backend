import Staff from '../../models/Staff.model.js';
import { sendNewStaffAddedEmail } from '../../utils/emailService.js';

// ==================== STAFF MANAGEMENT ====================

// Role → permissions + department mapping (used in addStaff and updateStaff)
const ROLE_CONFIG = {
  'Admin':              { department: 'management',    canApproveCheckIns: true,  canManageExperiences: true,  canManageBookings: true,  canManageGuests: true,  canViewAnalytics: true,  canManageStaff: true  },
  'Front Desk':         { department: 'front-desk',    canApproveCheckIns: true,  canManageExperiences: true,  canManageBookings: true,  canManageGuests: true,  canViewAnalytics: false, canManageStaff: false },
  'Restaurant Manager': { department: 'food-beverage', canApproveCheckIns: false, canManageExperiences: false, canManageBookings: true,  canManageGuests: false, canViewAnalytics: false, canManageStaff: false },
  'Spa Manager':        { department: 'spa',           canApproveCheckIns: false, canManageExperiences: false, canManageBookings: true,  canManageGuests: false, canViewAnalytics: false, canManageStaff: false },
  'Trainee':            { department: 'management',    canApproveCheckIns: false, canManageExperiences: false, canManageBookings: false, canManageGuests: false, canViewAnalytics: false, canManageStaff: false },
};

/**
 * Get all staff
 */
export const getAllStaff = async (req, res) => {
  try {
    const { role, department, propertyId, isActive } = req.query;

    const filter = {};

    if (role) filter.role = role;
    if (department) filter.department = department;
    // Admins are cross-property — always include them alongside the requested property
    if (propertyId) filter.$or = [{ propertyId }, { role: 'Admin' }];
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const staff = await Staff.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: staff.length,
      data: staff
    });
  } catch (error) {
    console.error('Get all staff error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve staff',
      error: error.message
    });
  }
};

/**
 * Add new staff
 */
export const addStaff = async (req, res) => {
  try {
    const config = ROLE_CONFIG[req.body.role] || {};
    const { department, ...permissions } = config;
    const staffData = {
      propertyId: 'default',
      ...req.body,
      department: department || req.body.department || 'management',
      permissions,
    };
    const staff = await Staff.create(staffData);

    sendNewStaffAddedEmail({
      newStaffName: `${staff.firstName} ${staff.lastName}`,
      role: staff.role,
      addedAt: new Date(),
      addedByName: `${req.staff.firstName} ${req.staff.lastName}`,
      propertyName: staff.propertyName || 'Evolve Back',
    }).catch(emailErr => console.error('Failed to send new staff email:', emailErr));

    res.status(201).json({
      success: true,
      message: 'Staff added successfully',
      data: staff
    });

  } catch (error) {
    console.error('Add staff error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add staff',
      error: error.message
    });
  }
};

/**
 * Update staff
 */
export const updateStaff = async (req, res) => {
  try {
    const { id } = req.params;

    const { password: _pw, ...safeBody } = req.body;
    const updates = { ...safeBody };
    if (updates.role && ROLE_CONFIG[updates.role]) {
      const { department, ...permissions } = ROLE_CONFIG[updates.role];
      updates.department = department;
      updates.permissions = permissions;
    }

    const staff = await Staff.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true
    });

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: 'Staff not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Staff updated successfully',
      data: staff
    });
  } catch (error) {
    console.error('Update staff error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update staff',
      error: error.message
    });
  }
};

/**
 * Delete staff member
 */
export const deleteStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const staff = await Staff.findByIdAndDelete(id);
    if (!staff) return res.status(404).json({ success: false, message: 'Staff not found' });
    res.status(200).json({ success: true, message: 'Staff member removed' });
  } catch (error) {
    console.error('Delete staff error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete staff', error: error.message });
  }
};
