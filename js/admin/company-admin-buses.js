// BusCommand — Company Admin full CRUD fleet (CA Buses)
import ApiClient from "../core/api-client.js";
import { loadStateFromFirestore } from "../core/firebase-service.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import { saveState } from "../core/state.js";
import { actionAttr, changeAttr } from "../core/action-delegate.js";
import { escapeHtml, showToast, refreshIcons } from "../core/utils.js";
import { getCompanyScope } from "./company-admin-overview-model.js";
import {
    BUS_OPS_STATUSES,
    busRevisionOf,
    normalizeBusOpsStatus,
    normalizeBusPlate
} from "../data/bus-ops.js";
import {
    buildNewBusGroups,
    busHasGroup,
    withAttachedGroup,
    withDetachedGroup
} from "../data/bus-group-membership.js";
import { dispoChangeReasonOptions, recordDemoChangeReason } from "../dispatcher/change-reason.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { t } from "../ui/i18n.js";

const OPS_STATUS_BADGE_TONE = Object.freeze({
    active: "approved",
    breakdown: "rejected",
    reserve: "pending",
    other_line: "pending"
});

let addPending = false;
let savePending = false;

function companyBuses() {
    const scope = getCompanyScope(window.state, window.currentUser, USE_LOCAL_STATE);
    return scope.buses || [];
}

function companyGroups() {
    const scope = getCompanyScope(window.state, window.currentUser, USE_LOCAL_STATE);
    return scope.groups || [];
}

function findBusById(busId) {
    return (window.state.buses || []).find((bus) => bus.id === busId) || null;
}

function findBusByNumber(number, excludeId) {
    const key = String(number || "").trim().toLowerCase();
    return companyBuses().find((bus) =>
        String(bus.number || "").trim().toLowerCase() === key && bus.id !== excludeId
    ) || null;
}

function primaryGroupId(bus) {
    if (Array.isArray(bus?.groupIds) && bus.groupIds.length) return String(bus.groupIds[0]);
    return String(bus?.groupId || bus?.lineId || "").trim();
}

function groupName(groups, groupId) {
    const match = (groups || []).find((group) => String(group.id) === String(groupId));
    return match?.name || groupId || "—";
}

function busGroupLabels(bus, groups) {
    const ids = Array.isArray(bus.groupIds) && bus.groupIds.length
        ? bus.groupIds
        : (bus.groupId ? [bus.groupId] : []);
    if (!ids.length) return "—";
    return ids.map((id) => groupName(groups, id)).join(", ");
}

function opsStatusLabel(status) {
    const key = `bus_ops_${normalizeBusOpsStatus(status)}`;
    return t(key) || normalizeBusOpsStatus(status);
}

function opsStatusOptions(selected) {
    const current = normalizeBusOpsStatus(selected);
    return BUS_OPS_STATUSES.map((status) =>
        `<option value="${status}" ${status === current ? "selected" : ""}>${escapeHtml(opsStatusLabel(status))}</option>`
    ).join("");
}

function groupOptionsHtml(selectedGroupId, withPlaceholder = false) {
    const groups = companyGroups();
    const options = [];
    if (withPlaceholder) {
        options.push(`<option value="">${escapeHtml(t("ca_plan_group_placeholder") || "Select group")}</option>`);
    }
    for (const group of groups) {
        const id = escapeHtml(group.id);
        const name = escapeHtml(group.name || group.id);
        const selected = String(group.id) === String(selectedGroupId) ? " selected" : "";
        options.push(`<option value="${id}"${selected}>${name}</option>`);
    }
    return options.join("");
}

function otherGroupOptions(bus, selectedGroupId) {
    const current = primaryGroupId(bus);
    return companyGroups()
        .filter((group) => String(group.id) !== current)
        .map((group) => {
            const id = escapeHtml(group.id);
            const name = escapeHtml(group.name || group.id);
            const selected = String(group.id) === String(selectedGroupId) ? " selected" : "";
            return `<option value="${id}"${selected}>${name}</option>`;
        }).join("") || `<option value="">${escapeHtml(t("bus_other_line_no_groups") || "—")}</option>`;
}

