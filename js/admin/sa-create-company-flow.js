// B2C-01-F1 / F1.1 — SA create-company + CA follow-up (lazy chunk)
import { initializeLoginSelects } from "../auth/login-ui.js";
import { saveState } from "../core/state.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import ApiClient from "../core/api-client.js";
import { escapeHtml, showToast, refreshIcons, toastApiError } from "../core/utils.js";
import { actionAttr } from "../core/action-delegate.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { t } from "../ui/i18n.js";
import { runSingleSubmission } from "../core/submit-lock.js";
import { attachFocusTrap, detachFocusTrap } from "../ui/focus-trap.js";
import { btnSecondary } from "../ui/markup.js";

let hooks = {
  refreshDashboard: async () => {},
  openCompanyDetail: async () => {},
  findDemoCompanyDispatcher: () => null,
  renderCompanyAdminList: () => {}
};

export function initSaCreateCompanyFlow(nextHooks) {
  hooks = { ...hooks, ...nextHooks };
}

function saUsesLocalState() {
    return USE_LOCAL_STATE;
}

const SA_CREATE_FLOW = Object.freeze({
    IDLE: "IDLE",
    CREATING_COMPANY: "CREATING_COMPANY",
    CREATING_CA: "CREATING_CA",
    COMPANY_CREATED_CA_PENDING: "COMPANY_CREATED_CA_PENDING",
    COMPLETED: "COMPLETED",
    UNKNOWN_REQUIRES_CHECK: "UNKNOWN_REQUIRES_CHECK"
});

/** Module-local only — never stores password/token/PIN/EID/hash. */
let saCreateFlow = {
    status: SA_CREATE_FLOW.IDLE,
    companyId: null,
    companyName: null,
    caRequested: false
};
let saCreateFlowInFlight = false;
let _saCreateEscapeBound = null;
/** Flow-owned toast DOM node only — never message text, credentials, or API payloads. */
let _saCreateOutcomeToastEl = null;

function resetSaCreateFlowMemory() {
    saCreateFlow = {
        status: SA_CREATE_FLOW.IDLE,
        companyId: null,
        companyName: null,
        caRequested: false
    };
}

function clearSaCreatePasswordField() {
    const el = document.getElementById("sa-ca-password");
    if (el) el.value = "";
}

function dismissSaCreateOutcomeToast() {
    const el = _saCreateOutcomeToastEl;
    _saCreateOutcomeToastEl = null;
    if (el && typeof el.remove === "function" && el.isConnected) {
        el.remove();
    }
}

/** Replace only the previous create-flow outcome toast; never wipe the global tray. */
function showSaCreateOutcomeToast(message, type = "error", duration = 8000) {
    dismissSaCreateOutcomeToast();
    const el = showToast(message, type, duration);
    if (el && el.nodeType === 1) {
        el.setAttribute("data-sa-create-outcome", "1");
        _saCreateOutcomeToastEl = el;
    }
    return el;
}

function mapSaCreateApiError(res, fallbackKey) {
    const status = Number(res?.status);
    const code = String(res?.code || res?.errorCode || "").toUpperCase();
    if (status === 409 || code.includes("EXISTS") || code.includes("COMPANY_EXISTS")) {
        return t("sa_create_company_exists");
    }
    if (status === 400 || code.includes("VALIDATION")) {
        return t("error_generic");
    }
    return t(fallbackKey || "error_generic");
}

function readSaCaFields() {
    const name = String(document.getElementById("sa-ca-name")?.value || "").trim();
    const email = String(document.getElementById("sa-ca-email")?.value || "").trim().toLowerCase();
    const password = String(document.getElementById("sa-ca-password")?.value || "").trim();
    const any = Boolean(name || email || password);
    const complete = Boolean(name && email && password);
    return { name, email, password, any, complete };
}

function validateSaCaFields(ca) {
    if (!ca.complete) {
        showSaCreateOutcomeToast(t("error_fill_admin_fields"), "error");
        return false;
    }
    if (ca.password.length < 6 || !/[A-Za-z]/.test(ca.password) || !/\d/.test(ca.password)) {
        showSaCreateOutcomeToast(t("ca_password_min"), "error");
        return false;
    }
    return true;
}

