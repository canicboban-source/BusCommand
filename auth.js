// ============================================================
// FleetPulse — AUTH MODULE
// Email/lozinka za dispečere i admine, PIN za vozače
// ============================================================

const Auth = (() => {

  let _currentUser = null;
  const _listeners = [];

  // ─── INIT ─────────────────────────────────────────────────
  // Pozovi jednom na DOMContentLoaded — prati Firebase Auth stanje

  function init() {
    firebase.auth().onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Uzmi custom claims (role, companyId) iz ID tokena
          const tokenResult = await firebaseUser.getIdTokenResult(true);
          const claims = tokenResult.claims;

          _currentUser = {
            uid:       firebaseUser.uid,
            email:     firebaseUser.email || null,
            name:      claims.name || firebaseUser.displayName || firebaseUser.email || "Korisnik",
            role:      claims.role || "driver",
            companyId: claims.companyId || null,
            bus:       claims.bus || null,
            permissions: claims.permissions || {}
          };

        } catch (err) {
          console.warn("Auth: ne mogu čitati claims:", err);
          _currentUser = null;
        }
      } else {
        _currentUser = null;
      }

      // Obavijesti sve listenere o promjeni
      _listeners.forEach(fn => fn(_currentUser));
    });
  }

  // ─── EMAIL / LOZINKA LOGIN ─────────────────────────────────
  // Za: Dispatcher, CompanyAdmin

  async function loginWithEmail(email, password) {
    try {
      const credential = await firebase.auth()
        .signInWithEmailAndPassword(email.trim(), password);

      const tokenResult = await credential.user.getIdTokenResult(true);
      const claims = tokenResult.claims;

      return {
        success: true,
        user: {
          uid:       credential.user.uid,
          email:     credential.user.email,
          name:      claims.name || credential.user.displayName || credential.user.email,
          role:      claims.role || "dispatcher",
          companyId: claims.companyId || null
        }
      };

    } catch (err) {
      return { success: false, error: _mapFirebaseError(err.code) };
    }
  }

  // ─── PIN LOGIN ─────────────────────────────────────────────
  // Za: Driver
  // Šalje PIN na backend API koji provjerava hash i vraća Firebase custom token

  async function loginWithPin(companyId, driverId, pin) {
    if (!companyId || !driverId || !pin) {
      return { success: false, error: "Popunite sva polja." };
    }

    try {
      const response = await fetch("/api/auth/driver-login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ companyId, driverId, pin })
      });

      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }

      const data = await response.json();

      if (!data.success) {
        return { success: false, error: data.error || "Greška pri prijavi." };
      }

      // Prijavi se pomoću Firebase custom tokena koji je generisao backend
      await firebase.auth().signInWithCustomToken(data.token);

      return {
        success: true,
        user: {
          id:        driverId,
          name:      data.user.name,
          role:      "driver",
          companyId: companyId,
          bus:       data.user.bus
        }
      };

    } catch (err) {
      console.error("PIN login greška:", err);
      return { success: false, error: "Server greška. Provjerite da li je server pokrenut." };
    }
  }

  // ─── LOGOUT ───────────────────────────────────────────────

  async function logout() {
    try {
      await firebase.auth().signOut();
      _currentUser = null;
    } catch (err) {
      console.warn("Logout greška:", err);
    }
  }

  // ─── GETTERS ──────────────────────────────────────────────

  function getCurrentUser() {
    return _currentUser;
  }

  function isLoggedIn() {
    return _currentUser !== null;
  }

  function hasRole(role) {
    return _currentUser && _currentUser.role === role;
  }

  function hasPermission(perm) {
    return _currentUser && (_currentUser.role === "company_admin" || !!_currentUser.permissions[perm]);
  }

  // ─── AUTH STATE LISTENER ───────────────────────────────────
  // Vrati unsubscribe funkciju

  function onAuthStateChanged(fn) {
    _listeners.push(fn);
    return () => {
      const idx = _listeners.indexOf(fn);
      if (idx > -1) _listeners.splice(idx, 1);
    };
  }

  // ─── REFRESH TOKEN ─────────────────────────────────────────
  // Korisno kad SuperAdmin mijenja role/plan — forsira refresh claims

  async function refreshToken() {
    const user = firebase.auth().currentUser;
    if (user) {
      await user.getIdToken(true);
    }
  }

  // ─── PRIVATE ──────────────────────────────────────────────

  function _mapFirebaseError(code) {
    const map = {
      "auth/user-not-found":        "Email adresa nije pronađena.",
      "auth/wrong-password":        "Pogrešna lozinka.",
      "auth/invalid-email":         "Neispravna email adresa.",
      "auth/user-disabled":         "Nalog je deaktiviran. Kontaktirajte administratora.",
      "auth/too-many-requests":     "Previše neuspjelih pokušaja. Pokušajte za nekoliko minuta.",
      "auth/network-request-failed":"Bez internet konekcije.",
      "auth/invalid-credential":    "Pogrešan email ili lozinka."
    };
    return map[code] || "Greška pri prijavi (" + code + ").";
  }

  // ─── PUBLIC API ───────────────────────────────────────────
  return {
    init,
    loginWithEmail,
    loginWithPin,
    logout,
    getCurrentUser,
    isLoggedIn,
    hasRole,
    hasPermission,
    onAuthStateChanged,
    refreshToken
  };

})();
