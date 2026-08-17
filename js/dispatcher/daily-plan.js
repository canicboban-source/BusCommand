// BusCommand — dnevni plan (poz. 1 = x2 Bereitschaft) — editable slots
import { getDailyPlanForDate, getActiveBereitschaftCode, getShiftForDriverDate } from "../core/shift-plan.js";
import { todayDateStr, escapeHtml, getVisibleDrivers, showToast } from "../core/utils.js";
import { getGroupById } from "../data/groups.js";
import { t } from "../ui/i18n.js";
import { actionAttr, changeAttr } from "../core/action-delegate.js";
import { persistShift, removeShift, undoShift } from "./shifts.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { isOperationalReadOnly } from "../core/access.js";
import { refreshPlanLockBanner } from "./plan-edit-lock-ui.js";
import { isActiveReport } from "./report-model.js";
import { paintPlanHealthBanner } from "./plan-health-banner.js";
import { collectAllAttentionItems } from "./ops-attention.js";

/** DnD state — tracks the driver being dragged between pool and slots. */
let draggedDriverName = null;

function getActiveHubGroupId() {
    return window.state.activeGroupHubId || null;
}

function syncDailyIssuesPill(groupId) {
    const pill = document.getElementById("daily-plan-issues-pill");
    if (!pill) return;
    const items = collectAllAttentionItems(groupId).filter((item) => {
        if (!groupId) return true;
        return !item.groupId || String(item.groupId) === String(groupId);
    });
    const label = pill.querySelector("[data-daily-issues-label]");
    if (!items.length) {
        pill.classList.add("hidden");
        if (label) label.textContent = "0";
        return;
    }
    pill.classList.remove("hidden");
    if (label) {
        label.textContent = t("daily_issues_pill", { count: items.length }) || `${items.length} issues`;
    }
}

function renderDailySituationPanel(_dateStr, groupId) {
    // B2 layout: no situation aside — issues pill + Needs attention are the SoT.
    syncDailyIssuesPill(groupId);
}

function getDailyPlanDateInput() {
    return document.getElementById("daily-plan-date-picker")
        || document.getElementById("schedule-date-picker");
}

function currentPlanDate() {
    return todayDateStr();
}

function driverOptions(selectedName, selectedId = "") {
    return getVisibleDrivers().map(driver => {
        const selected = (selectedId && (driver.id === selectedId || driver.uid === selectedId))
            || (selectedName && driver.name === selectedName);
        return `<option value="${escapeHtml(driver.name)}" ${selected ? "selected" : ""}>${escapeHtml(driver.name)}</option>`;
    }).join("");
}

function busOptions(selectedBus) {
    const options = (window.state.buses || []).map(b => {
        const num = String(b.number ?? "");
        return `<option value="${escapeHtml(num)}" ${num === String(selectedBus || "") ? "selected" : ""}>Bus ${escapeHtml(num)}</option>`;
    }).join("");
    return `<option value="">—</option>${options}`;
}

/** Return driver names already assigned to a slot in the current plan. */
function assignedDriverNames(slots) {
    const names = new Set();
    for (const slot of slots) {
        if (slot.driverName) names.add(slot.driverName);
    }
    return names;
}

/** Render the draggable driver pool — unassigned drivers for the current day. */
function buildDriverPoolHtml(slots, _dateStr) {
    if (isOperationalReadOnly()) return "";
    const assigned = assignedDriverNames(slots);
    const available = getVisibleDrivers().filter(driver => {
        if (driver.active === false) return false;
        return !assigned.has(driver.name);
    });
    if (!available.length) return "";
    const chips = available.map(driver => {
        const initials = String(driver.name || "").split(/\s+/).map(p => p[0]).join("").slice(0, 2).toUpperCase();
        return `<span class="dnd-driver-chip" draggable="true"
            data-driver-name="${escapeHtml(driver.name)}"
            data-driver-id="${escapeHtml(driver.id || driver.uid || "")}"
            title="${escapeHtml(driver.name)}">${escapeHtml(initials)} ${escapeHtml(driver.name)}</span>`;
    }).join("");
    return `<div class="dnd-driver-pool" role="region" aria-label="${escapeHtml(t("dnd_pool_label") || "Available drivers")}">
        <div class="dnd-driver-pool-header"><i data-lucide="users-round"></i> <span>${escapeHtml(t("dnd_pool_hint") || "Drag a driver onto a slot")}</span></div>
        <div class="dnd-driver-pool-chips">${chips}</div>
    </div>`;
}

