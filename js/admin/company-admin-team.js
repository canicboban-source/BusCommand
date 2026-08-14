// BusCommand — Company Admin: tenant-scoped dispatcher lifecycle
import ApiClient from "../core/api-client.js";
import { actionAttr } from "../core/action-delegate.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import { saveState } from "../core/state.js";
import { runSingleSubmission } from "../core/submit-lock.js";
import { canRunCompanyAdminAction } from "../core/ui-permissions.js";
import { escapeHtml, showToast } from "../core/utils.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { t } from "../ui/i18n.js";
import { rowActionsMenuHtml } from "../ui/row-actions-menu.js";
import { renderCompanyAdminDashboard } from "./company-admin.js";
import {
    dispatcherReadiness,
    filterCompanyDispatchers,
    getCompanyTeamScope,
    normalizeDispatcherGroups,
    validateCompanyDispatcherDraft,
    validateCompanyDispatcherProfile
} from "./company-admin-team-model.js";
import { safeGroupColor } from "./company-admin-groups-model.js";

let teamSearch = "";
let teamStatus = "all";
const pendingDispatcherActions = new Set();
const openGroupEditors = new Set();
const openProfileEditors = new Set();

function getScope() {
    return getCompanyTeamScope(window.state, window.currentUser, USE_LOCAL_STATE);
}

function getCompanyId() {
    return getScope().companyId;
}

function getCompanyDispatchers() {
    return getScope().dispatchers;
}

function getCompanyGroups() {
    return getScope().groups;
}

function findCompanyDispatcher(dispId) {
    return getCompanyDispatchers().find(dispatcher => String(dispatcher.id) === String(dispId)) || null;
}

function dispatcherFieldId(field) {
    return {
        name: "ca-new-disp-name",
        email: "ca-new-disp-email",
        password: "ca-new-disp-password",
        groups: "ca-disp-groups-picker"
    }[field];
}

function setDispatcherFieldErrors(errors = {}) {
    for (const field of ["name", "email", "password", "groups"]) {
        const input = document.getElementById(dispatcherFieldId(field));
        const error = document.querySelector(`[data-dispatcher-error="${field}"]`);
        const key = errors[field];
        if (input) input.setAttribute("aria-invalid", key ? "true" : "false");
        if (error) error.textContent = key ? t(`ca_team_error_${key}`) : "";
    }
}

function selectedCreateGroups() {
    return Array.from(document.querySelectorAll(".ca-new-disp-group:checked"), input => input.value);
}

function readDispatcherDraft() {
    return {
        name: document.getElementById("ca-new-disp-name")?.value || "",
        email: document.getElementById("ca-new-disp-email")?.value || "",
        password: document.getElementById("ca-new-disp-password")?.value || "",
        groups: selectedCreateGroups()
    };
}

function renderCreateGroupPicker(groups) {
    const picker = document.getElementById("ca-disp-groups-picker");
    if (!picker) return;
    if (groups.length === 0) {
        picker.innerHTML = `<div class="company-team-group-empty"><i data-lucide="layers-3"></i><span>${escapeHtml(t("ca_no_groups_for_disp"))}</span></div>`;
        return;
    }
    picker.innerHTML = groups.map(group => {
        const color = safeGroupColor(group.color);
        return `<label class="company-team-group-option" style="--team-group-color:${color}">
            <input type="checkbox" class="ca-new-disp-group" value="${escapeHtml(String(group.id))}">
            <span aria-hidden="true"></span><strong>${escapeHtml(group.name)}</strong><small>${escapeHtml(t("plan_pick_line"))} ${escapeHtml(String(group.id))}</small>
        </label>`;
    }).join("");
}

function renderTeamSummary(scope) {
    const active = scope.dispatchers.filter(dispatcher => dispatcher.active !== false).length;
    const assigned = scope.dispatchers.filter(dispatcher => dispatcherReadiness(dispatcher, scope.groups).assigned.length > 0).length;
    const values = {
        "ca-team-stat-total": scope.dispatchers.length,
        "ca-team-stat-active": active,
        "ca-team-stat-inactive": scope.dispatchers.length - active,
        "ca-team-stat-assigned": assigned
    };
    for (const [id, value] of Object.entries(values)) {
        const element = document.getElementById(id);
        if (element) element.textContent = String(value);
    }
}

