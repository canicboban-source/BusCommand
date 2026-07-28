const ACTIVE_REPORT_STATUSES = new Set(["active", "aktivno", "open"]);
const RESOLVED_REPORT_STATUSES = new Set(["resolved", "rešeno", "reseno", "status_resolved"]);

function normalizedReportStatus(value) {
    return String(value || "active").trim().toLowerCase();
}

function isActiveReport(report) {
    return ACTIVE_REPORT_STATUSES.has(normalizedReportStatus(report?.status));
}

function isResolvedReport(report) {
    return RESOLVED_REPORT_STATUSES.has(normalizedReportStatus(report?.status));
}

function normalizeGroupIds(values) {
    return [...new Set((Array.isArray(values) ? values : [])
        .map(value => String(value || "").trim())
        .filter(Boolean))];
}

function dispatcherGroupIds(currentUser, dispatchers = []) {
    if (!currentUser || currentUser.role !== "dispatcher") return [];
    const userId = currentUser.uid || currentUser.id;
    const profile = dispatchers.find(dispatcher => (dispatcher.uid || dispatcher.id) === userId);
    return normalizeGroupIds(profile ? profile.groups : currentUser.groups);
}

function reportGroupId(report, drivers, { demo = false } = {}) {
    const direct = String(report?.groupId || report?.lineId || "").trim();
    if (direct) return direct;
    const byId = report?.driverId
        ? drivers.find(driver => (driver.uid || driver.id) === report.driverId)
        : null;
    if (byId?.groupId || byId?.lineId) return String(byId.groupId || byId.lineId);
    if (!demo || !report?.driver) return "";
    const byName = drivers.find(driver => driver.name === report.driver);
    return String(byName?.groupId || byName?.lineId || "");
}

function scopedDispatcherReports({ reports = [], drivers = [], dispatchers = [], currentUser, activeGroupId = "", demo = false }) {
    const groups = dispatcherGroupIds(currentUser, dispatchers);
    if (!groups.length) return [];
    const allowed = new Set(activeGroupId && groups.includes(activeGroupId) ? [activeGroupId] : groups);
    return reports.filter(report => allowed.has(reportGroupId(report, drivers, { demo })));
}

function reportTimestamp(report) {
    const value = report?.createdAt || report?.reportedAt || report?.timestamp;
    if (typeof value?.toMillis === "function") return value.toMillis();
    if (Number.isFinite(value?.seconds)) return value.seconds * 1000;
    if (value instanceof Date) return value.getTime();
    const direct = Date.parse(String(value || ""));
    if (Number.isFinite(direct)) return direct;
    const legacy = Date.parse(`${report?.date || "1970-01-01"}T${report?.time || "00:00"}:00`);
    return Number.isFinite(legacy) ? legacy : 0;
}

function sortReportsForOperations(reports = []) {
    return [...reports].sort((left, right) => {
        const statusOrder = Number(isActiveReport(right)) - Number(isActiveReport(left));
        return statusOrder || reportTimestamp(right) - reportTimestamp(left) || String(right.id || "").localeCompare(String(left.id || ""));
    });
}

function reportKind(report) {
    const type = String(report?.type || "");
    if (type.startsWith("coverage:")) return { kind: "coverage", detail: type.slice("coverage:".length) };
    if (type.startsWith("breakdown:")) return { kind: "breakdown", detail: type.slice("breakdown:".length) };
    if (type.startsWith("delay:")) return { kind: "delay", detail: type.slice("delay:".length) };
    if (/kvar|breakdown/i.test(type)) return { kind: "breakdown", detail: type.replace(/^KVAR:\s*/i, "") };
    return { kind: "delay", detail: type.match(/\d+/)?.[0] || "" };
}

export {
    dispatcherGroupIds,
    isActiveReport,
    isResolvedReport,
    normalizedReportStatus,
    reportGroupId,
    reportKind,
    reportTimestamp,
    scopedDispatcherReports,
    sortReportsForOperations
};
