// BusCommand — Company Admin onboarding: brend → grupa → dispečer
import { saveState } from "../core/state.js";
import { showToast } from "../core/utils.js";
import { applyBrandingToUI, t, translateUI } from "../ui/i18n.js";
import { renderCompanyAdminDashboard } from "./company-admin.js";
import { switchSection } from "../layout/navigation.js";

let _caWizardStep = 1;
const CA_WIZARD_STEPS = 3;

function getCompanyId() {
    return window.currentUser?.companyId || "demo";
}

function shouldShowCompanyAdminOnboarding() {
    if (!window.currentUser || window.currentUser.role !== "company-admin") return false;
    return !window.state.companyAdminOnboardingDone;
}

function showCompanyAdminOnboarding() {
    const wiz = document.getElementById("ca-onboarding-wizard");
    if (!wiz || !shouldShowCompanyAdminOnboarding()) return;

    _caWizardStep = 1;
    const branding = window.state.branding || {};

    const nameEl = document.getElementById("ca-wizard-company-name");
    if (nameEl) nameEl.value = branding.name || "";

    const colorEl = document.getElementById("ca-wizard-color-picker");
    const color = branding.primaryColor || "#29ABE2";
    if (colorEl) colorEl.value = color;
    caWizardSelectColor(color);

    const logoUrlEl = document.getElementById("ca-wizard-logo-url");
    if (logoUrlEl) logoUrlEl.value = branding.logoUrl || "";

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
    wiz.classList.remove("hidden");
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function closeCompanyAdminOnboarding() {
    const wiz = document.getElementById("ca-onboarding-wizard");
    if (wiz) wiz.classList.add("hidden");
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
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function caWizardSelectColor(hex) {
    const picker = document.getElementById("ca-wizard-color-picker");
    const preview = document.getElementById("ca-wizard-color-preview");
    const hexLabel = document.getElementById("ca-wizard-color-hex");
    if (picker) picker.value = hex;
    if (preview) preview.style.background = hex;
    if (hexLabel) hexLabel.textContent = hex.toUpperCase();

    document.querySelectorAll(".ca-wizard-color-chip").forEach(c => {
        c.style.outline = c.dataset.color === hex ? "3px solid white" : "none";
        c.style.outlineOffset = "2px";
    });

    if (!window.state.branding) window.state.branding = {};
    window.state.branding.primaryColor = hex;
    document.documentElement.style.setProperty("--primary-color", hex);
}

function caWizardPreviewName() {
    const name = document.getElementById("ca-wizard-company-name")?.value?.trim();
    if (name) {
        const el = document.getElementById("app-branding-title");
        if (el) el.textContent = name;
    }
}

function caWizardSaveBranding() {
    const name = document.getElementById("ca-wizard-company-name")?.value?.trim();
    if (!name) {
        const el = document.getElementById("ca-wizard-company-name");
        if (el) {
            el.focus();
            el.style.borderColor = "var(--danger-color, #ef4444)";
            setTimeout(() => { el.style.borderColor = ""; }, 2000);
        }
        return false;
    }

    const color = document.getElementById("ca-wizard-color-picker")?.value || "#29ABE2";
    const logoUrl = document.getElementById("ca-wizard-logo-url")?.value?.trim() || "";

    window.state.branding = {
        ...window.state.branding,
        name,
        primaryColor: color,
        logoUrl
    };
    applyBrandingToUI();
    saveState();
    return true;
}

function caWizardSaveGroup() {
    const lineId = document.getElementById("ca-wizard-line-id")?.value?.trim();
    const name = document.getElementById("ca-wizard-group-name")?.value?.trim();
    const color = document.getElementById("ca-wizard-group-color")?.value || "#0ea5e9";

    if (!lineId || !name) {
        showToast(t("ca_group_err_line_name") || "Unesite ID linije i naziv", "error");
        return false;
    }
    if (!/^\d+$/.test(lineId)) {
        showToast(t("ca_group_err_line_numeric") || "ID linije mora biti broj", "error");
        return false;
    }
    if (!window.state.groups) window.state.groups = [];
    if (window.state.groups.some(g => g.id === lineId)) {
        showToast(t("group_err_exists") || "Grupa već postoji", "error");
        return false;
    }

    const companyId = getCompanyId();
    window.state.groups.push({
        id: lineId,
        lineId,
        name,
        color,
        description: "",
        active: true,
        companyId
    });
    saveState();
    return true;
}

function caWizardSaveDispatcher() {
    const name = document.getElementById("ca-wizard-disp-name")?.value?.trim();
    const email = document.getElementById("ca-wizard-disp-email")?.value?.trim().toLowerCase();
    const password = document.getElementById("ca-wizard-disp-password")?.value || "";

    if (!name || !email || !password) {
        showToast(t("error_fill_all_fields") || "Popunite sva polja", "error");
        return false;
    }
    if (password.length < 6) {
        showToast(t("ca_password_min") || "Lozinka min. 6 karaktera", "error");
        return false;
    }
    if ((window.state.dispatchers || []).some(d => d.email === email) ||
        (window.state.companyAdmins || []).some(ca => ca.email === email)) {
        showToast(t("ca_email_exists") || "Email zauzet", "error");
        return false;
    }

    const companyId = getCompanyId();
    const groups = (window.state.groups || []).filter(g => !companyId || !g.companyId || g.companyId === companyId);
    const groupIds = groups.map(g => g.id);

    if (!window.state.dispatchers) window.state.dispatchers = [];
    window.state.dispatchers.push({
        id: "dispo-" + Date.now(),
        name,
        email,
        password,
        passwordChanged: false,
        groups: groupIds,
        activeGroupId: groupIds[0] || null,
        companyId,
        paymentStatus: "Trial",
        trialDaysLeft: 30
    });
    saveState();
    return true;
}

function caWizardNext() {
    if (_caWizardStep === 1) {
        if (!caWizardSaveBranding()) return;
    } else if (_caWizardStep === 2) {
        if (!caWizardSaveGroup()) return;
    } else if (_caWizardStep === CA_WIZARD_STEPS) {
        if (!caWizardSaveDispatcher()) return;
        closeCompanyAdminOnboarding();
        showToast(t("ca_wizard_done_toast") || "Firma je spremna!", "success", 5000);
        return;
    }
    _caWizardStep++;
    caWizardRenderStep();
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
    caWizardPreviewName
};
