import Staff from '../../models/Staff.model.js';
import StaffActivityLog from '../../models/StaffActivityLog.model.js';
import { sendNewStaffAddedEmail } from '../../utils/emailService.js';
import { canManageTier, describeStaffTier, logStaffAction } from '../../utils/staffLog.js';

// ==================== STAFF MANAGEMENT ====================
// See Staff Management PRD (App Flow doc): three tiers (Admin/GM/Staff), fully custom
// departments/roles, "who can manage whom" enforced here (route-level requireTier only
// gates who can reach these endpoints at all — the finer-grained per-target checks
// below are data-dependent and can't live in middleware).

/**
 * Get all staff for a property. Admin/GM accounts are cross-property by design (Staff
 * Management PRD: Admin/GM aren't scoped to a department), so they're always included
 * alongside whichever property's Staff rows were requested.
 */
export const getAllStaff = async (req, res) => {
  try {
    const { propertyId, isActive } = req.query;

    const filter = {};
    if (propertyId) filter.$or = [{ propertyId }, { tier: { $in: ['Admin', 'GM'] } }];
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const staff = await Staff.find(filter).sort({ createdAt: 1 });

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
 * Add new staff. Route already requires the caller be Admin or GM
 * (requireTier('Admin','GM')); this enforces the finer "who can manage whom" rule —
 * a GM can stand up another GM or any department staff, but never an Admin.
 */
export const addStaff = async (req, res) => {
  try {
    const { firstName, lastName, email, password, phone, tier, department, role, propertyId, propertyName } = req.body;
    const targetTier = tier === 'Admin' || tier === 'GM' ? tier : 'Staff';

    if (!canManageTier(req.staff.tier, targetTier)) {
      return res.status(403).json({ success: false, message: `A ${req.staff.tier} cannot create a ${targetTier} account.` });
    }
    if (targetTier === 'Staff' && (!department || !role)) {
      return res.status(400).json({ success: false, message: 'Department and role are required for a Staff account.' });
    }

    const staff = await Staff.create({
      firstName,
      lastName,
      email,
      password,
      phone,
      tier: targetTier,
      department: targetTier === 'Staff' ? department : undefined,
      role: targetTier === 'Staff' ? role : undefined,
      propertyId: propertyId || req.staff.propertyId || 'default',
      propertyName,
    });

    await logStaffAction(staff.propertyId, req.staff, `Added new staff member — ${staff.firstName} ${staff.lastName}, ${describeStaffTier(staff)}.`);

    sendNewStaffAddedEmail({
      newStaffName: `${staff.firstName} ${staff.lastName}`,
      role: describeStaffTier(staff),
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
 * Update staff. Checked against both the target's CURRENT tier (can the viewer touch
 * this row at all) and, if the update changes tier, the NEW tier too (a GM can't
 * promote someone to Admin any more than they could have created one directly).
 */
export const updateStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const target = await Staff.findById(id);
    if (!target) {
      return res.status(404).json({ success: false, message: 'Staff not found' });
    }
    if (!canManageTier(req.staff.tier, target.tier)) {
      return res.status(403).json({ success: false, message: `A ${req.staff.tier} cannot edit this account.` });
    }

    const { password: _pw, tier, department, role, isActive, ...rest } = req.body;
    const nextTier = tier === 'Admin' || tier === 'GM' || tier === 'Staff' ? tier : target.tier;
    if (!canManageTier(req.staff.tier, nextTier)) {
      return res.status(403).json({ success: false, message: `A ${req.staff.tier} cannot grant a ${nextTier} account.` });
    }
    const nextDepartment = nextTier === 'Staff' ? (department ?? target.department) : undefined;
    const nextRole = nextTier === 'Staff' ? (role ?? target.role) : undefined;
    if (nextTier === 'Staff' && (!nextDepartment || !nextRole)) {
      return res.status(400).json({ success: false, message: 'Department and role are required for a Staff account.' });
    }

    // Deliberate, not silent: a property can never be left with zero Active Admins or
    // zero Active GMs (Staff Management PRD's Open Questions flags this explicitly).
    if (isActive === false && target.isActive && target.tier !== 'Staff') {
      const activeCount = await Staff.countDocuments({ tier: target.tier, isActive: true });
      if (activeCount <= 1) {
        return res.status(400).json({ success: false, message: `Can't deactivate the last remaining ${target.tier} account.` });
      }
    }

    Object.assign(target, rest, {
      tier: nextTier,
      department: nextDepartment,
      role: nextRole,
      ...(isActive !== undefined ? { isActive } : {}),
    });
    await target.save();

    await logStaffAction(target.propertyId, req.staff, `Edited staff member — ${target.firstName} ${target.lastName}, now ${describeStaffTier(target)}.`);

    res.status(200).json({
      success: true,
      message: 'Staff updated successfully',
      data: target
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
 * Delete (remove) a staff member. Same "who can manage whom" + last-remaining-tier
 * guard as updateStaff's deactivate path.
 */
export const deleteStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const target = await Staff.findById(id);
    if (!target) return res.status(404).json({ success: false, message: 'Staff not found' });
    if (!canManageTier(req.staff.tier, target.tier)) {
      return res.status(403).json({ success: false, message: `A ${req.staff.tier} cannot remove this account.` });
    }
    if (target.isActive && target.tier !== 'Staff') {
      const activeCount = await Staff.countDocuments({ tier: target.tier, isActive: true });
      if (activeCount <= 1) {
        return res.status(400).json({ success: false, message: `Can't remove the last remaining ${target.tier} account.` });
      }
    }

    await Staff.findByIdAndDelete(id);
    await logStaffAction(target.propertyId, req.staff, `Removed staff member — ${target.firstName} ${target.lastName}, ${describeStaffTier(target)}.`);
    res.status(200).json({ success: true, message: 'Staff member removed' });
  } catch (error) {
    console.error('Delete staff error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete staff', error: error.message });
  }
};

/**
 * Staff Log — append-only, Admin-only (route requires requireTier('Admin'); GM is
 * deliberately excluded, per Staff Management PRD Step 5).
 */
export const getStaffLog = async (req, res) => {
  try {
    const { propertyId } = req.query;
    const filter = {};
    if (propertyId) filter.propertyId = propertyId;

    const log = await StaffActivityLog.find(filter).sort({ createdAt: -1 }).limit(200);
    res.status(200).json({ success: true, count: log.length, data: log });
  } catch (error) {
    console.error('Get staff log error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve staff log', error: error.message });
  }
};