function upsertCaBusFromApi(bus) {
    if (!bus?.id) return;
    const list = window.state.buses || [];
    const idx = list.findIndex((item) => item.id === bus.id);
    if (idx >= 0) list[idx] = { ...list[idx], ...bus };
    else list.push(bus);
}

async function refreshCompanyState() {
    if (USE_LOCAL_STATE) { saveState(); return; }
    const companyId = window.currentUser?.companyId;
    if (!companyId) return;
    try {
        const refreshed = await loadStateFromFirestore(companyId);
        if (refreshed) {
            if (Array.isArray(refreshed.buses)) window.state.buses = refreshed.buses;
            if (Array.isArray(refreshed.groups)) window.state.groups = refreshed.groups;
        }
    } catch {
        // state refresh is best-effort; local object was already upserted
    }
}

async function applyToggleActive(bus, nextActive, reason = "") {
    const expectedRevision = busRevisionOf(bus);
    if (USE_LOCAL_STATE) {
        bus.active = nextActive;
        bus.revision = expectedRevision + 1;
        if (!nextActive) {
            recordDemoChangeReason({
                type: "bus_deactivated",
                busId: bus.id,
                reason,
                note: ""
            });
        }
        saveState();
        renderCompanyAdminBuses();
        showToast(t("ca_buses_update_success"), "success");
        return true;
    }
    const result = await ApiClient.setStaffBusActive(
        bus.id,
        nextActive,
        expectedRevision,
        nextActive ? {} : { reason }
    );
    if (!result?.success) {
        showToast(result?.error || t("ca_buses_status_error"), "error");
        await refreshCompanyState();
        renderCompanyAdminBuses();
        return false;
    }
    upsertCaBusFromApi(result.bus || { ...bus, active: nextActive, revision: expectedRevision + 1 });
    renderCompanyAdminBuses();
    showToast(t("ca_buses_update_success"), "success");
    return true;
}

async function applyBusProfileUpdate(bus, updates) {
    const expectedRevision = busRevisionOf(bus);
    const payload = { ...updates, expectedRevision };
    if (USE_LOCAL_STATE) {
        Object.assign(bus, updates, { revision: expectedRevision + 1 });
        saveState();
        renderCompanyAdminBuses();
        showToast(t("ca_buses_update_success"), "success");
        return true;
    }
    const result = await ApiClient.updateStaffBus(bus.id, payload);
    if (!result?.success) {
        showToast(result?.error || t("ca_buses_status_error"), "error");
        await refreshCompanyState();
        renderCompanyAdminBuses();
        return false;
    }
    upsertCaBusFromApi(result.bus || { ...bus, ...updates, revision: expectedRevision + 1 });
    renderCompanyAdminBuses();
    showToast(t("ca_buses_update_success"), "success");
    return true;
}

function fillCaBusAddSelects() {
    const groupSelect = document.getElementById("ca-bus-add-group");
    const statusSelect = document.getElementById("ca-bus-add-status");
    if (groupSelect) groupSelect.innerHTML = groupOptionsHtml("", true);
    if (statusSelect) statusSelect.innerHTML = opsStatusOptions("active");
}

function clearCaBusAddForm() {
    const number = document.getElementById("ca-bus-add-number");
    const plate = document.getElementById("ca-bus-add-plate");
    const group = document.getElementById("ca-bus-add-group");
    const status = document.getElementById("ca-bus-add-status");
    if (number) number.value = "";
    if (plate) plate.value = "";
    if (group) group.value = "";
    if (status) status.value = "active";
}

