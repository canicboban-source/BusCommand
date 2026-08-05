// BusCommand ESM v9.5
import Auth from "../core/auth-client.js";
import { showLoginScreen, switchLoginTab, rejectDispatcherWithoutGroups } from "./login-ui.js";
import { persistUserSession, clearUserSession } from "./login-session.js";
import { clearAllSensitiveAuthFields } from "./password-fields.js";
import { normalizeRole } from "../core/access.js";
import { initFirebase, stopFirestoreSync } from "../core/firebase-service.js";
import { checkCompanyLicense, isCompanyAccessBlocked } from "../core/license.js";
import { saveState, clearTenantStateCache, resetInMemoryTenantState } from "../core/state.js";
import { isMobileDevice, showToast } from "../core/utils.js";
import { showAppLayout } from "../layout/shell.js";
import { t, applyBrandingToUI } from "../ui/i18n.js";
import { EXPECTED_FIREBASE_PROJECT_ID } from "../core/firebase-web-config.js";
import { confirmedTenantId } from "../core/production-auth-gate.js";
import { isDriverSurface, isStaffRole } from "../core/app-surface.js";
import { IS_DEMO_MODE } from "../core/runtime-config.js";
import { isHardStaffAuthError, staffAuthErrorKey } from "./staff-login-errors.js";
import { clearDriverSensitiveCaches } from "../driver/offline-snapshot.js";

async function rejectNonStaffFirebaseSession() {
    try { await firebase.auth().signOut(); } catch { /* ignore */ }
    clearUserSession();
    window.currentUser = null;
}

function showDispatcherError(msg) {
    const el = document.getElementById("login-error-dispatcher");
    if (el) { el.textContent = msg; el.classList.remove("hidden"); }
}
function clearDispatcherError() {
    const el = document.getElementById("login-error-dispatcher");
    if (el) el.classList.add("hidden");
}

async function loginAsDispatcher() {
    if (isDriverSurface()) {
        window.location.href = "/staff.html" + window.location.search;
        return;
    }
    // Blokada mobilnih uredjaja
    if (isMobileDevice()) {
        switchLoginTab("dispatcher");
        return;
    }
    if (isCompanyAccessBlocked()) {
        showDispatcherError(t("company_access_blocked"));
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
            const confirmedCompanyId = confirmedTenantId({
                firebaseProjectId: EXPECTED_FIREBASE_PROJECT_ID,
                tokenCompanyId: claims.companyId
            });
            if (!confirmedCompanyId && claims.role !== "superadmin") {
                const error = new Error("Confirmed companyId is missing.");
                error.code = "auth/invalid-company";
                throw error;
            }

            const staffRole = normalizeRole(claims.role);
            if (!isStaffRole(staffRole)) {
                await rejectNonStaffFirebaseSession();
                if (btn) { btn.disabled = false; btn.style.opacity = ""; }
                showDispatcherError(t(staffAuthErrorKey("auth/invalid-credentials")));
                passInput.value = "";
                return;
            }

            window.currentUser = {
                uid:       credential.user.uid,
                email:     credential.user.email,
                name:      claims.name || credential.user.displayName || credential.user.email || "Korisnik",
                role:      staffRole,
                companyId: confirmedCompanyId,
                id:        credential.user.uid,
                groups:    Array.isArray(claims.groups) ? claims.groups : [],
                activeGroupId: Array.isArray(claims.groups) ? claims.groups[0] : null
            };

            // Super Admin has no tenant — skip license + Firestore (would throw on null companyId).
            if (window.currentUser.role === "superadmin") {
                persistUserSession(window.currentUser);
                if (btn) { btn.disabled = false; btn.style.opacity = ""; }
                passInput.value = "";
                showAppLayout();
                return;
            }

            await checkCompanyLicense(confirmedCompanyId);
            if (isCompanyAccessBlocked()) {
                await rejectNonStaffFirebaseSession();
                if (btn) { btn.disabled = false; btn.style.opacity = ""; }
                showDispatcherError(
                    t("company_access_blocked")
                    || t("license_suspended_banner")
                    || "Company access is suspended."
                );
                passInput.value = "";
                return;
            }
            await initFirebase(confirmedCompanyId);
            persistUserSession(window.currentUser);
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

            const code = err?.code || "";
            // Always surface hard/credential failures (never silent). Same message for
            // user-not-found and wrong-password to prevent user-enumeration.
            if (isHardStaffAuthError(code) || !IS_DEMO_MODE) {
                showDispatcherError(t(staffAuthErrorKey(code)));
                passInput.value = "";
                return;
            }
            // Demo only: non-auth failures (e.g. network) may try local users below.
        }
    }

    // FALLBACK: lokalni login (samo demo mod)
    if (!IS_DEMO_MODE) {
        showDispatcherError(t("error_invalid_credentials"));
        passInput.value = "";
        return;
    }

    const companyAdmin = (window.state.companyAdmins || []).find(ca => ca.email === email);
    const disp = (window.state.dispatchers || []).find(d => d.email === email);
    const localFound = companyAdmin || disp;

    if (!localFound) {
        showDispatcherError(t("error_invalid_credentials"));
        passInput.value = "";
        return;
    }

    if (!localFound.password || localFound.password !== password) {
        passInput.value = "";
        showDispatcherError(t("error_invalid_credentials"));
        return;
    }

    // Company Admin
    if (companyAdmin) {
        window.currentUser = {
            role: "company-admin",
            name: companyAdmin.name,
            id: companyAdmin.id,
            email: companyAdmin.email,
            companyId: companyAdmin.companyId || companyAdmin.id
        };
        persistUserSession(window.currentUser);
        showAppLayout();
        return;
    }

    // Dispatcher
    if (disp.id === "superadmin") {
        window.currentUser = { role: "superadmin", name: "Super Admin", id: "superadmin" };
    } else {
        if (disp.active === false) {
            passInput.value = "";
            showDispatcherError(t("error_account_disabled") || "This account has been disabled.");
            return;
        }
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
                showToast(t("password_reset_generic") || t("password_reset_sent"), "success", 6000);
            })
            .catch(() => {
                // Same UX whether the account exists or not (no user-enumeration).
                clearDispatcherError();
                showToast(t("password_reset_generic") || t("password_reset_sent"), "success", 6000);
            });
    } else {
        showToast(t("contact_admin") || "Contact your administrator to reset your password.", "info");
    }
}

function logout() {
    const companyId = window.currentUser?.companyId || null;
    const wasDriver = window.currentUser?.role === "driver";
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
    clearTenantStateCache(companyId);
    if (wasDriver) {
        clearDriverSensitiveCaches().catch(() => {});
    }
    resetInMemoryTenantState();
    applyBrandingToUI();
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