function groupChipsHtml(dispatcher, groups) {
    const assigned = normalizeDispatcherGroups(dispatcher.groups || [], groups);
    if (assigned.length === 0) return `<span class="company-team-no-group"><i data-lucide="triangle-alert"></i>${escapeHtml(t("group_none"))}</span>`;
    return assigned.map(groupId => {
        const group = groups.find(item => String(item.id) === groupId);
        const color = safeGroupColor(group?.color);
        return `<span class="company-team-group-chip" style="--team-group-color:${color}"><i data-lucide="route"></i>${escapeHtml(group?.name || groupId)} <small>${escapeHtml(groupId)}</small></span>`;
    }).join("");
}

function groupEditorHtml(dispatcher, groups) {
    if (groups.length === 0) return `<p class="company-team-editor-empty">${escapeHtml(t("ca_no_groups_for_disp"))}</p>`;
    const assigned = new Set(normalizeDispatcherGroups(dispatcher.groups || [], groups));
    return groups.map(group => {
        const groupId = String(group.id);
        const color = safeGroupColor(group.color);
        return `<label class="company-team-group-option" style="--team-group-color:${color}">
            <input type="checkbox" class="ca-disp-grp-chk" data-disp="${escapeHtml(String(dispatcher.id))}" value="${escapeHtml(groupId)}" ${assigned.has(groupId) ? "checked" : ""}>
            <span aria-hidden="true"></span><strong>${escapeHtml(group.name)}</strong><small>${escapeHtml(t("plan_pick_line"))} ${escapeHtml(groupId)}</small>
        </label>`;
    }).join("");
}

function profileFieldHtml(id, field, type, labelKey, value, attrs) {
    const safeId = escapeHtml(id);
    return `<label for="ca-disp-edit-${field}-${safeId}"><span>${escapeHtml(t(labelKey))}</span><input type="${type}" id="ca-disp-edit-${field}-${safeId}" value="${escapeHtml(value || "")}" ${attrs}><span class="field-error" data-dispatcher-profile-error="${safeId}" data-field="${field}" aria-live="polite"></span></label>`;
}

function profileEditorHtml(dispatcher) {
    const id = String(dispatcher.id);
    const safeId = escapeHtml(id);
    return `<div id="ca-disp-profile-edit-${safeId}" class="company-team-editor company-team-profile-editor"><div><strong>${escapeHtml(t("ca_edit_disp_profile"))}</strong><p>${escapeHtml(t("ca_edit_disp_profile_hint"))}</p></div><div class="company-team-profile-grid">${profileFieldHtml(id, "name", "text", "disp_name_label", dispatcher.name, 'maxlength="80" autocomplete="name"')}${profileFieldHtml(id, "email", "email", "email_label", dispatcher.email, 'maxlength="254" autocomplete="email" inputmode="email"')}${profileFieldHtml(id, "phone", "tel", "ca_disp_phone_label", dispatcher.phone, 'maxlength="40" autocomplete="tel" inputmode="tel" placeholder="+43699…"')}</div><div class="company-team-editor-actions"><button type="button" class="btn-secondary" ${actionAttr("toggleCaDispProfileEdit", [id])}><i data-lucide="x"></i><span>${escapeHtml(t("btn_cancel"))}</span></button><button type="button" class="btn-primary" ${actionAttr("saveCompanyDispatcherProfile", [id])}><i data-lucide="save"></i><span>${escapeHtml(t("btn_save_changes"))}</span></button></div></div>`;
}

