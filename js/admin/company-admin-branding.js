import ApiClient from "../core/api-client.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import { saveState } from "../core/state.js";
import { canRunCompanyAdminAction } from "../core/ui-permissions.js";
import { showToast } from "../core/utils.js";
import { applyBrandingToUI, t } from "../ui/i18n.js";
import {
    DEFAULT_BRAND_COLOR,
    brandingDraftEquals,
    normalizeBrandColor,
    normalizeBrandLogoUrl,
    readBrandLogoFile,
    validateBrandingDraft
} from "./company-admin-branding-model.js";

let savedBranding = null;
let brandingDirty = false;
let beforeUnloadInstalled = false;

function companyNeedsBrandingSetup() {
    const name = window.state.branding?.name;
    return !name || !String(name).trim();
}

function getBrandingDraft() {
    return {
        name: document.getElementById("settings-brand-name")?.value || "",
        primaryColor: document.getElementById("settings-primary-color-hex")?.value
            || document.getElementById("settings-primary-color")?.value
            || DEFAULT_BRAND_COLOR,
        logoUrl: document.getElementById("settings-brand-logo-data")?.value || ""
    };
}

function setBrandingFieldError(field, key = "") {
    const inputId = {
        name: "settings-brand-name",
        primaryColor: "settings-primary-color-hex",
        logoUrl: "settings-brand-logo-file"
    }[field];
    const input = inputId ? document.getElementById(inputId) : null;
    const error = document.querySelector(`[data-branding-error="${field}"]`);
    if (input) input.setAttribute("aria-invalid", key ? "true" : "false");
    if (error) error.textContent = key ? t(`ca_branding_error_${key}`) : "";
}

function showBrandingValidation(errors = {}) {
    for (const field of ["name", "primaryColor", "logoUrl"]) {
        setBrandingFieldError(field, errors[field]);
    }
}

