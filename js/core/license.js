// BusCommand ESM v9.5
async function checkCompanyLicense(companyId) {
    if (IS_DEMO_MODE) {
        window._licenseInfo = { status: "active", plan: "trial", daysRemaining: 30 };
        updateTrialBadge();
        return window._licenseInfo;
    }
    try {
        const data = await ApiClient.getLicense(companyId || COMPANY_ID);
        if (data.success) {
            window._licenseInfo = data;
            updateTrialBadge();
            if (data.status === "suspended") showLicenseBlockedBanner(data);
        }
        return window._licenseInfo;
    } catch (e) {
        console.warn("License check failed:", e);
        return null;
    }
}

function isCompanyAccessBlocked() {
    return !IS_DEMO_MODE && window._licenseInfo && window._licenseInfo.status === "suspended";
}

function showLicenseBlockedBanner(info) {
    let banner = document.getElementById("license-blocked-banner");
    if (!banner) {
        banner = document.createElement("div");
        banner.id = "license-blocked-banner";
        banner.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:10001;background:#dc2626;color:#fff;text-align:center;padding:10px;font-size:0.85rem;font-weight:600;font-family:'Outfit',sans-serif;";
        document.body.prepend(banner);
    }
    banner.textContent = "Pristup firmi je suspendovan. Kontaktirajte podršku.";
}

function updateTrialBadge() {
    const badge = document.getElementById("login-trial-badge");
    if (!badge || !window._licenseInfo) return;
    const days = window._licenseInfo.daysRemaining;
    const span = badge.querySelector("span");
    if (span && days != null) {
        span.textContent = (window._licenseInfo.plan === "trial" ? "TRIAL: " : "") + days + " DAYS";
    }
}
export {
    checkCompanyLicense,
    isCompanyAccessBlocked,
    showLicenseBlockedBanner,
    updateTrialBadge
};
