// BusCommand — jedan panel „Zahteva pažnju“: problem + rešenje na istom mestu
import { getVisibleDrivers, showToast, escapeHtml, todayDateStr } from "../core/utils.js";
import { getShiftForDriverDate, setShiftForDriverDate } from "../core/shift-plan.js";
import { actionAttr } from "../core/action-delegate.js";
import { t } from "../ui/i18n.js";
import { IS_DEMO_MODE } from "../core/runtime-config.js";
import {
    isActiveReport,
    reportKind,
    scopedDispatcherReports,
    sortReportsForOperations
} from "./report-model.js";
import { persistShift } from "./shifts.js";
import { ApiClient } from "../core/api-client.js";
import { saveState } from "../core/state.js";
import { busHasGroup } from "../data/bus-group-membership.js";
import { listAssignableCatalogCodes, ensureShiftCatalogForEdit } from "../core/line-shift-catalog.js";
import { getGroupById } from "../data/groups.js";
import { driverKnowsGroup, normalizeKnownGroupIds } from "../data/driver-known-groups.js";
import { switchSection } from "../layout/navigation.js";

function domSafeId(id) {
    return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

const AVAILABLE_REPLACEMENT_TYPES = new Set(["off", "clear", "bereitschaft", "standby", ""]);
const OPERATIONAL_TYPES = new Set(["morning", "afternoon", "night", "bereitschaft", "standby"]);

let _focusItemId = "";
let _pendingApply = false;

function driverUid(drv) {
    return drv?.id || drv?.uid || drv?.driverId || "";
}

function companyDrivers() {
    const companyId = window.currentUser?.companyId;
    const all = window.state.drivers || [];
    if (!companyId) return all.filter(d => d.active !== false);
    return all.filter(d => d.active !== false && (!d.companyId || d.companyId === companyId));
}

function groupLabel(groupId) {
    const group = getGroupById(groupId);
    return group?.name ? `${group.name} (${groupId})` : String(groupId || "—");
}

function notifyOpsChanged(detail = {}) {
    window.dispatchEvent(new CustomEvent("buscommand:ops-attention-changed", { detail }));
    if (detail.date) {
        window.dispatchEvent(new CustomEvent("buscommand:plan-updated", { detail: { date: detail.date } }));
    }
    if (typeof window.renderDispatcherDashboard === "function") {
        window.renderDispatcherDashboard();
    }
}

function visibleOperationalReports() {
    return sortReportsForOperations(scopedDispatcherReports({
        reports: window.state.reports,
        drivers: window.state.drivers,
        dispatchers: window.state.dispatchers,
        currentUser: window.currentUser,
        activeGroupId: window.state.activeGroupFilter || "",
        demo: IS_DEMO_MODE
    })).filter(isActiveReport);
}

function isOperationalDuty(shift) {
    if (!shift) return false;
    return OPERATIONAL_TYPES.has(String(shift.type || "").toLowerCase());
}

function isDriverFree(driver, dateStr) {
    const duty = getShiftForDriverDate(driver.name, dateStr);
    return !duty || AVAILABLE_REPLACEMENT_TYPES.has(String(duty.type || "").toLowerCase());
}

/**
 * Fast path pools (closest first):
 * 1) this group → 2) company / unassigned free → 3) other groups free
 */
function freeDriverPools(groupId, excludeDriverId, dateStr) {
    const target = String(groupId || "");
    const same = [];
    const company = [];
    const otherGroups = [];
    const knowsHint = t("ops_attn_knows_line") || "zna";
    for (const driver of companyDrivers()) {
        const id = driverUid(driver);
        if (!id || id === excludeDriverId) continue;
        if (!isDriverFree(driver, dateStr)) continue;
        const gid = String(driver.groupId || driver.lineId || "").trim();
        const knows = driverKnowsGroup(driver, target);
        const parts = [driver.name];
        if (gid && gid !== target) parts.push(groupLabel(gid));
        if (knows && target) parts.push(`${knowsHint} ${target}`);
        const row = {
            id,
            name: driver.name,
            groupId: gid,
            knowsTarget: knows,
            label: parts.join(" · "),
            driver,
            knownGroupIds: normalizeKnownGroupIds(driver)
        };
        if (gid && gid === target) same.push(row);
        else if (!gid) company.push(row);
        else otherGroups.push(row);
    }
    const sortPool = (a, b) => {
        if (Boolean(a.knowsTarget) !== Boolean(b.knowsTarget)) return a.knowsTarget ? -1 : 1;
        return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" });
    };
    same.sort(sortPool);
    company.sort(sortPool);
    otherGroups.sort(sortPool);
    return { same, company, otherGroups, all: [...same, ...company, ...otherGroups] };
}

function usedBusesOnDate(dateStr, excludeDriverId) {
    const used = new Set();
    companyDrivers().forEach(driver => {
        if (driverUid(driver) === excludeDriverId) return;
        const duty = getShiftForDriverDate(driver.name, dateStr);
        if (duty && isOperationalDuty(duty) && duty.bus) used.add(String(duty.bus));
    });
    return used;
}

function freeBusPools(groupId, dateStr, excludeDriverId, keepBus = "") {
    const used = usedBusesOnDate(dateStr, excludeDriverId);
    const target = String(groupId || "");
    const same = [];
    const company = [];
    const otherGroups = [];
    for (const bus of (window.state.buses || [])) {
        if (bus.active === false) continue;
        const number = String(bus.number || "");
        if (!number) continue;
        if (used.has(number) && number !== String(keepBus || "")) continue;
        const groups = (bus.groupIds || [bus.groupId || bus.lineId].filter(Boolean)).map(String);
        const inTarget = target && busHasGroup(bus, target);
        const unassigned = groups.length === 0;
        const label = (!inTarget && groups[0]) ? `Bus ${number} · ${groupLabel(groups[0])}` : `Bus ${number}`;
        const row = { number, label, bus };
        if (inTarget) same.push(row);
        else if (unassigned) company.push(row);
        else otherGroups.push(row);
    }
    const sortNum = (a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true });
    same.sort(sortNum);
    company.sort(sortNum);
    otherGroups.sort(sortNum);
    return { same, company, otherGroups, all: [...same, ...company, ...otherGroups] };
}

