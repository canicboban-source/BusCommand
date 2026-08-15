// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { showToast } from "../core/utils.js";
import { applyBrandingToUI, t, translateUI } from "../ui/i18n.js";
import { actionAttr } from "../core/action-delegate.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";

let _wizardStep = 1;
let _wizardDriverRows = 0;

function showOnboardingWizard() {
    const wiz = document.getElementById("onboarding-wizard");
    if (!wiz) return;
    _wizardStep = 1;
    _wizardDriverRows = 0;
    document.getElementById("wizard-drivers-list").innerHTML = "";
    wizardAddDriverRow(); // dodaj jedan red odmah
    wizardRenderStep();
    wiz.style.display = "flex";
    wiz.removeAttribute("aria-hidden");
    wiz.classList.remove("hidden");
    lucide.createIcons();
}

function closeOnboardingWizard() {
    const wiz = document.getElementById("onboarding-wizard");
    if (wiz) {
        wiz.classList.add("hidden");
        wiz.style.display = "none";
        wiz.setAttribute("aria-hidden", "true");
    }
    window.state.onboardingDone = true;
    saveState();
}

function wizardRenderStep() {
    const steps = [1, 2, 3];
    steps.forEach(n => {
        const el = document.getElementById(`wizard-step-${n}`);
        if (el) el.style.display = n === _wizardStep ? "" : "none";
    });

    const progress = { 1: "33%", 2: "66%", 3: "100%" };
    const bar = document.getElementById("wizard-progress-bar");
    if (bar) bar.style.width = progress[_wizardStep] || "33%";

    const label = document.getElementById("wizard-step-label");
    if (label) label.innerText = `${_wizardStep} / 3`;

    const btnBack = document.getElementById("wizard-btn-back");
    if (btnBack) btnBack.style.display = _wizardStep > 1 ? "" : "none";

    const btnNext = document.getElementById("wizard-btn-next");
    const btnSkip = document.getElementById("wizard-btn-skip");
    if (btnNext) {
        if (_wizardStep === 3) {
            btnNext.setAttribute("data-i18n", "wizard_finish");
            btnNext.innerText = t("wizard_finish");
        } else {
            btnNext.setAttribute("data-i18n", "btn_next");
            btnNext.innerText = t("btn_next");
        }
    }
    // Step 3 — skip dugme postaje "Završi bez vozača"
    if (btnSkip) {
        if (_wizardStep === 3) {
            btnSkip.setAttribute("data-i18n", "wizard_finish_empty");
            btnSkip.innerText = t("wizard_finish_empty");
        } else {
            btnSkip.setAttribute("data-i18n", "btn_skip");
            btnSkip.innerText = t("btn_skip");
        }
    }
    translateUI();
    lucide.createIcons();
}

function wizardNext() {
    if (_wizardStep === 1) {
        const name = document.getElementById("wizard-company-name").value.trim();
        if (!name) {
            document.getElementById("wizard-company-name").focus();
            document.getElementById("wizard-company-name").style.borderColor = "var(--danger-color)";
            setTimeout(() => { document.getElementById("wizard-company-name").style.borderColor = ""; }, 2000);
            return;
        }
        window.state.branding.name = name;
        applyBrandingToUI();
    } else if (_wizardStep === 2) {
        const color = document.getElementById("wizard-color-picker").value;
        window.state.branding.primaryColor = color;
        document.documentElement.style.setProperty("--primary-color", color);
        applyBrandingToUI();
    } else if (_wizardStep === 3) {
        wizardSaveDrivers();
        saveState();
        closeOnboardingWizard();
        showToast("✅ " + t("wizard_done_toast"), "success", 4000);
        return;
    }
    _wizardStep++;
    wizardRenderStep();
}

function wizardBack() {
    if (_wizardStep > 1) {
        _wizardStep--;
        wizardRenderStep();
    }
}

function wizardSkip() {
    if (_wizardStep === 3) {
        saveState();
        closeOnboardingWizard();
        return;
    }
    _wizardStep++;
    wizardRenderStep();
}