function dispatcherCardHtml(dispatcher, groups) {
    const readiness = dispatcherReadiness(dispatcher, groups);
    const active = readiness.active;
    const busy = pendingDispatcherActions.has(String(dispatcher.id));
    const stateClass = active ? "is-active" : "is-inactive";
    const stateIcon = active ? "circle-check" : "circle-pause";
    const stateLabel = t(active ? "ca_disp_active" : "ca_disp_inactive");
    const toggleLabel = t(active ? "ca_disp_deactivate" : "ca_disp_activate");
    const toggleIcon = active ? "user-x" : "user-check";
    const initials = String(dispatcher.name || dispatcher.email || "D").split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();
    const phone = String(dispatcher.phone || "").trim();

    const editingGroups = openGroupEditors.has(String(dispatcher.id));
    const editingProfile = openProfileEditors.has(String(dispatcher.id));
    const menuItems = [
        {
            action: "toggleCaDispProfileEdit",
            args: [String(dispatcher.id)],
            label: t("ca_edit_disp_profile"),
            icon: "user-pen",
            disabled: busy
        },
        ...(active
            ? []
            : [{
                action: "removeCompanyDispatcher",
                args: [String(dispatcher.id)],
                label: t("ca_disp_delete"),
                icon: "trash-2",
                danger: true,
                disabled: busy
            }])
    ];
    return `<article class="company-team-card ${stateClass}${editingGroups ? " is-editing-groups" : ""}${editingProfile ? " is-editing-profile" : ""}">
        <div class="company-team-person">
            <span class="company-team-avatar" aria-hidden="true">${escapeHtml(initials)}</span>
            <div>
                <strong>${escapeHtml(dispatcher.name || t("dispatcher"))}</strong>
                <a href="mailto:${escapeHtml(dispatcher.email || "")}">${escapeHtml(dispatcher.email || "—")}</a>
                ${phone ? `<span class="company-team-phone"><i data-lucide="phone"></i><a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a></span>` : ""}
            </div>
        </div>
        <div class="company-team-state">
            <span class="company-team-status ${stateClass}"><i data-lucide="${stateIcon}"></i>${escapeHtml(stateLabel)}</span>
            ${active && readiness.missingGroups ? `<span class="company-team-warning"><i data-lucide="triangle-alert"></i>${escapeHtml(t("ca_team_unassigned"))}</span>` : ""}
        </div>
        <div class="company-team-groups">${groupChipsHtml(dispatcher, groups)}</div>
        <div class="company-team-actions">
            <button type="button" class="btn-secondary company-team-edit-groups${editingGroups ? " is-active" : ""}" ${actionAttr("toggleCaDispGroupsEdit", [String(dispatcher.id)])} ${busy ? "disabled" : ""} aria-expanded="${editingGroups ? "true" : "false"}"><i data-lucide="pencil-line"></i><span>${escapeHtml(t("ca_edit_groups"))}</span></button>
            <button type="button" class="btn-secondary" ${actionAttr("resetCompanyDispatcherPassword", [String(dispatcher.id)])} ${busy || !active ? "disabled" : ""}><i data-lucide="mail-key"></i><span>${escapeHtml(t("ca_send_reset_link"))}</span></button>
            <button type="button" class="btn-secondary" ${actionAttr("revokeCompanyDispatcherSessions", [String(dispatcher.id)])} ${busy || !active ? "disabled" : ""}><i data-lucide="log-out"></i><span>${escapeHtml(t("ca_revoke_sessions"))}</span></button>
            <button type="button" class="${active ? "btn-danger-ghost" : "btn-secondary"} company-team-status-toggle" ${actionAttr("toggleCompanyDispatcherStatus", [String(dispatcher.id)])} ${busy ? "disabled" : ""}>
                <i data-lucide="${toggleIcon}"></i><span>${escapeHtml(toggleLabel)}</span>
            </button>
            ${rowActionsMenuHtml(`ca-disp-${dispatcher.id}`, menuItems)}
        </div>
        <div id="ca-disp-groups-edit-${escapeHtml(String(dispatcher.id))}" class="company-team-editor${editingGroups ? "" : " hidden"}">
            <div><strong>${escapeHtml(t("ca_assign_groups"))}</strong><p>${escapeHtml(t("ca_assign_groups_hint"))}</p></div>
            <div class="company-team-group-grid">${groupEditorHtml(dispatcher, groups)}</div>
            <span class="field-error" data-dispatcher-group-error="${escapeHtml(String(dispatcher.id))}" aria-live="polite"></span>
            <div class="company-team-editor-actions">
                <button type="button" class="btn-secondary" ${actionAttr("toggleCaDispGroupsEdit", [String(dispatcher.id)])}><i data-lucide="x"></i><span>${escapeHtml(t("btn_cancel"))}</span></button>
                <button type="button" class="btn-primary" ${actionAttr("saveCompanyDispatcherGroups", [String(dispatcher.id)])}><i data-lucide="save"></i><span>${escapeHtml(t("btn_save_changes"))}</span></button>
            </div>
        </div>
        ${editingProfile ? profileEditorHtml(dispatcher) : ""}
    </article>`;
}

