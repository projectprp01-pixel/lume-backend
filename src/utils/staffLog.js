import StaffActivityLog from '../models/StaffActivityLog.model.js';

// Shared by staff.controller.js and department.controller.js (Staff Management writes)
// and auth.controller.js (password resets) — every administrative action funnels
// through here so the Staff Log tab stays a single, consistent append-only record.

export function describeStaffTier(s) {
  if (s.tier === 'Admin') return 'Admin';
  if (s.tier === 'GM') return 'GM';
  return `${s.department} · ${s.role}`;
}

export async function logStaffAction(propertyId, actorStaff, action) {
  try {
    await StaffActivityLog.create({
      propertyId,
      actorStaffId: actorStaff._id,
      actorName: `${actorStaff.firstName} ${actorStaff.lastName}`,
      actorRole: describeStaffTier(actorStaff),
      action,
    });
  } catch (error) {
    // A failed log write should never block the underlying action — same posture as
    // this codebase's other fire-and-forget side effects (see sendNewStaffAddedEmail).
    console.error('Failed to write staff activity log:', error);
  }
}

// Admin can add/edit/remove anyone, including other Admins and every GM. GM can
// add/edit/remove any GM or any department staff, but never an Admin account — no
// self-exception either way. Department staff can never manage anyone (Staff
// Management PRD, "Who Can Manage Whom").
export function canManageTier(viewerTier, targetTier) {
  if (viewerTier === 'Admin') return true;
  if (viewerTier === 'GM') return targetTier !== 'Admin';
  return false;
}
