function normalizeUiRole(role) {
    return role === "company_admin" ? "company-admin" : role;
}

/** CA may view these dispatcher sections (read-only). No write. */
const CA_OPERATIONAL_VIEW_SECTIONS = new Set([
    "dispatcher-dashboard",
    "dispatcher-group-hub",
    "dispatcher-daily-plan-full",
    "dispatcher-daily-plan-pick",
    "dispatcher-monthly-plans-full",
    "dispatcher-monthly-plan-pick",
    "dispatcher-shifts"
]);

function canOpenSection(role, sectionId, _isDemoMode = false) {
    const normalizedRole = normalizeUiRole(role);
    if (sectionId === "dispatcher-settings") return false;
    if (sectionId.startsWith("company-admin-")) return normalizedRole === "company-admin";
    if (sectionId.startsWith("superadmin-")) return normalizedRole === "superadmin";
    if (sectionId.startsWith("driver-")) return normalizedRole === "driver";
    if (sectionId.startsWith("dispatcher-")) {
        if (normalizedRole === "dispatcher") return true;
        if (normalizedRole === "company-admin") return CA_OPERATIONAL_VIEW_SECTIONS.has(sectionId);
        return false;
    }
    return false;
}

/** Only dispatcher writes day/month roster, buses, ops mutations. */
function canWriteOperationalRoster(role) {
    return normalizeUiRole(role) === "dispatcher";
}

function canViewOperationalRoster(role) {
    const normalizedRole = normalizeUiRole(role);
    return normalizedRole === "dispatcher" || normalizedRole === "company-admin";
}

function canBreakPlanEditLock(role) {
    const normalizedRole = normalizeUiRole(role);
    return normalizedRole === "company-admin" || normalizedRole === "superadmin";
}

function canRunCompanyAdminAction(role) {
    return normalizeUiRole(role) === "company-admin";
}

function canRunFactoryReset(role, isDemoMode = false) {
    return isDemoMode && ["dispatcher", "company-admin", "superadmin"].includes(normalizeUiRole(role));
}

export {
    normalizeUiRole,
    CA_OPERATIONAL_VIEW_SECTIONS,
    canOpenSection,
    canWriteOperationalRoster,
    canViewOperationalRoster,
    canBreakPlanEditLock,
    canRunCompanyAdminAction,
    canRunFactoryReset
};
