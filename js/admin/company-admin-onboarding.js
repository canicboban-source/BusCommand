// BusCommand — Company Admin onboarding: brend → grupa → dispečer
import { saveState } from "../core/state.js";
import { escapeHtml, showToast } from "../core/utils.js";
import { t, translateUI } from "../ui/i18n.js";
import { renderCompanyAdminDashboard } from "./company-admin.js";
import { switchSection } from "../layout/navigation.js";
import { saveCompanyBrandingDraft } from "./company-admin-branding.js";
import { readBrandLogoFile } from "./company-admin-branding-model.js";
import { persistCompanyGroupDraft } from "./company-admin-groups.js";
import { safeGroupColor } from "./company-admin-groups-model.js";
import { persistCompanyDispatcherDraft } from "./company-admin-team.js";
import { resolveCompanyAdminOnboarding } from "./company-admin-onboarding-model.js";

let _caWizardStep = 1;
let _caWizardSaving = false;
const CA_WIZARD_STEPS = 3;

function getCompanyId() {
    return window.currentUser?.companyId || "demo";
}

function shouldShowCompanyAdminOnboarding() {
    const status = resolveCompanyAdminOnboarding(window.state, window.currentUser);
    if (status.alreadyProvisioned && window.state && !window.state.companyAdminOnboardingDone) {
        window.state.companyAdminOnboardingDone = true;
        try { saveState(); } catch { /* non-fatal */ }
    }
    return status.show;
}

