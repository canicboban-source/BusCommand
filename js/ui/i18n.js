// BusCommand ESM v9.5
import { getBaseState, saveState, resolveUiLanguage, applyUiLanguagePreference } from "../core/state.js";
import { DEFAULT_BRAND_COLOR, normalizeBrandColor, normalizeBrandLogoUrl } from "../admin/company-admin-branding-model.js";
import { populateTemplateSelect } from "../dispatcher/msg-compose.js";
import { initializeLoginSelects } from "../auth/login-selects.js";
import { switchSection } from "../layout/navigation.js";
import { tp } from "./i18n-plural.js";

function changeLanguage(lang) {
    if (!window.TRANSLATIONS[lang]) {
        console.warn("Jezik nije podrzavan:", lang);
        return;
    }
    
    applyUiLanguagePreference(lang);
    saveState();

    translateUI();

    if (window.currentUser) {
        const nameEl = document.getElementById("header-user-name");
        if (nameEl) nameEl.innerText = window.t(window.currentUser.name);

        const roleBadge = document.getElementById("current-role-badge");
        if (roleBadge) {
            const role = window.currentUser.role;
            if (role === "driver") roleBadge.innerText = window.t("driver");
            else if (role === "company-admin") roleBadge.innerText = window.t("role_company_admin");
            else if (role === "superadmin") roleBadge.innerText = window.t("role_superadmin");
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
                subEl.innerText = window.t("role_superadmin");
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
    const lang = resolveUiLanguage();
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
                    ? BusCommandConfig.VERSION : "1.0.1";
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
    document.querySelectorAll("[data-i18n-title]").forEach(el => {
        const key = el.getAttribute("data-i18n-title");
        const val = dict[key] || fallback[key];
        if (val) el.setAttribute("title", val);
    });
    document.querySelectorAll("[data-i18n-aria-label]").forEach(el => {
        const key = el.getAttribute("data-i18n-aria-label");
        const val = dict[key] || fallback[key];
        if (val) el.setAttribute("aria-label", val);
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
    const lang = resolveUiLanguage();
    let text = (window.TRANSLATIONS[lang] && window.TRANSLATIONS[lang][key])
        || (window.TRANSLATIONS["en"] && window.TRANSLATIONS["en"][key])
        || key;

    Object.keys(replacements).forEach(placeholder => {
        text = text.replace(`{${placeholder}}`, replacements[placeholder]);
    });

    return text;
}

// --- BRENDIRANJE ---

function productLogoHtml(name) {
    const n = String(name || "").trim();
    if (!n || /^BusCommand(\s|$)/i.test(n)) {
        return "BusCommand";
    }
    return escapeAttr(n);
}

/** Official BusCommand mark — concept 3D BC monogram (PNG). */
function productBrandMarkHtml({ size = "sm", titleId = null, name = "BusCommand" } = {}) {
    const sizeClass = size === "lg" ? "bc-brand-mark--lg" : "bc-brand-mark--sm";
    const px = size === "lg" ? 48 : 28;
    const titleAttrs = titleId ? ` id="${escapeAttr(titleId)}"` : "";
    return `<div class="logo bc-brand">
        <img class="bc-brand-mark ${sizeClass}" src="/brand/logo-mark.png" width="${px}" height="${px}" alt="">
        <span class="bc-brand-text"${titleAttrs}>${productLogoHtml(name)}</span>
    </div>`;
}

function escapeAttr(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function safeLogoUrl(url) {
    return normalizeBrandLogoUrl(url).value;
}

function applyBrandingToUI() {
    const branding = window.state.branding || getBaseState().branding;
    const safeName = escapeAttr(branding.name || "BusCommand");
    const displayName = branding.name?.startsWith("BusCommand") ? "BusCommand" : (branding.name || "BusCommand");
    const logoUrl = safeLogoUrl(branding.logoUrl);
    
    const primaryColor = normalizeBrandColor(branding.primaryColor) || DEFAULT_BRAND_COLOR;
    document.documentElement.style.setProperty('--primary-color', primaryColor);
    
    const hoverColor = adjustColorBrightness(primaryColor, -20);
    document.documentElement.style.setProperty('--primary-hover', hoverColor);
    
    const rgb = hexToRgb(primaryColor);
    if (rgb) {
        document.documentElement.style.setProperty('--primary-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    }
    
    const brandTitle = document.getElementById("app-branding-title");
    if (brandTitle) brandTitle.innerText = displayName;
    
    // Dinamički logo u zavisnosti od izabranog brenda
    const loginHeaderLogo = document.getElementById("login-logo-container");
    if (loginHeaderLogo) {
        if (logoUrl) {
            loginHeaderLogo.innerHTML = `
                <div class="custom-brand-logo" style="display:flex; flex-direction:column; align-items:center; justify-content:center; margin-bottom: 1.5rem;">
                    <img src="${escapeAttr(logoUrl)}" alt="${safeName}" referrerpolicy="no-referrer" style="max-height: 60px; max-width: 220px; object-fit: contain; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.3)); border-radius: var(--radius-sm);">
                    <span style="font-weight:700; color:var(--text-main); font-size:1.4rem; margin-top:8px;">${safeName}</span>
                </div>
                <div class="bc-product-signature">${productBrandMarkHtml({ size: "sm", name: "BusCommand" })}</div>
            `;
        } else {
            loginHeaderLogo.innerHTML = `
                <div class="logo bc-brand" id="login-logo" data-action="handleLogoClick" style="cursor:default;user-select:none;">
                    <img class="bc-brand-mark bc-brand-mark--hero" src="/brand/logo-hero.png" width="80" height="80" alt="BusCommand">
                    <span class="bc-brand-text">${productLogoHtml(branding.name)}</span>
                </div>
                <p data-i18n="login_subtitle" class="login-subtitle-text">${window.t("login_subtitle")}</p>
            `;
        }
    }

    const headerLogoContainer = document.getElementById("header-logo-container");
    if (headerLogoContainer) {
        if (logoUrl) {
            headerLogoContainer.innerHTML = `
                <div class="bc-co-brand">
                    ${productBrandMarkHtml({ size: "sm", name: "BusCommand" })}
                    <span class="bc-co-brand__separator" aria-hidden="true">·</span>
                    <div class="bc-tenant-brand">
                        <img src="${escapeAttr(logoUrl)}" alt="${safeName}" referrerpolicy="no-referrer">
                        <span id="app-branding-title">${safeName}</span>
                    </div>
                </div>
            `;
        } else {
            headerLogoContainer.innerHTML = productBrandMarkHtml({
                size: "sm",
                titleId: "app-branding-title",
                name: displayName
            });
        }
    }

    const brandInput = document.getElementById("settings-brand-name");
    const colorInput = document.getElementById("settings-primary-color");
    const logoData = document.getElementById("settings-brand-logo-data");
    const hexLabel = document.getElementById("settings-primary-color-hex");
    
    if (brandInput) brandInput.value = branding.name || "";
    if (colorInput) colorInput.value = primaryColor;
    if (logoData && branding.logoUrl) logoData.value = branding.logoUrl;
    if (hexLabel) hexLabel.value = primaryColor;
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

export {
    changeLanguage,
    translateUI,
    t,
    tp,
    applyBrandingToUI,
    adjustColorBrightness,
    hexToRgb
};