function renderCompanyAdminBuses() {
    if (!window.currentUser || window.currentUser.role !== "company-admin") return;
    const scope = getCompanyScope(window.state, window.currentUser, USE_LOCAL_STATE);
    const note = document.getElementById("ca-buses-readonly-note");
    if (note) note.textContent = t("ca_buses_readonly_note")
        || "Manage the company fleet: add, edit and assign groups and statuses.";
    const countEl = document.getElementById("ca-buses-count");
    if (countEl) countEl.textContent = String(scope.buses.length);
    const tbody = document.getElementById("ca-buses-table-body");
    if (!tbody) return;
    fillCaBusAddSelects();
    tbody.replaceChildren();
    if (!scope.buses.length) {
        const row = tbody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 5;
        cell.style.textAlign = "center";
        cell.style.color = "var(--text-muted)";
        cell.textContent = t("ca_buses_empty") || "No buses in this company yet.";
        refreshIcons();
        return;
    }
    const sorted = [...scope.buses].sort((a, b) =>
        String(a.number || a.id || "").localeCompare(String(b.number || b.id || ""), undefined, { numeric: true })
    );
    for (const bus of sorted) {
        const active = bus.active !== false;
        const ops = normalizeBusOpsStatus(bus);
        const tone = OPS_STATUS_BADGE_TONE[ops] || "pending";
        const groupId = primaryGroupId(bus);
        const groups = companyGroups();

        const viewRow = tbody.insertRow();
        viewRow.dataset.busId = bus.id;
        viewRow.className = active ? "" : "is-inactive";

        viewRow.insertCell().innerHTML = `<strong>${escapeHtml(bus.number || bus.id || "—")}</strong>${active ? "" : ` <small>· ${escapeHtml(t("ca_buses_inactive") || t("driver_status_inactive") || "Inactive")}</small>`}`;
        viewRow.insertCell().textContent = normalizeBusPlate(bus) || "—";
        viewRow.insertCell().textContent = busGroupLabels(bus, groups);
        const statusCell = viewRow.insertCell();
        statusCell.innerHTML = `<span class="badge ${tone}">${escapeHtml(opsStatusLabel(ops))}</span>`;

        const actionsCell = viewRow.insertCell();
        actionsCell.innerHTML = `
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <button type="button" class="btn-secondary" ${actionAttr("openCaBusEdit", [bus.id])}>
                    <span>${escapeHtml(t("ca_buses_edit") || t("btn_edit") || "Edit")}</span>
                </button>
                <button type="button" class="${active ? "btn-danger" : "btn-primary"}" ${actionAttr("toggleCaBusActive", [bus.id])}>
                    <span>${escapeHtml(active ? t("ca_buses_inactive") || t("btn_deactivate") || "Deactivate" : t("ca_buses_active") || t("btn_activate") || "Activate")}</span>
                </button>
            </div>
        `;

        const editRow = tbody.insertRow();
        editRow.className = "ca-bus-edit-row hidden";
        editRow.dataset.caBusEdit = bus.id;
        editRow.innerHTML = `
            <td colspan="5" style="padding:0;">
                <form class="ca-bus-edit-form card" data-bus-edit="${escapeHtml(bus.id)}" data-submit-action="saveCaBusEdit" novalidate>
                    <div class="company-drivers-add-fields">
                        <label class="form-group" for="ca-bus-edit-number-${escapeHtml(bus.id)}">
                            <span>${escapeHtml(t("ca_buses_number") || "Bus number")}</span>
                            <input type="text" id="ca-bus-edit-number-${escapeHtml(bus.id)}" name="number" maxlength="128" value="${escapeHtml(bus.number || "")}" required>
                        </label>
                        <label class="form-group" for="ca-bus-edit-plate-${escapeHtml(bus.id)}">
                            <span>${escapeHtml(t("ca_buses_plate") || "Plate")}</span>
                            <input type="text" id="ca-bus-edit-plate-${escapeHtml(bus.id)}" name="plate" maxlength="20" value="${escapeHtml(normalizeBusPlate(bus))}">
                        </label>
                        <label class="form-group" for="ca-bus-edit-group-${escapeHtml(bus.id)}">
                            <span>${escapeHtml(t("ca_buses_group") || "Group")}</span>
                            <select id="ca-bus-edit-group-${escapeHtml(bus.id)}" ${changeAttr("changeCaBusGroup", [bus.id], "args-value")}>${groupOptionsHtml(groupId)}</select>
                        </label>
                        <label class="form-group" for="ca-bus-edit-status-${escapeHtml(bus.id)}">
                            <span>${escapeHtml(t("ca_buses_status") || "Status")}</span>
                            <select id="ca-bus-edit-status-${escapeHtml(bus.id)}" ${changeAttr("quickSetCaBusStatus", [bus.id], "args-value")}>${opsStatusOptions(ops)}</select>
                        </label>
                    </div>
                    <div class="company-driver-add-actions" style="padding:0 16px 16px;">
                        <button type="button" class="btn-secondary" data-action="cancelCaBusEdit" data-action-args='["${escapeHtml(bus.id)}"]'>
                            <span>${escapeHtml(t("ca_buses_cancel") || t("btn_cancel") || "Cancel")}</span>
                        </button>
                        <button type="submit" class="btn-primary">
                            <i data-lucide="save"></i>
                            <span>${escapeHtml(t("ca_buses_save") || t("btn_save") || "Save")}</span>
                        </button>
                    </div>
                </form>
            </td>
        `;
    }
    refreshIcons();
}