function findDriverById(id) {
    return companyDrivers().find(d => driverUid(d) === id)
        || getVisibleDrivers().find(d => driverUid(d) === id)
        || null;
}

function confirmationAttentionRows() {
    if (Array.isArray(window.state.confirmationAttention) && window.state.confirmationAttention.length) {
        return window.state.confirmationAttention;
    }
    const confirmed = new Set(
        (window.state.shiftConfirmations || []).map((row) => `${row.driverId}|${row.date}`)
    );
    return (window.state.confirmationOutbox || [])
        .filter((row) => {
            if (!row?.driverId || !row?.targetDate) return false;
            if (["confirmed", "cancelled"].includes(row.status)) return false;
            return !confirmed.has(`${row.driverId}|${row.targetDate}`);
        })
        .map((row) => {
            const today = todayDateStr();
            const expired = today && String(row.targetDate) < String(today);
            return {
                kind: expired ? "expired"
                    : row.status === "failed" ? "delivery_failed"
                        : row.status === "pending" ? "pending_send"
                            : "awaiting_confirm",
                severity: row.status === "failed" ? "critical" : "warning",
                driverId: row.driverId,
                targetDate: row.targetDate,
                label: row.label || "next_shift",
                attempts: Number(row.attempts || 0),
                lastError: row.lastError || null
            };
        });
}

/**
 * Jedinstvena lista: šta zahteva pažnju + podaci za inline rešenje.
 */
