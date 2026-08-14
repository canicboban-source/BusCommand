// BusCommand — Company Admin: tenant-scoped groups / lines
import ApiClient from "../core/api-client.js";
import { actionAttr } from "../core/action-delegate.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import { saveState } from "../core/state.js";
import { runSingleSubmission } from "../core/submit-lock.js";
import { canRunCompanyAdminAction } from "../core/ui-permissions.js";
import { escapeHtml, showToast } from "../core/utils.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { t } from "../ui/i18n.js";
import { renderCompanyAdminDashboard } from "./company-admin.js";
import {
    DEFAULT_GROUP_COLOR,
    filterCompanyGroups,
    getCompanyGroupDependencies,
    getCompanyGroupsScope,
    groupReadiness,
    safeGroupColor,
    validateCompanyGroupDraft
} from "./company-admin-groups-model.js";

let editingGroupId = null;
let groupSearch = "";
let groupStatus = "all";
let groupSearchTimer = null;
const deletingGroups = new Set();

function getScope() {
    return getCompanyGroupsScope(window.state, window.currentUser, USE_LOCAL_STATE);
}

function groupFieldId(field) {
    return {
        id: "ca-new-group-line-id",
        name: "ca-new-group-name",
        description: "ca-new-group-desc",
        color: "ca-new-group-color-hex"
    }[field];
}

function setGroupFieldErrors(errors = {}) {
    for (const field of ["id", "name", "description", "color"]) {
        const input = document.getElementById(groupFieldId(field));
        const error = document.querySelector(`[data-group-error="${field}"]`);
        const key = errors[field];
        if (input) input.setAttribute("aria-invalid", key ? "true" : "false");
        if (error) error.textContent = key ? t(`ca_group_error_${key}`) : "";
    }
}

function readGroupDraft() {
    return {
        id: document.getElementById("ca-new-group-line-id")?.value || "",
        name: document.getElementById("ca-new-group-name")?.value || "",
        description: document.getElementById("ca-new-group-desc")?.value || "",
        color: document.getElementById("ca-new-group-color-hex")?.value
            || document.getElementById("ca-new-group-color")?.value
            || DEFAULT_GROUP_COLOR
    };
}