function bindTeamFilters() {
    const search = document.getElementById("ca-team-search");
    const status = document.getElementById("ca-team-status-filter");
    if (search) {
        search.value = teamSearch;
        search.oninput = event => { teamSearch = event.target.value; renderCompanyAdminTeam(); };
    }
    if (status) {
        status.value = teamStatus;
        status.onchange = event => { teamStatus = event.target.value; renderCompanyAdminTeam(); };
    }
}

function renderCompanyAdminTeam() {
    if (!canRunCompanyAdminAction(window.currentUser?.role)) return;
    const list = document.getElementById("ca-dispatchers-manage-list");
    if (!list) return;
    const scope = getScope();
    renderCreateGroupPicker(scope.groups);
    renderTeamSummary(scope);
    bindTeamFilters();

    const dispatchers = filterCompanyDispatchers(scope.dispatchers, teamSearch, teamStatus);
    if (scope.dispatchers.length === 0) {
        list.innerHTML = `<div class="company-team-empty"><i data-lucide="users-round"></i><strong>${escapeHtml(t("ca_team_empty_title"))}</strong><p>${escapeHtml(t("ca_no_dispatchers"))}</p><button type="button" class="btn-primary" ${actionAttr("focusCompanyDispatcherForm")}><i data-lucide="user-plus"></i>${escapeHtml(t("ca_add_disp_title"))}</button></div>`;
    } else if (dispatchers.length === 0) {
        list.innerHTML = `<div class="company-team-empty is-filtered"><i data-lucide="search-x"></i><strong>${escapeHtml(t("ca_team_no_results"))}</strong><p>${escapeHtml(t("ca_team_no_results_hint"))}</p></div>`;
    } else {
        list.innerHTML = dispatchers.map(dispatcher => dispatcherCardHtml(dispatcher, scope.groups)).join("");
    }
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function focusCompanyDispatcherForm() {
    document.getElementById("ca-new-disp-name")?.focus();
}

function toggleCaDispGroupsEdit(dispId) {
    const key = String(dispId);
    if (openGroupEditors.has(key)) openGroupEditors.delete(key);
    else {
        openGroupEditors.add(key);
        openProfileEditors.delete(key);
    }
    renderCompanyAdminTeam();
}

function toggleCaDispProfileEdit(dispId) {
    const key = String(dispId);
    if (openProfileEditors.has(key)) openProfileEditors.delete(key);
    else {
        openProfileEditors.add(key);
        openGroupEditors.delete(key);
    }
    renderCompanyAdminTeam();
}

function setDispatcherProfileFieldErrors(dispId, errors = {}) {
    for (const field of ["name", "email", "phone"]) {
        const error = document.querySelector(`[data-dispatcher-profile-error="${CSS.escape(String(dispId))}"][data-field="${field}"]`);
        const input = document.getElementById(`ca-disp-edit-${field}-${dispId}`);
        const key = errors[field];
        if (input) input.setAttribute("aria-invalid", key ? "true" : "false");
        if (error) error.textContent = key ? t(`ca_team_error_${key}`) : "";
    }
}

async function saveCompanyDispatcherProfile(dispId) {
    const dispatcher = findCompanyDispatcher(dispId);
    if (!dispatcher || pendingDispatcherActions.has(String(dispId))) return false;
    const draft = {
        name: document.getElementById(`ca-disp-edit-name-${dispId}`)?.value || "",
        email: document.getElementById(`ca-disp-edit-email-${dispId}`)?.value || "",
        phone: document.getElementById(`ca-disp-edit-phone-${dispId}`)?.value || ""
    };
    const validation = validateCompanyDispatcherProfile(draft);
    setDispatcherProfileFieldErrors(dispId, validation.errors);
    if (!validation.valid) {
        showToast(t("ca_team_form_errors"), "error");
        return false;
    }
    const emailChanged = validation.value.email !== String(dispatcher.email || "").trim().toLowerCase();
    if (emailChanged) {
        const clash = [...(window.state.dispatchers || []), ...(window.state.companyAdmins || [])]
            .some((user) => String(user.id) !== String(dispId)
                && String(user.email || "").trim().toLowerCase() === validation.value.email);
        if (clash) {
            setDispatcherProfileFieldErrors(dispId, { email: "email_exists" });
            showToast(t("ca_email_exists"), "error");
            return false;
        }
    }
    pendingDispatcherActions.add(String(dispId));
    renderCompanyAdminTeam();
    try {
        if (!USE_LOCAL_STATE) {
            const result = await ApiClient.updateCompanyDispatcherProfile(
                getCompanyId(),
                dispId,
                validation.value
            );
            if (!result.success) {
                if (result.code === "email-exists") {
                    setDispatcherProfileFieldErrors(dispId, { email: "email_exists" });
                }
                throw new Error(result.error || t("ca_disp_profile_save_failed"));
            }
        }
        Object.assign(dispatcher, validation.value);
        if (USE_LOCAL_STATE) saveState();
        openProfileEditors.delete(String(dispId));
        showToast(
            t(emailChanged ? "ca_disp_profile_saved_relogin" : "ca_disp_profile_saved"),
            "success",
            emailChanged ? 7000 : 4500
        );
        return true;
    } catch (cause) {
        showToast(cause.message || t("ca_disp_profile_save_failed"), "error");
        return false;
    } finally {
        pendingDispatcherActions.delete(String(dispId));
        renderCompanyAdminTeam();
        renderCompanyAdminDashboard();
    }
}

async function saveCompanyDispatcherGroups(dispId) {
    const dispatcher = findCompanyDispatcher(dispId);
    if (!dispatcher || pendingDispatcherActions.has(String(dispId))) return false;
    const groups = getCompanyGroups();
    const selected = Array.from(document.querySelectorAll(`.ca-disp-grp-chk[data-disp="${CSS.escape(String(dispId))}"]:checked`), input => input.value);
    const nextGroups = normalizeDispatcherGroups(selected, groups);
    const error = document.querySelector(`[data-dispatcher-group-error="${CSS.escape(String(dispId))}"]`);
    if (nextGroups.length === 0) {
        if (error) error.textContent = t("ca_team_error_groups_required");
        return false;
    }
    pendingDispatcherActions.add(String(dispId));
    renderCompanyAdminTeam();
    try {
        if (!USE_LOCAL_STATE) {
            const result = await ApiClient.updateCompanyDispatcherGroups(getCompanyId(), dispId, nextGroups);
            if (!result.success) throw new Error(result.error || t("ca_groups_save_failed"));
        }
        dispatcher.groups = nextGroups;
        dispatcher.activeGroupId = nextGroups.includes(dispatcher.activeGroupId) ? dispatcher.activeGroupId : nextGroups[0];
        openGroupEditors.delete(String(dispId));
        if (USE_LOCAL_STATE) saveState();
        showToast(t("ca_groups_saved_relogin"), "success", 6500);
        return true;
    } catch (cause) {
        showToast(cause.message || t("ca_groups_save_failed"), "error");
        return false;
    } finally {
        pendingDispatcherActions.delete(String(dispId));
        renderCompanyAdminTeam();
        renderCompanyAdminDashboard();
    }
}

function emailAlreadyExists(email) {
    return [...(window.state.dispatchers || []), ...(window.state.companyAdmins || [])]
        .some(user => String(user.email || "").trim().toLowerCase() === email);
}

function clearDispatcherForm() {
    for (const id of ["ca-new-disp-name", "ca-new-disp-email", "ca-new-disp-password"]) {
        const input = document.getElementById(id);
        if (input) input.value = "";
    }
    document.querySelectorAll(".ca-new-disp-group").forEach(input => { input.checked = false; });
    setDispatcherFieldErrors();
}

async function persistCompanyDispatcherDraft(input) {
    const scope = getScope();
    const validation = validateCompanyDispatcherDraft(input, scope.groups);
    if (!validation.valid) return { success: false, errors: validation.errors, error: t("ca_team_fix_errors") };
    if (emailAlreadyExists(validation.value.email)) {
        return { success: false, errors: { email: "email_exists" }, error: t("ca_email_exists") };
    }

    const dispatcher = {
        id: `dispo-${Date.now()}`,
        name: validation.value.name,
        email: validation.value.email,
        groups: validation.value.groups,
        activeGroupId: validation.value.groups[0],
        companyId: scope.companyId,
        active: true
    };
    if (USE_LOCAL_STATE) {
        dispatcher.password = validation.value.password;
        dispatcher.passwordChanged = true;
    } else {
        const result = await ApiClient.createCompanyDispatcher(scope.companyId, validation.value);
        if (!result.success) return { success: false, error: result.error || t("ca_disp_add_failed"), details: result.details };
        Object.assign(dispatcher, result.dispatcher);
    }
    window.state.dispatchers ||= [];
    const existingIndex = window.state.dispatchers.findIndex(item =>
        String(item.id) === String(dispatcher.id) || String(item.email || "").toLowerCase() === dispatcher.email
    );
    if (existingIndex >= 0) window.state.dispatchers[existingIndex] = { ...window.state.dispatchers[existingIndex], ...dispatcher };
    else window.state.dispatchers.push(dispatcher);
    if (USE_LOCAL_STATE) saveState();
    return { success: true, dispatcher };
}

async function addCompanyDispatcher() {
    if (!canRunCompanyAdminAction(window.currentUser?.role)) {
        showToast(t("error_access_denied"), "error");
        return false;
    }
    const submitButton = document.getElementById("ca-add-dispatcher-btn");
    const draft = readDispatcherDraft();
    const initialValidation = validateCompanyDispatcherDraft(draft, getCompanyGroups());
    setDispatcherFieldErrors(initialValidation.errors);
    if (!initialValidation.valid) {
        document.getElementById(dispatcherFieldId(Object.keys(initialValidation.errors)[0]))?.focus();
        showToast(t("ca_team_fix_errors"), "error");
        return false;
    }
    const submission = await runSingleSubmission(submitButton, t("creating"), async () => {
        const result = await persistCompanyDispatcherDraft(draft);
        if (!result.success) {
            setDispatcherFieldErrors(result.errors || {});
            const firstError = Object.keys(result.errors || {})[0];
            if (firstError) document.getElementById(dispatcherFieldId(firstError))?.focus();
            showToast(result.error || t("ca_disp_add_failed"), "error");
            return false;
        }
        clearDispatcherForm();
        renderCompanyAdminTeam();
        renderCompanyAdminDashboard();
        showToast(t("ca_disp_added"), "success");
        return true;
    });
    return submission.started && submission.value === true;
}

function generateDemoResetPassword() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const bytes = new Uint32Array(16);
    crypto.getRandomValues(bytes);
    const raw = Array.from(bytes, value => alphabet[value % alphabet.length]).join("");
    return `${raw.slice(0, 7)}7${raw.slice(8)}a`;
}