function collectOpsAttentionItems() {
    const today = todayDateStr();
    const items = [];
    const coveredDriverIds = new Set();

    for (const report of visibleOperationalReports()) {
        const kind = reportKind(report).kind;
        if (kind === "coverage") {
            coveredDriverIds.add(String(report.driverId || ""));
            const groupId = report.groupId || report.lineId || "";
            const drivers = freeDriverPools(groupId, report.driverId, report.date || today);
            const buses = freeBusPools(groupId, report.date || today, report.driverId, report.bus);
            items.push({
                id: `coverage:${report.id}`,
                kind: "coverage",
                severity: "critical",
                reportId: report.id,
                driverId: report.driverId,
                driverName: report.driver || "—",
                groupId,
                date: report.date || today,
                title: t("ops_attn_coverage_title") || "Vozač nedostupan",
                summary: [t(report.reason) || report.reason || "", report.description || ""].filter(Boolean).join(" · ")
                    || (t("ops_attn_coverage_summary") || "Izaberite zamenu — prvo iz grupe, pa šire."),
                driverPools: drivers,
                busPools: buses,
                keepBus: report.bus || ""
            });
            continue;
        }
        items.push({
            id: `report:${report.id}`,
            kind: "report",
            severity: kind === "breakdown" ? "critical" : "warning",
            reportId: report.id,
            driverId: report.driverId,
            driverName: report.driver || "—",
            bus: report.bus || "",
            date: report.date || today,
            title: kind === "breakdown"
                ? (t("report_breakdown_title") || "Kvar")
                : (t("report_delay_title") || "Kašnjenje"),
            summary: [t(report.reason) || report.reason || "", report.description || ""].filter(Boolean).join(" · ") || "—",
            reportKind: kind
        });
    }

    for (const driver of getVisibleDrivers()) {
        if (driver.active === false) continue;
        const duty = getShiftForDriverDate(driver.name, today);
        const groupId = driver.groupId || driver.lineId || "";
        const id = driverUid(driver);
        if (!isOperationalDuty(duty)) continue;
        if (coveredDriverIds.has(String(id))) continue;

        const dutyType = String(duty.type || "").toLowerCase();
        const needsBus = ["morning", "afternoon", "night"].includes(dutyType);
        const bus = duty.bus || driver.bus || "";
        // Standby / bereitschaft without a bus is normal — do not block the panel.
        if (needsBus && !bus) {
            const buses = freeBusPools(groupId, today, id, "");
            items.push({
                id: `bus:${id}`,
                kind: "missing_bus",
                severity: "critical",
                driverId: id,
                driverName: driver.name,
                groupId,
                date: today,
                dutyCode: duty.routeCode || duty.name || "",
                time: duty.start && duty.end ? `${duty.start}–${duty.end}` : "",
                title: t("ops_attn_missing_bus_title") || "Nema autobusa",
                summary: t("ops_attn_missing_bus_summary", {
                    driver: driver.name,
                    duty: duty.routeCode || duty.name || "—"
                }) || `${driver.name} je na smeni bez vozila — dodelite autobus odmah.`,
                busPools: buses
            });
        }

        ensureShiftCatalogForEdit(groupId);
        const codes = listAssignableCatalogCodes(groupId);
        const routeCode = String(duty.routeCode || "").trim();
        const needsDutyCode = ["morning", "afternoon", "night"].includes(dutyType);
        const unknownCode = codes.length > 0 && routeCode && !codes.includes(routeCode);
        // Standby / already-coded duties should not block the fast path.
        const missingCode = needsDutyCode && codes.length > 0 && !routeCode;
        if (unknownCode || missingCode) {
            const catalog = ensureShiftCatalogForEdit(groupId);
            items.push({
                id: `shift:${id}`,
                kind: "wrong_shift",
                severity: "warning",
                driverId: id,
                driverName: driver.name,
                groupId,
                date: today,
                currentCode: routeCode || duty.name || duty.type || "—",
                title: t("ops_attn_wrong_shift_title") || "Pogrešna ili nedostaje smena",
                summary: t("ops_attn_wrong_shift_summary", {
                    driver: driver.name,
                    duty: routeCode || duty.type || "—"
                }) || `${driver.name}: izaberite ispravnu smenu iz kataloga.`,
                duties: codes.map(code => ({
                    code,
                    label: catalog.entries?.[code]?.label || code,
                    type: catalog.entries?.[code]?.type || "morning",
                    start: catalog.entries?.[code]?.start || null,
                    end: catalog.entries?.[code]?.end || null
                }))
            });
        }
    }

    for (const row of confirmationAttentionRows().slice(0, 8)) {
        const drv = getVisibleDrivers().find(d => driverUid(d) === row.driverId);
        items.push({
            id: `confirm:${row.driverId}:${row.targetDate}`,
            kind: "confirm",
            severity: row.severity === "critical" ? "critical" : "warning",
            driverId: row.driverId,
            driverName: drv?.name || row.driverId || "—",
            date: row.targetDate,
            title: row.kind === "delivery_failed"
                ? (t("status_confirmation_delivery_failed") || "Slanje potvrde nije uspelo")
                : (t("status_pending_confirmation") || "Čeka potvrdu"),
            summary: [
                row.label && row.label !== "next_shift"
                    ? (t(`confirm_label_${row.label}`) || row.label)
                    : (t("confirm_label_next_shift") || "Sledeća smena"),
                row.lastError ? String(row.lastError).slice(0, 80) : ""
            ].filter(Boolean).join(" · ")
        });
    }

    const rank = { critical: 0, warning: 1, info: 2 };
    return items.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9));
}

