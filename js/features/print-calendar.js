// BusCommand ESM v9.5
import { showToast } from "../core/utils.js";
import { renderDriverCalendar } from "../driver/calendar.js";
import { t } from "../ui/i18n.js";

function printCurrentSchedule(type) {
    const lang = window.state.language || "en";
    let title = "";
    if (type === "week")   title = t("shift_weekly_view") || "Weekly Schedule";
    else if (type === "month") title = t("calendar_title")     || "Monthly Calendar";
    else                   title = t("settings_drivers_title") || "Drivers";

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
        showToast(t("error_popup_blocked") || "Please allow popups for printing.", "error", 4000);
        return;
    }

    const content = document.getElementById("dispatcher-shifts");
    const html = content ? content.innerHTML : "<p>No content to print.</p>";

    printWindow.document.write(`<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<title>${title} — BusCommand</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #000; margin: 20px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  th { background: #f0f0f0; font-weight: bold; }
  button { display: none; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
<h2>${title}</h2>
${html}
</body>
</html>`);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 400);
}

// ============================================================
// CALENDAR MONTH NAVIGATION
// ============================================================

function changeCalendarMonth(dir) {
    const parts = window.currentCalendarMonth.split("-");
    let year  = parseInt(parts[0]);
    let month = parseInt(parts[1]) - 1; // 0-based
    month += dir;
    if (month < 0)  { month = 11; year--; }
    if (month > 11) { month = 0;  year++; }
    window.currentCalendarMonth = `${year}-${String(month + 1).padStart(2, "0")}`;
    renderDriverCalendar();
}
export {
    printCurrentSchedule,
    changeCalendarMonth
};
