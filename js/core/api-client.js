// BusCommand ESM — API klijent (produkcija)

import Auth from "./auth-client.js";

const ApiClient = (() => {
    async function _getToken() {
        if (Auth && Auth.getIdToken) return Auth.getIdToken();
        return null;
    }

    async function apiFetch(path, options = {}) {
        const headers = { ...(options.headers || {}) };
        if (!headers["Content-Type"] && options.body) {
            headers["Content-Type"] = "application/json";
        }
        const token = await _getToken();
        if (token) headers["Authorization"] = "Bearer " + token;
        const res = await window.fetch(path, { ...options, headers });

        let data;
        try {
            data = await res.json();
        } catch {
            data = { success: false, error: "Nevalidan odgovor servera." };
        }

        if (!res.ok) {
            return {
                success: false,
                error: (data && data.error) || ("HTTP " + res.status),
                status: res.status,
                code: data && data.code,
                conflict: data && data.conflict,
                lock: data && data.lock,
                bus: data && data.bus,
                details: data && (data.details || data.errors)
            };
        }

        return data;
    }

    async function getConfig() { return apiFetch("/api/config"); }
    async function getLicense(companyId) {
        return apiFetch("/api/license/" + encodeURIComponent(companyId));
    }
    async function getCompanies() { return apiFetch("/api/admin/companies"); }
    async function getCompanyAdmins() { return apiFetch("/api/admin/company-admins"); }
    async function getSuperAdminOverview() { return apiFetch("/api/admin/overview"); }
    async function getCompanyDetail(companyId) {
        return apiFetch("/api/admin/company/" + encodeURIComponent(companyId));
    }
    async function patchCompanySettings(companyId, settings) {
        return apiFetch("/api/admin/company/" + encodeURIComponent(companyId) + "/settings", {
            method: "PATCH",
            body: JSON.stringify(settings || {})
        });
    }
    async function getPlatformHealth() {
        return apiFetch("/api/health");
    }
    async function setCompanyAdminStatus(companyId, uid, active) {
        return apiFetch(
            "/api/admin/company/" + encodeURIComponent(companyId) + "/admins/" + encodeURIComponent(uid) + "/status",
            { method: "PATCH", body: JSON.stringify({ active }) }
        );
    }
    async function resetCompanyAdminPassword(companyId, uid) {
        return apiFetch(
            "/api/admin/company/" + encodeURIComponent(companyId) + "/admins/" + encodeURIComponent(uid) + "/reset-password",
            { method: "POST", body: "{}" }
        );
    }
    async function setCompanyStatus(companyId, status, reason) {
        return apiFetch("/api/admin/company/" + encodeURIComponent(companyId) + "/status", {
            method: "POST",
            body: JSON.stringify({ status, reason: reason || null })
        });
    }
    async function deleteCompany(companyId, confirmCompanyId) {
        return apiFetch("/api/admin/company/" + encodeURIComponent(companyId) + "/delete", {
            method: "POST",
            body: JSON.stringify({ confirmCompanyId: confirmCompanyId || companyId })
        });
    }
    async function createCompany(data) {
        return apiFetch("/api/admin/create-company", { method: "POST", body: JSON.stringify(data) });
    }
    async function createUser(data) {
        return apiFetch("/api/admin/create-user", { method: "POST", body: JSON.stringify(data) });
    }
    async function updateUserGroups(uid, companyId, groups) {
        return apiFetch("/api/admin/users/" + encodeURIComponent(uid) + "/groups", {
            method: "PUT",
            body: JSON.stringify({ companyId, groups })
        });
    }
    async function createCompanyDispatcher(companyId, dispatcher) {
        return apiFetch("/api/company-admin/dispatchers", {
            method: "POST",
            body: JSON.stringify({ companyId, ...dispatcher })
        });
    }
    async function updateCompanyDispatcherGroups(companyId, uid, groups) {
        return apiFetch("/api/company-admin/dispatchers/" + encodeURIComponent(uid) + "/groups", {
            method: "PUT",
            body: JSON.stringify({ companyId, groups })
        });
    }
    async function setCompanyDispatcherStatus(companyId, uid, active) {
        return apiFetch("/api/company-admin/dispatchers/" + encodeURIComponent(uid) + "/status", {
            method: "PATCH",
            body: JSON.stringify({ companyId, active })
        });
    }
    async function revokeCompanyDispatcherSessions(companyId, uid) {
        return apiFetch("/api/company-admin/dispatchers/" + encodeURIComponent(uid) + "/revoke-sessions", {
            method: "POST",
            body: JSON.stringify({ companyId })
        });
    }
    async function deleteCompanyDispatcher(companyId, uid, confirmEmail) {
        return apiFetch("/api/company-admin/dispatchers/" + encodeURIComponent(uid), {
            method: "DELETE",
            body: JSON.stringify({ companyId, confirmEmail })
        });
    }
    async function updateCompanyProfileSettings(companyId, profile) {
        return apiFetch("/api/company-admin/profile-settings", {
            method: "PUT",
            body: JSON.stringify({ companyId, ...profile })
        });
    }
    async function downloadCompanyExport(companyId, dataset) {
        const token = await _getToken();
        const query = new URLSearchParams({ companyId });
        const response = await window.fetch(
            "/api/company-admin/exports/" + encodeURIComponent(dataset) + "?" + query.toString(),
            { headers: token ? { Authorization: "Bearer " + token } : {} }
        );
        if (!response.ok) {
            let error = "Izvoz podataka nije uspeo.";
            try { error = (await response.json()).error || error; } catch { /* non-JSON error */ }
            return { success: false, status: response.status, error };
        }
        const disposition = response.headers.get("Content-Disposition") || "";
        const filename = disposition.match(/filename="([^"]+)"/i)?.[1] || `buscommand_${dataset}.csv`;
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
        return { success: true, filename };
    }
    async function previewServicePlan(companyId, groupId, plan) {
        return apiFetch("/api/company-admin/service-plans/preview", {
            method: "POST",
            body: JSON.stringify({ companyId, groupId, plan })
        });
    }
    async function publishServicePlan(companyId, groupId, plan, source = {}) {
        return apiFetch("/api/company-admin/service-plans/publish", {
            method: "PUT",
            body: JSON.stringify({ companyId, groupId, plan, source })
        });
    }
    async function activateServicePlan(companyId, groupId, planId) {
        return apiFetch("/api/company-admin/service-plans/" + encodeURIComponent(planId) + "/activate", {
            method: "POST",
            body: JSON.stringify({ companyId, groupId })
        });
    }
    async function previewGroupMonthlyPlanImport(payload) {
        return apiFetch("/api/company-admin/monthly-plans/import/preview", {
            method: "POST",
            body: JSON.stringify(payload)
        });
    }
    async function commitGroupMonthlyPlanImport(companyId, importId, fingerprint) {
        return apiFetch("/api/company-admin/monthly-plans/import/commit", {
            method: "PUT",
            body: JSON.stringify({ companyId, importId, fingerprint })
        });
    }
    async function getActiveServicePlan(companyId, groupId) {
        const query = new URLSearchParams({ companyId, groupId });
        return apiFetch("/api/staff/service-plans/active?" + query.toString());
    }
    async function getServicePlanHistory(companyId, groupId) {
        const query = new URLSearchParams({ companyId, groupId });
        return apiFetch("/api/company-admin/service-plans/history?" + query.toString());
    }
    async function getServicePlanVersion(companyId, groupId, planId) {
        const query = new URLSearchParams({ companyId, groupId });
        return apiFetch("/api/company-admin/service-plans/" + encodeURIComponent(planId) + "?" + query.toString());
    }
    async function getCompanyAudit(companyId, filters = {}) {
        const query = new URLSearchParams({ companyId, limit: String(filters.limit || 25) });
        for (const key of ["category", "actor", "action", "from", "to", "cursor"]) {
            if (filters[key]) query.set(key, filters[key]);
        }
        return apiFetch("/api/company-admin/audit?" + query.toString());
    }
    async function updateCompanyBranding(companyId, branding) {
        return apiFetch("/api/company-admin/branding", {
            method: "PUT",
            body: JSON.stringify({ companyId, ...branding })
        });
    }
    async function createCompanyGroup(companyId, group) {
        return apiFetch("/api/company-admin/groups", {
            method: "POST",
            body: JSON.stringify({ companyId, ...group })
        });
    }
    async function updateCompanyGroup(companyId, groupId, group) {
        return apiFetch("/api/company-admin/groups/" + encodeURIComponent(groupId), {
            method: "PUT",
            body: JSON.stringify({ companyId, ...group })
        });
    }
    async function deleteCompanyGroup(companyId, groupId) {
        const query = new URLSearchParams({ companyId });
        return apiFetch("/api/company-admin/groups/" + encodeURIComponent(groupId) + "?" + query.toString(), {
            method: "DELETE"
        });
    }
    async function reportStateSync(details) {
        return apiFetch("/api/staff/audit/state-sync", { method: "POST", body: JSON.stringify(details) });
    }
    async function importDriversCsv(companyId, groupId, csv) {
        return apiFetch("/api/staff/drivers/import", {
            method: "POST",
            body: JSON.stringify({ companyId, groupId, csv })
        });
    }
    async function setDriverActive(driverId, active) {
        return apiFetch("/api/staff/drivers/" + encodeURIComponent(driverId) + "/status", {
            method: "PUT",
            body: JSON.stringify({ active })
        });
    }
    async function updateCompanyDriver(companyId, driverId, payload) {
        return apiFetch("/api/company-admin/drivers/" + encodeURIComponent(driverId), {
            method: "PATCH",
            body: JSON.stringify({ companyId, ...payload })
        });
    }
    async function listCompanyDrivers(companyId) {
        const query = companyId ? ("?companyId=" + encodeURIComponent(companyId)) : "";
        return apiFetch("/api/company-admin/drivers" + query);
    }
    async function setCompanyDriverPersonalCode(companyId, driverId, companyCode) {
        return apiFetch("/api/company-admin/drivers/" + encodeURIComponent(driverId) + "/personal-code", {
            method: "POST",
            body: JSON.stringify({ companyId, companyCode })
        });
    }
    async function createDriverReport(report) {
        return apiFetch("/api/driver/reports", {
            method: "POST",
            body: JSON.stringify(report)
        });
    }
    async function createDriverSos(bus) {
        return apiFetch("/api/driver/sos", {
            method: "POST",
            body: JSON.stringify({ bus: bus || "" })
        });
    }
    async function sendStaffMessage(message) {
        return apiFetch("/api/staff/messages", {
            method: "POST",
            body: JSON.stringify(message)
        });
    }
    async function markDriverMessageRead(messageId) {
        return apiFetch("/api/driver/messages/" + encodeURIComponent(messageId) + "/read", {
            method: "PUT"
        });
    }
    async function archiveDriverMessage(messageId) {
        return apiFetch("/api/driver/messages/" + encodeURIComponent(messageId) + "/archive", {
            method: "PUT"
        });
    }
    async function ackDriverMessage(messageId) {
        return apiFetch("/api/driver/messages/" + encodeURIComponent(messageId) + "/ack", {
            method: "PUT"
        });
    }
    async function archiveStaffMessage(messageId) {
        return apiFetch("/api/staff/messages/" + encodeURIComponent(messageId) + "/archive", {
            method: "PUT"
        });
    }
    async function createDriverLostItem(item) {
        return apiFetch("/api/driver/lost-items", {
            method: "POST",
            body: JSON.stringify(item)
        });
    }
    async function createDriverVacation(vacation) {
        return apiFetch("/api/driver/vacations", {
            method: "POST",
            body: JSON.stringify(vacation)
        });
    }
    async function setVacationStatus(vacationId, status) {
        return apiFetch("/api/staff/vacations/" + encodeURIComponent(vacationId) + "/status", {
            method: "PUT",
            body: JSON.stringify({ status })
        });
    }
    async function resolveStaffSos() {
        return apiFetch("/api/staff/sos/resolve", {
            method: "PUT",
            body: JSON.stringify({})
        });
    }
    async function setLostItemStatus(itemId, status) {
        return apiFetch("/api/staff/lost-items/" + encodeURIComponent(itemId) + "/status", {
            method: "PUT",
            body: JSON.stringify({ status })
        });
    }
    async function resolveStaffReport(reportId, resolution) {
        return apiFetch("/api/staff/reports/" + encodeURIComponent(reportId) + "/resolve", {
            method: "PUT",
            body: JSON.stringify(resolution || {})
        });
    }
    async function createStaffBus(number, groupId, extras = {}) {
        return apiFetch("/api/staff/buses", {
            method: "POST",
            body: JSON.stringify({
                number,
                groupId,
                garage: extras.garage || "",
                opsStatus: extras.opsStatus || "ready"
            })
        });
    }
    async function updateStaffBus(busId, payload) {
        return apiFetch("/api/staff/buses/" + encodeURIComponent(busId), {
            method: "PUT",
            body: JSON.stringify(payload || {})
        });
    }
    async function setStaffBusActive(busId, active, expectedRevision = 0) {
        return apiFetch("/api/staff/buses/" + encodeURIComponent(busId) + "/status", {
            method: "PUT",
            body: JSON.stringify({
                active,
                expectedRevision: Number.isInteger(expectedRevision) ? expectedRevision : 0
            })
        });
    }
    async function createStaffOperationalIncident(incident) {
        return apiFetch("/api/staff/operational-incidents", {
            method: "POST",
            body: JSON.stringify(incident)
        });
    }
    async function transitionStaffOperationalIncident(reportId, payload) {
        return apiFetch("/api/staff/operational-incidents/" + encodeURIComponent(reportId) + "/transition", {
            method: "PUT",
            body: JSON.stringify(payload)
        });
    }
    async function resolveStaffOperationalIncident(reportId, resolution) {
        return apiFetch("/api/staff/operational-incidents/" + encodeURIComponent(reportId) + "/resolve", {
            method: "PUT",
            body: JSON.stringify(resolution)
        });
    }
    async function getStaffOpsActivity(limit = 20) {
        const q = new URLSearchParams({ limit: String(limit) });
        return apiFetch(`/api/staff/ops-activity?${q}`);
    }
    async function assignStaffShift(shift) {
        return apiFetch("/api/staff/shifts/assignment", {
            method: "PUT",
            body: JSON.stringify(shift)
        });
    }
    async function undoStaffShift(payload) {
        return apiFetch("/api/staff/shifts/assignment/undo", {
            method: "POST",
            body: JSON.stringify(payload)
        });
    }
    async function acquirePlanLock({ scopeType, groupId, scopeKey }) {
        return apiFetch("/api/staff/plan-locks/acquire", {
            method: "POST",
            body: JSON.stringify({ scopeType, groupId, scopeKey })
        });
    }
    async function heartbeatPlanLock(lockId) {
        return apiFetch("/api/staff/plan-locks/heartbeat", {
            method: "POST",
            body: JSON.stringify({ lockId })
        });
    }
    async function releasePlanLock(lockId) {
        return apiFetch("/api/staff/plan-locks/release", {
            method: "POST",
            body: JSON.stringify({ lockId })
        });
    }
    async function breakPlanLock(lockId, reason) {
        return apiFetch("/api/staff/plan-locks/break", {
            method: "POST",
            body: JSON.stringify({ lockId, reason })
        });
    }
    async function getPlanLock(lockId) {
        return apiFetch("/api/staff/plan-locks/" + encodeURIComponent(lockId));
    }
    async function getDriverWorkSession() {
        return apiFetch("/api/driver/work-session");
    }
    async function postDriverLocation(location) {
        return apiFetch("/api/driver/location", {
            method: "POST",
            body: JSON.stringify(location || {})
        });
    }
    async function reportStaffMapAccess() {
        return apiFetch("/api/staff/map-access", {
            method: "PUT",
            body: "{}"
        });
    }
    async function confirmDriverShifts(dates) {
        return apiFetch("/api/driver/shift-confirmations", {
            method: "POST",
            body: JSON.stringify({ dates })
        });
    }
    async function getStaffShiftConfirmations({ from, to } = {}) {
        const query = new URLSearchParams();
        if (from) query.set("from", from);
        if (to) query.set("to", to);
        const suffix = query.toString() ? `?${query}` : "";
        return apiFetch(`/api/staff/shift-confirmations${suffix}`);
    }
    async function startSupportSession(companyId, payload) {
        return apiFetch(`/api/admin/companies/${encodeURIComponent(companyId)}/support-sessions`, {
            method: "POST",
            body: JSON.stringify(payload)
        });
    }
    async function getActiveSupportSessionAdmin(companyId) {
        return apiFetch(`/api/admin/companies/${encodeURIComponent(companyId)}/support-sessions/active`);
    }
    async function endSupportSessionAdmin(sessionId, companyId) {
        return apiFetch(`/api/admin/support-sessions/${encodeURIComponent(sessionId)}/end`, {
            method: "POST",
            body: JSON.stringify({ companyId })
        });
    }
    async function getCompanySupportSession() {
        return apiFetch("/api/company-admin/support-session");
    }
    async function endCompanySupportSession() {
        return apiFetch("/api/company-admin/support-session/end", { method: "POST", body: "{}" });
    }

    return {
        fetch: apiFetch, getConfig, getLicense, getCompanies, getCompanyAdmins, getSuperAdminOverview,
        getCompanyDetail, patchCompanySettings, getPlatformHealth, setCompanyAdminStatus, resetCompanyAdminPassword,
        setCompanyStatus, deleteCompany, createCompany, createUser, updateUserGroups,
        createCompanyDispatcher, updateCompanyDispatcherGroups,
        setCompanyDispatcherStatus, revokeCompanyDispatcherSessions, deleteCompanyDispatcher,
        updateCompanyProfileSettings, downloadCompanyExport,
        previewServicePlan, publishServicePlan, activateServicePlan, previewGroupMonthlyPlanImport, commitGroupMonthlyPlanImport,
        getActiveServicePlan, getServicePlanHistory, getServicePlanVersion, getCompanyAudit, updateCompanyBranding,
        createCompanyGroup, updateCompanyGroup, deleteCompanyGroup, reportStateSync, importDriversCsv, setDriverActive,
        updateCompanyDriver, listCompanyDrivers, setCompanyDriverPersonalCode,
        createDriverReport, createDriverSos, markDriverMessageRead, archiveDriverMessage, ackDriverMessage,
        createDriverLostItem, createDriverVacation, setVacationStatus, resolveStaffReport, createStaffOperationalIncident, transitionStaffOperationalIncident, resolveStaffOperationalIncident, getStaffOpsActivity, resolveStaffSos,
        setLostItemStatus, createStaffBus, updateStaffBus, setStaffBusActive, assignStaffShift, undoStaffShift,
        acquirePlanLock, heartbeatPlanLock, releasePlanLock, breakPlanLock, getPlanLock,
        sendStaffMessage, archiveStaffMessage, getDriverWorkSession, postDriverLocation, reportStaffMapAccess, confirmDriverShifts, getStaffShiftConfirmations,
        startSupportSession, getActiveSupportSessionAdmin, endSupportSessionAdmin,
        getCompanySupportSession, endCompanySupportSession
    };
})();

export { ApiClient };
export default ApiClient;