/** Wire DnD events on the driver pool and slot cells after render. */
function bindDragAndDrop(container, _slots, dateStr) {
    if (isOperationalReadOnly() || !container) return;

    // Pool chips — dragstart sets the driver payload.
    container.querySelectorAll(".dnd-driver-chip").forEach(chip => {
        chip.addEventListener("dragstart", (event) => {
            draggedDriverName = chip.dataset.driverName || "";
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", draggedDriverName);
            chip.classList.add("is-dragging");
        });
        chip.addEventListener("dragend", (event) => {
            chip.classList.remove("is-dragging");
            if (event.dataTransfer?.dropEffect === "none") {
                chip.classList.add("dnd-drop-failed");
                setTimeout(() => chip.classList.remove("dnd-drop-failed"), 600);
            }
            draggedDriverName = null;
        });
    });

    // Slot drop targets — the driver <td> cell.
    container.querySelectorAll("[data-slot-drop]").forEach(cell => {
        cell.addEventListener("dragover", (event) => {
            if (!draggedDriverName) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            cell.classList.add("is-drop-target");
        });
        cell.addEventListener("dragleave", () => {
            cell.classList.remove("is-drop-target");
        });
        cell.addEventListener("drop", (event) => {
            event.preventDefault();
            cell.classList.remove("is-drop-target");
            const slotType = cell.dataset.slotType || "morning";
            const slotCode = cell.dataset.slotCode || "";
            const driverName = draggedDriverName || event.dataTransfer.getData("text/plain") || "";
            if (!driverName) return;
            // Reuse the existing server-authoritative assignment path.
            dailyPlanAssignDriver(dateStr, slotType, slotCode, driverName);
        });
    });

    // Assigned driver chips in slots — draggable to move between slots.
    container.querySelectorAll("[data-assigned-driver]").forEach(chip => {
        chip.addEventListener("dragstart", (event) => {
            draggedDriverName = chip.dataset.driverName || "";
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", draggedDriverName);
            chip.classList.add("is-dragging");
        });
        chip.addEventListener("dragend", () => {
            chip.classList.remove("is-dragging");
            draggedDriverName = null;
        });
    });
}

