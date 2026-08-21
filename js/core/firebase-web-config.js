export const EXPECTED_FIREBASE_PROJECT_ID = "buscommand-preview";

const REQUIRED_ENV_VARS = Object.freeze({
    apiKey: "VITE_FIREBASE_API_KEY",
    authDomain: "VITE_FIREBASE_AUTH_DOMAIN",
    projectId: "VITE_FIREBASE_PROJECT_ID",
    storageBucket: "VITE_FIREBASE_STORAGE_BUCKET",
    messagingSenderId: "VITE_FIREBASE_MESSAGING_SENDER_ID",
    appId: "VITE_FIREBASE_APP_ID"
});

function readFirebaseWebConfig(env = import.meta.env || {}) {
    return Object.fromEntries(
        Object.entries(REQUIRED_ENV_VARS).map(([key, envName]) => [
            key,
            typeof env[envName] === "string" ? env[envName].trim() : ""
        ])
    );
}

function validateFirebaseWebConfig(config) {
    const missing = Object.entries(REQUIRED_ENV_VARS)
        .filter(([key]) => !config?.[key])
        .map(([, envName]) => envName);

    if (missing.length) {
        return { valid: false, error: `Firebase web configuration is missing: ${missing.join(", ")}` };
    }
    if (config.projectId !== EXPECTED_FIREBASE_PROJECT_ID) {
        return { valid: false, error: `Firebase project must be ${EXPECTED_FIREBASE_PROJECT_ID}.` };
    }
    if (config.authDomain !== `${EXPECTED_FIREBASE_PROJECT_ID}.firebaseapp.com`) {
        return { valid: false, error: `Firebase auth domain must belong to ${EXPECTED_FIREBASE_PROJECT_ID}.` };
    }
    if (config.storageBucket !== `${EXPECTED_FIREBASE_PROJECT_ID}.firebasestorage.app`) {
        return { valid: false, error: `Firebase storage bucket must belong to ${EXPECTED_FIREBASE_PROJECT_ID}.` };
    }
    return { valid: true, error: null };
}

const LOCAL_HOSTS = Object.freeze(["localhost", "127.0.0.1"]);

/**
 * QA/dev-only local emulator connector configuration. This is a SEPARATE,
 * strictly-validated path from production `readFirebaseWebConfig` above and
 * never substitutes for it in a real deployment.
 *
 * All of the following are REQUIRED (conjunction, not best-effort):
 *  - VITE_USE_FIREBASE_EMULATOR === "1" (explicit build/runtime opt-in)
 *  - page hostname is exactly "localhost" or "127.0.0.1"
 *  - Firestore/Auth emulator hosts are exactly "localhost" or "127.0.0.1"
 *  - project id starts with "demo-" (never the real project id)
 *
 * A runtime-only global (window.__BUSCOMMAND_USE_FIREBASE_EMULATOR__) may be
 * present as an ADDITIONAL signal but is never sufficient by itself.
 */
// Only fills a default when the variable is genuinely ABSENT/empty. If a
// value was actually supplied, it is passed through as-is (even if invalid)
// so validateFirebaseEmulatorConfig can explicitly reject it rather than a
// silent numeric coercion (e.g. Number("bad-port") || fallback) masking a
// misconfiguration.
function portOrDefault(value, fallback) {
    if (value === undefined || value === null || String(value).trim() === "") return fallback;
    return Number(value);
}

function readFirebaseEmulatorConfig(env = import.meta.env || {}) {
    return {
        enabled: String(env.VITE_USE_FIREBASE_EMULATOR || "") === "1",
        projectId: typeof env.VITE_FIREBASE_EMULATOR_PROJECT_ID === "string"
            ? env.VITE_FIREBASE_EMULATOR_PROJECT_ID.trim() : "",
        firestoreHost: typeof env.VITE_FIREBASE_EMULATOR_FIRESTORE_HOST === "string" && env.VITE_FIREBASE_EMULATOR_FIRESTORE_HOST.trim()
            ? env.VITE_FIREBASE_EMULATOR_FIRESTORE_HOST.trim() : "127.0.0.1",
        firestorePort: portOrDefault(env.VITE_FIREBASE_EMULATOR_FIRESTORE_PORT, 8080),
        authHost: typeof env.VITE_FIREBASE_EMULATOR_AUTH_HOST === "string" && env.VITE_FIREBASE_EMULATOR_AUTH_HOST.trim()
            ? env.VITE_FIREBASE_EMULATOR_AUTH_HOST.trim() : "127.0.0.1",
        authPort: portOrDefault(env.VITE_FIREBASE_EMULATOR_AUTH_PORT, 9099)
    };
}

/**
 * Validates the emulator connector configuration as a strict conjunction.
 * Returns { valid:false } for ANY missing/invalid piece — callers must
 * reject/throw, never silently fall back to a default that could be unsafe
 * (e.g. never assume "localhost" if an invalid host string was supplied).
 */
function validateFirebaseEmulatorConfig(config, { hostname } = {}) {
    if (!config || config.enabled !== true) {
        return { valid: false, error: "Firebase emulator mode is not enabled (VITE_USE_FIREBASE_EMULATOR!==1)." };
    }
    if (!LOCAL_HOSTS.includes(String(hostname || ""))) {
        return { valid: false, error: `Firebase emulator mode refused: page hostname "${hostname}" is not localhost/127.0.0.1.` };
    }
    if (!LOCAL_HOSTS.includes(String(config.firestoreHost || ""))) {
        return { valid: false, error: `Firebase emulator mode refused: Firestore host "${config.firestoreHost}" is not localhost/127.0.0.1.` };
    }
    if (!LOCAL_HOSTS.includes(String(config.authHost || ""))) {
        return { valid: false, error: `Firebase emulator mode refused: Auth host "${config.authHost}" is not localhost/127.0.0.1.` };
    }
    if (!Number.isInteger(config.firestorePort) || config.firestorePort <= 0 || config.firestorePort > 65535) {
        return { valid: false, error: `Firebase emulator mode refused: invalid Firestore port "${config.firestorePort}".` };
    }
    if (!Number.isInteger(config.authPort) || config.authPort <= 0 || config.authPort > 65535) {
        return { valid: false, error: `Firebase emulator mode refused: invalid Auth port "${config.authPort}".` };
    }
    if (!/^demo-[a-z0-9-]+$/.test(String(config.projectId || ""))) {
        return { valid: false, error: `Firebase emulator mode refused: project id "${config.projectId}" must start with "demo-".` };
    }
    return { valid: true, error: null };
}

export {
    readFirebaseWebConfig,
    validateFirebaseWebConfig,
    readFirebaseEmulatorConfig,
    validateFirebaseEmulatorConfig,
    LOCAL_HOSTS
};
