// BusCommand — Company Admin: headquarters, privacy and audited exports
import ApiClient from "../core/api-client.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import { saveState } from "../core/state.js";
import { runSingleSubmission } from "../core/submit-lock.js";
import { canRunCompanyAdminAction } from "../core/ui-permissions.js";
import { showToast } from "../core/utils.js";
import { t } from "../ui/i18n.js";
import {
    companySettingsEqual,
    timezoneForCountry,
    validateCompanySettingsDraft
} from "./company-admin-settings-model.js";
import { getCompanyLicenseInfo } from "./company-admin-overview-model.js";

let savedSettings = null;
let settingsCompanyId = null;
let settingsDirty = false;
let beforeUnloadBound = false;

function currentCompanyId() {
    return window.currentUser?.companyId || null;
}

function stateProfileDraft() {
    const profile = window.state.profile || {};
    const demoCountry = USE_LOCAL_STATE ? "AT" : "";
    const country = profile.country || demoCountry;
    return {
        country,
        timezone: profile.timezone || timezoneForCountry(country),
        defaultLanguage: profile.defaultLanguage || (USE_LOCAL_STATE ? window.state.language || "de" : ""),
        contactEmail: profile.contactEmail || (USE_LOCAL_STATE ? window.currentUser?.email || "" : "")
    };
}

function settingsFieldId(field) {
    return {
        country: "ca-settings-country",
        timezone: "ca-settings-timezone",
        defaultLanguage: "ca-settings-language",
        contactEmail: "ca-settings-contact-email"
    }[field];
}

function readCompanySettingsDraft() {
    return {
        country: document.getElementById("ca-settings-country")?.value || "",
        timezone: document.getElementById("ca-settings-timezone")?.value || "",
        defaultLanguage: document.getElementById("ca-settings-language")?.value || "",
        contactEmail: document.getElementById("ca-settings-contact-email")?.value || ""
    };
}

function setSettingsFieldErrors(errors = {}) {
    for (const field of ["country", "defaultLanguage", "contactEmail"]) {
        const input = document.getElementById(settingsFieldId(field));
        const error = document.querySelector(`[data-company-settings-error="${field}"]`);
        const key = errors[field];
        if (input) input.setAttribute("aria-invalid", key ? "true" : "false");
        if (error) error.textContent = key ? t(`ca_settings_error_${key}`) : "";
    }
}

function renderSettingsSaveState(state = settingsDirty ? "unsaved" : "saved") {
    const element = document.getElementById("ca-settings-save-state");
    if (!element) return;
    const map = {
        saved: ["circle-check", "ca_settings_saved", "is-saved"],
        unsaved: ["circle-dot-dashed", "ca_settings_unsaved", "is-unsaved"],
        saving: ["loader-circle", "ca_settings_saving", "is-saving"],
        error: ["circle-alert", "ca_settings_save_error", "is-error"]
    };
    const [icon, key, className] = map[state] || map.saved;
    element.className = `company-settings-save-state ${className}`;
    element.innerHTML = `<i data-lucide="${icon}"></i><span>${t(key)}</span>`;
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function writeDraftToForm(draft) {
    const validation = validateCompanySettingsDraft(draft);
    for (const field of ["country", "defaultLanguage", "contactEmail"]) {
        const input = document.getElementById(settingsFieldId(field));
        if (input) input.value = validation.value[field] || "";
    }
    const timezone = document.getElementById("ca-settings-timezone");
    if (timezone) timezone.value = validation.value.timezone || "";
    setSettingsFieldErrors();
}

function renderLicenseFacts() {
    const settings = window.state.settings || {};
    const companyId = currentCompanyId();
    const license = getCompanyLicenseInfo(companyId, {
        licenseInfo: window._licenseInfo,
        state: window.state,
        isDemoMode: USE_LOCAL_STATE
    });
    const formatLimit = value => {
        const number = Number(value);
        return value !== null && value !== undefined && value !== "" && Number.isInteger(number) && number > 0
            ? String(number)
            : "—";
    };
    const plan = settings.plan || (license.available ? license.plan : "") || "";
    const status = settings.status || (license.available ? license.status : "") || "";
    const fields = {
        "ca-settings-plan": plan || t("ca_value_unavailable"),
        "ca-settings-license-status": status || t("ca_value_unavailable"),
        "ca-settings-max-drivers": formatLimit(settings.maxDrivers ?? license.maxDrivers),
        "ca-settings-max-dispatchers": formatLimit(settings.maxDispatchers ?? license.maxDispatchers)
    };
    for (const [id, value] of Object.entries(fields)) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    }
}

