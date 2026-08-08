/**
 * Runtime mode resolution.
 * Demo URL/query activation is forbidden (Owner Task Contract 2026-08-08).
 * Ephemeral local state is allowed ONLY when Playwright/QA sets
 * window.__BUSCOMMAND_QA_HARNESS__ before app boot (never via URL).
 */

function isLocalHost(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1";
}

function isQaHarnessActive() {
    try {
        return typeof window !== "undefined"
            && window.__BUSCOMMAND_QA_HARNESS__ === true;
    } catch {
        return false;
    }
}

function resolveRuntimeMode({ hostname, search }) {
    const local = isLocalHost(hostname);
    // Ignore mode=demo / ?demo= — never activate packaged demo datasets.
    void search;
    const qaHarness = isQaHarnessActive();
    return {
        isLocal: local,
        useLocalState: qaHarness === true,
        quickDemoRole: null
    };
}

export { isLocalHost, isQaHarnessActive, resolveRuntimeMode };
