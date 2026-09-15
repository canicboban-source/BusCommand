/**
 * Race-safe Staff role-graph installer (WIDE-36).
 * After authenticated role is known, loads exactly one production role graph:
 * Company Admin or Dispatcher. Super Admin keeps the existing lazy SA panel loader.
 *
 * Concurrent callers for the same role share one in-flight Promise.
 * Successful installs are idempotent (no duplicate section/remote/onclick registration).
 */
import { createLazyModuleLoader } from "../dispatcher/plan-import-loader.js";
import { normalizeRole } from "../core/access.js";

const caLoader = createLazyModuleLoader(() => import("./install-company-admin-role.js"));
const dispatcherLoader = createLazyModuleLoader(() => import("./install-dispatcher-role.js"));

/** @type {Map<string, ReturnType<typeof createLazyModuleLoader>>} */
const LOADERS = new Map([
    ["company-admin", caLoader],
    ["dispatcher", dispatcherLoader]
]);

/**
 * @param {string|null|undefined} role
 * @returns {"superadmin"|"company-admin"|"dispatcher"|null}
 */
export function resolveStaffRoleGraphKey(role) {
    const normalized = normalizeRole(role);
    if (normalized === "superadmin") return "superadmin";
    if (normalized === "company-admin") return "company-admin";
    if (normalized === "dispatcher") return "dispatcher";
    return null;
}

/**
 * Install the authenticated Staff role graph before dashboard paint,
 * section handlers, and Firestore remote-render callbacks.
 * @param {string|null|undefined} role
 * @returns {Promise<{ role: string, graph: string|null }>}
 */
export async function ensureStaffRoleGraph(role) {
    const key = resolveStaffRoleGraphKey(role);
    if (!key) {
        throw new Error("STAFF_ROLE_GRAPH_UNSUPPORTED");
    }
    if (key === "superadmin") {
        return { role: key, graph: null };
    }
    const loader = LOADERS.get(key);
    const mod = await loader.load();
    if (mod && typeof mod.install === "function") {
        mod.install();
    }
    return { role: key, graph: key };
}

/** Read-only: true after a successful CA/Dispo install for that role. */
export function isStaffRoleGraphInstalled(role) {
    const key = resolveStaffRoleGraphKey(role);
    if (!key || key === "superadmin") return key === "superadmin";
    const loader = LOADERS.get(key);
    const mod = loader?.getIfLoaded?.();
    if (!mod) return false;
    if (typeof mod.isInstalled === "function") return mod.isInstalled();
    return true;
}

/** @internal test-only */
export function __resetStaffRoleGraphLoadersForTests() {
    caLoader.reset();
    dispatcherLoader.reset();
}

if (typeof window !== "undefined") {
    window.__bcEnsureStaffRoleGraphForTests = ensureStaffRoleGraph;
    window.__bcIsStaffRoleGraphInstalledForTests = isStaffRoleGraphInstalled;
}
