import Department from '../../models/Department.model.js';
import ServiceRequest from '../../models/ServiceRequest.model.js';
import Staff from '../../models/Staff.model.js';
import { logStaffAction } from '../../utils/staffLog.js';
import { syncDepartmentRegistry } from '../../ai/departmentRegistry.js';

// ==================== DEPARTMENTS & ROLES ====================
// Staff Management PRD, "Departments and Roles Are Fully Custom" + "Hub Access Is a
// Matrix, Not an Assumption". Route-level requireTier('Admin','GM') gates who can
// reach these at all — there's no per-target check here the way staff.controller.js
// needs, since a department itself has no tier.

/**
 * A staff member's own granted hubs — the one Staff Management-adjacent read that is
 * deliberately NOT gated to Admin/GM (unlike everything else in this file), since a
 * regular department-staff viewer still needs to know their own access to render
 * anything else in the dashboard (Sidebar, route guards). It only ever exposes the
 * caller's own department/role slice of the matrix, never the full roster or matrix —
 * that stays behind requireTier('Admin','GM') on every other route here.
 */
export const getMyAccess = async (req, res) => {
  try {
    const staff = req.staff;
    if (staff.tier === 'Admin' || staff.tier === 'GM') {
      return res.status(200).json({ success: true, data: { tier: staff.tier, department: null, role: null, access: null } });
    }

    const department = await Department.findOne({ propertyId: staff.propertyId, name: staff.department });
    const access = (department?.access && department.access[staff.role]) || {};
    res.status(200).json({ success: true, data: { tier: staff.tier, department: staff.department, role: staff.role, access } });
  } catch (error) {
    console.error('Get my access error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve access', error: error.message });
  }
};

export const getAllDepartments = async (req, res) => {
  try {
    const { propertyId } = req.query;
    const filter = {};
    if (propertyId) filter.propertyId = propertyId;

    const departments = await Department.find(filter).sort({ createdAt: 1 });
    res.status(200).json({ success: true, count: departments.length, data: departments });
  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve departments', error: error.message });
  }
};

/**
 * Create a department. `access` is optional — an omitted or empty matrix means every
 * hub starts off for every role, matching the Add Department modal's default state.
 */
export const createDepartment = async (req, res) => {
  try {
    const { propertyId, name, roles, access } = req.body;
    if (!propertyId || !name || !Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({ success: false, message: 'propertyId, name, and at least one role are required.' });
    }

    const existing = await Department.findOne({ propertyId, name });
    if (existing) {
      return res.status(409).json({ success: false, message: `A department named "${name}" already exists.` });
    }

    const department = await Department.create({ propertyId, name, roles, access: access || {} });
    await syncDepartmentRegistry(propertyId); // AI layer's department list — see src/ai/departmentRegistry.js

    await logStaffAction(propertyId, req.staff, `Created new department — ${name}, with role${roles.length === 1 ? '' : 's'} ${roles.join(', ')}.`);

    res.status(201).json({ success: true, message: 'Department created', data: department });
  } catch (error) {
    console.error('Create department error:', error);
    res.status(500).json({ success: false, message: 'Failed to create department', error: error.message });
  }
};

/**
 * Update a department — renaming, adding/removing roles, or replacing the whole
 * access matrix wholesale (the Departments & Roles UI sends the full `roles`/`access`
 * it's showing rather than diffing individual cells).
 */
export const updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, roles, access } = req.body;

    const department = await Department.findById(id);
    if (!department) return res.status(404).json({ success: false, message: 'Department not found' });

    const previousName = department.name;
    if (name !== undefined && name !== previousName) {
      const clash = await Department.findOne({ propertyId: department.propertyId, name, _id: { $ne: department._id } });
      if (clash) return res.status(409).json({ success: false, message: `A department named "${name}" already exists.` });
    }
    if (roles !== undefined) {
      // A role can't be dropped while someone still holds it — they'd be left in a role that no
      // longer exists, with no matrix row to grant them any hub.
      const dropped = department.roles.filter((r) => !roles.includes(r));
      if (dropped.length) {
        const holders = await Staff.countDocuments({
          propertyId: department.propertyId,
          tier: 'Staff',
          department: previousName,
          role: { $in: dropped },
        });
        if (holders > 0) {
          return res.status(409).json({
            success: false,
            message: `Can't remove ${dropped.join(', ')} — ${holders} staff member${holders === 1 ? ' still holds' : 's still hold'} that role. Reassign them first.`,
          });
        }
      }
    }
    if (name !== undefined) department.name = name;
    if (roles !== undefined) department.roles = roles;
    if (access !== undefined) department.access = access;
    await department.save();

    if (name !== undefined && name !== previousName) {
      // Requests hold the department by name; keep them (and their acceptors' snapshot)
      // pointing at the renamed department instead of orphaning them.
      await ServiceRequest.updateMany(
        { propertyId: department.propertyId, department: previousName },
        { department: name }
      );
      await ServiceRequest.updateMany(
        { propertyId: department.propertyId, 'acceptedBy.department': previousName },
        { 'acceptedBy.department': name }
      );
      // Staff hold their department by name too — carry them along with the rename.
      await Staff.updateMany(
        { propertyId: department.propertyId, tier: 'Staff', department: previousName },
        { department: name }
      );
      await logStaffAction(department.propertyId, req.staff, `Renamed department — ${previousName} to ${name}.`);
    }
    await syncDepartmentRegistry(department.propertyId);

    res.status(200).json({ success: true, message: 'Department updated', data: department });
  } catch (error) {
    console.error('Update department error:', error);
    res.status(500).json({ success: false, message: 'Failed to update department', error: error.message });
  }
};