function ensureOpsAttentionPanel() {
    let layer = document.getElementById("ops-attention-panel");
    if (layer) return layer;
    layer = document.createElement("div");
    layer.id = "ops-attention-panel";
    layer.className = "ops-attention-layer hidden";
    layer.setAttribute("role", "dialog");
    layer.setAttribute("aria-modal", "true");
    layer.setAttribute("aria-labelledby", "ops-attention-title");
    layer.setAttribute("aria-hidden", "true");
    layer.innerHTML = `
        <aside class="ops-attention-sheet">
            <header class="ops-attention-header">
                <div>
                    <p class="ops-attention-kicker">${escapeHtml(t("ops_attn_kicker") || "Operativa")}</p>
                    <h2 id="ops-attention-title">${escapeHtml(t("ops_attn_title") || "Zahteva pažnju")}</h2>
                    <p id="ops-attention-subtitle" class="ops-attention-subtitle"></p>
                </div>
                <button type="button" class="btn-secondary ops-attention-close" ${actionAttr("closeOpsAttentionPanel")} aria-label="${escapeHtml(t("btn_close") || "Zatvori")}">
                    <i data-lucide="x"></i>
                </button>
            </header>
            <div id="ops-attention-list" class="ops-attention-list"></div>
        </aside>`;
    document.body.appendChild(layer);
    layer.addEventListener("click", (event) => {
        if (event.target === layer) closeOpsAttentionPanel();
    });
    return layer;
}

function optionList(items, { valueKey = "value", labelKey = "label", selected = "", emptyLabel = "—" } = {}) {
    if (!items.length) {
        return `<option value="" disabled selected>${escapeHtml(emptyLabel)}</option>`;
    }
    return items.map((item, index) => {
        const value = String(item[valueKey] ?? item.code ?? item.number ?? item.id ?? "");
        const label = String(item[labelKey] ?? item.name ?? item.code ?? value);
        const isSelected = selected ? value === String(selected) : index === 0;
        return `<option value="${escapeHtml(value)}" ${isSelected ? "selected" : ""}>${escapeHtml(label)}</option>`;
    }).join("");
}

function pooledOptionList(pools, { selected = "", emptyLabel = "—" } = {}) {
    const same = pools?.same || [];
    const company = pools?.company || [];
    const other = pools?.otherGroups || [];
    const ordered = [...same, ...company, ...other];
    if (!ordered.length) {
        return `<option value="" disabled selected>${escapeHtml(emptyLabel)}</option>`;
    }
    const preferred = String(selected || ordered[0].id || ordered[0].number || "");
    const render = (rows) => rows.map((row) => {
        const value = String(row.id || row.number || "");
        const label = String(row.label || row.name || value);
        return `<option value="${escapeHtml(value)}" ${value === preferred ? "selected" : ""}>${escapeHtml(label)}</option>`;
    }).join("");
    let html = "";
    if (same.length) {
        html += `<optgroup label="${escapeHtml(t("ops_attn_pool_same_group") || "Ova grupa")}">${render(same)}</optgroup>`;
    }
    if (company.length) {
        html += `<optgroup label="${escapeHtml(t("ops_attn_pool_company") || "Firma — slobodni")}">${render(company)}</optgroup>`;
    }
    if (other.length) {
        html += `<optgroup label="${escapeHtml(t("ops_attn_pool_other_groups") || "Druge grupe — slobodni")}">${render(other)}</optgroup>`;
    }
    return html;
}