function resetCompanyDispatcherPassword(dispId) {
    const dispatcher = findCompanyDispatcher(dispId);
    if (!dispatcher || dispatcher.active === false || pendingDispatcherActions.has(String(dispId))) return;
    showConfirm(
        t("ca_confirm_reset_pwd", { email: dispatcher.email }),
        async () => {
            pendingDispatcherActions.add(String(dispId));
            renderCompanyAdminTeam();
            try {
                if (USE_LOCAL_STATE) {
                    const temporaryPassword = generateDemoResetPassword();
                    dispatcher.password = temporaryPassword;
                    dispatcher.passwordChanged = true;
                    saveState();
                    showToast(`${t("ca_reset_pwd_done")} ${temporaryPassword}`, "success", 12000);
                } else {
                    if (typeof firebase === "undefined" || !firebase.auth) throw new Error(t("ca_reset_pwd_unavailable"));
                    await firebase.auth().sendPasswordResetEmail(dispatcher.email);
                    showToast(t("ca_reset_email_sent", { email: dispatcher.email }), "success", 7000);
                }
            } catch (cause) {
                showToast(cause.message || t("ca_reset_pwd_unavailable"), "error");
            } finally {
                pendingDispatcherActions.delete(String(dispId));
                renderCompanyAdminTeam();
            }
        },
        { danger: false, confirmText: t("ca_send_reset_link") }
    );
}

