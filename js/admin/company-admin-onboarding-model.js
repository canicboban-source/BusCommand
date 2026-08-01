/**
 * Pure helpers for CA first-run wizard visibility.
 * Server truth (groups / dispatchers) beats the session-only done flag.
 */

function companyScopedItems(items, companyId) {
    return (Array.isArray(items) ? items : []).filter((item) =>
        item
        && typeof item === "object"
        && (!companyId || !item.companyId || item.companyId === companyId)
    );
}

function companyAdminWizardGroups(state, companyId) {
    return companyScopedItems(state?.groups, companyId);
}

function companyAdminWizardDispatchers(state, companyId) {
    return companyScopedItems(state?.dispatchers, companyId).filter((dispatcher) =>
        dispatcher.id !== "superadmin"
        && !dispatcher.isSuperAdmin
        && dispatcher.role !== "company_admin"
        && dispatcher.role !== "company-admin"
    );
}

/**
 * @returns {{
 *   show: boolean,
 *   startStep: number,
 *   alreadyProvisioned: boolean,
 *   hasBranding: boolean,
 *   hasGroup: boolean,
 *   hasDispatcher: boolean
 * }}
 */
function resolveCompanyAdminOnboarding(state, currentUser) {
    if (!currentUser || currentUser.role !== "company-admin") {
        return {
            show: false,
            startStep: 1,
            alreadyProvisioned: false,
            hasBranding: false,
            hasGroup: false,
            hasDispatcher: false
        };
    }

    const companyId = currentUser.companyId || null;
    const hasBranding = Boolean(String(state?.branding?.name || "").trim());
    const hasGroup = companyAdminWizardGroups(state, companyId).length > 0;
    const hasDispatcher = companyAdminWizardDispatchers(state, companyId).length > 0;
    const alreadyProvisioned = hasGroup && hasDispatcher;

    if (alreadyProvisioned) {
        return {
            show: false,
            startStep: 1,
            alreadyProvisioned: true,
            hasBranding,
            hasGroup,
            hasDispatcher
        };
    }

    let startStep = 1;
    if (hasGroup) startStep = 3;
    else if (hasBranding) startStep = 2;

    return {
        show: true,
        startStep,
        alreadyProvisioned: false,
        hasBranding,
        hasGroup,
        hasDispatcher
    };
}

export {
    companyAdminWizardDispatchers,
    companyAdminWizardGroups,
    resolveCompanyAdminOnboarding
};
