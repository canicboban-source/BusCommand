function itemBelongsToCompany(item, companyId, isDemoMode = false) {
    if (!companyId || !item) return false;
    if (item.companyId === companyId) return true;
    return isDemoMode && !item.companyId;
}

function getCompanyScope(state, currentUser, isDemoMode = false) {
    const companyId = currentUser?.companyId || null;
    const matchCompany = item => itemBelongsToCompany(item, companyId, isDemoMode);
    const groups = (state?.groups || []).filter(matchCompany);
    const groupIds = new Set(groups.map(group => String(group.id)));

    return {
        companyId,
        drivers: (state?.drivers || []).filter(matchCompany),
        buses: (state?.buses || []).filter(matchCompany),
        groups,
        dispatchers: (state?.dispatchers || []).filter(
            dispatcher => dispatcher.id !== "superadmin" && !dispatcher.isSuperAdmin
                && dispatcher.role !== "company_admin" && dispatcher.role !== "company-admin"
                && dispatcher.active !== false && matchCompany(dispatcher)
        ),
        servicePlans: (state?.servicePlans || []).filter(plan =>
            groupIds.has(String(plan.groupId))
            && (!plan.companyId || plan.companyId === companyId)
        )
    };
}

function getCompanyLicenseInfo(companyId, { licenseInfo, state, isDemoMode = false } = {}) {
    if (licenseInfo && licenseInfo.companyId === companyId) {
        const licenseStatus = licenseInfo.licenseStatus
            || (String(licenseInfo.plan || "").toLowerCase() === "trial" ? "trial" : licenseInfo.status)
            || "unknown";
        return {
            plan: licenseInfo.licenseType || licenseInfo.plan || "unknown",
            status: licenseInfo.status || "unknown",
            licenseStatus,
            packageLabel: licenseInfo.packageLabel || null,
            daysRemaining: licenseInfo.daysRemaining ?? null,
            available: true
        };
    }

    if (isDemoMode) {
        const dispatcher = (state?.dispatchers || []).find(
            item => item.companyId === companyId && item.id !== "superadmin" && !item.isSuperAdmin
        );
        const planRaw = dispatcher?.paymentStatus || "Trial";
        const plan = String(planRaw).toLowerCase();
        const isTrial = plan === "trial";
        return {
            plan: isTrial ? "pro" : plan,
            status: "active",
            licenseStatus: isTrial ? "trial" : "active",
            packageLabel: isTrial ? "PRO" : String(planRaw).toUpperCase(),
            daysRemaining: dispatcher?.trialDaysLeft ?? 30,
            available: true
        };
    }

    return {
        plan: "unknown",
        status: "unknown",
        licenseStatus: "unknown",
        packageLabel: null,
        daysRemaining: null,
        available: false
    };
}

function recordBelongsToGroup(record, group, groups) {
    const groupId = String(group.id);
    if (String(record?.groupId || "") === groupId || String(record?.lineId || "") === groupId) return true;
    const recordGroup = groups.find(item => String(item.id) === String(record?.groupId || ""));
    return String(recordGroup?.lineId || "") === groupId;
}

function calculateGroupStats(group, scope) {
    const driverCount = scope.drivers.filter(driver => recordBelongsToGroup(driver, group, scope.groups)).length;
    const busCount = scope.buses.filter(bus => recordBelongsToGroup(bus, group, scope.groups)).length;
    const planCount = scope.servicePlans.filter(plan =>
        String(plan.groupId) === String(group.id) && plan.status === "active"
    ).length;
    const dispatcherCount = scope.dispatchers.filter(dispatcher =>
        dispatcher.active !== false && (dispatcher.groups || []).map(String).includes(String(group.id))
    ).length;
    const missing = [];
    if (driverCount === 0) missing.push("drivers");
    if (busCount === 0) missing.push("buses");
    if (planCount === 0) missing.push("plan");
    if (dispatcherCount === 0) missing.push("dispatcher");
    return { driverCount, busCount, planCount, dispatcherCount, missing, ready: missing.length === 0 };
}

export { itemBelongsToCompany, getCompanyScope, getCompanyLicenseInfo, calculateGroupStats };
