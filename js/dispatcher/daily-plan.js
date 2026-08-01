// BusCommand — dnevni plan (poz. 1 = x2 Bereitschaft) — editable slots
import { getDailyPlanForDate, getActiveBereitschaftCode, getShiftForDriverDate } from "../core/shift-plan.js";
import { todayDateStr, escapeHtml, getVisibleDrivers, showToast } from "../core/utils.js";
import { getGroupById } from "../data/groups.js";
import { t } from "../ui/i18n.js";
import { actionAttr, changeAttr } from "../core/action-delegate.js";
import { persistShift } from "./shifts.js";

function getActiveHubGroupId() {
    return window.state.activeGroupHubId || null;
}

function getDailyPlanDateInput() {
    return document.getElementById("daily-plan-date-picker")
        || document.getElementById("schedule-date-picker");
}

function currentPlanDate() {
    return todayDateStr();
}

function driverOptions(selectedName) {
    return getVisibleDrivers().map(driver =>
        `<option value="${escapeHtml(driver.name)}" ${driver.name === selectedName ? "selected" : ""}>${escapeHtml(driver.name)}</option>`
    ).join("");
}

function busOptions(selectedBus) {
    const options = (window.state.buses || []).map(b => {
        const num = String(b.number ?? "");
        return `<option value="${escapeHtml(num)}" ${num === String(selectedBus || "") ? "selected" : ""}>Bus ${escapeHtml(num)}</option>`;
    }).join("");
    return `<option value="">—</option>${options}`;
}

function buildDailyPlanTable(slots, { compact = false, editable = false, dateStr = "" } = {}) {
    if (!slots.length) return "";

    const fontSize = compact ? "0.78rem" : "0.9rem";
    const pad = compact ? "6px 8px" : "10px 12px";
    const date = dateStr || currentPlanDate();

    return `
        <table class="daily-plan-table" style="width:100%;border-collapse:collapse;font-size:${fontSize};">
            <thead>
                <tr style="color:var(--text-muted);text-align:left;border-bottom:1px solid rgba(255,255,255,0.08);">
                    <th style="padding:${pad};width:48px;">${t("daily_col_pos")}</th>
                    <th style="padding:${pad};">${t("daily_col_shift")}</th>
                    <th style="padding:${pad};">${t("daily_col_driver")}</th>
                    <th style="padding:${pad};">${t("table_bus") || "Autobus"}</th>
                    <th style="padding:${pad};">${t("daily_col_time")}</th>
                    ${editable ? `<th style="padding:${pad};">${t("table_actions") || "Akcija"}</th>` : ""}
                </tr>
            </thead>
            <tbody>
                ${slots.map((slot) => {
                    const isBr = slot.position === 1 && slot.type === "bereitschaft";
                    const rowBg = isBr ? "rgba(245,158,11,0.08)" : "transparent";
                    const codeLabel = slot.shortName ? `${slot.code} (${slot.shortName})` : (slot.code || slot.name);
                    const time = slot.start && slot.end ? `${slot.start}\u2013${slot.end}` : "\u2014";
                    const driverName = slot.driverName || "";
                    const shift = driverName ? getShiftForDriverDate(driverName, date) : null;
                    const bus = shift?.bus || "";
                    if (!editable) {
                        return `<tr style="background:${rowBg};border-bottom:1px solid rgba(255,255,255,0.04);">
                            <td style="padding:${pad};font-weight:700;color:${isBr ? "#f59e0b" : "var(--text-main)"};">${escapeHtml(String(slot.position ?? ""))}</td>
                            <td style="padding:${pad};">${escapeHtml(codeLabel || "")}</td>
                            <td style="padding:${pad};font-weight:600;">${escapeHtml(driverName || "\u2014")}</td>
                            <td style="padding:${pad};">${escapeHtml(bus || "\u2014")}</td>
                            <td style="padding:${pad};color:var(--text-muted);">${escapeHtml(time)}</td>
                        </tr>`;
                    }
                    return `<tr style="background:${rowBg};border-bottom:1px solid rgba(255,255,255,0.04);">
                        <td style="padding:${pad};font-weight:700;color:${isBr ? "#f59e0b" : "var(--text-main)"};">${escapeHtml(String(slot.position ?? ""))}</td>
                        <td style="padding:${pad};">${escapeHtml(codeLabel || "")}</td>
                        <td style="padding:${pad};">
                            <select class="ops-edit-select" ${changeAttr("dailyPlanAssignDriver", [date, slot.type || "morning", slot.code || ""], "args-value")} aria-label="${escapeHtml(t("daily_col_driver") || "Vozač")}">
                                <option value="">—</option>
                                ${driverOptions(driverName)}
                            </select>
                        </td>
                        <td style="padding:${pad};">
                            <select class="ops-edit-select" ${driverName ? changeAttr("updateDriverBusInline", [driverName], "args-value") : "disabled"} aria-label="${escapeHtml(t("table_bus") || "Bus")}">
                                ${busOptions(bus)}
                            </select>
                        </td>
                        <td style="padding:${pad};color:var(--text-muted);">${escapeHtml(time)}</td>
                        <td style="padding:${pad};">
                            ${driverName
                                ? `<button type="button" class="btn-secondary" ${actionAttr("openShiftCell", [driverName, date])}>${escapeHtml(t("ops_btn_edit") || "Izmeni")}</button>`
                                : `<span style="color:var(--text-muted);font-size:0.75rem;">${escapeHtml(t("ops_pick_driver") || "Izaberite vozača")}</span>`}
                        </td>
                    </tr>`;
                }).join("")}
            </tbody>
        </table>`;
}

