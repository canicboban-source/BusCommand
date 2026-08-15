/**
 * B2C-01-F1.1 — race-safe lazy loader for SA create-company + CA follow-up.
 * H1-A.1 contract: shared in-flight Promise; rejected attempt clears cache;
 * recovery only via same-origin allowlisted URLs.
 */
import { createLazyModuleLoader } from "../dispatcher/plan-import-loader.js";

export function isTrustedSaCreateFlowPathname(pathname) {
    const path = String(pathname || "");
    if (!path || path.includes("..") || path.includes("%") || path.includes("\\")) return false;
    // Payload chunk only — never trust sa-create-company-flow-loader-* as recovery target.
    if (/^\/assets\/sa-create-company-flow-(?!loader-)[A-Za-z0-9_-]+\.js$/i.test(path)) return true;
    if (path === "/js/admin/sa-create-company-flow.js") return true;
    return false;
}

export function isTrustedSaCreateFlowRecoveryUrl(candidate, pageOrigin) {
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
    if (!isTrustedSaCreateFlowPathname(url.pathname)) return null;

    return `${url.origin}${url.pathname}`;
}

export function extractFailedModuleUrlCandidate(err) {
    const msg = String(err?.message || err || "");
    const m = msg.match(/https?:\/\/[^\s'")]+/i);
    return m ? m[0].split("#")[0] : null;
}

export function collectSaCreateFlowUrlCandidates(err, performanceEntries = []) {
    const out = [];
    const fromErr = extractFailedModuleUrlCandidate(err);
    if (fromErr) out.push(fromErr);
    for (const entry of performanceEntries || []) {
        const name = String(entry?.name || "").trim();
        if (name) out.push(name.split("#")[0]);
    }
    return out;
}

export function resolveTrustedSaCreateFlowRecoveryBase(err, performanceEntries, pageOrigin) {
    for (const candidate of collectSaCreateFlowUrlCandidates(err, performanceEntries)) {
        const trusted = isTrustedSaCreateFlowRecoveryUrl(candidate, pageOrigin);
        if (trusted) return trusted;
    }
    return null;
}

export async function importSaCreateCompanyFlowModule({
    nativeImport = () => import("./sa-create-company-flow.js"),
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
        const base = resolveTrustedSaCreateFlowRecoveryBase(
            err,
            getPerformanceEntries(),
            getPageOrigin()
        );
        if (!base) throw err;
        return recoveryImport(`${base}?bc_recovery=${now()}`);
    }
}

/** Pure factory for unit tests — does not mutate the production singleton. */
export function createSaCreateCompanyFlowLoader(
    importer = () => importSaCreateCompanyFlowModule()
) {
    return createLazyModuleLoader(importer);
}

const activeLoader = createSaCreateCompanyFlowLoader();

export function loadSaCreateCompanyFlow() {
    return activeLoader.load();
}

export function getSaCreateFlowIfLoaded() {
    if (typeof activeLoader.getIfLoaded !== "function") return null;
    return activeLoader.getIfLoaded();
}
