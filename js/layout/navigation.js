// BusCommand — thin section switcher (handlers registered per surface)
import { clearAllPasswordFields } from "../auth/password-fields.js";
import { isSessionValid } from "../auth/login-session.js";
import { showLoginScreen } from "../auth/login-ui.js";
import { translateUI, t } from "../ui/i18n.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import { canOpenSection } from "../core/ui-permissions.js";
import { showToast } from "../core/utils.js";
import { canUseDriverOperationalUi } from "../auth/driver-access-gate.js";
import { checkSOSStatus } from "../maps/sos-siren.js";
import { runSectionHandler } from "./section-registry.js";

function switchSection(sectionId) {
    if (!canUseDriverOperationalUi()) return false;
    if (window.currentUser && !isSessionValid()) {
        window.currentUser = null;
        showLoginScreen(true);
        return false;
    }

    if (!window.currentUser || !canOpenSection(window.currentUser.role, sectionId, USE_LOCAL_STATE)) {
        showToast(t("error_access_denied"), "error");
        return false;
    }

    clearAllPasswordFields();

    document.querySelectorAll(".content-section").forEach((sec) => sec.classList.add("hidden"));
    const target = document.getElementById(sectionId);
    if (target) target.classList.remove("hidden");

    translateUI();

    document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
    const targetLink = Array.from(document.querySelectorAll(".nav-item")).find((item) => {
        if (item.dataset.action !== "switchSection") return false;
        const args = item.dataset.actionArgs || "";
        return args.includes(`"${sectionId}"`) || args.includes(`'${sectionId}'`);
    });
    if (targetLink) targetLink.classList.add("active");

    const mobMap = {
        "driver-dashboard": "mobnav-dashboard",
        "driver-calendar": "mobnav-calendar",
        "driver-reports": "mobnav-reports",
        "driver-vacation": "mobnav-vacation"
    };
    document.querySelectorAll(".mob-nav-btn").forEach((btn) => {
        if (!btn.classList.contains("mob-nav-sos")) btn.classList.remove("active");
    });
    if (mobMap[sectionId]) {
        document.getElementById(mobMap[sectionId])?.classList.add("active");
    }

    runSectionHandler(sectionId);
    checkSOSStatus();
    if (typeof lucide !== "undefined") lucide.createIcons();
    return true;
}

export { switchSection };
