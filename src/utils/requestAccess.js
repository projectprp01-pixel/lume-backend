// Who may do what to a service request (Requests Hub PRD, Steps 5, 6 and 8). Every
// rule lives here so the controller stays a thin shell and the rules can be read (and
// changed) in one place. All checks run against the JWT-authenticated staff document —
// nothing here ever trusts a client-supplied identity or "viewing as" value.

const norm = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');

export const isGlobalViewer = (staff) => staff.tier === 'Admin' || staff.tier === 'GM';

// Roles are free-form per property ("Manager", "Duty Manager", ...), so a manager is any
// department-staff whose role name says so.
export const isDepartmentManager = (staff) => staff.tier === 'Staff' && /manager/i.test(staff.role || '');

const inDepartment = (staff, department) => staff.tier === 'Staff' && norm(staff.department) === norm(department);

// GM/Admin belong to every department: they see, accept, re-route and complete any ticket.
// Everyone else only their own department — never a setting.
export const canViewRequest = (staff, request) => isGlobalViewer(staff) || inDepartment(staff, request.department);

// Anyone who can see a ticket can accept it while it's still New.
export const canAcceptRequest = canViewRequest;

// Re-routing follows the ticket's CURRENT department: that department's manager, or
// GM/Admin (also the fallback when the department has no manager). Regular staff never.
export const canRerouteRequest = (staff, request) =>
  isGlobalViewer(staff) || (isDepartmentManager(staff) && inDepartment(staff, request.department));

/**
 * Completion is atomic to whoever accepted the ticket: that person, or the manager of
 * the department they accepted it under. GM/Admin are part of every department, so they
 * may complete any ticket regardless of who accepted it. Nobody else — not other staff,
 * and not a department's own manager for tickets accepted in a different department.
 */
export function canCompleteRequest(staff, request) {
  if (isGlobalViewer(staff)) return true;
  const accepted = request.acceptedBy;
  if (!accepted?.staffId) {
    // Legacy in-progress ticket from before accept-tracking existed: no acceptor to
    // defer to, so fall back to whoever can re-route it.
    return canRerouteRequest(staff, request);
  }
  if (String(accepted.staffId) === String(staff._id)) return true;
  return isDepartmentManager(staff) && !!accepted.department && norm(staff.department) === norm(accepted.department);
}