function showCompanyAdminOnboarding() {
    const wiz = document.getElementById("ca-onboarding-wizard");
    const status = resolveCompanyAdminOnboarding(window.state, window.currentUser);
    if (!wiz || !status.show) return;

    _caWizardStep = Math.min(Math.max(status.startStep || 1, 1), CA_WIZARD_STEPS);
    const branding = window.state.branding || {};

    const nameEl = document.getElementById("ca-wizard-company-name");
    if (nameEl) nameEl.value = branding.name || "";

    const colorEl = document.getElementById("ca-wizard-color-picker");
    const color = branding.primaryColor || "#29ABE2";
    if (colorEl) colorEl.value = color;
    caWizardSelectColor(color);

    const logoDataEl = document.getElementById("ca-wizard-logo-data");
    const logoPreview = document.getElementById("ca-wizard-logo-preview");
    const logoPlaceholder = document.getElementById("ca-wizard-logo-placeholder");
    const logoImg = document.getElementById("ca-wizard-logo-img");
    const existingLogo = branding.logoUrl ? String(branding.logoUrl) : "";
    if (logoDataEl) logoDataEl.value = existingLogo;
    if (existingLogo && logoImg && logoPreview && logoPlaceholder) {
        logoImg.src = existingLogo;
        logoPreview.style.display = "";
        logoPlaceholder.style.display = "none";
    } else if (logoPreview && logoPlaceholder) {
        logoPreview.style.display = "none";
        logoPlaceholder.style.display = "";
    }

    // New group / dispatcher forms stay empty — never prefill placeholders as if editable existing rows.
    const lineEl = document.getElementById("ca-wizard-line-id");
    const groupNameEl = document.getElementById("ca-wizard-group-name");
    if (lineEl) lineEl.value = "";
    if (groupNameEl) groupNameEl.value = "";

    const dispName = document.getElementById("ca-wizard-disp-name");
    const dispEmail = document.getElementById("ca-wizard-disp-email");
    const dispPwd = document.getElementById("ca-wizard-disp-password");
    if (dispName) dispName.value = "";
    if (dispEmail) dispEmail.value = "";
    if (dispPwd) dispPwd.value = "";

    caWizardRenderStep();
    wiz.style.display = "flex";
    wiz.removeAttribute("aria-hidden");
    wiz.classList.remove("hidden");
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function closeCompanyAdminOnboarding() {
    const wiz = document.getElementById("ca-onboarding-wizard");
    if (wiz) {
        wiz.classList.add("hidden");
        wiz.style.display = "none";
        wiz.setAttribute("aria-hidden", "true");
    }
    window.state.companyAdminOnboardingDone = true;
    saveState();
    renderCompanyAdminDashboard();
    switchSection("company-admin-dashboard");
}

function caWizardRenderStep() {
    for (let n = 1; n <= CA_WIZARD_STEPS; n++) {
        const el = document.getElementById(`ca-wizard-step-${n}`);
        if (el) el.style.display = n === _caWizardStep ? "" : "none";
    }

    const progress = { 1: "33%", 2: "66%", 3: "100%" };
    const bar = document.getElementById("ca-wizard-progress-bar");
    if (bar) bar.style.width = progress[_caWizardStep] || "33%";

    const label = document.getElementById("ca-wizard-step-label");
    if (label) label.innerText = `${_caWizardStep} / ${CA_WIZARD_STEPS}`;

    const btnBack = document.getElementById("ca-wizard-btn-back");
    if (btnBack) btnBack.style.display = _caWizardStep > 1 ? "" : "none";

    const btnNext = document.getElementById("ca-wizard-btn-next");
    const btnSkip = document.getElementById("ca-wizard-btn-skip");

    if (btnNext) {
        if (_caWizardStep === CA_WIZARD_STEPS) {
            btnNext.setAttribute("data-i18n", "ca_wizard_finish");
            btnNext.textContent = t("ca_wizard_finish") || "Završi";
        } else {
            btnNext.setAttribute("data-i18n", "btn_next");
            btnNext.textContent = t("btn_next") || "Dalje";
        }
    }

    if (btnSkip) {
        if (_caWizardStep === 2) {
            btnSkip.style.display = "";
            btnSkip.setAttribute("data-i18n", "ca_wizard_skip_group");
            btnSkip.textContent = t("ca_wizard_skip_group") || "Preskoči (dodaj kasnije)";
        } else if (_caWizardStep === CA_WIZARD_STEPS) {
            btnSkip.style.display = "";
            btnSkip.setAttribute("data-i18n", "ca_wizard_skip_disp");
            btnSkip.textContent = t("ca_wizard_skip_disp") || "Završi bez dispečera";
        } else {
            btnSkip.style.display = "none";
        }
    }

    translateUI();
    if (_caWizardStep === CA_WIZARD_STEPS) renderWizardDispatcherGroups();
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function getWizardGroups() {
    const companyId = getCompanyId();
    return (Array.isArray(window.state.groups) ? window.state.groups : []).filter(group =>
        group
        && typeof group === "object"
        && group.id != null
        && String(group.id).trim()
        && (!companyId || !group.companyId || group.companyId === companyId)
    );
}

function renderWizardDispatcherGroups() {
    const picker = document.getElementById("ca-wizard-disp-groups");
    if (!picker) return;
    const groups = getWizardGroups();
    if (!groups.length) {
        picker.innerHTML = `<div style="padding:12px;border:1px dashed var(--panel-border);border-radius:10px;color:var(--text-muted);font-size:0.85rem;">${escapeHtml(t("ca_wizard_need_group") || t("ca_no_groups_for_disp"))}</div>`;
        return;
    }
    const previouslyChecked = new Set(
        Array.from(document.querySelectorAll(".ca-wizard-disp-group:checked"), input => String(input.value))
    );
    const selectAllByDefault = previouslyChecked.size === 0;
    picker.innerHTML = groups.map(group => {
        const id = String(group.id);
        const color = safeGroupColor(group.color);
        const checked = selectAllByDefault || previouslyChecked.has(id);
        return `<label class="company-team-group-option" style="--team-group-color:${color};display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--panel-border);border-radius:10px;cursor:pointer;">
            <input type="checkbox" class="ca-wizard-disp-group" value="${escapeHtml(id)}" ${checked ? "checked" : ""}>
            <span style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;" aria-hidden="true"></span>
            <strong style="color:var(--text-main);">${escapeHtml(group.name || id)}</strong>
            <small style="color:var(--text-muted);margin-left:auto;">${escapeHtml(t("plan_pick_line") || "Line")} ${escapeHtml(id)}</small>
        </label>`;
    }).join("");
}

function selectedWizardDispatcherGroups() {
    return Array.from(document.querySelectorAll(".ca-wizard-disp-group:checked"), input => String(input.value));
}

function caWizardSelectColor(hex) {
    const normalized = String(hex || "").trim().toUpperCase();
    const valid = /^#[0-9A-F]{6}$/.test(normalized) ? normalized : "";
    const picker = document.getElementById("ca-wizard-color-picker");
    const preview = document.getElementById("ca-wizard-color-preview");
    const hexInput = document.getElementById("ca-wizard-color-hex");
    const error = document.getElementById("ca-wizard-color-error");

    if (valid) {
        if (picker) picker.value = valid;
        if (preview) preview.style.background = valid;
        if (hexInput && document.activeElement !== hexInput) hexInput.value = valid;
        if (hexInput) {
            hexInput.setAttribute("aria-invalid", "false");
            hexInput.style.borderColor = "";
        }
        if (error) error.textContent = "";
        document.querySelectorAll(".ca-wizard-color-chip").forEach(chip => {
            const chipColor = String(chip.dataset.color || "").toUpperCase();
            chip.style.outline = chipColor === valid ? "3px solid white" : "none";
            chip.style.outlineOffset = "2px";
        });
        return valid;
    }

    if (hexInput) {
        hexInput.setAttribute("aria-invalid", "true");
        hexInput.style.borderColor = "var(--danger-color)";
    }
    if (error) error.textContent = t("ca_branding_error_color_invalid") || "Use a full HEX color, e.g. #2563EB.";
    return "";
}

function caWizardSelectColorFromPicker(value) {
    return caWizardSelectColor(value);
}

function caWizardSelectColorFromHex(value) {
    let raw = String(value || "").trim().toUpperCase();
    if (raw && !raw.startsWith("#")) raw = `#${raw}`;
    const hexInput = document.getElementById("ca-wizard-color-hex");
    if (hexInput && hexInput.value !== raw) hexInput.value = raw;
    if (raw.length < 7) {
        const error = document.getElementById("ca-wizard-color-error");
        if (error) error.textContent = "";
        if (hexInput) {
            hexInput.setAttribute("aria-invalid", "false");
            hexInput.style.borderColor = "";
        }
        return "";
    }
    return caWizardSelectColor(raw);
}

function caWizardPreviewName() {
    return document.getElementById("ca-wizard-company-name")?.value?.trim() || "";
}

async function caWizardSaveBranding() {
    const name = document.getElementById("ca-wizard-company-name")?.value?.trim();
    const hexRaw = document.getElementById("ca-wizard-color-hex")?.value?.trim()
        || document.getElementById("ca-wizard-color-picker")?.value
        || "#29ABE2";
    const color = caWizardSelectColor(hexRaw) || hexRaw;
    const logoUrl = document.getElementById("ca-wizard-logo-data")?.value?.trim() || "";
    const result = await saveCompanyBrandingDraft({ name, primaryColor: color, logoUrl });
    if (!result.success) {
        const field = result.errors?.name
            ? document.getElementById("ca-wizard-company-name")
            : result.errors?.logoUrl
                ? document.getElementById("ca-wizard-logo-file")
                : document.getElementById("ca-wizard-color-hex");
        field?.focus();
        if (result.errors?.primaryColor) caWizardSelectColor(color);
        if (result.errors?.logoUrl) {
            const logoError = document.getElementById("ca-wizard-logo-error");
            if (logoError) logoError.textContent = t(`ca_branding_error_${result.errors.logoUrl}`) || result.error;
        }
        showToast(result.error || t("ca_branding_form_errors"), "error");
        return false;
    }
    return true;
}

async function caWizardHandleLogo(fileInput) {
    const input = fileInput || document.getElementById("ca-wizard-logo-file");
    const file = input?.files?.[0];
    const error = document.getElementById("ca-wizard-logo-error");
    if (!file) return false;
    try {
        const dataUrl = await readBrandLogoFile(file);
        const dataField = document.getElementById("ca-wizard-logo-data");
        const preview = document.getElementById("ca-wizard-logo-preview");
        const img = document.getElementById("ca-wizard-logo-img");
        const placeholder = document.getElementById("ca-wizard-logo-placeholder");
        if (dataField) dataField.value = dataUrl;
        if (img) img.src = dataUrl;
        if (preview) preview.style.display = "";
        if (placeholder) placeholder.style.display = "none";
        if (error) error.textContent = "";
        showToast(t("ca_branding_logo_ready") || "Logo ready.", "success");
        return true;
    } catch (err) {
        const code = err?.code || "logo_file_type";
        if (error) error.textContent = t(`ca_branding_error_${code}`) || t("ca_branding_error_logo_file_type");
        showToast(t(`ca_branding_error_${code}`) || t("ca_branding_error_logo_file_type"), "error");
        return false;
    } finally {
        if (input) input.value = "";
    }
}

async function caWizardSaveGroup() {
    const lineId = document.getElementById("ca-wizard-line-id")?.value?.trim();
    const name = document.getElementById("ca-wizard-group-name")?.value?.trim();
    const color = document.getElementById("ca-wizard-group-color")?.value || "#0ea5e9";
    const result = await persistCompanyGroupDraft({ id: lineId, name, color, description: "" });
    if (!result.success) {
        const field = result.errors?.id
            ? document.getElementById("ca-wizard-line-id")
            : document.getElementById("ca-wizard-group-name");
        field?.focus();
        showToast(result.error || t("ca_group_form_errors"), "error");
        return false;
    }
    return true;
}

async function caWizardSaveDispatcher() {
    const name = document.getElementById("ca-wizard-disp-name")?.value?.trim();
    const email = document.getElementById("ca-wizard-disp-email")?.value?.trim().toLowerCase();
    const password = document.getElementById("ca-wizard-disp-password")?.value || "";
    const groupIds = selectedWizardDispatcherGroups();
    clearWizardDispatcherErrors();

    if (!getWizardGroups().length) {
        setWizardDispatcherErrors({ groups: "groups_required" });
        showToast(t("ca_wizard_need_group") || t("ca_team_error_groups_required"), "error");
        return false;
    }

    const result = await persistCompanyDispatcherDraft({ name, email, password, groups: groupIds });
    if (!result.success) {
        setWizardDispatcherErrors(result.errors || {});
        const firstKey = Object.keys(result.errors || {})[0];
        const specific = firstKey ? t(`ca_team_error_${result.errors[firstKey]}`) : "";
        showToast(specific || result.error || t("ca_disp_add_failed"), "error");
        const focusId = {
            name: "ca-wizard-disp-name",
            email: "ca-wizard-disp-email",
            password: "ca-wizard-disp-password"
        }[firstKey];
        if (focusId) document.getElementById(focusId)?.focus();
        else document.querySelector(".ca-wizard-disp-group")?.focus();
        return false;
    }
    return true;
}

function clearWizardDispatcherErrors() {
    setWizardDispatcherErrors({});
}

function setWizardDispatcherErrors(errors = {}) {
    const fieldIds = {
        name: "ca-wizard-disp-name",
        email: "ca-wizard-disp-email",
        password: "ca-wizard-disp-password"
    };
    for (const field of ["name", "email", "password", "groups"]) {
        const input = fieldIds[field] ? document.getElementById(fieldIds[field]) : null;
        const error = document.querySelector(`[data-wizard-disp-error="${field}"]`);
        const key = errors[field];
        if (input) {
            input.setAttribute("aria-invalid", key ? "true" : "false");
            input.style.borderColor = key ? "var(--danger-color)" : "";
        }
        if (error) error.textContent = key ? t(`ca_team_error_${key}`) : "";
    }
}

async function caWizardNext() {
    if (_caWizardSaving) return;
    _caWizardSaving = true;
    const nextButton = document.getElementById("ca-wizard-btn-next");
    if (nextButton) nextButton.disabled = true;
    try {
        if (_caWizardStep === 1) {
            if (!await caWizardSaveBranding()) return;
        } else if (_caWizardStep === 2) {
            if (!await caWizardSaveGroup()) return;
        } else if (_caWizardStep === CA_WIZARD_STEPS) {
            if (!await caWizardSaveDispatcher()) return;
            closeCompanyAdminOnboarding();
            showToast(t("ca_wizard_done_toast") || "Firma je spremna!", "success", 5000);
            return;
        }
        _caWizardStep++;
        caWizardRenderStep();
    } finally {
        _caWizardSaving = false;
        if (nextButton) nextButton.disabled = false;
    }
}

function caWizardBack() {
    if (_caWizardStep > 1) {
        _caWizardStep--;
        caWizardRenderStep();
    }
}

function caWizardSkip() {
    if (_caWizardStep === 2) {
        _caWizardStep++;
        caWizardRenderStep();
        return;
    }
    if (_caWizardStep === CA_WIZARD_STEPS) {
        closeCompanyAdminOnboarding();
        showToast(t("ca_wizard_done_partial") || "Možete dodati dispečere kasnije u Tim.", "info", 4000);
    }
}

export {
    shouldShowCompanyAdminOnboarding,
    showCompanyAdminOnboarding,
    closeCompanyAdminOnboarding,
    caWizardNext,
    caWizardBack,
    caWizardSkip,
    caWizardSelectColor,
    caWizardSelectColorFromPicker,
    caWizardSelectColorFromHex,
    caWizardHandleLogo,
    caWizardPreviewName
};