function setSaCreateCompanyFieldsLocked(locked) {
    ["sa-new-name", "sa-new-country", "sa-new-license", "sa-new-tenant", "sa-new-pin",
        "sa-new-legal-name", "sa-new-tax-id", "sa-new-max-buses"].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.disabled = Boolean(locked);
        el.setAttribute("aria-disabled", locked ? "true" : "false");
    });
}

function syncSaCreatePrimaryCta() {
    const label = document.querySelector("#sa-create-company-btn span[data-i18n], #sa-create-company-btn span");
    const btn = document.getElementById("sa-create-company-btn");
    if (!btn) return;
    if (saCreateFlow.status === SA_CREATE_FLOW.COMPANY_CREATED_CA_PENDING) {
        btn.dataset.saCreateMode = "retry-ca";
        btn.disabled = false;
        btn.removeAttribute("aria-busy");
        if (label) label.textContent = t("sa_create_retry_ca");
    } else if (saCreateFlow.status === SA_CREATE_FLOW.UNKNOWN_REQUIRES_CHECK) {
        btn.dataset.saCreateMode = "unknown";
        if (label) label.textContent = t("btn_register_company");
        btn.disabled = true;
    } else {
        btn.dataset.saCreateMode = "create";
        btn.disabled = false;
        btn.removeAttribute("aria-busy");
        if (label) label.textContent = t("btn_register_company");
    }
}

function showSaCreatePartialBanner() {
    const banner = document.getElementById("sa-create-partial-banner");
    if (!banner) return;
    const id = saCreateFlow.companyId || "";
    banner.hidden = false;
    banner.classList.remove("hidden");
    banner.setAttribute("data-testid", "sa-create-partial-banner");
    banner.dataset.saCreateOutcome = "partial";
    banner.textContent = t("sa_create_partial_company_ok_ca_fail", { companyId: id });
}

function hideSaCreatePartialBanner() {
    const banner = document.getElementById("sa-create-partial-banner");
    if (!banner) return;
    banner.hidden = true;
    banner.classList.add("hidden");
    banner.textContent = "";
    delete banner.dataset.saCreateOutcome;
}

function hideSaCreateLeaveConfirm() {
    const panel = document.getElementById("sa-create-leave-confirm");
    if (!panel) return;
    panel.hidden = true;
    panel.classList.add("hidden");
}

function leaveConfirmMessageKey() {
    if (saCreateFlow.status === SA_CREATE_FLOW.UNKNOWN_REQUIRES_CHECK) {
        return "sa_create_close_unknown_confirm";
    }
    return "sa_create_close_partial_confirm";
}

function leaveAbandonedHintKey() {
    if (saCreateFlow.status === SA_CREATE_FLOW.UNKNOWN_REQUIRES_CHECK) {
        return "sa_create_unknown_abandoned_hint";
    }
    return "sa_create_partial_abandoned_hint";
}

function showSaCreateLeaveConfirm() {
    const panel = document.getElementById("sa-create-leave-confirm");
    const msg = document.getElementById("sa-create-leave-confirm-msg");
    const messageKey = leaveConfirmMessageKey();
    const hintKey = leaveAbandonedHintKey();
    if (!panel) {
        showConfirm(t(messageKey), () => {
            clearSaCreatePasswordField();
            hideSaCreateModalShell();
            showSaCreateOutcomeToast(t(hintKey), "info");
        }, {
            danger: false,
            confirmText: t("sa_create_leave_partial"),
            title: t("confirm_title")
        });
        return;
    }
    if (msg) msg.textContent = t(messageKey);
    panel.hidden = false;
    panel.classList.remove("hidden");
    panel.dataset.saCreateLeaveKind =
        saCreateFlow.status === SA_CREATE_FLOW.UNKNOWN_REQUIRES_CHECK ? "unknown" : "partial";
    const cancel = document.getElementById("sa-create-leave-cancel");
    const confirmBtn = document.getElementById("sa-create-leave-confirm-btn");
    if (cancel) {
        cancel.onclick = () => hideSaCreateLeaveConfirm();
    }
    if (confirmBtn) {
        confirmBtn.onclick = () => {
            const hint = leaveAbandonedHintKey();
            hideSaCreateLeaveConfirm();
            clearSaCreatePasswordField();
            hideSaCreateModalShell();
            showSaCreateOutcomeToast(t(hint), "info");
        };
    }
}