function renderDailyPlanMeta(plan, metaEl, { full = false } = {}) {
    if (!metaEl) return;
    const brCode = getActiveBereitschaftCode() || "X2";
    const driver = plan.bereitschaftDriver || "\u2014";
    const key = plan.isWeekday
        ? (full ? "daily_pos1_meta_full" : "daily_pos1_meta")
        : (full ? "daily_weekend_meta_full" : "daily_weekend_meta");
    const replacements = plan.isWeekday
        ? { code: brCode, driver, ...(full ? { total: plan.slots.length } : {}) }
        : (full ? { total: plan.slots.length } : {});
    metaEl.textContent = t(key, replacements);
}

function renderEmptyState(container, message) {
    container.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "plan-empty-state";
    empty.textContent = message;
    container.appendChild(empty);
}

function renderDailyPlanPanel(dateStr) {
    const container = document.getElementById("daily-plan-slots");
    const metaEl = document.getElementById("daily-plan-meta");
    if (!container) return;

    const date = dateStr || getDailyPlanDateInput()?.value || todayDateStr();
    const plan = getDailyPlanForDate(date);
    renderDailyPlanMeta(plan, metaEl);
    if (!plan.slots.length) return renderEmptyState(container, t("daily_no_shifts", { date }));
    container.innerHTML = buildDailyPlanTable(plan.slots, { editable: true, dateStr: date });
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function renderDailyPlanFullPage() {
    const container = document.getElementById("daily-plan-full-slots");
    const metaEl = document.getElementById("daily-plan-full-meta");
    const subtitle = document.getElementById("daily-full-subtitle");
    const picker = document.getElementById("daily-plan-date-picker");
    if (!container) return;
    const today = todayDateStr();
    if (picker) {
        picker.value = today;
        picker.min = today;
        picker.max = today;
        picker.readOnly = true;
    }

    const groupId = getActiveHubGroupId();
    const group = groupId ? getGroupById(groupId) : null;
    if (subtitle && group) subtitle.textContent = t("daily_full_subtitle", { name: group.name, id: group.id });

    const date = today;
    const plan = getDailyPlanForDate(date);
    renderDailyPlanMeta(plan, metaEl, { full: true });
    if (!plan.slots.length) return renderEmptyState(container, t("daily_no_shifts_full", { date }));
    container.innerHTML = buildDailyPlanTable(plan.slots, { editable: true, dateStr: date });
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function bindDailyPlanFullPage() {
    const picker = document.getElementById("daily-plan-date-picker");
    if (picker) {
        const today = todayDateStr();
        picker.value = today;
        picker.min = today;
        picker.max = today;
        picker.readOnly = true;
    }
}

function renderHubDailyPreview() {
    const el = document.getElementById("hub-daily-preview");
    const dateLabel = document.getElementById("hub-daily-date-label");
    if (!el) return;
    const date = todayDateStr();
    if (dateLabel) {
        const d = new Date(`${date}T12:00:00`);
        const lang = window.state.language || "en";
        dateLabel.textContent = d.toLocaleDateString(lang === "sr" ? "sr-RS" : lang, { weekday: "short", day: "numeric", month: "short" });
    }
    const plan = getDailyPlanForDate(date);
    if (!plan.slots.length) return renderEmptyState(el, t("daily_no_shifts_today"));

    const preview = plan.slots.slice(0, 4);
    el.innerHTML = buildDailyPlanTable(preview, { compact: true, editable: false, dateStr: date });
    if (plan.slots.length > 4) {
        const more = document.createElement("p");
        more.style.cssText = "margin:8px 0 0;color:var(--text-muted);font-size:0.75rem;";
        more.textContent = t("hub_monthly_more", { count: plan.slots.length - 4 });
        el.appendChild(more);
    }
}

function refreshDailyPlanOnDateChange() {
    const picker = document.getElementById("schedule-date-picker");
    if (picker && !picker.dataset.dailyPlanBound) {
        picker.dataset.dailyPlanBound = "1";
        picker.addEventListener("change", () => renderDailyPlanPanel(picker.value));
    }
    renderDailyPlanPanel(picker?.value);
}

/**
 * Assign selected driver to a daily-plan slot type for the given date.
 * changeAttr passes the select value as the last argument.
 */
async function dailyPlanAssignDriver(dateStr, shiftType, routeCode, driverName) {
    const today = todayDateStr();
    if (dateStr !== today) {
        showToast(t("shift_future_monthly_only"), "error");
        return;
    }
    const planBeforeChange = getDailyPlanForDate(today);
    const type = shiftType || "morning";
    const currentSlot = planBeforeChange.slots.find(slot =>
        String(slot.code || "") === String(routeCode || "")
        && String(slot.type || "morning") === String(type)
    );
    const previousDriver = currentSlot?.driverName
        ? getVisibleDrivers().find(driver => driver.name === currentSlot.driverName)
        : null;
    const nextDriver = driverName
        ? getVisibleDrivers().find(driver => driver.name === driverName)
        : null;

    if (driverName && !nextDriver) return;
    if (previousDriver?.id === nextDriver?.id) return;

    if (previousDriver) {
        const previousDriverId = previousDriver.id || previousDriver.uid;
        const incident = (window.state.reports || []).find(report =>
            report.status === "active"
            && report.type === "coverage:disruption"
            && report.driverId === previousDriverId
            && report.date === today
        );
        const preferredReplacementDriverId = nextDriver ? (nextDriver.id || nextDriver.uid || "") : "";
        if (incident && typeof window.openCoverageResolver === "function") {
            window.openCoverageResolver(incident.id, preferredReplacementDriverId);
        } else if (typeof window.openOperationalIncident === "function") {
            window.openOperationalIncident(previousDriver.name, preferredReplacementDriverId);
        }
        renderDailyPlanFullPage();
        renderDailyPlanPanel(today);
        return;
    }

    if (!nextDriver) return;
    const assigned = await persistShift(
        nextDriver,
        today,
        type,
        routeCode || "",
        currentSlot?.start || null,
        currentSlot?.end || null,
        nextDriver.bus || ""
    );
    if (!assigned) return;
    showToast(t("ops_assigned_toast", { driver: nextDriver.name, type }), "success");
    renderDailyPlanFullPage();
    renderDailyPlanPanel(today);
    if (typeof window.renderDispatcherDashboard === "function") window.renderDispatcherDashboard();
}

if (typeof window.addEventListener === "function" && !window.__buscommandPlanUpdatedListener) {
    window.__buscommandPlanUpdatedListener = true;
    window.addEventListener("buscommand:plan-updated", (event) => {
        const date = event.detail?.date || todayDateStr();
        renderDailyPlanFullPage();
        renderDailyPlanPanel(date);
    });
}

export {
    renderDailyPlanPanel,
    renderDailyPlanFullPage,
    renderHubDailyPreview,
    bindDailyPlanFullPage,
    refreshDailyPlanOnDateChange,
    dailyPlanAssignDriver
};
