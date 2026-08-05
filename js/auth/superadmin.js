// BusCommand ESM v9.5
import Auth from "../core/auth-client.js";
import { IS_DEMO_MODE } from "../core/runtime-config.js";
import { persistUserSession } from "./login-session.js";
import { clearAuthSetupFields } from "./password-fields.js";
import { showAppLayout } from "../layout/shell.js";
import { t } from "../ui/i18n.js";

function isLocalSuperAdminAccount(user) {
    if (!user) return false;
    return user.id === "superadmin"
        || user.isSuperAdmin === true
        || user.role === "superadmin";
}

/** Demo-only: authenticate SA from local seed (same store as staff login form). */
function tryDemoSuperAdminLogin(email, password, errEl) {
    if (!IS_DEMO_MODE) return false;
    const localUsers = [
        ...(window.state?.companyAdmins || []),
        ...(window.state?.dispatchers || [])
    ];
    const found = localUsers.find((u) => u?.email === email);
    if (!found) return false;

    if (!found.password || found.password !== password) {
        if (errEl) errEl.textContent = t("error_invalid_credentials");
        return true;
    }
    if (!isLocalSuperAdminAccount(found)) {
        if (errEl) errEl.textContent = t("sa_err_not_superadmin");
        return true;
    }

    closeSuperAdminModal();
    window.currentUser = {
        role: "superadmin",
        name: found.name || "Super Admin",
        id: found.id || "superadmin",
        email: found.email || email
    };
    persistUserSession(window.currentUser);
    showAppLayout();
    return true;
}

function handleLogoClick() {
    window._saClickCount = (window._saClickCount || 0) + 1;
    clearTimeout(window._saClickTimer);
    if (window._saClickCount >= 5) {
        window._saClickCount = 0;
        openSuperAdminModal();
    } else {
        window._saClickTimer = setTimeout(() => { window._saClickCount = 0; }, 2000);
    }
}

function setSaFieldVisibility(el, visible) {
    if (!el) return;
    el.classList.toggle("hidden", !visible);
    el.style.display = visible ? "" : "none";
    el.setAttribute("aria-hidden", visible ? "false" : "true");
}

function openSuperAdminModal() {
    const modal = document.getElementById("superadmin-pin-modal");
    const input = document.getElementById("superadmin-pin-input");
    const err = document.getElementById("superadmin-pin-error");
    const demoFields = document.getElementById("superadmin-demo-fields");
    const prodFields = document.getElementById("superadmin-prod-fields");
    if (!modal) return;
    if (err) err.textContent = "";

    // Always email+password (real staff credentials). Demo PIN UI stays hidden.
    setSaFieldVisibility(demoFields, false);
    setSaFieldVisibility(prodFields, true);

    if (input) input.value = "";
    const emailIn = document.getElementById("superadmin-email-input");
    const passIn = document.getElementById("superadmin-pass-input");
    if (emailIn) emailIn.value = "";
    if (passIn) passIn.value = "";

    modal.classList.remove("hidden");
    modal.style.display = "flex";
    modal.removeAttribute("aria-hidden");

    setTimeout(() => {
        const emailInput = document.getElementById("superadmin-email-input");
        if (emailInput) emailInput.focus();
        else if (emailIn) emailIn.focus();
    }, 100);
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function closeSuperAdminModal() {
    const modal = document.getElementById("superadmin-pin-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.style.display = "none";
        modal.setAttribute("aria-hidden", "true");
    }
    clearAuthSetupFields();
}

async function confirmSuperAdminPin() {
    const err = document.getElementById("superadmin-pin-error");

    const email = document.getElementById("superadmin-email-input")?.value?.trim();
    const pass = document.getElementById("superadmin-pass-input")?.value;
    if (!email || !pass) {
        if (err) err.textContent = t("sa_err_enter_credentials");
        return;
    }

    // Local demo seed first — logo modal must match staff-form SA login.
    if (tryDemoSuperAdminLogin(email, pass, err)) return;

    try {
        const result = await Auth.loginWithEmail(email, pass);
        if (!result.success) {
            if (err) err.textContent = t(result.errorKey || "error_invalid_credentials");
            return;
        }
        if (result.user.role !== "superadmin") {
            await Auth.logout();
            if (err) err.textContent = t("sa_err_not_superadmin");
            return;
        }
        closeSuperAdminModal();
        window.currentUser = { ...result.user, role: "superadmin", id: result.user.uid };
        persistUserSession(window.currentUser);
        showAppLayout();
    } catch {
        if (err) err.textContent = t("sa_err_login_failed");
    }
}

export {
    handleLogoClick,
    openSuperAdminModal,
    closeSuperAdminModal,
    confirmSuperAdminPin
};
