function normalizeUiRole(role) {
    return role === "company_admin" ? "company-admin" : role;
}

function canOpenSection(role, sectionId, _isDemoMode = false) {
    const normalizedRole = normalizeUiRole(role);
    if (sectionId === "dispatcher-settings") return false;
    if (sectionId.startsWith("company-admin-")) return normalizedRole === "company-admin";
    if (sectionId.startsWith("superadmin-")) return normalizedRole === "superadmin";
    if (sectionId.startsWith("driver-")) return normalizedRole === "driver";
    if (sectionId.startsWith("dispatcher-")) return normalizedRole === "dispatcher";
    return false;
}

function canRunCompanyAdminAction(role) {
    return normalizeUiRole(role) === "company-admin";
}

function canRunFactoryReset(role, isDemoMode = false) {
    return isDemoMode && ["dispatcher", "company-admin", "superadmin"].includes(normalizeUiRole(role));
}

export { normalizeUiRole, canOpenSection, canRunCompanyAdminAction, canRunFactoryReset };
