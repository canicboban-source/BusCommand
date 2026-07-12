// BusCommand ESM — Auth (email/lozinka + PIN login)

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
                        permissions: claims.permissions || {}
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
                    companyId: claims.companyId || null
                }
            };
        } catch (err) {
            return { success: false, error: _mapFirebaseError(err.code) };
        }
    }

    async function loginWithPin(companyId, driverId, pin) {
        if (!companyId || !driverId || !pin) {
            return { success: false, error: "Popunite sva polja." };
        }
        try {
            const response = await fetch("/api/auth/driver-login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ companyId, driverId, pin })
            });
            let data;
            try {
                data = await response.json();
            } catch {
                return { success: false, error: "Server greška. Provjerite da li je server pokrenut." };
            }
            if (!response.ok || !data.success) {
                return { success: false, error: data.error || "Greška pri prijavi." };
            }
            if (data.demo || !data.token) {
                return {
                    success: true,
                    user: {
                        id: driverId,
                        name: data.user.name,
                        role: "driver",
                        companyId,
                        bus: data.user.bus
                    }
                };
            }
            await firebase.auth().signInWithCustomToken(data.token);
            return {
                success: true,
                user: {
                    id: driverId,
                    name: data.user.name,
                    role: "driver",
                    companyId,
                    bus: data.user.bus
                }
            };
        } catch (err) {
            console.error("PIN login greška:", err);
            return { success: false, error: "Server greška. Provjerite da li je server pokrenut." };
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

    async function refreshToken() {
        const user = firebase.auth().currentUser;
        if (user) await user.getIdToken(true);
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

    function _mapFirebaseError(code) {
        const map = {
            "auth/user-not-found": "Email adresa nije pronađena.",
            "auth/wrong-password": "Pogrešna lozinka.",
            "auth/invalid-email": "Neispravna email adresa.",
            "auth/user-disabled": "Nalog je deaktiviran. Kontaktirajte administratora.",
            "auth/too-many-requests": "Previše neuspjelih pokušaja. Pokušajte za nekoliko minuta.",
            "auth/network-request-failed": "Bez internet konekcije.",
            "auth/invalid-credential": "Pogrešan email ili lozinka."
        };
        return map[code] || "Greška pri prijavi (" + code + ").";
    }

    return {
        init, loginWithEmail, loginWithPin, logout,
        getCurrentUser, isLoggedIn, hasRole, hasPermission,
        onAuthStateChanged, refreshToken, getIdToken
    };
})();

export { Auth };
export default Auth;