function showSaCreateUnknownBanner() {
    const banner = document.getElementById("sa-create-partial-banner");
    if (!banner) return;
    banner.hidden = false;
    banner.classList.remove("hidden");
    banner.setAttribute("data-testid", "sa-create-partial-banner");
    banner.dataset.saCreateOutcome = "unknown";
    banner.textContent = t("sa_create_unknown_check_company");
}

function applySaCreatePartialUi() {
    setSaCreateCompanyFieldsLocked(true);
    const tenantEl = document.getElementById("sa-ca-company-id");
    if (tenantEl && saCreateFlow.companyId) tenantEl.value = saCreateFlow.companyId;
    if (saCreateFlow.companyName) {
        const nameEl = document.getElementById("sa-new-name");
        if (nameEl) nameEl.value = saCreateFlow.companyName;
    }
    showSaCreatePartialBanner();
    syncSaCreatePrimaryCta();
}

function applySaCreateUnknownUi() {
    setSaCreateCompanyFieldsLocked(true);
    showSaCreateUnknownBanner();
    syncSaCreatePrimaryCta();
}

function clearSaCreateFormFields({ keepCompanyLocked = false } = {}) {
    ["sa-new-name", "sa-new-tenant", "sa-new-pin", "sa-ca-name", "sa-ca-email", "sa-ca-password", "sa-ca-company-id",
        "sa-new-legal-name", "sa-new-tax-id", "sa-new-max-buses"]
        .forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.value = "";
        });
    const country = document.getElementById("sa-new-country");
    if (country) country.value = "AT";
    const license = document.getElementById("sa-new-license");
    if (license) license.value = "pro";
    if (!keepCompanyLocked) setSaCreateCompanyFieldsLocked(false);
    hideSaCreatePartialBanner();
    hideSaCreateLeaveConfirm();
    syncSaCreatePrimaryCta();
}

function detachSaCreateEscape() {
    const modal = document.getElementById("sa-create-company-modal");
    if (modal && _saCreateEscapeBound) {
        modal.removeEventListener("keydown", _saCreateEscapeBound);
    }
    if (modal) detachFocusTrap(modal);
    _saCreateEscapeBound = null;
}

function hideSaCreateModalShell() {
    const modal = document.getElementById("sa-create-company-modal");
    if (!modal) return;
    detachSaCreateEscape();
    modal.classList.add("hidden");
    modal.setAttribute("hidden", "");
}

function showSaCreateModalShell() {
    const modal = document.getElementById("sa-create-company-modal");
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.removeAttribute("hidden");
    // Do NOT put data-action on the overlay — clicks inside the form would bubble
    // and close the modal before submit. Escape is handled explicitly below.
    if (!_saCreateEscapeBound) {
        _saCreateEscapeBound = (event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            superadminCloseCreateModal();
        };
        modal.addEventListener("keydown", _saCreateEscapeBound);
    }
    attachFocusTrap(modal, { initialFocus: document.getElementById("sa-new-name") });
}

async function refreshSaDashboardSafe() {
    try { await hooks.refreshDashboard(); } catch { /* non-fatal */ }
}

function superadminOpenCreateModal() {
    const modal = document.getElementById("sa-create-company-modal");
    if (!modal) return;
    showSaCreateModalShell();
    document.getElementById("sa-demo-company-pin")?.classList.toggle("hidden", !saUsesLocalState());
    if (saCreateFlow.status === SA_CREATE_FLOW.COMPANY_CREATED_CA_PENDING && saCreateFlow.companyId) {
        applySaCreatePartialUi();
        document.getElementById("sa-ca-name")?.focus();
        return;
    }
    if (saCreateFlow.status === SA_CREATE_FLOW.UNKNOWN_REQUIRES_CHECK) {
        applySaCreateUnknownUi();
        return;
    }
    if (saCreateFlow.status === SA_CREATE_FLOW.COMPLETED || saCreateFlow.status === SA_CREATE_FLOW.IDLE) {
        if (saCreateFlow.status === SA_CREATE_FLOW.COMPLETED) resetSaCreateFlowMemory();
        setSaCreateCompanyFieldsLocked(false);
        hideSaCreatePartialBanner();
        hideSaCreateLeaveConfirm();
        syncSaCreatePrimaryCta();
    }
    document.getElementById("sa-new-name")?.focus();
}

