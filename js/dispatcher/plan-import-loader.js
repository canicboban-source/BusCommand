/**
 * Race-safe lazy loader for the monthly plan-import chunk (FAZA 2R-B.1 / 2R-B.1.1).
 *
 * - Parallel callers share one in-flight Promise.
 * - A rejected attempt is never left permanently cached.
 * - Cache clear is identity-checked so a newer attempt is not wiped by an older failure.
 * - Recovery re-import uses only same-origin trusted plan-import asset URLs.
 */

export function createLazyModuleLoader(importer) {
    if (typeof importer !== "function") {
        throw new TypeError("createLazyModuleLoader requires an importer function");
    }
    let cached = null;
    /** Settled successful module only — never an in-flight Promise. */
    let resolved = null;

    function load() {
        if (!cached) {
            const attempt = Promise.resolve().then(() => importer());
            cached = attempt;
            void attempt.then(
                (mod) => {
                    if (cached === attempt) resolved = mod;
                },
                () => {
                    if (cached === attempt) {
                        cached = null;
                        resolved = null;
                    }
                }
            );
        }
        return cached;
    }

    /** Read-only: returns loaded module or null. Does not start import/recovery. */
    function getIfLoaded() {
        return resolved;
    }

    function peekCached() {
        return cached;
    }

    function reset() {
        cached = null;
        resolved = null;
    }

    return { load, getIfLoaded, peekCached, reset };
}

/** Production hashed asset or exact Vite source path used in local/QA runtime. */
export function isTrustedPlanImportPathname(pathname) {
    const path = String(pathname || "");
    if (!path || path.includes("..") || path.includes("%") || path.includes("\\")) return false;
    if (/^\/assets\/plan-import-[A-Za-z0-9_-]+\.js$/i.test(path)) return true;
    if (path === "/js/dispatcher/plan-import.js") return true;
    return false;
}

/**
 * Validate a candidate recovery URL. Returns origin+pathname (no query/hash) or null.
 * Never trust foreign-origin, protocol-relative, credentialed, or lookalike paths.
 */
export function isTrustedPlanImportRecoveryUrl(candidate, pageOrigin) {
    const raw = String(candidate || "").trim();
    if (!raw) return null;
    if (raw.startsWith("//") || raw.startsWith("\\\\")) return null;
    if (!pageOrigin || typeof pageOrigin !== "string") return null;

    let url;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }

    if (url.username || url.password) return null;
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    let expectedOrigin;
    try {
        expectedOrigin = new URL(pageOrigin).origin;
    } catch {
        return null;
    }
    if (url.origin !== expectedOrigin) return null;
    if (!isTrustedPlanImportPathname(url.pathname)) return null;

    return `${url.origin}${url.pathname}`;
}

export function extractFailedModuleUrlCandidate(err) {
    const msg = String(err?.message || err || "");
    const m = msg.match(/https?:\/\/[^\s'")]+/i);
    return m ? m[0].split("#")[0] : null;
}

export function collectPlanImportUrlCandidates(err, performanceEntries = []) {
    const out = [];
    const fromErr = extractFailedModuleUrlCandidate(err);
    if (fromErr) out.push(fromErr);
    for (const entry of performanceEntries || []) {
        const name = String(entry?.name || "").trim();
        if (name) out.push(name.split("#")[0]);
    }
    return out;
}

export function resolveTrustedPlanImportRecoveryBase(err, performanceEntries, pageOrigin) {
    for (const candidate of collectPlanImportUrlCandidates(err, performanceEntries)) {
        const trusted = isTrustedPlanImportRecoveryUrl(candidate, pageOrigin);
        if (trusted) return trusted;
    }
    return null;
}

/**
 * Production importer: first try Vite-rewritten static import; on sticky failure,
 * re-import via trusted same-origin absolute URL + recovery query.
 */
export async function importPlanImportModule({
    nativeImport = () => import("./plan-import.js"),
    recoveryImport = (url) => import(/* @vite-ignore */ url),
    getPerformanceEntries = () => {
        try {
            return performance.getEntriesByType("resource");
        } catch {
            return [];
        }
    },
    getPageOrigin = () => (typeof window !== "undefined" ? window.location.origin : ""),
    now = () => Date.now()
} = {}) {
    try {
        return await nativeImport();
    } catch (err) {
        const base = resolveTrustedPlanImportRecoveryBase(
            err,
            getPerformanceEntries(),
            getPageOrigin()
        );
        if (!base) throw err;
        return recoveryImport(`${base}?bc_recovery=${now()}`);
    }
}

let activeLoader = createLazyModuleLoader(() => importPlanImportModule());

/** Shared production loader used by staff onclick wrappers. */
export function loadPlanImport() {
    return activeLoader.load();
}

/** Background warm — failures stay silent but must release the cache (via load()). */
export function prefetchPlanImport() {
    void activeLoader.load().catch(() => {});
}

/** @internal test-only */
export function __setPlanImportLoaderForTests(loader) {
    activeLoader = loader;
}

/** @internal test-only */
export function __resetPlanImportLoaderForTests() {
    activeLoader = createLazyModuleLoader(() => importPlanImportModule());
}
