// BusCommand ESM v9.5
import Auth from "../core/auth-client.js";
import { logout } from "./login-dispatcher.js";
import { persistUserSession } from "./login-session.js";
import { clearAuthSetupFields } from "./password-fields.js";
import { showAppLayout } from "../layout/shell.js";

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

function openSuperAdminModal() {
    const modal = document.getElementById("superadmin-pin-modal");
    const input = document.getElementById("superadmin-pin-input");
    const err   = document.getElementById("superadmin-pin-error");
    const demoFields = document.getElementById("superadmin-demo-fields");
    const prodFields = document.getElementById("superadmin-prod-fields");
    if (!modal) return;
    if (err) err.textContent = "";
    if (demoFields) demoFields.classList.toggle("hidden", !IS_DEMO_MODE);
    if (prodFields) prodFields.classList.toggle("hidden", IS_DEMO_MODE);
    if (input) { input.value = ""; }
    const emailIn = document.getElementById("superadmin-email-input");
    const passIn  = document.getElementById("superadmin-pass-input");
    if (emailIn) emailIn.value = "";
    if (passIn)  passIn.value = "";
    modal.classList.remove("hidden");
    setTimeout(() => {
        if (IS_DEMO_MODE && input) input.focus();
        else if (emailIn) emailIn.focus();
    }, 100);
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function closeSuperAdminModal() {
    const modal = document.getElementById("superadmin-pin-modal");
    if (modal) modal.classList.add("hidden");
    clearAuthSetupFields();
}

async function confirmSuperAdminPin() {
    const err = document.getElementById("superadmin-pin-error");

    if (IS_DEMO_MODE) {
        const input = document.getElementById("superadmin-pin-input");
        const pin   = input ? input.value.trim() : "";
        if (pin === BusCommandConfig.DEMO_SA_PIN) {
            closeSuperAdminModal();
            window.currentUser = { role: "superadmin", name: "Super Admin", id: "superadmin", isDemo: true };
            persistUserSession(window.currentUser);
            showAppLayout();
        } else {
            if (err) err.textContent = "Incorrect PIN";
            if (input) { input.value = ""; input.focus(); }
        }
        return;
    }

    // Produkcija — Firebase email + lozinka
    const email = document.getElementById("superadmin-email-input")?.value?.trim();
    const pass  = document.getElementById("superadmin-pass-input")?.value;
    if (!email || !pass) {
        if (err) err.textContent = "Unesite email i lozinku.";
        return;
    }
    try {
        const result = await Auth.loginWithEmail(email, pass);
        if (!result.success) {
            if (err) err.textContent = result.error;
            return;
        }
        if (result.user.role !== "superadmin") {
            await Auth.logout();
            if (err) err.textContent = "Nemate Super Admin pristup.";
            return;
        }
        closeSuperAdminModal();
        window.currentUser = { ...result.user, role: "superadmin", id: result.user.uid };
        persistUserSession(window.currentUser);
        showAppLayout();
    } catch (e) {
        if (err) err.textContent = "Greška pri prijavi.";
    }
}
export {
    handleLogoClick,
    openSuperAdminModal,
    closeSuperAdminModal,
    confirmSuperAdminPin
};