function setBrandingSaveState(state) {
    const status = document.getElementById("ca-branding-save-state");
    if (status) {
        status.dataset.state = state;
        status.textContent = t(`ca_branding_state_${state}`);
    }
    const button = document.getElementById("ca-branding-save");
    if (button) {
        const saving = state === "saving";
        button.disabled = saving;
        button.setAttribute("aria-busy", String(saving));
        button.innerHTML = saving
            ? `<span class="spinner" aria-hidden="true"></span><span>${t("ca_branding_saving")}</span>`
            : `<i data-lucide="save"></i><span>${t("ca_branding_save")}</span>`;
    }
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function updatePreviewLogo(logoUrl) {
    const image = document.getElementById("ca-branding-preview-logo");
    const fallback = document.getElementById("ca-branding-preview-fallback");
    if (!image || !fallback) return;
    const parsed = normalizeBrandLogoUrl(logoUrl);

    image.onload = () => {
        image.hidden = false;
        fallback.hidden = true;
    };
    image.onerror = () => {
        image.hidden = true;
        fallback.hidden = false;
    };
    if (!parsed.value) {
        image.dataset.url = "";
        image.removeAttribute("src");
        image.hidden = true;
        fallback.hidden = false;
        return;
    }
    if (image.dataset.url === parsed.value) return;
    image.dataset.url = parsed.value;
    image.hidden = true;
    fallback.hidden = false;
    image.src = parsed.value;
}

function updateCompanyBrandingPreview() {
    const draft = getBrandingDraft();
    const color = normalizeBrandColor(draft.primaryColor) || DEFAULT_BRAND_COLOR;
    const name = draft.name.trim() || t("ca_branding_preview_fallback");
    const preview = document.getElementById("ca-branding-preview");
    const previewName = document.getElementById("ca-branding-preview-name");
    const previewLoginName = document.getElementById("ca-branding-preview-login-name");
    const colorInput = document.getElementById("settings-primary-color");
    const colorHex = document.getElementById("settings-primary-color-hex");
    const colorSwatch = document.querySelector(".company-branding-color-swatch");

    if (preview) preview.style.setProperty("--branding-preview-color", color);
    if (previewName) previewName.textContent = name;
    if (previewLoginName) previewLoginName.textContent = name;
    if (colorInput && normalizeBrandColor(colorHex?.value)) colorInput.value = color;
    if (colorSwatch) colorSwatch.style.background = color;
    updatePreviewLogo(draft.logoUrl);

    brandingDirty = savedBranding ? !brandingDraftEquals(draft, savedBranding) : false;
    setBrandingSaveState(brandingDirty ? "unsaved" : "saved");
}

function syncBrandingColor(source) {
    const colorInput = document.getElementById("settings-primary-color");
    const colorHex = document.getElementById("settings-primary-color-hex");
    if (!colorInput || !colorHex) return;
    if (source === "picker") colorHex.value = colorInput.value.toUpperCase();
    const normalized = normalizeBrandColor(colorHex.value);
    if (normalized) colorInput.value = normalized;
    updateCompanyBrandingPreview();
}

function clearCompanyBrandingLogo() {
    const logoData = document.getElementById("settings-brand-logo-data");
    const fileInput = document.getElementById("settings-brand-logo-file");
    const status = document.getElementById("settings-brand-logo-status");
    if (logoData) logoData.value = "";
    if (fileInput) fileInput.value = "";
    if (status) status.textContent = "";
    setBrandingFieldError("logoUrl");
    updateCompanyBrandingPreview();
    fileInput?.focus();
}

async function handleCompanyBrandingLogoFile(fileInput) {
    const input = fileInput || document.getElementById("settings-brand-logo-file");
    const file = input?.files?.[0];
    if (!file) return false;
    try {
        const dataUrl = await readBrandLogoFile(file);
        const logoData = document.getElementById("settings-brand-logo-data");
        const status = document.getElementById("settings-brand-logo-status");
        if (logoData) logoData.value = dataUrl;
        if (status) status.textContent = t("ca_branding_logo_uploaded", { name: file.name }) || `Uploaded: ${file.name}`;
        setBrandingFieldError("logoUrl");
        updateCompanyBrandingPreview();
        showToast(t("ca_branding_logo_ready") || "Logo ready. Save branding to apply.", "success");
        return true;
    } catch (error) {
        const code = error?.code || "logo_file_type";
        setBrandingFieldError("logoUrl", code);
        showToast(t(`ca_branding_error_${code}`) || t("ca_branding_error_logo_file_type"), "error");
        return false;
    } finally {
        if (input) input.value = "";
    }
}

function installBrandingListeners() {
    const name = document.getElementById("settings-brand-name");
    const color = document.getElementById("settings-primary-color");
    const colorHex = document.getElementById("settings-primary-color-hex");
    if (name) name.oninput = updateCompanyBrandingPreview;
    if (color) color.oninput = () => syncBrandingColor("picker");
    if (colorHex) colorHex.oninput = () => syncBrandingColor("hex");

    if (!beforeUnloadInstalled) {
        window.addEventListener("beforeunload", event => {
            if (!brandingDirty) return;
            event.preventDefault();
            event.returnValue = "";
        });
        beforeUnloadInstalled = true;
    }
}

function renderCompanyAdminBranding() {
    if (!canRunCompanyAdminAction(window.currentUser?.role)) return;
    applyBrandingToUI();
    const branding = window.state.branding || {};
    const color = normalizeBrandColor(branding.primaryColor) || DEFAULT_BRAND_COLOR;
    const name = document.getElementById("settings-brand-name");
    const colorPicker = document.getElementById("settings-primary-color");
    const colorHex = document.getElementById("settings-primary-color-hex");
    const logoData = document.getElementById("settings-brand-logo-data");
    const status = document.getElementById("settings-brand-logo-status");
    if (name) name.value = branding.name || "";
    if (colorPicker) colorPicker.value = color;
    if (colorHex) colorHex.value = color;
    const existingLogo = branding.logoUrl || "";
    if (logoData) logoData.value = existingLogo;
    if (status) {
        status.textContent = existingLogo
            ? (t("ca_branding_logo_stored") || "Uploaded logo is saved for this company.")
            : "";
    }

    savedBranding = { name: branding.name || "", primaryColor: color, logoUrl: branding.logoUrl || "" };
    brandingDirty = false;
    showBrandingValidation();
    installBrandingListeners();
    updateCompanyBrandingPreview();

    const hint = document.getElementById("ca-branding-first-run");
    if (hint) hint.hidden = !companyNeedsBrandingSetup();
    if (typeof lucide !== "undefined") lucide.createIcons();
}

async function saveCompanyBrandingDraft(draft) {
    if (!canRunCompanyAdminAction(window.currentUser?.role)) {
        return { success: false, error: t("error_access_denied"), errors: {} };
    }

    const validated = validateBrandingDraft(draft);
    if (!validated.valid) return { success: false, error: t("ca_branding_fix_errors"), errors: validated.errors };

    let branding = validated.value;
    if (!USE_LOCAL_STATE) {
        const companyId = window.currentUser?.companyId;
        if (!companyId) return { success: false, error: t("ca_branding_company_missing"), errors: {} };
        const result = await ApiClient.updateCompanyBranding(companyId, branding);
        if (!result.success) return { success: false, error: result.error || t("ca_branding_save_failed"), errors: {} };
        branding = result.branding || branding;
    }

    window.state.branding = { ...window.state.branding, ...branding };
    saveState();
    applyBrandingToUI();
    return { success: true, branding, errors: {} };
}

async function applyBrandingSettings() {
    const validated = validateBrandingDraft(getBrandingDraft());
    showBrandingValidation(validated.errors);
    if (!validated.valid) {
        const firstField = Object.keys(validated.errors)[0];
        const firstId = { name: "settings-brand-name", primaryColor: "settings-primary-color-hex", logoUrl: "settings-brand-logo-file" }[firstField];
        document.getElementById(firstId)?.focus();
        showToast(t("ca_branding_fix_errors"), "error");
        return false;
    }

    setBrandingSaveState("saving");
    try {
        const result = await saveCompanyBrandingDraft(validated.value);
        if (!result.success) throw new Error(result.error || t("ca_branding_save_failed"));
        const branding = result.branding;
        savedBranding = { ...branding };
        brandingDirty = false;
        showBrandingValidation();
        setBrandingSaveState("saved");
        const hint = document.getElementById("ca-branding-first-run");
        if (hint) hint.hidden = true;
        showToast(t("ca_branding_saved"), "success");
        return true;
    } catch (error) {
        setBrandingSaveState("error");
        showToast(error.message || t("ca_branding_save_failed"), "error");
        return false;
    }
}

export {
    applyBrandingSettings,
    clearCompanyBrandingLogo,
    companyNeedsBrandingSetup,
    handleCompanyBrandingLogoFile,
    renderCompanyAdminBranding,
    saveCompanyBrandingDraft,
    updateCompanyBrandingPreview
};