function wizardSelectColor(hex) {
    document.getElementById("wizard-color-picker").value = hex;
    document.getElementById("wizard-color-preview").style.background = hex;
    document.getElementById("wizard-color-hex").innerText = hex;

    // Označi chip
    document.querySelectorAll(".wizard-color-chip").forEach(c => {
        c.style.outline = c.dataset.color === hex ? "3px solid white" : "none";
        c.style.outlineOffset = "2px";
    });

    // Live preview boje u app-u
    document.documentElement.style.setProperty("--primary-color", hex);
    window.state.branding.primaryColor = hex;
}

function wizardPreviewBranding() {
    const name = document.getElementById("wizard-company-name").value.trim();
    if (name) {
        const el = document.getElementById("app-branding-title");
        if (el) el.innerText = name;
    }
}

function wizardHandleLogo(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const dataUrl = e.target.result;
        window.state.branding.logo = dataUrl;

        document.getElementById("wizard-logo-img").src = dataUrl;
        document.getElementById("wizard-logo-preview").style.display = "block";
        document.getElementById("wizard-logo-placeholder").style.display = "none";
        applyBrandingToUI();
    };
    reader.readAsDataURL(file);
}

function wizardAddDriverRow() {
    _wizardDriverRows++;
    const id = `wdrv-${_wizardDriverRows}`;
    const list = document.getElementById("wizard-drivers-list");
    const row = document.createElement("div");
    row.id = id;
    row.style.cssText = "display:grid;grid-template-columns:1fr 80px 70px auto;gap:8px;align-items:center;";
    row.innerHTML = `
        <input type="text" placeholder="${t('wizard_driver_name')}"
            style="padding:10px 12px;border-radius:8px;border:1px solid var(--panel-border);background:var(--input-bg);color:var(--text-main);font-family:'Outfit',sans-serif;font-size:0.85rem;outline:none;width:100%;box-sizing:border-box;" />
        <input type="text" placeholder="${t('wizard_bus_nr')}" maxlength="6"
            style="padding:10px 12px;border-radius:8px;border:1px solid var(--panel-border);background:var(--input-bg);color:var(--text-main);font-family:'Outfit',sans-serif;font-size:0.85rem;outline:none;width:100%;box-sizing:border-box;" />
        <input type="text" placeholder="PIN" maxlength="4"
            style="padding:10px 12px;border-radius:8px;border:1px solid var(--panel-border);background:var(--input-bg);color:var(--text-main);font-family:'Outfit',sans-serif;font-size:0.85rem;outline:none;width:100%;box-sizing:border-box;" />
        <button ${actionAttr("removeElementById", [id])}
            style="width:36px;height:36px;border:1px solid var(--panel-border);border-radius:8px;background:none;color:var(--text-muted);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
        </button>`;
    list.appendChild(row);
    lucide.createIcons();
}

function wizardSaveDrivers() {
    if (!USE_LOCAL_STATE) {
        showToast(t("ca_drivers_admin_only") || "Vozačke naloge uvozi Company Admin (CSV).", "info");
        return;
    }
    const rows = document.querySelectorAll("#wizard-drivers-list > div");
    rows.forEach((row, i) => {
        const inputs = row.querySelectorAll("input");
        const name = inputs[0].value.trim();
        const bus  = inputs[1].value.trim();
        const pin  = inputs[2].value.trim() || "1234";
        if (!name) return;
        // Dodaj grupu ako postoji, inače bez grupe
        const groupId = window.state.groups.length > 0 ? window.state.groups[0].id : null;
        const exists = window.state.drivers.find(d => d.name === name);
        if (!exists) {
            window.state.drivers.push({
                id: `drv-${Date.now()}-${i}`,
                name, bus: bus || "?", pin, groupId,
                active: false
            });
        }
    });
}
export {
    showOnboardingWizard,
    closeOnboardingWizard,
    wizardRenderStep,
    wizardNext,
    wizardBack,
    wizardSkip,
    wizardSelectColor,
    wizardPreviewBranding,
    wizardHandleLogo,
    wizardAddDriverRow,
    wizardSaveDrivers
};
