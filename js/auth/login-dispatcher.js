// BusCommand ESM v9.5
import Auth from "../core/auth-client.js";
import { showLoginScreen, switchLoginTab, rejectDispatcherWithoutGroups } from "./login-ui.js";
import { persistUserSession, clearUserSession } from "./login-session.js";
import { clearAllSensitiveAuthFields } from "./password-fields.js";
import { normalizeRole } from "../core/access.js";
import { initFirebase, stopFirestoreSync } from "../core/firebase-service.js";
import { isCompanyAccessBlocked } from "../core/license.js";
import { saveState } from "../core/state.js";
import { isMobileDevice, showToast } from "../core/utils.js";
import { showAppLayout } from "../layout/shell.js";
import { t } from "../ui/i18n.js";

function showDispatcherError(msg) {
    const el = document.getElementById("login-error-dispatcher");
    if (el) { el.textContent = msg; el.classList.remove("hidden"); }
}
function clearDispatcherError() {
    const el = document.getElementById("login-error-dispatcher");
    if (el) el.classList.add("hidden");
}

async function loginAsDispatcher() {
    // Blokada mobilnih uređaja
    if (isMobileDevice()) {
        switchLoginTab("dispatcher");
        return;
    }
    if (isCompanyAccessBlocked()) {
        showDispatcherError("Pristup firmi je suspendovan.");
        return;
    }

    const emailInput = document.getElementById("login-dispatcher-email");
    const passInput  = document.getElementById("login-dispatcher-password");

    if (!emailInput || !passInput) return;
    clearDispatcherError();

    const email    = emailInput.value.trim();
    const password = passInput.value;

    if (!email || !password) {
        showDispatcherError(t("error_fill_all_fields") || "Please enter email and password.");
        return;
    }

    // Lokalni korisnici — samo u demo modu
    const allLocalUsers = IS_DEMO_MODE
        ? [...(window.state.companyAdmins || []), ...(window.state.dispatchers || [])]
        : [];
    const localUser = allLocalUsers.find(d => d.email === email);
    const emailIsReal = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    // Firebase auth — produkcija ili nepoznati korisnik u demo modu
    if ((!IS_DEMO_MODE || (emailIsReal && !localUser)) && typeof firebase !== "undefined" && firebase.auth) {
        try {
            const btn = document.getElementById("dispatcher-login-btn");
            if (btn) { btn.disabled = true; btn.style.opacity = "0.6"; }

            const credential = await firebase.auth().signInWithEmailAndPassword(email, password);
            const tokenResult = await credential.user.getIdTokenResult(true);
            const claims = tokenResult.claims;

            window.currentUser = {
                uid:       credential.user.uid,
                email:     credential.user.email,
                name:      claims.name || credential.user.displayName || credential.user.email || "Korisnik",
                role:      normalizeRole(claims.role || "dispatcher"),
                companyId: claims.companyId || COMPANY_ID,
                id:        credential.user.uid,
                activeGroupId: claims.groups ? claims.groups[0] : null
            };

            persistUserSession(window.currentUser);
            await initFirebase(window.currentUser.companyId || COMPANY_ID);
            if (btn) { btn.disabled = false; btn.style.opacity = ""; }
            if (window.currentUser.role === "dispatcher") {
                const disp = (window.state.dispatchers || []).find(d => d.id === window.currentUser.id);
                if (rejectDispatcherWithoutGroups(disp)) {
                    passInput.value = "";
                    return;
                }
            }
            passInput.value = "";
            showAppLayout();
            return;
        } catch (err) {
            const btn = document.getElementById("dispatcher-login-btn");
            if (btn) { btn.disabled = false; btn.style.opacity = ""; }
            // Hard greške — ne probaj lokalni fallback
            const hardErrors = ["auth/user-not-found","auth/wrong-password","auth/invalid-credential","auth/too-many-requests","auth/user-disabled"];
            if (hardErrors.includes(err.code)) {
                const msgs = {
                    "auth/user-not-found":     t("error_user_not_found")    || "No account found with this email.",
                    "auth/wrong-password":     t("error_wrong_password")    || "Incorrect password.",
                    "auth/invalid-credential": t("error_wrong_password")    || "Incorrect email or password.",
                    "auth/too-many-requests":  t("error_too_many_requests") || "Too many failed attempts. Try again later.",
                    "auth/user-disabled":      t("error_account_disabled")  || "This account has been disabled."
                };
                showDispatcherError(msgs[err.code]);
                passInput.value = "";
                return;
            }
            // Sve ostale greške (network, invalid-email...) → probaj lokalni login
        }
    }

    // ── FALLBACK: lokalni login (samo demo mod) ─────────────────────────────
    if (!IS_DEMO_MODE) {
        showDispatcherError(t("error_user_not_found") || "No account found with this email.");
        return;
    }

    const companyAdmin = (window.state.companyAdmins || []).find(ca => ca.email === email);
    const disp = (window.state.dispatchers || []).find(d => d.email === email);
    const localFound = companyAdmin || disp;

    if (!localFound) {
        showDispatcherError(t("error_user_not_found") || "No account found with this email.");
        return;
    }

    if (localFound.password && localFound.password !== password) {
        passInput.value = "";
        showDispatcherError(t("error_wrong_password") || "Incorrect password.");
        return;
    }

    // ── Company Admin ──
    if (companyAdmin) {
        window.currentUser = {
            role: "company-admin",
            name: companyAdmin.name,
            id: companyAdmin.id,
            email: companyAdmin.email,
            companyId: companyAdmin.companyId || companyAdmin.id
        };
        persistUserSession(window.currentUser);
        if (!IS_DEMO_MODE && true) {
            initFirebase(window.currentUser.companyId || COMPANY_ID);
        }
        showAppLayout();
        return;
    }

    // ── Dispatcher ──
    if (disp.id === "superadmin") {
        window.currentUser = { role: "superadmin", name: "Super Admin", id: "superadmin" };
    } else {
        if (!disp.passwordChanged) {
            clearAllSensitiveAuthFields();
            document.getElementById("login-screen").classList.add("hidden");
            document.getElementById("dispatcher-password-setup-view").classList.remove("hidden");
            document.getElementById("setup-dispatcher-id").value = disp.id;
            document.getElementById("setup-new-pin").value = "";
            document.getElementById("setup-confirm-pin").value = "";
            return;
        }
        window.currentUser = {
            role: "dispatcher",
            name: disp.name,
            id: disp.id,
            email: disp.email,
            companyId: disp.companyId || null,
            activeGroupId: disp.activeGroupId || (disp.groups && disp.groups.length > 0 ? disp.groups[0] : null)
        };
    }

    if (window.currentUser.role === "dispatcher" && rejectDispatcherWithoutGroups(disp)) {
        passInput.value = "";
        return;
    }

    passInput.value = "";
    persistUserSession(window.currentUser);
    showAppLayout();
}

