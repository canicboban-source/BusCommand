import ApiClient from "./api-client.js";
import { IS_DEMO_MODE } from "./runtime-config.js";
import { persistCatalogForLine } from "./line-shift-catalog.js";

function servicePlanToCatalog(plan, groupId = plan?.groupId) {
    const entries = {};
    (plan?.duties || []).forEach(duty => {
        entries[duty.code] = {
            code: duty.code,
            label: duty.code,
            dayType: duty.dayType,
            type: "service",
            start: duty.workStart,
            firstTripStart: duty.firstTripStart,
            lastTripEnd: duty.lastTripEnd,
            end: duty.workEnd,
            endDayOffset: duty.endDayOffset || 0,
            startLocation: duty.startLocation || "",
            endLocation: duty.endLocation || "",
            lines: groupId,
            planCode: plan.planCode,
            activities: duty.activities || []
        };
    });
    return entries;
}

function applyServicePlanToCatalog(plan, groupId = plan?.groupId) {
    const targetGroupId = String(groupId || "").trim();
    if (!targetGroupId || !plan?.planCode || !Array.isArray(plan.duties)) return null;
    return persistCatalogForLine(targetGroupId, servicePlanToCatalog(plan, targetGroupId), {
        replace: true,
        locked: true,
        source: "company-service-plan",
        version: plan.planVersion,
        updatedAt: plan.publishedAt || new Date().toISOString()
    });
}

function findDemoPlan(groupId) {
    return (window.state.servicePlans || [])
        .filter(plan => plan.status === "active" && plan.groupId === groupId)
        .sort((a, b) => String(b.validFrom).localeCompare(String(a.validFrom)))[0] || null;
}

async function loadActiveServicePlanForLine(groupId) {
    const targetGroupId = String(groupId || "").trim();
    if (!targetGroupId) return null;
    if (IS_DEMO_MODE) {
        const plan = findDemoPlan(targetGroupId);
        if (plan) applyServicePlanToCatalog(plan, targetGroupId);
        return plan;
    }
    const companyId = window.currentUser?.companyId;
    if (!companyId) return null;
    const result = await ApiClient.getActiveServicePlan(companyId, targetGroupId);
    if (!result.success) return null;
    applyServicePlanToCatalog(result.plan, targetGroupId);
    return result.plan;
}

export {
    applyServicePlanToCatalog,
    findDemoPlan,
    loadActiveServicePlanForLine,
    servicePlanToCatalog
};