/**
 * Toggle a single hub for a single role — the actual switch flipped in the
 * Departments & Roles matrix. Kept as its own endpoint (rather than always requiring
 * the whole-matrix PUT above) so the log entry can name exactly what changed.
 */
export const toggleDepartmentAccess = async (req, res) => {
  try {
    const { id } = req.params;
    const { role, hub } = req.body;
    if (!role || !hub) {
      return res.status(400).json({ success: false, message: 'role and hub are required.' });
    }

    const department = await Department.findById(id);
    if (!department) return res.status(404).json({ success: false, message: 'Department not found' });
    if (!department.roles.includes(role)) {
      return res.status(400).json({ success: false, message: `"${role}" is not a role in ${department.name}.` });
    }

    const access = department.access || {};
    const roleAccess = access[role] || {};
    const currentlyOn = !!roleAccess[hub];
    roleAccess[hub] = !currentlyOn;
    access[role] = roleAccess;
    department.access = access;
    department.markModified('access');
    await department.save();

    await logStaffAction(
      department.propertyId,
      req.staff,
      `Edited access — ${department.name} department, ${role} role: ${hub} hub turned ${currentlyOn ? 'off' : 'on'}.`
    );

    res.status(200).json({ success: true, message: 'Access updated', data: department });
  } catch (error) {
    console.error('Toggle department access error:', error);
    res.status(500).json({ success: false, message: 'Failed to update access', error: error.message });
  }
};

/**
 * Remove a department. Refused while any staff member (active or not) is still in it —
 * they would be stranded in a department with no matrix row — and while it is the only
 * department, since open requests always need somewhere to land. Open requests are moved to the
 * registry's new fallback department (an already-accepted one goes back to New, same as a
 * manual re-route); Completed requests keep the name they were closed under as history.
 */
export const deleteDepartment = async (req, res) => {
  try {
    const department = await Department.findById(req.params.id);
    if (!department) return res.status(404).json({ success: false, message: 'Department not found' });
    const { propertyId, name } = department;

    const staffCount = await Staff.countDocuments({ propertyId, tier: 'Staff', department: name });
    if (staffCount > 0) {
      return res.status(409).json({
        success: false,
        message: `Can't remove ${name} — ${staffCount} staff member${staffCount === 1 ? ' is' : 's are'} still in it. Move or remove them first.`,
      });
    }

    const remaining = await Department.find({ propertyId, _id: { $ne: department._id } }).sort({ createdAt: 1, _id: 1 }).lean();
    const openFilter = { propertyId, department: name, status: { $ne: 'Completed' } };
    const openCount = await ServiceRequest.countDocuments(openFilter);
    if (remaining.length === 0 && openCount > 0) {
      return res.status(409).json({
        success: false,
        message: `Can't remove ${name} — it's the only department and ${openCount} open request${openCount === 1 ? ' has' : 's have'} nowhere else to go.`,
      });
    }

    let movedTo = null;
    if (openCount > 0) {
      movedTo = remaining[0].name; // same "oldest department" rule as the registry fallback
      const routing = { source: 'manual', confidencePct: null, reason: `Re-routed from ${name} (department removed)`, routedBy: 'System' };
      const reset = {
        status: 'Pending',
        assignee: '',
        acceptedBy: { staffId: null, name: '', department: null, acceptedAt: null },
      };
      await ServiceRequest.updateMany({ ...openFilter, status: { $in: ['Assigned', 'In-progress'] } }, { department: movedTo, routing, ...reset });
      await ServiceRequest.updateMany({ ...openFilter, status: 'Pending' }, { department: movedTo, routing });
    }

    await Department.deleteOne({ _id: department._id });
    await syncDepartmentRegistry(propertyId);

    await logStaffAction(
      propertyId,
      req.staff,
      `Removed department — ${name}${openCount ? `; ${openCount} open request${openCount === 1 ? '' : 's'} moved to ${movedTo}` : ''}.`
    );

    res.status(200).json({ success: true, message: 'Department removed', data: { id: String(department._id), name, movedRequests: openCount, movedTo } });
  } catch (error) {
    console.error('Delete department error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove department', error: error.message });
  }
};
