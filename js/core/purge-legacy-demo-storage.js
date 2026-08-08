/**
 * Controlled removal of known legacy demo cache keys only.
 * Never clears all localStorage / IndexedDB / Cache Storage.
 */

const LEGACY_DEMO_LOCAL_KEYS = [
    "buscommand_demo_state_v2",
    "buscommand_demo_state_v3",
    "buscommand_demo_otp",
    "buscommand_force_demo",
    "buscommand_demo_user"
];

const LEGACY_DEMO_CACHE_NAMES = [
    "buscommand-demo-v1",
    "buscommand-demo-v2",
    "buscommand-demo-static-v1"
];

export function purgeLegacyDemoStorage() {
    try {
        for (const key of LEGACY_DEMO_LOCAL_KEYS) {
            localStorage.removeItem(key);
            sessionStorage.removeItem(key);
        }
        // Stale tenant caches that used companyId "demo"
        const doomed = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            if (k === "buscommand_state_demo" || k.endsWith("_demo_seed")) {
                doomed.push(k);
            }
        }
        for (const k of doomed) localStorage.removeItem(k);
    } catch {
        /* ignore quota / private mode */
    }

    try {
        if (typeof caches !== "undefined" && caches.keys) {
            caches.keys().then((names) => {
                for (const name of names) {
                    if (LEGACY_DEMO_CACHE_NAMES.includes(name) || /buscommand.*demo/i.test(name)) {
                        caches.delete(name);
                    }
                }
            }).catch(() => {});
        }
    } catch {
        /* ignore */
    }
}