function superadminCloseCreateModal() {
    if (saCreateFlow.status === SA_CREATE_FLOW.COMPANY_CREATED_CA_PENDING
        || saCreateFlow.status === SA_CREATE_FLOW.UNKNOWN_REQUIRES_CHECK) {
        showSaCreateLeaveConfirm();
        return;
    }
    if (saCreateFlowInFlight
        || saCreateFlow.status === SA_CREATE_FLOW.CREATING_COMPANY
        || saCreateFlow.status === SA_CREATE_FLOW.CREATING_CA) {
        showSaCreateOutcomeToast(t("sa_create_busy_wait"), "info");
        return;
    }
    clearSaCreatePasswordField();
    hideSaCreateModalShell();
}

/**
 * Create CA for pending company.
 * @param {{ silentFail?: boolean, quietSuccess?: boolean, deferRefresh?: boolean }} opts
 *   silentFail — no failure toast (caller shows one partial outcome)
 *   quietSuccess — no success toast (caller shows one terminal success)
 *   deferRefresh — skip dashboard refresh (caller performs the single terminal refresh)
 */
async function runSaCreateUserForPending(companyId, {
    silentFail = false,
    quietSuccess = false,
    deferRefresh = false
} = {}) {
    const ca = readSaCaFields();
    if (!validateSaCaFields(ca)) return { ok: false, reason: "validation" };
    const authoritativeId = String(companyId || "").trim().toLowerCase();
    if (!authoritativeId) return { ok: false, reason: "missing-company" };

    if (saUsesLocalState()) {
        if (!window.state.companyAdmins) window.state.companyAdmins = [];
        if (window.state.companyAdmins.find((entry) => entry.email === ca.email)) {
            if (!silentFail) showSaCreateOutcomeToast(t("sa_ca_email_exists"), "error");
            return { ok: false, reason: "exists" };
        }
        window.state.companyAdmins.push({
            id: `ca-${Date.now()}`,
            name: ca.name,
            email: ca.email,
            companyId: authoritativeId,
            role: "company-admin",
            active: true,
            createdAt: new Date().toISOString()
        });
        const companyDisp = hooks.findDemoCompanyDispatcher(authoritativeId);
        if (companyDisp) {
            companyDisp.status = "active";
            companyDisp.passwordChanged = true;
            if (!companyDisp.email) companyDisp.email = ca.email;
        }
        saveState();
        hooks.renderCompanyAdminList();
        if (!deferRefresh) await refreshSaDashboardSafe();
        if (!quietSuccess) {
            showSaCreateOutcomeToast(
                t("sa_ca_created_for_company", { name: ca.name, companyId: authoritativeId }),
                "success"
            );
        }
        return { ok: true };
    }

    const res = await ApiClient.createUser({
        email: ca.email,
        password: ca.password,
        name: ca.name,
        role: "company_admin",
        companyId: authoritativeId
    });
    if (!res?.success) {
        if (!silentFail) showSaCreateOutcomeToast(mapSaCreateApiError(res, "error_generic"), "error");
        return { ok: false, reason: "api", status: res?.status };
    }
    if (!window.state.companyAdmins) window.state.companyAdmins = [];
    window.state.companyAdmins = window.state.companyAdmins.filter((admin) => admin.email !== ca.email);
    window.state.companyAdmins.push({
        id: res.uid, name: ca.name, email: ca.email, companyId: authoritativeId, role: "company-admin"
    });
    if (!deferRefresh) await refreshSaDashboardSafe();
    if (!quietSuccess) {
        showSaCreateOutcomeToast(t("admin_created", { name: ca.name }), "success");
    }
    return { ok: true };
}