function toggleCompanyDispatcherStatus(dispId) {
    const dispatcher = findCompanyDispatcher(dispId);
    if (!dispatcher || pendingDispatcherActions.has(String(dispId))) return;
    const nextActive = dispatcher.active === false;
    showConfirm(
        t(nextActive ? "ca_confirm_activate_disp" : "ca_confirm_deactivate_disp", { name: dispatcher.name }),
        async () => {
            pendingDispatcherActions.add(String(dispId));
            renderCompanyAdminTeam();
            try {
                if (!USE_LOCAL_STATE) {
                    const result = await ApiClient.setCompanyDispatcherStatus(getCompanyId(), dispId, nextActive);
                    if (!result.success) throw new Error(result.error || t("ca_disp_status_failed"));
                }
                dispatcher.active = nextActive;
                if (USE_LOCAL_STATE) saveState();
                showToast(t(nextActive ? "ca_disp_activated" : "ca_disp_deactivated"), "success", 6000);
            } catch (cause) {
                showToast(cause.message || t("ca_disp_status_failed"), "error");
            } finally {
                pendingDispatcherActions.delete(String(dispId));
                renderCompanyAdminTeam();
                renderCompanyAdminDashboard();
            }
        },
        { danger: !nextActive, confirmText: t(nextActive ? "ca_disp_activate" : "ca_disp_deactivate") }
    );
}