function openCompanyBusesOverview() {
    if (window.currentUser?.role !== "company-admin") {
        showToast(t("error_access_denied"), "error");
        return;
    }
    if (typeof window.switchSection === "function") {
        window.switchSection("company-admin-buses");
    }
    document.getElementById("ca-bus-add-card")?.classList.add("hidden");
    renderCompanyAdminBuses();
}

function openCaBusAddModal() {
    document.getElementById("ca-bus-add-card")?.classList.remove("hidden");
    document.getElementById("ca-bus-add-number")?.focus();
}

function closeCaBusAddModal() {
    document.getElementById("ca-bus-add-card")?.classList.add("hidden");
    clearCaBusAddForm();
}

async function submitCaBusAdd(event) {
    if (event?.preventDefault) event.preventDefault();
    if (addPending) return false;
    const number = String(document.getElementById("ca-bus-add-number")?.value || "").trim();
    const plate = normalizeBusPlate(document.getElementById("ca-bus-add-plate")?.value || "");
    const groupId = String(document.getElementById("ca-bus-add-group")?.value || "").trim();
    const opsStatus = normalizeBusOpsStatus(document.getElementById("ca-bus-add-status")?.value || "active");
    if (!number) {
        showToast(t("ca_buses_number_exists") || t("error_required"), "error");
        return false;
    }
    if (!groupId) {
        showToast(t("ca_buses_group_error"), "error");
        return false;
    }
    if (findBusByNumber(number)) {
        showToast(t("ca_buses_number_exists"), "error");
        return false;
    }
    addPending = true;
    const submitBtn = document.getElementById("ca-bus-add-submit");
    if (submitBtn) submitBtn.disabled = true;
    try {
        if (USE_LOCAL_STATE) {
            const bus = {
                id: `bus-${Date.now()}`,
                number,
                plate,
                active: true,
                opsStatus,
                revision: 0,
                ...buildNewBusGroups(groupId)
            };
            if (!Array.isArray(window.state.buses)) window.state.buses = [];
            window.state.buses.push(bus);
            saveState();
        } else {
            const result = await ApiClient.createStaffBus(number, groupId, { plate, opsStatus });
            if (!result?.success) {
                showToast(result?.error || t("error_generic"), "error");
                return false;
            }
            upsertCaBusFromApi(result.bus);
        }
        showToast(t("ca_buses_add_success"), "success");
        clearCaBusAddForm();
        closeCaBusAddModal();
        renderCompanyAdminBuses();
        return true;
    } catch (err) {
        showToast(err.message || t("error_generic"), "error");
        return false;
    } finally {
        addPending = false;
        if (submitBtn) submitBtn.disabled = false;
    }
}

function openCaBusEdit(busId) {
    const selector = `[data-ca-bus-edit="${CSS.escape(String(busId))}"]`;
    const editRow = document.querySelector(selector);
    if (!editRow) return;
    document.querySelectorAll(".ca-bus-edit-row").forEach((row) => row.classList.add("hidden"));
    editRow.classList.remove("hidden");
    const input = editRow.querySelector("input[name='number']");
    if (input) input.focus();
}

function cancelCaBusEdit(busId) {
    const selector = `[data-ca-bus-edit="${CSS.escape(String(busId))}"]`;
    const editRow = document.querySelector(selector);
    if (editRow) editRow.classList.add("hidden");
}

