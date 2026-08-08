// BusCommand — login dropdowns (bez circular importa sa i18n)
import { USE_LOCAL_STATE, COMPANY_ID } from "../core/runtime-config.js";
import {
    normalizeCompanyId,
    readRememberedDriverCompany
} from "./driver-company.js";

function loginT(key) {
    const lang = window.state?.language || localStorage.getItem("buscommand_lang") || "en";
    const dict = window.TRANSLATIONS?.[lang] || window.TRANSLATIONS?.en || {};
    return dict[key] || key;
}

function configureProductionDriverLoginFields() {
    const select = document.getElementById("login-driver-select");
    const selectGroup = select?.closest(".form-group");
    const eidInput = document.getElementById("login-driver-eid");
    const eidLabel = document.querySelector("label[for='login-driver-eid']");
    const companyInput = document.getElementById("login-driver-company");
    const companyGroup = companyInput?.closest(".form-group");
    const companyLabel = document.querySelector("label[for='login-driver-company']");

    if (selectGroup) selectGroup.classList.add("hidden");
    if (select) {
        select.required = false;
        select.innerHTML = "";
        select.value = "";
    }
    if (companyGroup) companyGroup.classList.remove("hidden");
    if (companyInput) {
        companyInput.required = true;
        companyInput.placeholder = loginT("login_company_placeholder") || "company-id";
        companyInput.setAttribute("autocomplete", "organization");
        const prefill = normalizeCompanyId(COMPANY_ID) || readRememberedDriverCompany();
        if (prefill && !companyInput.value.trim()) companyInput.value = prefill;
    }
    if (companyLabel) {
        companyLabel.textContent = loginT("login_company_label") || loginT("company_id_label") || "Company ID";
    }
    if (eidInput) {
        eidInput.required = true;
        eidInput.placeholder = loginT("login_eid_required_ph") || "EID (required)";
        eidInput.setAttribute("autocomplete", "username");
    }
    if (eidLabel) {
        eidLabel.textContent = loginT("login_eid_required") || "EID";
    }
}

function configureLocalQaDriverLoginFields() {
    const companyInput = document.getElementById("login-driver-company");
    const companyGroup = companyInput?.closest(".form-group");
    if (companyGroup) companyGroup.classList.add("hidden");
    if (companyInput) {
        companyInput.required = false;
        companyInput.value = (typeof COMPANY_ID === "string" && COMPANY_ID) ? COMPANY_ID : "qa-local";
    }
}

async function initializeLoginSelects() {
    const driverSelect = document.getElementById("login-driver-select");
    if (!driverSelect) return;

    // Production: no unauthenticated roster dump — identify by company + EID.
    if (!USE_LOCAL_STATE) {
        configureProductionDriverLoginFields();
        return;
    }

    configureLocalQaDriverLoginFields();

    const selectedName = driverSelect.value;
    driverSelect.innerHTML = "";

    const drivers = window.state?.drivers || [];
    if (drivers.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.disabled = true;
        opt.selected = true;
        opt.innerText = loginT("no_drivers_registered");
        driverSelect.appendChild(opt);
        return;
    }

    drivers.forEach((d) => {
        const opt = document.createElement("option");
        opt.value = d.id;
        opt.innerText = d.name;
        if (d.id === selectedName) opt.selected = true;
        driverSelect.appendChild(opt);
    });

    if (!selectedName && driverSelect.options.length) {
        driverSelect.selectedIndex = 0;
    }
}

export { initializeLoginSelects };
