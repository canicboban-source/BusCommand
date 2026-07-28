function confirmedTenantId({ firebaseProjectId, tokenCompanyId }) {
    const tenantId = typeof tokenCompanyId === "string" ? tokenCompanyId.trim().toLowerCase() : "";
    if (!tenantId || tenantId === firebaseProjectId) return null;
    return tenantId;
}

function createProductionAuthGate({ firebaseProjectId, onPending, onSignedOut, onAuthenticated, onInvalidTenant, onActivationRequired }) {
    let generation = 0;
    onPending();
    return async function handleAuthState(authUser) {
        const current = ++generation;
        if (!authUser) return onSignedOut();
        const companyId = confirmedTenantId({ firebaseProjectId, tokenCompanyId: authUser.companyId });
        if (!companyId && authUser.role !== "superadmin") return onInvalidTenant();
        if (authUser.role === "driver" && authUser.mustChangeLoginCode === true) {
            return onActivationRequired(authUser, companyId);
        }
        if (current !== generation) return;
        return onAuthenticated(authUser, companyId);
    };
}

export { confirmedTenantId, createProductionAuthGate };