function buildDailyPlanTable(slots, { compact = false, editable = false, dateStr = "" } = {}) {
    if (!slots.length) return "";

    const date = dateStr || currentPlanDate();
    const tableClass = compact ? "daily-plan-table daily-plan-table--compact" : "daily-plan-table";

    return `
        <table class="${tableClass}">
            <thead>
                <tr>
                    <th class="daily-plan-col-pos">${t("daily_col_pos")}</th>
                    <th>${t("daily_col_shift")}</th>
                    <th>${t("daily_col_driver")}</th>
                    <th>${t("table_bus") || "Autobus"}</th>
                    <th>${t("daily_col_time")}</th>
                    ${editable ? `<th>${t("table_actions") || "Akcija"}</th>` : ""}
                </tr>
            </thead>
            <tbody>
                ${slots.map((slot) => {
                    const isBr = slot.position === 1 && slot.type === "bereitschaft";
                    const codeLabel = slot.shortName ? `${slot.code} (${slot.shortName})` : (slot.code || slot.name);
                    const time = slot.start && slot.end ? `${slot.start}\u2013${slot.end}` : "\u2014";
                    const driverName = slot.driverName || "";
                    const driverId = slot.driverId || "";
                    const shift = driverName ? getShiftForDriverDate(driverName, date) : null;
                    const bus = shift?.bus || "";
                    const rowClass = isBr ? "daily-plan-row daily-plan-row--standby" : "daily-plan-row";
                    if (!editable) {
                        return `<tr class="${rowClass}">
                            <td class="daily-plan-col-pos${isBr ? " is-standby" : ""}">${escapeHtml(String(slot.position ?? ""))}</td>
                            <td>${escapeHtml(codeLabel || "")}</td>
                            <td class="daily-plan-driver">${escapeHtml(driverName || "\u2014")}</td>
                            <td>${escapeHtml(bus || "\u2014")}</td>
                            <td class="daily-plan-time">${escapeHtml(time)}</td>
                        </tr>`;
                    }
                    return `<tr class="${rowClass}">
                        <td class="daily-plan-col-pos${isBr ? " is-standby" : ""}">${escapeHtml(String(slot.position ?? ""))}</td>
                        <td>${escapeHtml(codeLabel || "")}</td>
                        <td data-slot-drop data-slot-type="${escapeHtml(slot.type || "morning")}" data-slot-code="${escapeHtml(slot.code || "")}" class="daily-plan-slot-cell">
                            ${driverName
                                ? `<span class="dnd-assigned-driver" draggable="true" data-assigned-driver data-driver-name="${escapeHtml(driverName)}" data-driver-id="${escapeHtml(driverId)}">${escapeHtml(driverName)}</span>`
                                : `<span class="dnd-slot-empty">${escapeHtml(t("dnd_drop_here") || "Drop driver here")}</span>`}
                            <select class="ops-edit-select dnd-fallback-select" ${changeAttr("dailyPlanAssignDriver", [date, slot.type || "morning", slot.code || ""], "args-value")} aria-label="${escapeHtml(t("daily_col_driver") || "Vozač")}">
                                <option value="">—</option>
                                ${driverOptions(driverName, driverId)}
                            </select>
                        </td>
                        <td>
                            <select class="ops-edit-select" ${driverName ? changeAttr("updateDriverBusInline", [driverName], "args-value") : "disabled"} aria-label="${escapeHtml(t("table_bus") || "Bus")}">
                                ${busOptions(bus)}
                            </select>
                        </td>
                        <td class="daily-plan-time">${escapeHtml(time)}</td>
                        <td>
                            ${driverName
                                ? `<div class="daily-plan-row-actions">
                                    <button type="button" class="btn-secondary" ${actionAttr("openShiftCell", [driverName, date])}>${escapeHtml(t("ops_btn_edit") || "Izmeni")}</button>
                                    <button type="button" class="btn-secondary daily-plan-clear-btn" ${actionAttr("clearDailyShift", [driverName, date])}>${escapeHtml(t("dispo_clear_shift") || "Clear shift")}</button>
                                    ${canUndoShift(shift)
                                        ? `<button type="button" class="btn-secondary daily-plan-undo-btn" ${actionAttr("undoDailyShift", [driverName, date])}><i data-lucide="undo-2"></i> ${escapeHtml(t("ops_btn_undo") || "Undo")}</button>`
                                        : ""}
                                   </div>`
                                : `<span class="daily-plan-pick-hint">${escapeHtml(t("ops_pick_driver") || "Izaberite vozača")}</span>`}
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

function renderEmptyState(container, message, { showNewPlan = false } = {}) {
    container.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "plan-empty-state plan-empty-state--action";
    const p = document.createElement("p");
    p.className = "plan-empty-title";
    p.textContent = message;
    empty.appendChild(p);
    if (showNewPlan && !isOperationalReadOnly()) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn-primary plan-empty-cta";
        btn.setAttribute("data-action", "openMonthlyPlanImport");
        btn.innerHTML = `<i data-lucide="file-up"></i> <span>${escapeHtml(t("hub_import_monthly_plan") || "+ Uvezi / Kreiraj Mesečni Plan")}</span>`;
        empty.appendChild(btn);
        const hint = document.createElement("p");
        hint.className = "plan-empty-hint";
        hint.style.cssText = "margin:8px 0 0;font-size:0.78rem;color:var(--text-muted);";
        hint.textContent = t("daily_filled_from_monthly")
            || "Dnevni plan se puni iz uvezenog/uređenog mesečnog Dienstplana.";
        empty.appendChild(hint);
    }
    container.appendChild(empty);
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function renderDailyPlanPanel(dateStr) {
    const container = document.getElementById("daily-plan-slots");
    const metaEl = document.getElementById("daily-plan-meta");
    if (!container) return;

    const date = dateStr || getDailyPlanDateInput()?.value || todayDateStr();
    const plan = getDailyPlanForDate(date);
    renderDailyPlanMeta(plan, metaEl);
    if (!plan.slots.length) return renderEmptyState(container, t("daily_no_shifts", { date }), { showNewPlan: true });
    const editable = !isOperationalReadOnly();
    const poolHtml = editable ? buildDriverPoolHtml(plan.slots, date) : "";
    container.innerHTML = `${poolHtml}${buildDailyPlanTable(plan.slots, { editable, dateStr: date })}`;
    if (typeof lucide !== "undefined") lucide.createIcons();
    if (editable) bindDragAndDrop(container, plan.slots, date);
}

function renderDailyPlanFullPage() {
    const container = document.getElementById("daily-plan-full-slots");
    const metaEl = document.getElementById("daily-plan-full-meta");
    const subtitle = document.getElementById("daily-full-subtitle");
    const picker = document.getElementById("daily-plan-date-picker");
    if (!container) return;
    const today = todayDateStr();
    if (picker) {
        if (!picker.value) picker.value = today;
        picker.min = today;
        const maxDate = new Date();
        maxDate.setDate(maxDate.getDate() + 7);
        picker.max = maxDate.toISOString().slice(0, 10);
        picker.readOnly = false;
    }
    const selectedDate = picker?.value || today;

    const groupId = getActiveHubGroupId();
    const group = groupId ? getGroupById(groupId) : null;
    if (subtitle && group) subtitle.textContent = t("daily_full_subtitle", { name: group.name, id: group.id });

    paintPlanHealthBanner("daily-plan-health", { groupId, dateStr: selectedDate });
    renderDailySituationPanel(selectedDate, groupId);

    const date = selectedDate;
    const isFuture = date > today;
    const plan = getDailyPlanForDate(date);
    renderDailyPlanMeta(plan, metaEl, { full: true });
    if (!plan.slots.length) {
        renderEmptyState(container, t("daily_no_shifts_full", { date }), { showNewPlan: true });
        void refreshPlanLockBanner();
        return;
    }
    const editable = !isOperationalReadOnly() && !isFuture;
    const poolHtml = editable ? buildDriverPoolHtml(plan.slots, date) : "";
    const futureHint = isFuture
        ? `<div class="daily-plan-future-hint" role="status"><i data-lucide="eye"></i> ${escapeHtml(t("daily_future_readonly") || "Future dates are read-only. Edit via monthly plan.")}</div>`
        : "";
    container.innerHTML = `${futureHint}${poolHtml}${buildDailyPlanTable(plan.slots, { editable, dateStr: date })}`;
    if (typeof lucide !== "undefined") lucide.createIcons();
    if (editable) bindDragAndDrop(container, plan.slots, date);
    void refreshPlanLockBanner();
}

function bindDailyPlanFullPage() {
    const picker = document.getElementById("daily-plan-date-picker");
    if (picker) {
        const today = todayDateStr();
        if (!picker.value) picker.value = today;
        picker.min = today;
        const maxDate = new Date();
        maxDate.setDate(maxDate.getDate() + 7);
        picker.max = maxDate.toISOString().slice(0, 10);
        picker.readOnly = false;
        if (!picker.dataset.dailyFullBound) {
            picker.dataset.dailyFullBound = "1";
            picker.addEventListener("change", () => renderDailyPlanFullPage());
        }
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
    if (!plan.slots.length) return renderEmptyState(el, t("daily_no_shifts_today"), { showNewPlan: true });

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

function clearDailyShift(driverName, dateStr) {
    if (isOperationalReadOnly()) {
        showToast(t("error_ops_read_only") || "Read-only view — changes are not allowed.", "error");
        return;
    }
    const name = String(driverName || "").trim();
    const date = String(dateStr || "").trim();
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const shift = getShiftForDriverDate(name, date);
    if (!shift || shift.type === "clear" || shift.type === "off") {
        showToast(t("dispo_clear_shift_empty") || "No shift to clear for this day.", "info");
        return;
    }
    const msg = (t("dispo_confirm_clear_shift") || "Remove the shift for {driver} on {date}?")
        .replace("{driver}", name)
        .replace("{date}", date);
    showConfirm(msg, async () => {
        await removeShift(name, date);
        renderDailyPlanFullPage();
        renderDailyPlanPanel(date);
        if (typeof window.renderDispatcherDashboard === "function") window.renderDispatcherDashboard();
    }, {
        danger: true,
        title: t("dispo_clear_shift") || "Clear shift",
        confirmText: t("dispo_clear_shift") || "Clear shift"
    });
}

function canUndoShift(shift) {
    return shift?.source === "shift" && Number(shift?.revision) >= 1;
}

async function undoDailyShift(driverName, dateStr) {
    if (isOperationalReadOnly()) {
        showToast(t("error_ops_read_only") || "Read-only view — changes are not allowed.", "error");
        return;
    }
    const name = String(driverName || "").trim();
    const date = String(dateStr || "").trim();
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const driver = getVisibleDrivers().find(driver => driver.name === name);
    if (!driver) return;
    const ok = await undoShift(driver, date);
    if (!ok) return;
    showToast(t("shift_undone") || "Change undone.", "success");
    renderDailyPlanFullPage();
    renderDailyPlanPanel(date);
    if (typeof window.renderDispatcherDashboard === "function") window.renderDispatcherDashboard();
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
            isActiveReport(report)
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
    dailyPlanAssignDriver,
    clearDailyShift,
    undoDailyShift
};