function syncCompanyGroupColor(source = "hex") {
    const picker = document.getElementById("ca-new-group-color");
    const hex = document.getElementById("ca-new-group-color-hex");
    const swatch = document.getElementById("ca-group-color-swatch");
    if (!picker || !hex) return;
    if (source === "picker") hex.value = picker.value.toUpperCase();
    const color = safeGroupColor(hex.value);
    if (/^#[0-9A-F]{6}$/i.test(hex.value)) picker.value = color;
    if (swatch) swatch.style.background = color;
}

function resetCompanyGroupForm() {
    editingGroupId = null;
    for (const id of ["ca-new-group-line-id", "ca-new-group-name", "ca-new-group-desc"]) {
        const input = document.getElementById(id);
        if (input) input.value = "";
    }
    const picker = document.getElementById("ca-new-group-color");
    const hex = document.getElementById("ca-new-group-color-hex");
    if (picker) picker.value = DEFAULT_GROUP_COLOR;
    if (hex) hex.value = DEFAULT_GROUP_COLOR;
    setGroupFieldErrors();
    renderCompanyGroupFormState();
}

function renderCompanyGroupFormState() {
    const formCard = document.getElementById("ca-group-form-card");
    const idInput = document.getElementById("ca-new-group-line-id");
    const title = document.getElementById("ca-group-form-title");
    const submitBtn = document.getElementById("ca-save-group");
    const submitText = submitBtn?.querySelector("span");
    const submitIcon = submitBtn?.querySelector("i[data-lucide], i");
    const cancel = document.getElementById("ca-cancel-group-edit");
    const editing = Boolean(editingGroupId);
    if (formCard) formCard.classList.toggle("is-editing", editing);
    if (idInput) idInput.disabled = editing;
    if (title) title.textContent = t(editing ? "ca_edit_group_title" : "ca_add_group_title");
    if (submitText) submitText.textContent = t(editing ? "ca_group_save_changes" : "btn_add_group");
    if (submitIcon) submitIcon.setAttribute("data-lucide", editing ? "save" : "plus");
    if (cancel) cancel.hidden = !editing;
    syncCompanyGroupColor();
}

function renderGroupSummary(scope) {
    const readyCount = scope.groups.filter(group => groupReadiness(getCompanyGroupDependencies(group.id, scope)).ready).length;
    const referencedCount = scope.groups.filter(group => !getCompanyGroupDependencies(group.id, scope).canDelete).length;
    const values = {
        "ca-groups-stat-total": scope.groups.length,
        "ca-groups-stat-ready": readyCount,
        "ca-groups-stat-incomplete": scope.groups.length - readyCount,
        "ca-groups-stat-used": referencedCount
    };
    for (const [id, value] of Object.entries(values)) {
        const element = document.getElementById(id);
        if (element) element.textContent = String(value);
    }
}

function dependencyLabel(dependencies) {
    return dependencies.references.map(key => t(`ca_group_ref_${key}`)).join(", ");
}

function groupRowHtml(group, scope) {
    const dependencies = getCompanyGroupDependencies(group.id, scope);
    const readiness = groupReadiness(dependencies);
    const color = safeGroupColor(group.color);
    const dependencyText = dependencyLabel(dependencies);
    const deleteTitle = dependencies.canDelete
        ? t("ca_group_delete_empty_title")
        : t("ca_group_delete_blocked_title", { items: dependencyText });
    const status = readiness.ready
        ? `<span class="company-group-status is-ready"><i data-lucide="circle-check"></i>${escapeHtml(t("ca_status_ready"))}</span>`
        : `<span class="company-group-status is-incomplete" title="${escapeHtml(t("ca_missing_title", { items: readiness.missing.map(key => t(`ca_missing_${key === "plans" ? "plan" : key === "dispatchers" ? "dispatcher" : key}`)).join(", ") }))}"><i data-lucide="circle-alert"></i>${escapeHtml(t("ca_status_incomplete"))}</span>`;

    const isEditingRow = String(editingGroupId || "") === String(group.id);
    return `<article class="company-group-row${isEditingRow ? " is-editing" : ""}" style="--group-color:${color}">
        <div class="company-group-identity">
            <span class="company-group-color" aria-hidden="true"></span>
            <div><span>${escapeHtml(t("plan_pick_line"))} ${escapeHtml(String(group.id))}</span><strong>${escapeHtml(group.name || "—")}</strong><small>${escapeHtml(group.description || t("ca_group_no_description"))}</small></div>
        </div>
        <div class="company-group-metrics">
            <span><b>${dependencies.counts.drivers}</b>${escapeHtml(t("ca_col_drivers"))}</span>
            <span><b>${dependencies.counts.buses}</b>${escapeHtml(t("ca_col_buses"))}</span>
            <span><b>${dependencies.counts.plans}</b>${escapeHtml(t("ca_col_plans"))}</span>
            <span><b>${dependencies.counts.dispatchers}</b>${escapeHtml(t("ca_col_dispatchers"))}</span>
        </div>
        <div class="company-group-state">${status}</div>
        <div class="company-group-actions">
            <button type="button" class="btn-secondary company-group-edit-btn${isEditingRow ? " is-active" : ""}" ${actionAttr("startEditCompanyGroup", [String(group.id)])} ${isEditingRow ? "aria-current=\"true\"" : ""}><i data-lucide="pencil"></i><span>${escapeHtml(t("btn_edit"))}</span></button>
            <button type="button" class="btn-danger-ghost company-group-delete-btn" ${actionAttr("deleteCompanyGroup", [String(group.id)])} ${dependencies.canDelete ? "" : "disabled"} title="${escapeHtml(deleteTitle)}" aria-label="${escapeHtml(t("btn_delete"))}"><i data-lucide="trash-2"></i><span>${escapeHtml(t("btn_delete"))}</span></button>
        </div>
    </article>`;
}

function renderCompanyAdminGroups() {
    if (!canRunCompanyAdminAction(window.currentUser?.role)) return;
    const container = document.getElementById("ca-groups-manage-list");
    if (!container) return;
    const scope = getScope();
    renderGroupSummary(scope);
    renderCompanyGroupFormState();

    const groups = filterCompanyGroups(scope.groups, groupSearch, groupStatus, scope);
    if (scope.groups.length === 0) {
        container.innerHTML = `<div class="company-groups-empty"><div class="company-groups-empty-icon" aria-hidden="true"><i data-lucide="layers-3"></i></div><strong>${escapeHtml(t("ca_groups_empty_title"))}</strong><p>${escapeHtml(t("ca_groups_empty"))}</p><button type="button" class="btn-primary" ${actionAttr("focusCompanyGroupForm")}><i data-lucide="plus"></i><span>${escapeHtml(t("btn_add_group"))}</span></button></div>`;
    } else if (groups.length === 0) {
        container.innerHTML = `<div class="company-groups-empty is-filtered"><div class="company-groups-empty-icon" aria-hidden="true"><i data-lucide="search-x"></i></div><strong>${escapeHtml(t("ca_groups_no_results"))}</strong><p>${escapeHtml(t("ca_groups_no_results_hint"))}</p></div>`;
    } else {
        container.innerHTML = groups.map(group => groupRowHtml(group, scope)).join("");
    }

    const search = document.getElementById("ca-groups-search");
    const status = document.getElementById("ca-groups-status-filter");
    if (search) {
        search.value = groupSearch;
        search.oninput = event => {
            groupSearch = event.target.value;
            clearTimeout(groupSearchTimer);
            groupSearchTimer = setTimeout(() => renderCompanyAdminGroups(), 250);
        };
    }
    if (status) {
        status.value = groupStatus;
        status.onchange = event => {
            groupStatus = event.target.value;
            renderCompanyAdminGroups();
        };
    }
    const picker = document.getElementById("ca-new-group-color");
    const hex = document.getElementById("ca-new-group-color-hex");
    if (picker) picker.oninput = () => syncCompanyGroupColor("picker");
    if (hex) hex.oninput = () => syncCompanyGroupColor("hex");
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function focusCompanyGroupForm() {
    document.getElementById("ca-new-group-line-id")?.focus();
}

function startEditCompanyGroup(id) {
    const scope = getScope();
    const group = scope.groups.find(item => String(item.id) === String(id));
    if (!group) {
        showToast(t("ca_group_forbidden"), "error");
        return false;
    }
    editingGroupId = String(group.id);
    document.getElementById("ca-new-group-line-id").value = String(group.id);
    document.getElementById("ca-new-group-name").value = group.name || "";
    document.getElementById("ca-new-group-desc").value = group.description || "";
    document.getElementById("ca-new-group-color").value = safeGroupColor(group.color);
    document.getElementById("ca-new-group-color-hex").value = safeGroupColor(group.color);
    setGroupFieldErrors();
    renderCompanyAdminGroups();
    document.getElementById("ca-new-group-name")?.focus();
    document.getElementById("ca-group-form-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
}

function cancelCompanyGroupEdit() {
    resetCompanyGroupForm();
    renderCompanyAdminGroups();
}

async function persistCompanyGroupDraft(draft, { editingId = null } = {}) {
    if (!canRunCompanyAdminAction(window.currentUser?.role)) {
        return { success: false, error: t("error_access_denied"), errors: {} };
    }
    const validated = validateCompanyGroupDraft(draft);
    if (!validated.valid) return { success: false, error: t("ca_group_fix_errors"), errors: validated.errors };
    const scope = getScope();
    const duplicate = scope.groups.some(group =>
        String(group.id) === validated.value.id && String(group.id) !== String(editingId || "")
    );
    if (duplicate) return { success: false, error: t("ca_group_error_id_exists"), errors: { id: "id_exists" } };

    let savedGroup = { ...validated.value, companyId: scope.companyId || "demo" };
    if (!USE_LOCAL_STATE) {
        const payload = {
            name: validated.value.name,
            description: validated.value.description,
            color: validated.value.color
        };
        const result = editingId
            ? await ApiClient.updateCompanyGroup(scope.companyId, editingId, payload)
            : await ApiClient.createCompanyGroup(scope.companyId, { id: validated.value.id, ...payload });
        if (!result.success) return { success: false, error: result.error || t("ca_group_save_failed"), errors: {} };
        savedGroup = result.group || savedGroup;
    }

    if (!window.state.groups) window.state.groups = [];
    const index = window.state.groups.findIndex(group =>
        String(group.id) === String(savedGroup.id)
        && (USE_LOCAL_STATE || group.companyId === scope.companyId)
    );
    if (index >= 0) window.state.groups[index] = { ...window.state.groups[index], ...savedGroup };
    else window.state.groups.push(savedGroup);
    saveState();
    return { success: true, group: savedGroup, errors: {} };
}

async function saveCompanyGroup() {
    if (!canRunCompanyAdminAction(window.currentUser?.role)) {
        showToast(t("error_access_denied"), "error");
        return false;
    }
    const validated = validateCompanyGroupDraft(readGroupDraft());
    setGroupFieldErrors(validated.errors);
    if (!validated.valid) {
        document.getElementById(groupFieldId(Object.keys(validated.errors)[0]))?.focus();
        showToast(t("ca_group_fix_errors"), "error");
        return false;
    }
    const button = document.getElementById("ca-save-group");
    const submission = await runSingleSubmission(button, t("ca_group_saving"), async () => {
        const result = await persistCompanyGroupDraft(validated.value, { editingId: editingGroupId });
        if (!result.success) {
            setGroupFieldErrors(result.errors);
            if (Object.keys(result.errors).length) document.getElementById(groupFieldId(Object.keys(result.errors)[0]))?.focus();
            showToast(result.error || t("ca_group_save_failed"), "error");
            return false;
        }
        const wasEditing = Boolean(editingGroupId);
        resetCompanyGroupForm();
        renderCompanyAdminGroups();
        renderCompanyAdminDashboard();
        showToast(t(wasEditing ? "ca_group_updated" : "group_added"), "success");
        return true;
    });
    return submission.started && submission.value === true;
}

function addCompanyGroup() {
    return saveCompanyGroup();
}

function deleteCompanyGroup(id) {
    if (!canRunCompanyAdminAction(window.currentUser?.role) || deletingGroups.has(String(id))) return false;
    const scope = getScope();
    const group = scope.groups.find(item => String(item.id) === String(id));
    if (!group) {
        showToast(t("ca_group_forbidden"), "error");
        return false;
    }
    const dependencies = getCompanyGroupDependencies(group.id, scope);
    if (!dependencies.canDelete) {
        showToast(t("ca_group_delete_blocked", { items: dependencyLabel(dependencies) }), "error", 6500);
        return false;
    }

    showConfirm(t("ca_group_confirm_delete", { name: group.name, id: group.id }), async () => {
        deletingGroups.add(String(id));
        try {
            if (!USE_LOCAL_STATE) {
                const result = await ApiClient.deleteCompanyGroup(scope.companyId, String(id));
                if (!result.success) {
                    const references = result.details?.references || [];
                    const message = references.length
                        ? t("ca_group_delete_blocked", { items: references.map(key => t(`ca_group_ref_${key}`)).join(", ") })
                        : result.error || t("ca_group_delete_failed");
                    showToast(message, "error", 6500);
                    return;
                }
            }
            window.state.groups = (window.state.groups || []).filter(item =>
                !(String(item.id) === String(id) && (USE_LOCAL_STATE || item.companyId === scope.companyId))
            );
            if (window.state.activeGroupFilter === id) window.state.activeGroupFilter = null;
            if (String(editingGroupId) === String(id)) resetCompanyGroupForm();
            saveState();
            renderCompanyAdminGroups();
            renderCompanyAdminDashboard();
            showToast(t("ca_group_deleted"), "info");
        } finally {
            deletingGroups.delete(String(id));
        }
    }, { danger: true, title: t("ca_group_delete_title"), confirmText: t("btn_yes") || "Da" });
    return true;
}

export {
    addCompanyGroup,
    cancelCompanyGroupEdit,
    deleteCompanyGroup,
    focusCompanyGroupForm,
    persistCompanyGroupDraft,
    renderCompanyAdminGroups,
    saveCompanyGroup,
    startEditCompanyGroup,
    syncCompanyGroupColor
};
