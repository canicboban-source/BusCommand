// BusCommand ESM v9.5
import { showToast } from "./utils.js";
import { t } from "../ui/i18n.js";

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
    showToast("✅ " + filename + " downloaded", "success", 3000);
}

function exportReportsCSV() {
    const headers = [t("table_time") || "Time", t("table_driver") || "Driver", t("table_bus") || "Bus", t("table_type") || "Type", t("table_reason") || "Reason", t("table_severity") || "Severity", t("table_status") || "Status"];
    const rows = (window.state.reports || []).map(r => [r.time, r.driver, r.bus, r.type, r.reason, r.severity, r.status]);
    downloadCSV("buscommand_reports.csv", headers, rows);
}

function exportDriversCSV() {
    const headers = [t("table_driver") || "Driver", t("table_bus") || "Bus", "PIN", "Group ID"];
    const rows = (window.state.drivers || []).map(d => [d.name, d.bus, d.pin, d.groupId || ""]);
    downloadCSV("buscommand_drivers.csv", headers, rows);
}

function exportLostItemsCSV() {
    const headers = [t("table_time") || "Time", t("table_driver") || "Driver", t("table_bus") || "Bus", t("table_type") || "Type", "Location", t("table_status") || "Status"];
    const rows = (window.state.lostItems || []).map(i => [i.time, i.driver, i.bus, i.type, i.location || "", i.status]);
    downloadCSV("buscommand_lost_items.csv", headers, rows);
}
export {
    downloadCSV,
    exportReportsCSV,
    exportDriversCSV,
    exportLostItemsCSV
};
