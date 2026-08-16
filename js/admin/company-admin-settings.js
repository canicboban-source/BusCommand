// BusCommand — Company Admin: headquarters, privacy and audited exports
import ApiClient from "../core/api-client.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import { saveState } from "../core/state.js";
import { runSingleSubmission } from "../core/submit-lock.js";
import { currentUserCanRunCompanyAdminAction } from "../core/ui-permissions.js";
import { showToast, refreshIcons } from "../core/utils.js";
import { resolveUiLanguage } from "../core/state.js";
import { t } from "../ui/i18n.js";
import {
    COMPANY_TIMEZONES,
    companySettingsEqual,
    timezoneForCountry,
    validateCompanySettingsDraft
} from "./company-admin-settings-model.js";
import { getCompanyLicenseInfo } from "./company-admin-overview-model.js";

let savedSettings = null;
let settingsCompanyId = null;
let settingsDirty = false;
let beforeUnloadBound = false;

const SETTINGS_FIELDS = ["country", "defaultLanguage", "contactEmail", "taxId", "billingEmail", "smsSenderId", "dispatchPhone"];

function currentCompanyId() {
    return window.currentUser?.companyId || null;
}

function stateProfileDraft() {
    const profile = window.state.profile || {};
    const demoCountry = USE_LOCAL_STATE ? "AT" : "";
    const country = profile.country || demoCountry;
    const draft = {
        country,
        timezone: profile.timezone || timezoneForCountry(country),
        defaultLanguage: profile.defaultLanguage || (USE_LOCAL_STATE ? window.state.language || "de" : ""),
        contactEmail: profile.contactEmail || (USE_LOCAL_STATE ? window.currentUser?.email || "" : "")
    };
    for (const field of ["taxId", "billingEmail", "smsSenderId", "dispatchPhone"]) draft[field] = profile[field] || "";
    return draft;
}

function settingsFieldId(field) {
    if (field === "defaultLanguage") return "ca-settings-language";
    return "ca-settings-" + field.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
}

function readCompanySettingsDraft() {
    const draft = {};
    for (const field of SETTINGS_FIELDS) {
        draft[field] = document.getElementById(settingsFieldId(field))?.value || "";
    }
    return draft;
}

function setSettingsFieldErrors(errors = {}) {
    for (const field of SETTINGS_FIELDS) {
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
    refreshIcons();
}

function writeDraftToForm(draft) {
    const validation = validateCompanySettingsDraft(draft);
    for (const field of SETTINGS_FIELDS) {
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

/**
 * Fills the country select from COMPANY_TIMEZONES. Labels come from Intl.DisplayNames
 * in the active UI language, so adding a country needs no new translation keys and the
 * list can never show a country the timezone map cannot resolve.
 */
function renderCompanyCountryOptions(selected = "") {
    const select = document.getElementById("ca-settings-country");
    if (!select) return;
    const lang = resolveUiLanguage();
    let names = null;
    try {
        names = new Intl.DisplayNames([lang], { type: "region" });
    } catch {
        names = null;
    }
    const options = Object.keys(COMPANY_TIMEZONES)
        .map((code) => {
            let label = code;
            try {
                label = names?.of(code) || code;
            } catch {
                label = code;
            }
            return { code, label };
        })
        .sort((left, right) => left.label.localeCompare(right.label, lang, { sensitivity: "base" }));

    const current = String(selected || select.value || "");
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = t("ca_settings_country_placeholder");
    select.appendChild(placeholder);
    for (const option of options) {
        const el = document.createElement("option");
        el.value = option.code;
        el.textContent = option.label;
        select.appendChild(el);
    }
    select.value = current && COMPANY_TIMEZONES[current] ? current : "";
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
    if (!currentUserCanRunCompanyAdminAction()) {
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
    if (!currentUserCanRunCompanyAdminAction()) return;
    const companyId = currentCompanyId();
    if (!companyId) return;
    if (settingsCompanyId !== companyId || !savedSettings) {
        settingsCompanyId = companyId;
        savedSettings = validateCompanySettingsDraft(stateProfileDraft()).value;
        settingsDirty = false;
    }
    renderCompanyCountryOptions(savedSettings?.country);
    if (!settingsDirty) writeDraftToForm(savedSettings);
    renderLicenseFacts();
    renderSettingsSaveState();

    const demoTools = document.getElementById("ca-settings-demo-tools");
    if (demoTools) demoTools.hidden = !USE_LOCAL_STATE;
    bindBeforeUnload();
    refreshIcons();
}

export {
    renderCompanyCountryOptions,
    handleCompanySettingsCountry,
    handleCompanySettingsInput,
    readCompanySettingsDraft,
    renderCompanyAdminSettings,
    resetCompanySettingsForm,
    saveCompanyProfileSettings
};
