// BusCommand — staff surface app shell (SA / CA / dispatcher)
import { renderCompanyAdminDashboard } from "../admin/company-admin.js";
import { renderSuperAdminDashboard } from "../admin/superadmin.js";
import { checkSOSStatus } from "../maps/sos-siren.js";
import { rejectDispatcherWithoutGroups, clearAllSensitiveAuthFields } from "../auth/login-ui.js";
import { clearUserSession, syncUserSession } from "../auth/login-session.js";
import { switchSection } from "./navigation.js";
import { requestNotificationPermission } from "../maps/gps-track.js";
import { initDispatcherLiveMap } from "../maps/live-map-core.js";
import { t } from "../ui/i18n.js";
import { applyUiLanguagePreference } from "../core/state.js";
import { actionAttr } from "../core/action-delegate.js";
import { canUseDriverOperationalUi } from "../auth/driver-access-gate.js";
import { escapeHtml } from "../core/utils.js";
import { updateTrialBadge } from "../core/license.js";
import { startHeaderConnectionStatus } from "../ui/connection-status.js";
import { sanitizeDispatcherActiveGroups } from "../core/dispatcher-scope.js";

export function showAppLayout() {
    if (!canUseDriverOperationalUi()) return false;
    const role = window.currentUser?.role;
    if (!role || role === "driver") {
        console.warn("[shell-staff] driver role not allowed on staff surface");
        try { window.Auth?.logout?.(); } catch { /* ignore */ }
        clearUserSession();
        clearAllSensitiveAuthFields();
        window.currentUser = null;
        return false;
    }

    // Keep SA/CA/dispatcher UI in sync with language select (buscommand_lang),
    // even when tenant state merges would otherwise reset language to FRESH_STATE "en".
    applyUiLanguagePreference();
    // Phase 3: keep Trial/Demo chips suppressed; show tenant title + connection.
    updateTrialBadge();
    startHeaderConnectionStatus();
    const brandTitle = document.getElementById("app-branding-title");
    if (brandTitle) {
        const tenantName = String(window.state?.branding?.name || "").trim();
        if (tenantName && role !== "superadmin") brandTitle.textContent = tenantName;
    }

    clearAllSensitiveAuthFields();

    document.getElementById("login-screen")?.classList.add("hidden");
    document.getElementById("pre-trip-modal")?.classList.add("hidden");
    document.getElementById("app-container")?.classList.remove("hidden");

    const nameEl = document.getElementById("header-user-name");
    if (nameEl) nameEl.innerText = t(window.currentUser.name);

    const roleBadge = document.getElementById("current-role-badge");
    const driverNav = document.getElementById("driver-nav");
    const dispNav = document.getElementById("dispatcher-nav");
    const saNav = document.getElementById("superadmin-nav");
    const caNav = document.getElementById("company-admin-nav");
    const mobileNav = document.getElementById("mobile-bottom-nav");
    if (mobileNav) mobileNav.classList.add("hidden");
    document.querySelector(".role-selector-container")?.classList.add("hidden");
    driverNav?.classList.add("hidden");

    if (role === "superadmin") {
        const sub = document.getElementById("header-user-sub");
        if (sub) sub.innerText = t("role_superadmin");
        if (roleBadge) roleBadge.innerText = t("role_superadmin");
        dispNav?.classList.add("hidden");
        saNav?.classList.remove("hidden");
        caNav?.classList.add("hidden");
        renderSuperAdminDashboard();
        switchSection("superadmin-dashboard");
    } else if (role === "company-admin") {
        const sub = document.getElementById("header-user-sub");
        if (sub) sub.innerText = t("role_company_admin");
        if (roleBadge) roleBadge.innerText = t("role_company_admin");
        dispNav?.classList.add("hidden");
        saNav?.classList.add("hidden");
        caNav?.classList.remove("hidden");
        renderCompanyAdminDashboard();
        // Lazy onboarding chunk — keeps D17 staff budget under 568 KiB ceiling.
        switchSection("company-admin-dashboard");
        void import("../admin/company-admin-onboarding.js").then((mod) => {
            if (mod.shouldShowCompanyAdminOnboarding()) {
                setTimeout(() => mod.showCompanyAdminOnboarding(), 350);
                return;
            }
            if (!window.state.branding?.name?.trim()) {
                switchSection("company-admin-branding");
            }
        }).catch((err) => {
            console.warn("[shell-staff] CA onboarding chunk failed to load", err);
            if (!window.state.branding?.name?.trim()) {
                switchSection("company-admin-branding");
            }
        });
    } else {
        const disp = window.state.dispatchers.find((d) => d.id === window.currentUser.id);
        if (disp && rejectDispatcherWithoutGroups(disp)) return false;
        // Profile groups win; drop any stale/foreign activeGroupId before painting the header.
        const assignedGroups = Array.isArray(disp?.groups) && disp.groups.length
            ? disp.groups
            : (window.currentUser.groups || []);
        const sanitized = sanitizeDispatcherActiveGroups({
            assignedIds: assignedGroups,
            activeGroupId: window.currentUser.activeGroupId,
            activeGroupHubId: window.state.activeGroupHubId
        });
        window.currentUser.groups = sanitized.assignedIds;
        window.currentUser.activeGroupId = sanitized.activeGroupId;
        window.state.activeGroupHubId = sanitized.activeGroupHubId;
        window.state.activeGroupFilter = sanitized.activeGroupHubId;
        if (!window.currentUser.activeGroupId) {
            rejectDispatcherWithoutGroups(disp || {});
            return false;
        }
        syncUserSession(window.currentUser);

        if (roleBadge) roleBadge.innerText = t("dispatcher");
        const sub = document.getElementById("header-user-sub");
        if (sub) {
            const groupId = escapeHtml(String(window.currentUser.activeGroupId || ""));
            const activeGroup = (window.state.groups || []).find((group) => String(group.id) === String(window.currentUser.activeGroupId));
            const groupName = escapeHtml(String(activeGroup?.name || groupId));
            sub.innerHTML = `${escapeHtml(t("active_group_short") || "Active group")}: ${groupName} <button type="button" ${actionAttr("switchToGroupSetup")} style="background:rgba(255,255,255,0.1); border:none; color:var(--primary-color); border-radius:4px; padding:2px 8px; margin-left:8px; font-size:0.75rem; cursor:pointer;">${escapeHtml(t("btn_switch") || "Switch")}</button>`;
            if (window.currentUser.impersonated) {
                sub.innerHTML += ` <button type="button" ${actionAttr("exitImpersonation")} style="background:var(--danger-color); border:none; color:#fff; border-radius:4px; padding:3px 12px; margin-left:8px; font-size:0.75rem; cursor:pointer; font-weight:600;">${escapeHtml(t("btn_exit_inspect") || "Exit inspect")}</button>`;
                const readOnlyBanner = document.createElement("div");
                readOnlyBanner.id = "readonly-banner";
                readOnlyBanner.setAttribute("role", "status");
                readOnlyBanner.style.cssText = "position:fixed; top:0; left:0; right:0; z-index:10000; background:linear-gradient(90deg, var(--warning-color), #d97706); color:#000; text-align:center; padding:6px 12px; font-size:0.8rem; font-weight:700; letter-spacing:0.5px; font-family:'Outfit',sans-serif;";
                readOnlyBanner.textContent = t("stealth_inspect_banner") || "Stealth inspect mode — read-only";
                document.getElementById("readonly-banner")?.remove();
                document.body.prepend(readOnlyBanner);
            } else {
                document.getElementById("readonly-banner")?.remove();
            }
        }

        dispNav?.classList.remove("hidden");
        saNav?.classList.add("hidden");
        caNav?.classList.add("hidden");
        switchSection("dispatcher-dashboard");
        setTimeout(() => initDispatcherLiveMap(), 300);
        requestNotificationPermission();
    }

    checkSOSStatus();
    import("../dispatcher/help-support.js")
        .then((mod) => mod.syncDispatcherHelpButton())
        .catch(() => {});
    return true;
}