async function saveCaBusEdit(event) {
    if (event?.preventDefault) event.preventDefault();
    if (savePending) return false;
    const form = event?.target;
    const busId = form?.dataset?.busEdit;
    const bus = findBusById(busId);
    if (!bus || !form) return false;
    const number = String(form.querySelector("input[name='number']")?.value || "").trim();
    const plate = normalizeBusPlate(form.querySelector("input[name='plate']")?.value || "");
    if (!number) {
        showToast(t("ca_buses_number_exists") || t("error_required"), "error");
        return false;
    }
    const conflict = findBusByNumber(number, bus.id);
    if (conflict) {
        showToast(t("ca_buses_number_exists"), "error");
        return false;
    }
    savePending = true;
    try {
        const ok = await applyBusProfileUpdate(bus, { number, plate });
        if (ok) cancelCaBusEdit(busId);
        return ok;
    } finally {
        savePending = false;
    }
}

async function changeCaBusGroup(busId, toGroupId) {
    const bus = findBusById(busId);
    const gid = String(toGroupId || "").trim();
    if (!bus || !gid || primaryGroupId(bus) === gid) return;
    const old = primaryGroupId(bus);
    const expectedRevision = busRevisionOf(bus);
    if (USE_LOCAL_STATE) {
        const updated = withAttachedGroup(withDetachedGroup(bus, old), gid);
        Object.assign(bus, updated, { revision: expectedRevision + 1 });
        saveState();
        renderCompanyAdminBuses();
        showToast(t("ca_buses_update_success"), "success");
        return;
    }
    const result = await ApiClient.switchStaffBusGroup(bus.id, gid, expectedRevision);
    if (!result?.success) {
        showToast(result?.error || t("ca_buses_group_error"), "error");
        await refreshCompanyState();
        renderCompanyAdminBuses();
        return;
    }
    upsertCaBusFromApi(result.bus || { ...bus, ...withAttachedGroup(withDetachedGroup(bus, old), gid), revision: expectedRevision + 1 });
    renderCompanyAdminBuses();
    showToast(t("ca_buses_update_success"), "success");
}

async function setCaBusOtherLine(busId, otherGroupId) {
    const bus = findBusById(busId);
    const gid = String(otherGroupId || "").trim();
    if (!bus || !gid) return;
    await applyBusProfileUpdate(bus, { opsStatus: "other_line", otherLineId: gid });
}

async function quickSetCaBusStatus(busId, opsStatus) {
    const bus = findBusById(busId);
    if (!bus) return;
    const status = normalizeBusOpsStatus(opsStatus);
    if (status === "other_line") {
        const current = primaryGroupId(bus);
        const otherGroups = companyGroups().filter((group) => String(group.id) !== current);
        if (!otherGroups.length) {
            showToast(t("bus_other_line_no_groups"), "error");
            return;
        }
        showConfirm(
            t("ca_buses_other_line_select") || t("bus_other_line_prompt"),
            (payload) => setCaBusOtherLine(busId, payload?.reason || ""),
            {
                danger: false,
                title: t("bus_ops_other_line"),
                confirmText: t("btn_yes"),
                reasons: otherGroups.map((g) => ({ value: g.id, label: g.name || g.id }))
            }
        );
        return;
    }
    await applyBusProfileUpdate(bus, { opsStatus: status, otherLineId: "" });
}

async function toggleCaBusActive(busId) {
    const bus = findBusById(busId);
    if (!bus) return;
    const nextActive = bus.active === false;
    const message = nextActive
        ? (t("ca_buses_active") + "?")
        : t("ca_buses_deactivate_confirm");
    showConfirm(
        message,
        async (payload) => {
            const reason = payload?.reason || "";
            if (!nextActive && !reason) {
                showToast(t("ca_buses_deactivate_reason"), "error");
                return;
            }
            await applyToggleActive(bus, nextActive, reason);
        },
        {
            danger: !nextActive,
            title: nextActive ? t("ca_buses_active") : t("ca_buses_inactive"),
            confirmText: t("btn_yes"),
            reasons: nextActive ? undefined : dispoChangeReasonOptions()
        }
    );
}

export {
    renderCompanyAdminBuses,
    openCompanyBusesOverview,
    openCaBusAddModal,
    closeCaBusAddModal,
    submitCaBusAdd,
    openCaBusEdit,
    saveCaBusEdit,
    cancelCaBusEdit,
    changeCaBusGroup,
    quickSetCaBusStatus,
    setCaBusOtherLine,
    toggleCaBusActive
};
