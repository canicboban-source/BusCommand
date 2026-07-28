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

export { readFirebaseWebConfig, validateFirebaseWebConfig };
