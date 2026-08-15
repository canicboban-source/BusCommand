// BusCommand — driver surface app shell
import { updateAvatarUI } from "../driver/avatar.js";
import { checkSOSStatus } from "../maps/sos-siren.js";
import { bindSosHoldControl } from "../driver/dashboard.js";
import { clearAllSensitiveAuthFields } from "../auth/login-ui.js";
import { switchSection } from "./navigation.js";
import { showPreTripModal } from "./pretrip.js";
import { startDriverGpsTracking } from "../maps/gps-track.js";
import { isDriverWorkSessionActive, startDriverWorkSessionGuard, driverLiveGpsEnabled } from "../driver/work-session.js";
import { startDriverNetworkStatus } from "../driver/network-status.js";
import { t } from "../ui/i18n.js";
import { applyUiLanguagePreference } from "../core/state.js";
import { canUseDriverOperationalUi } from "../auth/driver-access-gate.js";
import { updateTrialBadge } from "../core/license.js";

export function showAppLayout() {
    if (!canUseDriverOperationalUi()) return false;
    if (window.currentUser?.role !== "driver") {
        console.warn("[shell-driver] expected driver role");
        return false;
    }

    applyUiLanguagePreference();
    updateTrialBadge();

    if (!sessionStorage.getItem("buscommand_pretrip_done")) {
        clearAllSensitiveAuthFields();
        showPreTripModal();
        return false;
    }

    clearAllSensitiveAuthFields();

    document.getElementById("login-screen")?.classList.add("hidden");
    document.getElementById("pre-trip-modal")?.classList.add("hidden");
    document.getElementById("app-container")?.classList.remove("hidden");

    const nameEl = document.getElementById("header-user-name");
    if (nameEl) nameEl.innerText = t(window.currentUser.name);
    updateAvatarUI();

    const roleBadge = document.getElementById("current-role-badge");
    if (roleBadge) roleBadge.innerText = t("driver");

    const sub = document.getElementById("header-user-sub");
    if (sub) sub.innerText = `${t("vehicle")} ${window.currentUser.bus || ""}`;

    document.getElementById("driver-nav")?.classList.remove("hidden");
    document.getElementById("dispatcher-nav")?.classList.add("hidden");
    document.getElementById("superadmin-nav")?.classList.add("hidden");
    document.getElementById("company-admin-nav")?.classList.add("hidden");

    const mobileNav = document.getElementById("mobile-bottom-nav");
    if (mobileNav) {
        mobileNav.classList.remove("hidden");
        mobileNav.style.display = "flex";
    }

    // Hide demo role toggle on driver surface
    document.querySelector(".role-selector-container")?.classList.add("hidden");

    startDriverWorkSessionGuard();
    startDriverNetworkStatus();
    // GPS only when tenant flag is ON and session is active (§13 / O2).
    if (isDriverWorkSessionActive() && driverLiveGpsEnabled()) {
        startDriverGpsTracking();
    }
    switchSection("driver-dashboard");
    checkSOSStatus();
    bindSosHoldControl();
    return true;
}
