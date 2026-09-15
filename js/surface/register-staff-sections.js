/**
 * Legacy Staff section barrel (WIDE-36).
 * CA and Dispatcher section/remote-render registration moved to:
 * - js/surface/register-company-admin-sections.js
 * - js/surface/register-dispatcher-sections.js
 * and runs only via ensureStaffRoleGraph after authenticated role is known.
 *
 * Do not statically import role section modules from this file — that would
 * re-merge CA+Dispo into the initial Staff graph.
 */
export function registerStaffSections() {
    throw new Error("registerStaffSections is deferred; call ensureStaffRoleGraph(role) after auth");
}