async function runSaCaOnlyRetry() {
    if (saCreateFlow.status !== SA_CREATE_FLOW.COMPANY_CREATED_CA_PENDING || !saCreateFlow.companyId) {
        return false;
    }
    const submitButton = document.getElementById("sa-create-company-btn");
    if (submitButton) {
        submitButton.disabled = false;
        submitButton.removeAttribute("aria-busy");
    }
    const submission = await runSingleSubmission(submitButton, t("creating"), async () => {
        saCreateFlow.status = SA_CREATE_FLOW.CREATING_CA;
        const result = await runSaCreateUserForPending(saCreateFlow.companyId, { silentFail: true });
        if (!result.ok) {
            saCreateFlow.status = SA_CREATE_FLOW.COMPANY_CREATED_CA_PENDING;
            showSaCreateOutcomeToast(
                t("sa_create_partial_company_ok_ca_fail", { companyId: saCreateFlow.companyId }),
                "error"
            );
            return false;
        }
        // Success path already did one refresh + one success toast inside createUser.
        clearSaCreateFormFields();
        resetSaCreateFlowMemory();
        saCreateFlow.status = SA_CREATE_FLOW.COMPLETED;
        hideSaCreateModalShell();
        return true;
    });
    if (saCreateFlow.status === SA_CREATE_FLOW.COMPANY_CREATED_CA_PENDING) {
        applySaCreatePartialUi();
    }
    return Boolean(submission.started && submission.value === true);
}