function renderAttentionCard(item) {
    const severity = item.severity === "critical" ? "is-critical" : "is-warning";
    const meta = [
        item.driverName,
        item.dutyCode,
        item.time,
        item.currentCode && item.kind === "wrong_shift" ? `${t("ops_attn_current") || "Trenutno"}: ${item.currentCode}` : "",
        item.bus ? `${t("vehicle") || "Bus"} ${item.bus}` : "",
        item.date && item.kind === "confirm" ? item.date : ""
    ].filter(Boolean).join(" · ");

    let solution = "";
    const sid = domSafeId(item.id);
    if (item.kind === "missing_bus") {
        const hasBuses = (item.busPools?.all || []).length > 0;
        solution = `
            <label class="ops-attention-label" for="attn-bus-${sid}">${escapeHtml(t("ops_attn_pick_bus") || "Dodeli autobus")}</label>
            <select id="attn-bus-${sid}" class="ops-attention-select" data-attn-field="bus">
                ${pooledOptionList(item.busPools, { emptyLabel: t("ops_coverage_no_buses") || "Nema slobodnog autobusa" })}
            </select>
            <button type="button" class="urgent-action ops-attention-apply" ${actionAttr("applyOpsAttentionFix", [item.id])} ${hasBuses ? "" : "disabled"}>
                <i data-lucide="check"></i> ${escapeHtml(t("ops_attn_apply") || "Primeni odmah")}
            </button>`;
    } else if (item.kind === "coverage") {
        const hasDrivers = (item.driverPools?.all || []).length > 0;
        const hasBuses = (item.busPools?.all || []).length > 0;
        solution = `
            <label class="ops-attention-label" for="attn-drv-${sid}">${escapeHtml(t("ops_attn_pick_driver") || "Slobodan / dostupan vozač")}</label>
            <select id="attn-drv-${sid}" class="ops-attention-select" data-attn-field="driver">
                ${pooledOptionList(item.driverPools, { emptyLabel: t("ops_coverage_no_drivers") || "Nema slobodnog vozača" })}
            </select>
            <label class="ops-attention-label" for="attn-bus-${sid}">${escapeHtml(t("ops_attn_pick_bus") || "Autobus")}</label>
            <select id="attn-bus-${sid}" class="ops-attention-select" data-attn-field="bus">
                ${pooledOptionList(item.busPools, {
                    selected: item.keepBus || "",
                    emptyLabel: t("ops_coverage_no_buses") || "Nema slobodnog autobusa"
                })}
            </select>
            <button type="button" class="urgent-action ops-attention-apply" ${actionAttr("applyOpsAttentionFix", [item.id])} ${hasDrivers && hasBuses ? "" : "disabled"}>
                <i data-lucide="wrench"></i> ${escapeHtml(t("ops_attn_apply_coverage") || "Primeni zamenu odmah")}
            </button>`;
    } else if (item.kind === "wrong_shift") {
        solution = `
            <label class="ops-attention-label" for="attn-duty-${sid}">${escapeHtml(t("ops_attn_pick_shift") || "Izaberi smenu")}</label>
            <select id="attn-duty-${sid}" class="ops-attention-select" data-attn-field="duty">
                ${optionList(item.duties.map(d => ({
                    value: d.code,
                    label: d.start && d.end ? `${d.code} · ${d.start}–${d.end}` : (d.label ? `${d.code} (${d.label})` : d.code)
                })), {
                    emptyLabel: t("ops_attn_no_shifts") || "Nema smena u katalogu"
                })}
            </select>
            <button type="button" class="urgent-action ops-attention-apply" ${actionAttr("applyOpsAttentionFix", [item.id])} ${item.duties.length ? "" : "disabled"}>
                <i data-lucide="check"></i> ${escapeHtml(t("ops_attn_apply_shift") || "Primeni smenu")}
            </button>`;
    } else if (item.kind === "report") {
        solution = `
            <label class="ops-attention-label" for="attn-res-${sid}">${escapeHtml(t("ops_attn_resolution_type") || "Tip rešenja")}</label>
            <select id="attn-res-${sid}" class="ops-attention-select" data-attn-field="resolutionType">
                <option value="restored">${escapeHtml(t("report_resolution_restored") || "Rad je nastavljen")}</option>
                <option value="replaced">${escapeHtml(t("report_resolution_replaced") || "Zamena primenjena")}</option>
                <option value="cancelled">${escapeHtml(t("report_resolution_cancelled") || "Odustajanje / otkaz")}</option>
            </select>
            <label class="ops-attention-label" for="attn-note-${sid}">${escapeHtml(t("ops_attn_resolution_note") || "Šta je urađeno")}</label>
            <textarea id="attn-note-${sid}" class="ops-attention-note" data-attn-field="note" rows="2" maxlength="400" placeholder="${escapeHtml(t("report_resolution_summary_placeholder") || "Kratko opišite rešenje…")}"></textarea>
            <button type="button" class="urgent-action ops-attention-apply" ${actionAttr("applyOpsAttentionFix", [item.id])}>
                <i data-lucide="check"></i> ${escapeHtml(t("ops_attn_apply") || "Zatvori prijavu")}
            </button>`;
    } else {
        solution = `
            <p class="ops-attention-soft">${escapeHtml(t("ops_attn_confirm_hint") || "Potvrda još nije stigla — proverite poruke ili sačekajte odgovor vozača.")}</p>
            <button type="button" class="btn-secondary ops-attention-apply" ${actionAttr("applyOpsAttentionFix", [item.id])}>
                <i data-lucide="message-circle"></i> ${escapeHtml(t("ops_attn_open_messages") || "Otvori poruke")}
            </button>`;
    }

    return `
        <article class="ops-attention-card ${severity}" data-attn-id="${escapeHtml(item.id)}" id="ops-attn-card-${sid}">
            <div class="ops-attention-card-top">
                <span class="ops-attention-badge">${escapeHtml(item.title)}</span>
                <span class="ops-attention-sev">${escapeHtml(item.severity === "critical" ? (t("sev_critical") || "Kritično") : (t("sev_warning") || "Upozorenje"))}</span>
            </div>
            <p class="ops-attention-meta">${escapeHtml(meta)}</p>
            <p class="ops-attention-summary">${escapeHtml(item.summary || "")}</p>
            <div class="ops-attention-solution">
                <p class="ops-attention-solution-label">${escapeHtml(t("ops_attn_solution") || "Rešenje")}</p>
                ${solution}
                <p class="ops-attention-status" data-attn-status role="status" aria-live="polite"></p>
            </div>
        </article>`;
}

