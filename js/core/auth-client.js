// BusCommand ESM — Auth (email/lozinka + PIN login)
import { staffAuthErrorKey } from "../auth/staff-login-errors.js";

const Auth = (() => {
    let _currentUser = null;
    const _listeners = [];

    function init() {
        if (typeof firebase === "undefined" || !firebase.auth) {
            console.warn("Auth: Firebase Auth SDK nije učitan.");
            return;
        }
        firebase.auth().onAuthStateChanged(async (firebaseUser) => {
            if (firebaseUser) {
                try {
                    const tokenResult = await firebaseUser.getIdTokenResult(true);
                    const claims = tokenResult.claims;
                    _currentUser = {
                        uid: firebaseUser.uid,
                        email: firebaseUser.email || null,
                        name: claims.name || firebaseUser.displayName || firebaseUser.email || "Korisnik",
                        role: normalizeRoleClaim(claims.role || "driver"),
                        companyId: claims.companyId || null,
                        bus: claims.bus || null,
                        permissions: claims.permissions || {},
                        groups: Array.isArray(claims.groups) ? claims.groups : [],
                        mustChangeLoginCode: claims.mustChangeLoginCode === true
                    };
                } catch (err) {
                    console.warn("Auth: ne mogu čitati claims:", err);
                    _currentUser = null;
                }
            } else {
                _currentUser = null;
            }
            _listeners.forEach(fn => fn(_currentUser));
        });
    }

    async function loginWithEmail(email, password) {
        try {
            const credential = await firebase.auth()
                .signInWithEmailAndPassword(email.trim(), password);
            const tokenResult = await credential.user.getIdTokenResult(true);
            const claims = tokenResult.claims;
            return {
                success: true,
                user: {
                    uid: credential.user.uid,
                    email: credential.user.email,
                    name: claims.name || credential.user.displayName || credential.user.email,
                    role: normalizeRoleClaim(claims.role || "dispatcher"),
                    companyId: claims.companyId || null,
                    groups: Array.isArray(claims.groups) ? claims.groups : []
                }
            };
        } catch (err) {
            return {
                success: false,
                code: err.code || "",
                errorKey: staffAuthErrorKey(err.code)
            };
        }
    }

    // One request, one answer: the server resolves the employee id itself and
    // never tells an unauthenticated caller whether that id exists.
    async function loginWithDriverCode({ companyId, eid, loginCode }) {
        if (!companyId || !eid || !loginCode) {
            return { success: false, code: "MISSING_FIELDS" };
        }
        try {
            const response = await fetch("/api/auth/driver-login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ companyId, eid, loginCode })
            });
            let data;
            try {
                data = await response.json();
            } catch {
                return { success: false, code: "SERVER_ERROR" };
            }
            if (!response.ok || !data.success) {
                return {
                    success: false,
                    code: data.code || "INVALID_LOGIN",
                    retryAfterSeconds: Number(data.retryAfterSeconds) || null
                };
            }
            if (!data.token || !data.user?.id) {
                return { success: false, code: "SERVER_ERROR" };
            }
            await firebase.auth().signInWithCustomToken(data.token);
            const user = { id: data.user.id, name: data.user.name, role: "driver", companyId };
            if (data.mustChangeLoginCode) {
                return { success: true, requiresActivation: true, user };
            }
            return { success: true, user };
        } catch (err) {
            console.error("Driver login greška:", err);
            return { success: false, code: "SERVER_ERROR" };
        }
    }

    async function activatePersonalLoginCode(personalLoginCode) {
        if (!personalLoginCode || !firebase.auth().currentUser) return { success: false };
        try {
            const idToken = await firebase.auth().currentUser.getIdToken(true);
            const response = await fetch("/api/auth/driver/activate-personal-code", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ personalLoginCode })
            });
            const data = await response.json();
            if (!response.ok || !data.success || !data.token) return { success: false };
            await firebase.auth().signInWithCustomToken(data.token);
            const tokenResult = await firebase.auth().currentUser.getIdTokenResult(true);
            if (tokenResult.claims.mustChangeLoginCode === true) {
                await firebase.auth().signOut();
                return { success: false };
            }
            return { success: true, user: data.user };
        } catch {
            return { success: false };
        }
    }

    async function logout() {
        try {
            await firebase.auth().signOut();
            _currentUser = null;
        } catch (err) {
            console.warn("Logout greška:", err);
        }
    }

    function getCurrentUser() { return _currentUser; }
    function isLoggedIn() { return _currentUser !== null; }
    function hasRole(role) { return _currentUser && _currentUser.role === role; }
    function hasPermission(perm) {
        return _currentUser && (_currentUser.role === "company_admin" || !!_currentUser.permissions[perm]);
    }

    function onAuthStateChanged(fn) {
        _listeners.push(fn);
        return () => {
            const idx = _listeners.indexOf(fn);
            if (idx > -1) _listeners.splice(idx, 1);
        };
    }

    async function getIdToken() {
        const user = firebase.auth().currentUser;
        if (!user) return null;
        return user.getIdToken();
    }

    function normalizeRoleClaim(role) {
        if (role === "company_admin") return "company-admin";
        return role;
    }

    return {
        init, loginWithEmail, loginWithDriverCode, activatePersonalLoginCode, logout,
        getCurrentUser, isLoggedIn, hasRole, hasPermission,
        onAuthStateChanged, getIdToken
    };
})();

export { Auth };
export default Auth;
