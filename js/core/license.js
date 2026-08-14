// BusCommand ESM v9.5
import ApiClient from "./api-client.js";
import { USE_LOCAL_STATE } from "./runtime-config.js";
import { t } from "../ui/i18n.js";

async function checkCompanyLicense(companyId) {
    if (USE_LOCAL_STATE) {
        window._licenseInfo = {
            companyId,
            status: "active",
            plan: "pro",
            licenseType: "pro",
            licenseStatus: "trial",
            packageLabel: "PRO",
            daysRemaining: 31,
            maxDrivers: 50
        };
        updateTrialBadge();
        return window._licenseInfo;
    }
    if (!companyId || companyId === "buscommand-preview") {
        throw new Error("Confirmed companyId is required for license lookup.");
    }
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
            if (data.status === "suspended" || data.licenseStatus === "suspended") {
                showLicenseBlockedBanner(data);
            }
        }
    } catch (e) {
        console.warn("License check failed:", e);
        return null;
    }
    return window._licenseInfo;
}

function isCompanyAccessBlocked() {
    return !USE_LOCAL_STATE && window._licenseInfo && (
        window._licenseInfo.status === "suspended"
        || window._licenseInfo.licenseStatus === "suspended"
    );
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
    return role === "company-admin";
}

function hasActiveTrialLicense(info = window._licenseInfo) {
    return Boolean(info && (info.licenseStatus === "trial" || info.plan === "trial") && info.daysRemaining != null);
}

function packageLabel(info = window._licenseInfo) {
    if (info?.packageLabel) return String(info.packageLabel).toUpperCase();
    const type = String(info?.licenseType || info?.plan || "PRO").toLowerCase();
    if (type === "starter") return "STARTER";
    if (type === "fleet_master") return "FLEET MASTER";
    if (type === "enterprise") return "ENTERPRISE";
    return "PRO";
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
    if (visible) {
        if (typeof el.removeAttribute === "function") el.removeAttribute("hidden");
    } else if (typeof el.setAttribute === "function") {
        el.setAttribute("hidden", "");
    }
    el.setAttribute("aria-hidden", visible ? "false" : "true");
}

function updateTrialBadge() {
    const loginBadge = document.getElementById("login-trial-badge");
    setBadgeVisible(loginBadge, false);

    const badge = document.getElementById("app-trial-badge");
    if (!badge) return;

    const info = window._licenseInfo;
    const allowed = isTrialBadgeRoleAllowed();
    if (!allowed || !info) {
        setBadgeVisible(badge, false);
        badge.textContent = "";
        badge.classList.remove("is-trial", "is-active", "license-package-badge");
        return;
    }

    const label = packageLabel(info);
    const days = info.daysRemaining;
    const isTrial = info.licenseStatus === "trial"
        || (String(info.plan || "").toLowerCase() === "trial" && days != null);
    const isExpired = info.licenseStatus === "expired";
    const isSuspended = info.licenseStatus === "suspended" || info.status === "suspended";

    // Single authoritative badge: TRIAL = yellow + days; ACTIVE = green + package name.
    let text = label;
    let toneTrial = false;
    if (isSuspended) {
        text = t("license_status_suspended") || "Suspendovan";
        toneTrial = true;
    } else if (isExpired) {
        text = t("sa_status_expired") || "Istekla licenca";
        toneTrial = true;
    } else if (isTrial) {
        const dayCount = days != null ? days : "—";
        text = (t("license_badge_trial_days") || "Probni: {days} dana").replace("{days}", String(dayCount));
        toneTrial = true;
    } else {
        text = label;
        toneTrial = false;
    }

    badge.textContent = text;
    badge.classList.add("license-package-badge");
    badge.classList.toggle("is-trial", toneTrial);
    badge.classList.toggle("is-active", !toneTrial);
    setBadgeVisible(badge, true);
}

export {
    checkCompanyLicense,
    isCompanyAccessBlocked,
    showLicenseBlockedBanner,
    updateTrialBadge,
    isTrialBadgeRoleAllowed,
    hasActiveTrialLicense,
    formatTrialLabel,
    packageLabel
};
