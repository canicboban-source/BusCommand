/**
 * Staff (dispatcher / CA / SA) Firebase Auth error mapping.
 * Credential failures share one generic message to prevent user-enumeration.
 */

const CREDENTIAL_CODES = new Set([
    "auth/user-not-found",
    "auth/wrong-password",
    "auth/invalid-credential",
    "auth/invalid-login-credentials"
]);

const ERROR_KEY_BY_CODE = Object.freeze({
    "auth/user-not-found": "error_invalid_credentials",
    "auth/wrong-password": "error_invalid_credentials",
    "auth/invalid-credential": "error_invalid_credentials",
    "auth/invalid-login-credentials": "error_invalid_credentials",
    "auth/too-many-requests": "error_too_many_requests",
    "auth/user-disabled": "error_account_disabled",
    "auth/invalid-email": "error_invalid_email",
    "auth/network-request-failed": "error_network",
    "auth/invalid-company": "error_login_generic"
});

/** Translation key for a Firebase Auth error code (enumeration-safe for credentials). */
function staffAuthErrorKey(code) {
    const normalized = String(code || "").trim();
    if (!normalized) return "error_invalid_credentials";
    return ERROR_KEY_BY_CODE[normalized] || "error_login_generic";
}

function isCredentialAuthError(code) {
    return CREDENTIAL_CODES.has(String(code || "").trim());
}

/** Errors that must stop login and show a message (never silent, never local fallback). */
function isHardStaffAuthError(code) {
    const normalized = String(code || "").trim();
    return Object.prototype.hasOwnProperty.call(ERROR_KEY_BY_CODE, normalized);
}

export {
    CREDENTIAL_CODES,
    ERROR_KEY_BY_CODE,
    staffAuthErrorKey,
    isCredentialAuthError,
    isHardStaffAuthError
};