function removeCompanyDispatcher(dispId) {
    const dispatcher = findCompanyDispatcher(dispId);
    if (!dispatcher || dispatcher.active !== false || pendingDispatcherActions.has(String(dispId))) return;
    showConfirm(
        t("ca_confirm_delete_disp", { name: dispatcher.name, email: dispatcher.email }),
        async () => {
            pendingDispatcherActions.add(String(dispId));
            renderCompanyAdminTeam();
            try {
                if (!USE_LOCAL_STATE) {
                    const result = await ApiClient.deleteCompanyDispatcher(getCompanyId(), dispId, dispatcher.email);
                    if (!result.success) {
                        const errorKey = {
                            "dispatcher-active": "ca_disp_delete_requires_inactive",
                            "confirm-mismatch": "ca_disp_delete_confirmation_failed",
                            "dispatcher-deleting": "ca_disp_delete_in_progress",
                            "dispatcher-delete-incomplete": "ca_disp_delete_incomplete"
                        }[result.code] || "ca_disp_delete_failed";
                        throw new Error(t(errorKey));
                    }
                }
                window.state.dispatchers = (window.state.dispatchers || []).filter(item => String(item.id) !== String(dispId));
                if (USE_LOCAL_STATE) saveState();
                showToast(t("ca_disp_deleted"), "success", 6500);
            } catch (cause) {
                showToast(cause.message || t("ca_disp_delete_failed"), "error");
            } finally {
                pendingDispatcherActions.delete(String(dispId));
                renderCompanyAdminTeam();
                renderCompanyAdminDashboard();
            }
        },
        { danger: true, confirmText: t("btn_yes") || "Da" }
    );
}

function revokeCompanyDispatcherSessions(dispId) {
    const dispatcher = findCompanyDispatcher(dispId);
    if (!dispatcher || dispatcher.active === false || pendingDispatcherActions.has(String(dispId))) return;
    showConfirm(
        t("ca_confirm_revoke_sessions", { name: dispatcher.name }),
        async () => {
            pendingDispatcherActions.add(String(dispId));
            renderCompanyAdminTeam();
            try {
                if (!USE_LOCAL_STATE) {
                    const result = await ApiClient.revokeCompanyDispatcherSessions(getCompanyId(), dispId);
                    if (!result.success) throw new Error(result.error || t("ca_revoke_failed"));
                }
                showToast(t("ca_sessions_revoked"), "success", 6500);
            } catch (cause) {
                showToast(cause.message || t("ca_revoke_failed"), "error");
            } finally {
                pendingDispatcherActions.delete(String(dispId));
                renderCompanyAdminTeam();
            }
        },
        { danger: false, confirmText: t("ca_revoke_sessions") }
    );
}

export {
    addCompanyDispatcher,
    findCompanyDispatcher,
    focusCompanyDispatcherForm,
    getCompanyDispatchers,
    getCompanyGroups,
    persistCompanyDispatcherDraft,
    removeCompanyDispatcher,
    renderCompanyAdminTeam,
    resetCompanyDispatcherPassword,
    revokeCompanyDispatcherSessions,
    saveCompanyDispatcherGroups,
    saveCompanyDispatcherProfile,
    toggleCaDispGroupsEdit,
    toggleCaDispProfileEdit,
    toggleCompanyDispatcherStatus
};
