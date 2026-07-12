// BusCommand — briše sva polja za lozinku/PIN (sprečava slučajnu prijavu)

function isLoginScreenVisible() {
    const login = document.getElementById("login-screen");
    return login && !login.classList.contains("hidden");
}

function clearAllPasswordFields() {
    document.querySelectorAll('input[type="password"]').forEach((el) => {
        el.value = "";
    });
}

function clearLoginFormFields() {
    const pinInput = document.getElementById("login-driver-pin");
    const emailInput = document.getElementById("login-dispatcher-email");
    const passInput = document.getElementById("login-dispatcher-password");
    const driverSelect = document.getElementById("login-driver-select");

    if (pinInput) pinInput.value = "";
    if (emailInput) emailInput.value = "";
    if (passInput) passInput.value = "";
    if (driverSelect && driverSelect.options.length) {
        driverSelect.selectedIndex = 0;
    }

    ["login-error-driver", "login-error-dispatcher"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = "";
            el.classList.add("hidden");
        }
    });
}

function clearAuthSetupFields() {
    [
        "setup-new-pin",
        "setup-confirm-pin",
        "superadmin-pin-input",
        "superadmin-pass-input"
    ].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
    const saEmail = document.getElementById("superadmin-email-input");
    if (saEmail) saEmail.value = "";
}

function clearAllSensitiveAuthFields() {
    clearLoginFormFields();
    clearAuthSetupFields();
    clearAllPasswordFields();
}

/** Briše login lozinke kad korisnik napusti tab/prozor dok je na login ekranu */
function initPasswordFieldGuards() {
    const scrubIfLoginVisible = () => {
        if (!isLoginScreenVisible()) return;
        clearAllSensitiveAuthFields();
    };

    window.addEventListener("pagehide", scrubIfLoginVisible);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") scrubIfLoginVisible();
    });
    window.addEventListener("blur", () => {
        if (isLoginScreenVisible()) clearAllPasswordFields();
    });
}

export {
    clearAllPasswordFields,
    clearLoginFormFields,
    clearAuthSetupFields,
    clearAllSensitiveAuthFields,
    initPasswordFieldGuards,
    isLoginScreenVisible
};