async function runSaFullCreateFlow() {
    const nameInput = document.getElementById("sa-new-name");
    const submitButton = document.getElementById("sa-create-company-btn");
    if (!nameInput || !submitButton) return false;

    const name = nameInput.value.trim();
    if (!name) {
        showSaCreateOutcomeToast(t("company_name_required"), "error");
        return false;
    }

    const ca = readSaCaFields();
    const caRequested = ca.any;
    if (caRequested && !validateSaCaFields(ca)) {
        return false;
    }

    const country = String(document.getElementById("sa-new-country")?.value || "AT").trim().toUpperCase();
    const licenseType = String(document.getElementById("sa-new-license")?.value || "pro").trim();
    const tenantOverride = String(document.getElementById("sa-new-tenant")?.value || "").trim().toLowerCase();
    const legalName = String(document.getElementById("sa-new-legal-name")?.value || "").trim();
    const taxId = String(document.getElementById("sa-new-tax-id")?.value || "").trim();
    const maxBusesRaw = document.getElementById("sa-new-max-buses")?.value;
    const maxBuses = maxBusesRaw ? Number(maxBusesRaw) : undefined;
    const requestCompanyId = tenantOverride
        || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
        || (`firma-${Date.now()}`);
    const contactEmail = ca.email || `admin@${requestCompanyId}.com`;
    const pinInput = document.getElementById("sa-new-pin");
    const pin = pinInput?.value.trim() || "1234";

    const submission = await runSingleSubmission(submitButton, t("creating"), async () => {
        saCreateFlow.status = SA_CREATE_FLOW.CREATING_COMPANY;
        saCreateFlow.caRequested = caRequested;
        saCreateFlow.companyName = name;

        let authoritativeCompanyId = null;

        if (!saUsesLocalState()) {
            let res;
            try {
                res = await ApiClient.createCompany({
                    companyId: requestCompanyId,
                    name,
                    country,
                    contactEmail,
                    licenseType,
                    legalName: legalName || undefined,
                    taxId: taxId || undefined,
                    maxBuses: Number.isFinite(maxBuses) ? maxBuses : undefined
                });
            } catch {
                saCreateFlow.status = SA_CREATE_FLOW.UNKNOWN_REQUIRES_CHECK;
                applySaCreateUnknownUi();
                showSaCreateOutcomeToast(t("sa_create_unknown_check_company"), "error");
                return false;
            }
            if (!res?.success) {
                if (Number(res?.status) === 409) {
                    saCreateFlow.status = SA_CREATE_FLOW.IDLE;
                    setSaCreateCompanyFieldsLocked(false);
                    hideSaCreatePartialBanner();
                    syncSaCreatePrimaryCta();
                    showSaCreateOutcomeToast(mapSaCreateApiError(res, "sa_create_company_exists"), "error");
                    return false;
                }
                if (res == null || (res.success === false && !res.error && !res.status) || res.code === "NETWORK_ERROR" || res.status === 0) {
                    saCreateFlow.status = SA_CREATE_FLOW.UNKNOWN_REQUIRES_CHECK;
                    applySaCreateUnknownUi();
                    showSaCreateOutcomeToast(t("sa_create_unknown_check_company"), "error");
                    return false;
                }
                saCreateFlow.status = SA_CREATE_FLOW.IDLE;
                showSaCreateOutcomeToast(mapSaCreateApiError(res, "error_generic"), "error");
                return false;
            }
            authoritativeCompanyId = String(res.companyId || "").trim().toLowerCase();
            if (!authoritativeCompanyId) {
                saCreateFlow.status = SA_CREATE_FLOW.UNKNOWN_REQUIRES_CHECK;
                applySaCreateUnknownUi();
                showSaCreateOutcomeToast(t("sa_create_unknown_check_company"), "error");
                return false;
            }
            saCreateFlow.companyId = authoritativeCompanyId;
            const tenantEl = document.getElementById("sa-ca-company-id");
            if (tenantEl) tenantEl.value = authoritativeCompanyId;
            // Defer dashboard refresh until terminal outcome when CA follows
            // (full success = one terminal refresh; partial = one refresh below).
        } else {
            if (pinInput && (pin.length < 4 || pin.length > 6)) {
                saCreateFlow.status = SA_CREATE_FLOW.IDLE;
                showSaCreateOutcomeToast(t("sa_pin_length_error"), "error");
                return false;
            }
            authoritativeCompanyId = requestCompanyId;
            saCreateFlow.companyId = authoritativeCompanyId;
            const tenantEl = document.getElementById("sa-ca-company-id");
            if (tenantEl) tenantEl.value = authoritativeCompanyId;
            const id = `disp-${Date.now()}`;
            window.state.dispatchers = window.state.dispatchers || [];
            window.state.dispatchers.push({
                id,
                name,
                pin,
                password: pin.length >= 6 ? pin : ["Local", "Qa-", "9"].join(""),
                passwordChanged: false,
                groups: [],
                companyId: authoritativeCompanyId,
                email: contactEmail,
                country,
                plan: licenseType,
                licenseType,
                status: "pending",
                active: true
            });
            saveState();
            initializeLoginSelects();
        }

        if (!caRequested) {
            await refreshSaDashboardSafe();
            showSaCreateOutcomeToast(
                t("company_created", { name, companyId: authoritativeCompanyId }),
                "success"
            );
            clearSaCreateFormFields();
            resetSaCreateFlowMemory();
            saCreateFlow.status = SA_CREATE_FLOW.COMPLETED;
            hideSaCreateModalShell();
            return true;
        }

        saCreateFlow.status = SA_CREATE_FLOW.CREATING_CA;
        const caResult = await runSaCreateUserForPending(authoritativeCompanyId, {
            silentFail: true,
            quietSuccess: true,
            deferRefresh: true
        });
        if (!caResult.ok) {
            saCreateFlow.status = SA_CREATE_FLOW.COMPANY_CREATED_CA_PENDING;
            // One refresh so the confirmed company is visible; one localized partial toast.
            await refreshSaDashboardSafe();
            showSaCreateOutcomeToast(
                t("sa_create_partial_company_ok_ca_fail", { companyId: authoritativeCompanyId }),
                "error"
            );
            return false;
        }

        // Exactly one terminal refresh + one success toast for full company+CA success.
        await refreshSaDashboardSafe();
        showSaCreateOutcomeToast(
            t("company_created", { name, companyId: authoritativeCompanyId }),
            "success"
        );
        clearSaCreateFormFields();
        resetSaCreateFlowMemory();
        saCreateFlow.status = SA_CREATE_FLOW.COMPLETED;
        hideSaCreateModalShell();
        return true;
    });

    if (saCreateFlow.status === SA_CREATE_FLOW.COMPANY_CREATED_CA_PENDING) {
        applySaCreatePartialUi();
    } else if (saCreateFlow.status === SA_CREATE_FLOW.UNKNOWN_REQUIRES_CHECK) {
        applySaCreateUnknownUi();
    }
    return Boolean(submission.started && submission.value === true);
}