function forgotDispatcherPassword() {
    const email = document.getElementById("login-dispatcher-email")?.value?.trim();
    if (typeof firebase !== "undefined" && firebase.auth) {
        if (!email) {
            showDispatcherError(t("error_enter_email") || "Please enter your email address first.");
            return;
        }
        firebase.auth().sendPasswordResetEmail(email)
            .then(() => {
                clearDispatcherError();
                showToast(t("password_reset_sent") || "Password reset email sent. Check your inbox.", "success", 6000);
            })
            .catch(err => {
                showDispatcherError(err.code === "auth/user-not-found"
                    ? (t("error_user_not_found") || "No account found with this email.")
                    : err.message);
            });
    } else {
        showToast(t("contact_admin") || "Contact your administrator to reset your password.", "info");
    }
}

function logout() {
    if (window.currentUser && window.currentUser.role === "driver") {
        const driver = window.state.drivers.find(d => d.name === window.currentUser.name || d.id === window.currentUser.id);
        if (driver) {
            driver.active = false;
            driver.preTripDone = false;
            saveState();
        }
    }
    if (!IS_DEMO_MODE) {
        Auth.logout();
    }
    stopFirestoreSync();
    window.currentUser = null;
    clearUserSession();
    window.currentCalendarMonth = new Date().toISOString().slice(0, 7);
    showLoginScreen(true);
}
export {
    showDispatcherError,
    clearDispatcherError,
    loginAsDispatcher,
    forgotDispatcherPassword,
    logout
};
