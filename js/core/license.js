// BusCommand ESM v9.5
import ApiClient from "./api-client.js";
import { IS_DEMO_MODE } from "./runtime-config.js";
import { t } from "../ui/i18n.js";

async function checkCompanyLicense(companyId) {
    if (IS_DEMO_MODE) {
        window._licenseInfo = { companyId, status: "active", plan: "trial", daysRemaining: 30 };
        updateTrialBadge();
        return window._licenseInfo;
    }
    if (!companyId || companyId === "buscommand-preview") {
        throw new Error("Confirmed companyId is required for license lookup.");
    }
    // Never allow license calls for a tenant other than the authenticated session.
    const sessionCompanyId = window.currentUser?.companyId;
    if (sessionCompanyId && sessionCompanyId !== companyId) {
        console.warn("License lookup blocked: companyId does not match authenticated session.", {
            requested: companyId,
            session: sessionCompanyId
        });
        return null;
    }
    try {
        const data = await ApiClient.getLicense(companyId);
        if (data.success) {
            window._licenseInfo = { ...data, companyId };
            updateTrialBadge();
            if (data.status === "suspended") showLicenseBlockedBanner(data);
        }
    } catch (e) {
        console.warn("License check failed:", e);
        return null;
    }
    return window._licenseInfo;
}

function isCompanyAccessBlocked() {
    return !IS_DEMO_MODE && window._licenseInfo && window._licenseInfo.status === "suspended";
}

function showLicenseBlockedBanner(_info) {
    let banner = document.getElementById("license-blocked-banner");
    if (!banner) {
        banner = document.createElement("div");
        banner.id = "license-blocked-banner";
        banner.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:10001;background:#dc2626;color:#fff;text-align:center;padding:10px;font-size:0.85rem;font-weight:600;font-family:'Outfit',sans-serif;";
        document.body.prepend(banner);
    }
    banner.textContent = t("license_suspended_banner");
}

/** Platform owner has no company trial — never show countdown to Super Admin. */
function isTrialBadgeRoleAllowed(role = window.currentUser?.role) {
    return role !== "superadmin";
}

function hasActiveTrialLicense(info = window._licenseInfo) {
    return Boolean(info && info.plan === "trial" && info.daysRemaining != null);
}

function formatTrialLabel(days, forLogin) {
    const key = forLogin ? "js_trial_remaining_login" : "js_trial_remaining";
    if (typeof window.t === "function") {
        const translated = window.t(key, { days });
        if (translated && translated !== key) return translated;
    }
    return forLogin ? `TRIAL: ${days} DAYS` : `Trial period: ${days} days remaining`;
}

function setBadgeVisible(el, visible) {
    if (!el) return;
    el.classList.toggle("hidden", !visible);
    el.setAttribute("aria-hidden", visible ? "false" : "true");
}

function updateTrialBadge() {
    const info = window._licenseInfo;
    const role = window.currentUser?.role;
    const allowRole = isTrialBadgeRoleAllowed(role);
    const onTrial = hasActiveTrialLicense(info);
    const days = info?.daysRemaining;

    // Login-screen badge: demo / pre-auth only when trial info exists and role is not SA.
    const loginBadge = document.getElementById("login-trial-badge");
    if (loginBadge) {
        const showLogin = allowRole && onTrial;
        if (showLogin) {
            const span = loginBadge.querySelector("span");
            if (span) span.textContent = formatTrialLabel(days, true);
        }
        setBadgeVisible(loginBadge, showLogin);
    }

    // In-app header badge: only for tenant roles on an active trial plan.
    const appBadge = document.getElementById("app-trial-badge");
    if (appBadge) {
        const showApp = Boolean(role) && allowRole && onTrial;
        if (showApp) {
            const span = appBadge.querySelector("span") || appBadge;
            span.textContent = formatTrialLabel(days, false);
        }
        setBadgeVisible(appBadge, showApp);
    }
}

export {
    checkCompanyLicense,
    isCompanyAccessBlocked,
    showLicenseBlockedBanner,
    updateTrialBadge,
    isTrialBadgeRoleAllowed,
    hasActiveTrialLicense
};