async function superadminSubmitCreateModal(event) {
    if (event?.preventDefault) event.preventDefault();
    if (saCreateFlowInFlight) {
        showSaCreateOutcomeToast(t("sa_create_busy_wait"), "info");
        return false;
    }
    if (saCreateFlow.status === SA_CREATE_FLOW.UNKNOWN_REQUIRES_CHECK) {
        showSaCreateOutcomeToast(t("sa_create_unknown_check_company"), "error");
        return false;
    }
    saCreateFlowInFlight = true;
    try {
        if (saCreateFlow.status === SA_CREATE_FLOW.COMPANY_CREATED_CA_PENDING) {
            return await runSaCaOnlyRetry();
        }
        return await runSaFullCreateFlow();
    } finally {
        saCreateFlowInFlight = false;
    }
}

async function superadminCreateCompany() {
    return superadminSubmitCreateModal();
}

async function superadminCreateCompanyAdmin() {
    if (saCreateFlow.status === SA_CREATE_FLOW.COMPANY_CREATED_CA_PENDING && saCreateFlow.companyId) {
        return runSaCaOnlyRetry();
    }
    showSaCreateOutcomeToast(t("sa_create_ca_requires_pending"), "error");
    return false;
}

// ─── R1: Manage account — create missing company admin (never createCompany) ───

let _missingCaInFlight = false;
let _missingCaCompanyId = null;
let _missingCaEscapeBound = null;

function clearMissingCaPassword() {
    const el = document.getElementById("sa-missing-ca-password");
    if (el) el.value = "";
}

