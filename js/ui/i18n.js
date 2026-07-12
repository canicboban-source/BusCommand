// BusCommand ESM v9.5
import { getBaseState, saveState } from "../core/state.js";
import { showToast } from "../core/utils.js";
import { populateTemplateSelect } from "../dispatcher/msg-compose.js";
import { initializeLoginSelects } from "../auth/login-selects.js";
import { switchSection } from "../layout/navigation.js";
import { showConfirm } from "./confirm-modal.js";

function changeLanguage(lang) {
    if (!window.TRANSLATIONS[lang]) {
        console.warn("Jezik nije podrzavan:", lang);
        return;
    }
    
    window.state.language = lang;
    saveState();
    localStorage.setItem("buscommand_lang", lang); // čuva jezik odvojeno, preživljava reset
    
    const loginSel  = document.getElementById("login-lang-select");
    const headerSel = document.getElementById("header-lang-select");
    if (loginSel)  loginSel.value  = lang;
    if (headerSel) headerSel.value = lang;

    // Ažuriraj HTML lang atribut (pristupačnost)
    document.documentElement.lang = lang;

    translateUI();

    if (window.currentUser) {
        const nameEl = document.getElementById("header-user-name");
        if (nameEl) nameEl.innerText = window.t(window.currentUser.name);

        const roleBadge = document.getElementById("current-role-badge");
        if (roleBadge) {
            const role = window.currentUser.role;
            if (role === "driver") roleBadge.innerText = window.t("driver");
            else if (role === "company-admin") roleBadge.innerText = window.t("role_company_admin");
            else if (role === "superadmin") roleBadge.innerText = "Super Admin";
            else roleBadge.innerText = window.t("dispatcher");
        }

        const subEl = document.getElementById("header-user-sub");
        if (subEl) {
            const role = window.currentUser.role;
            if (role === "driver") {
                subEl.innerText = `${window.t("vehicle")} ${window.currentUser.bus || ""}`;
            } else if (role === "company-admin") {
                subEl.innerText = window.t("role_company_admin");
            } else if (role === "superadmin") {
                subEl.innerText = "Super Admin";
            } else {
                subEl.innerText = window.t("dispatcher");
            }
        }

        const activeSection = document.querySelector(".content-section:not(.hidden)");
        if (activeSection) switchSection(activeSection.id);
    }

    lucide.createIcons();
}

function translateUI() {
    const lang = window.state.language || "en";
    const dict = window.TRANSLATIONS[lang] || window.TRANSLATIONS["en"];
    const fallback = window.TRANSLATIONS["en"] || {};

    const elements = document.querySelectorAll("[data-i18n]");
    elements.forEach(el => {
        const key = el.getAttribute("data-i18n");
        // EN fallback ako ključ nedostaje u odabranom jeziku
        const val = dict[key] || fallback[key];
        if (val) {
            if (key === "saas_version") {
                const ver = (typeof BusCommandConfig !== "undefined" && BusCommandConfig.VERSION)
                    ? BusCommandConfig.VERSION : "9.3.4";
                el.innerText = `BusCommand v${ver}`;
            } else if (key === "trial_badge_login") {
                el.innerText = val.replace("{days}", "30");
            } else if (key === "trial_indicator_text") {
                el.innerHTML = `<i class="lucide-icon" data-lucide="clock"></i> ` + val.replace("{days}", "29");
            } else {
                el.innerText = val;
            }
        }
    });

    // Prevedi placeholdere za input i textarea polja
    const placeholderElements = document.querySelectorAll("[data-i18n-placeholder]");
    placeholderElements.forEach(el => {
        const key = el.getAttribute("data-i18n-placeholder");
        const val = dict[key] || fallback[key];
        if (val) el.setAttribute("placeholder", val);
    });

    // Obnovi template selectove na novom jeziku
    populateTemplateSelect("message-template");
    populateTemplateSelect("message-template-messages");

    const loginScreen = document.getElementById("login-screen");
    if (loginScreen && !loginScreen.classList.contains("hidden")) {
        initializeLoginSelects();
    }
}

function t(key, replacements = {}) {
    const lang = window.state.language || "en";
    let text = (window.TRANSLATIONS[lang] && window.TRANSLATIONS[lang][key])
        || (window.TRANSLATIONS["en"] && window.TRANSLATIONS["en"][key])
        || key;

    Object.keys(replacements).forEach(placeholder => {
        text = text.replace(`{${placeholder}}`, replacements[placeholder]);
    });

    return text;
}

