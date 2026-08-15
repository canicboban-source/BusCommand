// BusCommand ESM v9.5
import { showToast } from "./utils.js";
import { t } from "../ui/i18n.js";
import { canRunCompanyAdminAction } from "./ui-permissions.js";
import { safeDriverExportRows } from "./export-policy.js";
import { USE_LOCAL_STATE } from "./runtime-config.js";
import ApiClient from "./api-client.js";

const activeExports = new Set();

function companyScoped(records) {
    const companyId = window.currentUser?.companyId;
    if (!companyId) return [];
    return (records || []).filter(record => record.companyId === companyId || (USE_LOCAL_STATE && !record.companyId));
}

function assertExportAllowed() {
    if (canRunCompanyAdminAction(window.currentUser?.role) && window.currentUser?.companyId) return true;
    showToast(t("error_access_denied"), "error");
    return false;
}

function downloadCSV(filename, headers, rows) {
    const escape = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map(row => row.map(escape).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast(t("export_downloaded", { filename }), "success", 3000);
}

async function runCompanyExport(dataset, demoExport) {
    if (!assertExportAllowed()) return false;
    if (activeExports.has(dataset)) return false;
    activeExports.add(dataset);
    try {
        if (USE_LOCAL_STATE) return demoExport();
        const result = await ApiClient.downloadCompanyExport(window.currentUser.companyId, dataset);
        if (!result.success) {
            showToast(result.error || t("export_failed"), "error");
            return false;
        }
        showToast(t("export_downloaded", { filename: result.filename }), "success", 3000);
        return true;
    } finally {
        activeExports.delete(dataset);
    }
}

async function exportReportsCSV() {
    return runCompanyExport("reports", () => {
    const headers = [t("table_time"), t("table_driver"), t("table_bus"), t("table_type"), t("table_reason"), t("table_severity"), t("table_status")];
    const rows = companyScoped(window.state.reports).map(r => [r.time, r.driver, r.bus, r.type, r.reason, r.severity, r.status]);
    downloadCSV("buscommand_reports.csv", headers, rows);
    return true;
    });
}

async function exportDriversCSV() {
    return runCompanyExport("drivers", () => {
    const headers = [t("table_driver"), t("table_bus"), t("group_id_label")];
    const rows = safeDriverExportRows(window.state.drivers, window.currentUser.companyId, true);
    downloadCSV("buscommand_drivers.csv", headers, rows);
    return true;
    });
}

async function exportLostItemsCSV() {
    return runCompanyExport("lost_items", () => {
    const headers = [t("table_time"), t("table_driver"), t("table_bus"), t("table_type"), t("location_label"), t("table_status")];
    const rows = companyScoped(window.state.lostItems).map(i => [i.time, i.driver, i.bus, i.type, i.location || "", i.status]);
    downloadCSV("buscommand_lost_items.csv", headers, rows);
    return true;
    });
}
export {
    downloadCSV,
    exportReportsCSV,
    exportDriversCSV,
    exportLostItemsCSV
};