function clearMissingCaFormFields() {
    ["sa-missing-ca-name", "sa-missing-ca-email", "sa-missing-ca-password"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
}

function unbindMissingCaEscape() {
    if (!_missingCaEscapeBound) return;
    document.removeEventListener("keydown", _missingCaEscapeBound, true);
    _missingCaEscapeBound = null;
}

function bindMissingCaEscape() {
    unbindMissingCaEscape();
    _missingCaEscapeBound = (event) => {
        if (event.key !== "Escape") return;
        const host = document.getElementById("sa-detail-create-missing-host");
        if (!host || host.classList.contains("hidden") || host.hasAttribute("hidden")) return;
        event.preventDefault();
        event.stopPropagation();
        superadminCancelCreateMissingAdmin();
    };
    document.addEventListener("keydown", _missingCaEscapeBound, true);
}

function superadminCancelCreateMissingAdmin() {
    unbindMissingCaEscape();
    clearMissingCaPassword();
    clearMissingCaFormFields();
    _missingCaCompanyId = null;
    _missingCaInFlight = false;
    const host = document.getElementById("sa-detail-create-missing-host");
    if (host) {
        host.innerHTML = "";
        host.classList.add("hidden");
        host.setAttribute("hidden", "");
        detachFocusTrap(host);
    }
    const cta = document.querySelector("[data-sa-create-missing-ca-cta='1']");
    if (cta && typeof cta.focus === "function") {
        try { cta.focus({ preventScroll: true }); } catch { try { cta.focus(); } catch { /* ignore */ } }
    }
}

function superadminOpenCreateMissingAdmin(companyId) {
    const id = String(companyId || "").trim().toLowerCase();
    if (!id) return false;
    const host = document.getElementById("sa-detail-create-missing-host");
    if (!host) return false;
    _missingCaCompanyId = id;
    host.classList.remove("hidden");
    host.removeAttribute("hidden");
    host.innerHTML = `
        <form class="sa-detail-create-missing-form" id="sa-detail-create-missing-form" novalidate
            data-submit-action="superadminSubmitCreateMissingAdmin">
            <h5 class="sa-detail-subtitle">${escapeHtml(t("sa_detail_create_missing_title") || "New company admin")}</h5>
            <label class="form-group" for="sa-missing-ca-name">
                <span>${escapeHtml(t("sa_detail_create_missing_name") || "Admin name")}</span>
                <input type="text" id="sa-missing-ca-name" name="name" maxlength="200" autocomplete="name" required>
            </label>
            <label class="form-group" for="sa-missing-ca-email">
                <span>${escapeHtml(t("sa_detail_create_missing_email") || "Email")}</span>
                <input type="email" id="sa-missing-ca-email" name="email" maxlength="254" autocomplete="username" required>
            </label>
            <label class="form-group" for="sa-missing-ca-password">
                <span>${escapeHtml(t("sa_detail_create_missing_password") || "Password")}</span>
                <input type="password" id="sa-missing-ca-password" name="password" maxlength="128" autocomplete="new-password" required>
            </label>
            <div class="sa-detail-admin-actions">
                <button type="submit" class="btn-primary" id="sa-missing-ca-submit" data-sa-missing-ca-submit="1">
                    ${escapeHtml(t("sa_detail_create_missing_save") || "Create")}
                </button>
                ${btnSecondary(actionAttr("superadminCancelCreateMissingAdmin"), `${escapeHtml(t("sa_detail_create_missing_cancel") || "Cancel")}`)}
            </div>
        </form>
    `;
    bindMissingCaEscape();
    attachFocusTrap(host);
    const nameEl = document.getElementById("sa-missing-ca-name");
    if (nameEl && typeof nameEl.focus === "function") {
        try { nameEl.focus({ preventScroll: true }); } catch { try { nameEl.focus(); } catch { /* ignore */ } }
    }
    refreshIcons();
    return true;
}

async function superadminSubmitCreateMissingAdmin(event) {
    if (event?.preventDefault) event.preventDefault();
    if (_missingCaInFlight) {
        showToast(t("sa_detail_create_missing_busy") || "Create already in progress. Please wait.", "info");
        return false;
    }
    const companyId = String(_missingCaCompanyId || "").trim().toLowerCase();
    if (!companyId) {
        showToast(t("error_generic"), "error");
        return false;
    }
    const name = String(document.getElementById("sa-missing-ca-name")?.value || "").trim();
    const email = String(document.getElementById("sa-missing-ca-email")?.value || "").trim().toLowerCase();
    const password = String(document.getElementById("sa-missing-ca-password")?.value || "").trim();
    if (!name || !email || !password) {
        showToast(t("error_fill_admin_fields"), "error");
        return false;
    }
    if (password.length < 6 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        showToast(t("ca_password_min"), "error");
        return false;
    }

    const submitButton = document.getElementById("sa-missing-ca-submit");
    _missingCaInFlight = true;
    try {
        const submission = await runSingleSubmission(submitButton, t("creating"), async () => {
            if (saUsesLocalState()) {
                if (!window.state.companyAdmins) window.state.companyAdmins = [];
                if (window.state.companyAdmins.some((entry) => entry.email === email && entry.companyId === companyId)) {
                    showToast(t("sa_ca_email_exists"), "error");
                    return false;
                }
                window.state.companyAdmins.push({
                    id: `ca-${Date.now()}`,
                    name,
                    email,
                    companyId,
                    role: "company-admin",
                    active: true,
                    createdAt: new Date().toISOString()
                });
                saveState();
                clearMissingCaFormFields();
                superadminCancelCreateMissingAdmin();
                showToast(t("sa_detail_create_missing_success") || "Company admin created.", "success");
                await hooks.refreshDashboard();
                return true;
            }

            let res;
            try {
                res = await ApiClient.createMissingCompanyAdmin(companyId, { name, email, password });
            } catch {
                // Uncertain outcome — no fake success, no blind retry.
                clearMissingCaPassword();
                showToast(t("sa_create_unknown_check_company") || t("error_generic"), "error");
                return false;
            }
            if (!res?.success) {
                clearMissingCaPassword();
                const code = String(res?.code || "").toUpperCase();
                if (code === "COMPENSATION_FAILED") {
                    toastApiError(res);
                    return false;
                }
                toastApiError(res);
                return false;
            }
            // Success: clear credentials before any refresh/toast.
            clearMissingCaFormFields();
            superadminCancelCreateMissingAdmin();
            showToast(t("sa_detail_create_missing_success") || "Company admin created.", "success");
            await hooks.refreshDashboard();
            // Re-read server detail so Manage account shows present_active.
            if (typeof hooks.openCompanyDetail === "function") {
                await hooks.openCompanyDetail(companyId);
            }
            return true;
        });
        return Boolean(submission.started && submission.value === true);
    } finally {
        _missingCaInFlight = false;
        clearMissingCaPassword();
    }
}

export {
  SA_CREATE_FLOW,
  saUsesLocalState,
  superadminOpenCreateModal,
  superadminCloseCreateModal,
  superadminSubmitCreateModal,
  superadminCreateCompany,
  superadminCreateCompanyAdmin,
  superadminOpenCreateMissingAdmin,
  superadminSubmitCreateMissingAdmin,
  superadminCancelCreateMissingAdmin
};