function syncSettingsDirtyState() {
    settingsDirty = savedSettings ? !companySettingsEqual(readCompanySettingsDraft(), savedSettings) : false;
    renderSettingsSaveState();
}

function handleCompanySettingsCountry() {
    const country = document.getElementById("ca-settings-country")?.value || "";
    const timezone = document.getElementById("ca-settings-timezone");
    if (timezone) timezone.value = timezoneForCountry(country);
    setSettingsFieldErrors();
    syncSettingsDirtyState();
}

function handleCompanySettingsInput() {
    setSettingsFieldErrors();
    syncSettingsDirtyState();
}

function resetCompanySettingsForm() {
    if (!savedSettings) return;
    writeDraftToForm(savedSettings);
    settingsDirty = false;
    renderSettingsSaveState("saved");
}

async function saveCompanyProfileSettings() {
    if (!canRunCompanyAdminAction(window.currentUser?.role)) {
        showToast(t("error_access_denied"), "error");
        return false;
    }
    const draft = readCompanySettingsDraft();
    const validation = validateCompanySettingsDraft(draft);
    setSettingsFieldErrors(validation.errors);
    if (!validation.valid) {
        const first = Object.keys(validation.errors)[0];
        document.getElementById(settingsFieldId(first))?.focus();
        showToast(t("ca_settings_fix_errors"), "error");
        return false;
    }
    const button = document.getElementById("ca-settings-save");
    const submission = await runSingleSubmission(button, t("ca_settings_saving"), async () => {
        renderSettingsSaveState("saving");
        try {
            if (!USE_LOCAL_STATE) {
                const result = await ApiClient.updateCompanyProfileSettings(currentCompanyId(), validation.value);
                if (!result.success) throw new Error(result.error || t("ca_settings_save_failed"));
            }
            window.state.profile = { ...(window.state.profile || {}), ...validation.value };
            if (USE_LOCAL_STATE) saveState();
            savedSettings = { ...validation.value };
            settingsDirty = false;
            renderSettingsSaveState("saved");
            showToast(t("ca_settings_saved_toast"), "success");
            return true;
        } catch (cause) {
            renderSettingsSaveState("error");
            showToast(cause.message || t("ca_settings_save_failed"), "error");
            return false;
        }
    });
    return submission.started && submission.value === true;
}

function bindBeforeUnload() {
    if (beforeUnloadBound) return;
    window.addEventListener("beforeunload", event => {
        if (!settingsDirty) return;
        event.preventDefault();
        event.returnValue = "";
    });
    beforeUnloadBound = true;
}

function renderCompanyAdminSettings() {
    if (!canRunCompanyAdminAction(window.currentUser?.role)) return;
    const companyId = currentCompanyId();
    if (!companyId) return;
    if (settingsCompanyId !== companyId || !savedSettings) {
        settingsCompanyId = companyId;
        savedSettings = validateCompanySettingsDraft(stateProfileDraft()).value;
        settingsDirty = false;
    }
    if (!settingsDirty) writeDraftToForm(savedSettings);
    renderLicenseFacts();
    renderSettingsSaveState();

    const demoTools = document.getElementById("ca-settings-demo-tools");
    if (demoTools) demoTools.hidden = !USE_LOCAL_STATE;
    bindBeforeUnload();
    if (typeof lucide !== "undefined") lucide.createIcons();
}

export {
    handleCompanySettingsCountry,
    handleCompanySettingsInput,
    readCompanySettingsDraft,
    renderCompanyAdminSettings,
    resetCompanySettingsForm,
    saveCompanyProfileSettings
};