function paintOpsAttentionPanel(items) {
    const layer = ensureOpsAttentionPanel();
    const list = layer.querySelector("#ops-attention-list");
    const subtitle = layer.querySelector("#ops-attention-subtitle");
    if (subtitle) {
        subtitle.textContent = items.length
            ? (t("ops_attn_subtitle", { count: items.length }) || `${items.length} stavki — rešite ih ovde, bez skakanja po panelima.`)
            : (t("ops_attn_empty") || "Trenutno nema stavki koje zahtevaju pažnju.");
    }
    if (!list) return;
    list.innerHTML = items.length
        ? items.map(renderAttentionCard).join("")
        : `<div class="ops-attention-empty">${escapeHtml(t("ops_attn_empty") || "Sve je u redu.")}</div>`;

    if (_focusItemId) {
        const card = list.querySelector(`[data-attn-id="${_focusItemId.replace(/"/g, "")}"]`);
        if (card) {
            card.classList.add("is-focused");
            card.scrollIntoView({ block: "nearest", behavior: "smooth" });
            const firstControl = card.querySelector("select, textarea, button.ops-attention-apply");
            setTimeout(() => firstControl?.focus(), 0);
        }
    }
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function openOpsAttentionPanel(focusItemId = "") {
    // data-action with [] passes the click event as the first arg.
    if (focusItemId && typeof focusItemId === "object") focusItemId = "";
    _focusItemId = String(focusItemId || "");
    const items = collectOpsAttentionItems();
    const layer = ensureOpsAttentionPanel();
    paintOpsAttentionPanel(items);
    layer.classList.remove("hidden");
    layer.style.display = "flex";
    layer.setAttribute("aria-hidden", "false");
    document.body.classList.add("ops-attention-open");
    return true;
}

function closeOpsAttentionPanel() {
    if (_pendingApply) return;
    const layer = document.getElementById("ops-attention-panel");
    if (!layer) return;
    layer.classList.add("hidden");
    layer.style.display = "none";
    layer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("ops-attention-open");
    _focusItemId = "";
}

function refreshOpsAttentionPanelIfOpen() {
    const layer = document.getElementById("ops-attention-panel");
    if (!layer || layer.classList.contains("hidden")) return;
    const items = collectOpsAttentionItems();
    paintOpsAttentionPanel(items);
    if (!items.length) {
        showToast(t("ops_attn_all_clear") || "Sve stavke su rešene.", "success");
        closeOpsAttentionPanel();
    }
}

function cardField(card, field) {
    return card?.querySelector(`[data-attn-field="${field}"]`);
}

async function applyCoverageResolution(reportId, replacementDriverId, replacementBus, statusEl = null) {
    const report = (window.state.reports || []).find(item =>
        item.id === reportId && isActiveReport(item)
    );
    const replacement = findDriverById(replacementDriverId);
    const original = findDriverById(report?.driverId);
    if (!report || !replacement || !original || !replacementBus) {
        const message = t("ops_coverage_selection_required") || "Izaberite vozača i autobus.";
        if (statusEl) statusEl.textContent = message;
        showToast(message, "error");
        return false;
    }
    const originalShift = getShiftForDriverDate(original.name, report.date);
    const replacementShift = getShiftForDriverDate(replacement.name, report.date);
    if (statusEl) statusEl.textContent = t("report_resolving") || "Rešavanje…";
    let result;
    if (IS_DEMO_MODE) {
        result = {
            success: true,
            report: {
                id: report.id,
                status: "resolved",
                resolution: {
                    type: "replacement",
                    summary: `${replacement.name} / ${replacementBus}`,
                    replacementDriverId,
                    replacementBus
                }
            },
            shift: {
                type: report.shiftType || originalShift?.type || "morning",
                name: report.shiftName || originalShift?.name || "",
                routeCode: originalShift?.routeCode || report.shiftName || "",
                start: originalShift?.start || null,
                end: originalShift?.end || null,
                bus: replacementBus,
                revision: Number(replacementShift?.revision || 0) + 1
            }
        };
    } else {
        result = await ApiClient.resolveStaffOperationalIncident(report.id, {
            replacementDriverId,
            replacementBus,
            expectedOriginalRevision: Number(originalShift?.revision || 0),
            expectedReplacementRevision: Number(replacementShift?.revision || 0)
        });
    }
    if (!result?.success) {
        const message = result?.error || t("ops_resolver_failed");
        if (statusEl) statusEl.textContent = message;
        showToast(message, "error");
        return false;
    }
    setShiftForDriverDate(original.name, report.date, { type: "clear" });
    const assigned = result.shift || {};
    setShiftForDriverDate(replacement.name, report.date, {
        type: assigned.type || report.shiftType || originalShift?.type || "morning",
        name: assigned.name || report.shiftName || originalShift?.name || "",
        bus: assigned.bus || replacementBus,
        routeCode: assigned.routeCode || originalShift?.routeCode || "",
        start: assigned.start || originalShift?.start || null,
        end: assigned.end || originalShift?.end || null,
        revision: Number.isInteger(assigned.revision) ? assigned.revision : Number(replacementShift?.revision || 0) + 1
    });
    Object.assign(report, result.report || {}, {
        status: "resolved",
        resolvedAt: result.report?.resolvedAt || new Date().toISOString(),
        resolvedBy: result.report?.resolvedBy || window.currentUser?.uid || window.currentUser?.id
    });
    if (IS_DEMO_MODE) saveState();
    showToast(t("ops_resolver_success", { driver: replacement.name, bus: replacementBus }), "success");
    notifyOpsChanged({ date: report.date });
    return true;
}

async function applyOpsAttentionFix(itemId) {
    const items = collectOpsAttentionItems();
    const item = items.find(row => row.id === itemId);
    const card = document.querySelector(`[data-attn-id="${String(itemId).replace(/"/g, "")}"]`);
    const statusEl = card?.querySelector("[data-attn-status]");
    if (!item || !card) return;
    if (_pendingApply) return;
    _pendingApply = true;
    const applyBtn = card.querySelector(".ops-attention-apply");
    if (applyBtn) applyBtn.disabled = true;
    card.classList.add("is-pending");
    if (statusEl) statusEl.textContent = t("report_resolving") || "Rešavanje…";
    try {
        if (item.kind === "missing_bus") {
            const bus = String(cardField(card, "bus")?.value || "");
            if (!bus) {
                if (statusEl) statusEl.textContent = t("ops_attn_pick_bus") || "Izaberite autobus.";
                return;
            }
            const driver = findDriverById(item.driverId);
            if (!driver) {
                if (statusEl) statusEl.textContent = t("ops_resolver_failed") || "Rešenje nije primenjeno.";
                return;
            }
            const existing = getShiftForDriverDate(driver.name, item.date);
            const saved = await persistShift(
                driver,
                item.date,
                existing?.type || "morning",
                existing?.name || existing?.routeCode || "",
                existing?.start || null,
                existing?.end || null,
                bus
            );
            if (!saved) {
                if (statusEl) {
                    statusEl.textContent = t("shift_conflict_refresh")
                        || t("ops_resolver_failed")
                        || "Raspored je izmenjen. Osvežite i pokušajte ponovo.";
                }
                refreshOpsAttentionPanelIfOpen();
                return;
            }
            showToast(t("ops_bus_assigned", { bus, driver: driver.name }) || `Bus ${bus} → ${driver.name}`, "success");
            notifyOpsChanged({ date: item.date });
        } else if (item.kind === "coverage") {
            const driverId = String(cardField(card, "driver")?.value || "");
            const bus = String(cardField(card, "bus")?.value || "");
            const ok = await applyCoverageResolution(item.reportId, driverId, bus, statusEl);
            if (!ok) {
                refreshOpsAttentionPanelIfOpen();
                return;
            }
        } else if (item.kind === "wrong_shift") {
            const code = String(cardField(card, "duty")?.value || "");
            const duty = item.duties.find(row => row.code === code);
            const driver = findDriverById(item.driverId);
            if (!driver || !duty) {
                if (statusEl) statusEl.textContent = t("ops_attn_pick_shift") || "Izaberite smenu.";
                return;
            }
            const existing = getShiftForDriverDate(driver.name, item.date);
            const saved = await persistShift(
                driver,
                item.date,
                duty.type || existing?.type || "morning",
                duty.code,
                duty.start || existing?.start || null,
                duty.end || existing?.end || null,
                existing?.bus || driver.bus || ""
            );
            if (!saved) {
                if (statusEl) {
                    statusEl.textContent = t("shift_conflict_refresh")
                        || t("ops_resolver_failed")
                        || "Raspored je izmenjen. Osvežite i pokušajte ponovo.";
                }
                refreshOpsAttentionPanelIfOpen();
                return;
            }
            showToast(t("ops_attn_shift_applied", { driver: driver.name, duty: duty.code }) || `${driver.name} · ${duty.code}`, "success");
            notifyOpsChanged({ date: item.date });
        } else if (item.kind === "report") {
            const resolutionType = String(cardField(card, "resolutionType")?.value || "restored");
            const summary = String(cardField(card, "note")?.value || "").trim();
            if (summary.length < 3) {
                if (statusEl) statusEl.textContent = t("report_resolution_required") || "Unesite kratak opis rešenja.";
                return;
            }
            const { resolveReport } = await import("./reports.js");
            const ok = await resolveReport(item.reportId, { type: resolutionType, summary });
            if (!ok) {
                if (statusEl) statusEl.textContent = t("report_resolve_failed") || "Prijava nije zatvorena.";
                return;
            }
            showToast(t("ops_attn_report_closed") || "Prijava zatvorena.", "success");
            _focusItemId = "";
            notifyOpsChanged({ date: item.date });
        } else if (item.kind === "confirm") {
            // Navigation away is explicit user intent after choosing this card action.
            _pendingApply = false;
            card.classList.remove("is-pending");
            closeOpsAttentionPanel();
            switchSection("dispatcher-messages");
            return;
        }
        refreshOpsAttentionPanelIfOpen();
    } catch (error) {
        const message = error?.message || t("ops_resolver_failed") || "Rešenje nije primenjeno.";
        if (statusEl) statusEl.textContent = message;
        showToast(message, "error");
        refreshOpsAttentionPanelIfOpen();
    } finally {
        _pendingApply = false;
        card.classList.remove("is-pending");
        if (applyBtn && document.body.contains(applyBtn)) applyBtn.disabled = false;
    }
}

function wireOpsPlanHealthAttention() {
    const health = document.getElementById("ops-plan-health");
    if (!health || health.dataset.attnBound === "true") return;
    health.dataset.attnBound = "true";
    health.addEventListener("click", () => {
        if (!health.classList.contains("is-attention")) return;
        openOpsAttentionPanel();
    });
    health.addEventListener("keydown", (event) => {
        if (!health.classList.contains("is-attention")) return;
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openOpsAttentionPanel();
        }
    });
}

function syncOpsPlanHealthAttentionState(needsAttention, count) {
    const health = document.getElementById("ops-plan-health");
    if (!health) return;
    wireOpsPlanHealthAttention();
    health.classList.toggle("is-clickable", needsAttention);
    if (needsAttention) {
        health.setAttribute("role", "button");
        health.setAttribute("tabindex", "0");
        health.setAttribute("aria-label", t("ops_attn_open_aria", { count }) || `Zahteva pažnju: ${count}. Otvorite panel rešenja.`);
    } else {
        health.setAttribute("role", "status");
        health.removeAttribute("tabindex");
        health.removeAttribute("aria-label");
    }
}

export {
    collectOpsAttentionItems,
    openOpsAttentionPanel,
    closeOpsAttentionPanel,
    refreshOpsAttentionPanelIfOpen,
    applyOpsAttentionFix,
    applyCoverageResolution,
    syncOpsPlanHealthAttentionState,
    wireOpsPlanHealthAttention
};