// --- BRENDIRANJE ---
function applyBrandingToUI() {
    const branding = window.state.branding || getBaseState().branding;
    
    document.documentElement.style.setProperty('--primary-color', branding.primaryColor);
    
    const hoverColor = adjustColorBrightness(branding.primaryColor, -20);
    document.documentElement.style.setProperty('--primary-hover', hoverColor);
    
    const rgb = hexToRgb(branding.primaryColor);
    if (rgb) {
        document.documentElement.style.setProperty('--primary-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    }
    
    const brandTitle = document.getElementById("app-branding-title");
    if (brandTitle) brandTitle.innerText = branding.name;
    
    // Dinamički logo u zavisnosti od izabranog brenda
    const loginHeaderLogo = document.getElementById("login-logo-container");
    if (loginHeaderLogo) {
        if (branding.logoUrl) {
            loginHeaderLogo.innerHTML = `
                <div class="custom-brand-logo" style="display:flex; flex-direction:column; align-items:center; justify-content:center; margin-bottom: 1.5rem;">
                    <img src="${branding.logoUrl}" alt="${branding.name}" style="max-height: 60px; max-width: 220px; object-fit: contain; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.3)); border-radius: var(--radius-sm);">
                    <span style="font-weight:700; color:var(--text-main); font-size:1.4rem; margin-top:8px;">${branding.name}</span>
                </div>
            `;
        } else if (branding.name.toLowerCase().includes("blaguss")) {
            loginHeaderLogo.innerHTML = `
                <div class="blaguss-logo-display">
                    <span class="blaguss-brand-text">BLAGUSS</span>
                    <span class="blaguss-subtext">Bringt Sie weiter</span>
                </div>
            `;
        } else {
            loginHeaderLogo.innerHTML = `
                <div class="logo">
                    <i data-lucide="bus"></i>
                    <span>${branding.name}</span>
                </div>
                <p data-i18n="login_subtitle" class="login-subtitle-text">${window.t("login_subtitle")}</p>
            `;
            lucide.createIcons();
        }
    }

    const headerLogoContainer = document.getElementById("header-logo-container");
    if (headerLogoContainer) {
        if (branding.logoUrl) {
            headerLogoContainer.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px;">
                    <img src="${branding.logoUrl}" alt="${branding.name}" style="max-height: 32px; max-width: 110px; object-fit: contain; border-radius: 2px;">
                    <span style="font-weight:700; color:var(--text-main); font-size:1.1rem; letter-spacing:-0.2px;">${branding.name}</span>
                </div>
            `;
        } else if (branding.name.toLowerCase().includes("blaguss")) {
            headerLogoContainer.innerHTML = `
                <div class="blaguss-logo-display header-version">
                    <span class="blaguss-brand-text">BLAGUSS</span>
                </div>
            `;
        } else {
            headerLogoContainer.innerHTML = `
                <div class="logo">
                    <i data-lucide="bus"></i>
                    <span id="app-branding-title">${branding.name}</span>
                </div>
            `;
            lucide.createIcons();
        }
    }

    const brandInput = document.getElementById("settings-brand-name");
    const colorInput = document.getElementById("settings-primary-color");
    const logoInput = document.getElementById("settings-brand-logo");
    const hexLabel = document.getElementById("color-hex-display");
    
    if (brandInput) brandInput.value = branding.name;
    if (colorInput) colorInput.value = branding.primaryColor;
    if (logoInput) logoInput.value = branding.logoUrl || "";
    if (hexLabel) hexLabel.innerText = branding.primaryColor.toUpperCase();
}

function applyBrandingSettings() {
    const nameEl = document.getElementById("settings-brand-name");
    const colorEl = document.getElementById("settings-primary-color");
    const logoEl = document.getElementById("settings-brand-logo");
    if (!nameEl || !colorEl || !logoEl) return;

    const name = nameEl.value.trim();
    const color = colorEl.value;
    const logoUrl = logoEl.value.trim();
    
    if (!name) return;
    
    showConfirm(
        window.t("confirm_apply_branding") || "Apply branding settings?",
        function() {
            window.state.branding = {
                name: name,
                primaryColor: color,
                logoUrl: logoUrl
            };
            saveState();
            applyBrandingToUI();
            showToast(window.t("js_alert_branding_applied"), "success");
            const hint = document.getElementById("ca-branding-first-run");
            if (hint) hint.style.display = "none";
        },
        { danger: false, title: window.t("btn_apply_branding") || "Primeni brendiranje", confirmText: window.t("btn_yes") || "Da" }
    );
}

function adjustColorBrightness(hex, percent) {
    let R = parseInt(hex.substring(1, 3), 16);
    let G = parseInt(hex.substring(3, 5), 16);
    let B = parseInt(hex.substring(5, 7), 16);

    R = parseInt(R * (100 + percent) / 100);
    G = parseInt(G * (100 + percent) / 100);
    B = parseInt(B * (100 + percent) / 100);

    R = (R < 255) ? R : 255;
    G = (G < 255) ? G : 255;
    B = (B < 255) ? B : 255;

    R = (R > 0) ? R : 0;
    G = (G > 0) ? G : 0;
    B = (B > 0) ? B : 0;

    const rHex = R.toString(16).padStart(2, '0');
    const gHex = G.toString(16).padStart(2, '0');
    const bHex = B.toString(16).padStart(2, '0');

    return `#${rHex}${gHex}${bHex}`;
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

const colorPicker = document.getElementById("settings-primary-color");
if (colorPicker) {
    colorPicker.addEventListener("input", (e) => {
        const hexDisplay = document.getElementById("color-hex-display");
        if (hexDisplay) hexDisplay.innerText = e.target.value.toUpperCase();
    });
}
export {
    changeLanguage,
    translateUI,
    t,
    applyBrandingToUI,
    applyBrandingSettings,
    adjustColorBrightness,
    hexToRgb
};
