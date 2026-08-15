/**
 * Race-safe lazy loader for Dispo msg-compose (+ co-lazy sent-messages).
 * Reuses createLazyModuleLoader; recovery URLs are msg-compose–scoped only.
 */
import { createLazyModuleLoader } from "./plan-import-loader.js";

export function isTrustedMsgComposePathname(pathname) {
    const path = String(pathname || "");
    if (!path || path.includes("..") || path.includes("%") || path.includes("\\")) return false;
    // Payload chunk only — never trust msg-compose-loader-* as recovery target.
    if (/^\/assets\/msg-compose-(?!loader-)[A-Za-z0-9_-]+\.js$/i.test(path)) return true;
    if (path === "/js/dispatcher/msg-compose.js") return true;
    return false;
}

export function isTrustedMsgComposeRecoveryUrl(candidate, pageOrigin) {
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
    if (!isTrustedMsgComposePathname(url.pathname)) return null;

    return `${url.origin}${url.pathname}`;
}

export function extractFailedModuleUrlCandidate(err) {
    const msg = String(err?.message || err || "");
    const m = msg.match(/https?:\/\/[^\s'")]+/i);
    return m ? m[0].split("#")[0] : null;
}

export function collectMsgComposeUrlCandidates(err, performanceEntries = []) {
    const out = [];
    const fromErr = extractFailedModuleUrlCandidate(err);
    if (fromErr) out.push(fromErr);
    for (const entry of performanceEntries || []) {
        const name = String(entry?.name || "").trim();
        if (name) out.push(name.split("#")[0]);
    }
    return out;
}

export function resolveTrustedMsgComposeRecoveryBase(err, performanceEntries, pageOrigin) {
    for (const candidate of collectMsgComposeUrlCandidates(err, performanceEntries)) {
        const trusted = isTrustedMsgComposeRecoveryUrl(candidate, pageOrigin);
        if (trusted) return trusted;
    }
    return null;
}

export async function importMsgComposeModule({
    nativeImport = () => import("./msg-compose.js"),
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
        const base = resolveTrustedMsgComposeRecoveryBase(
            err,
            getPerformanceEntries(),
            getPageOrigin()
        );
        if (!base) throw err;
        const ns = await recoveryImport(`${base}?bc_recovery=${now()}`);
        return unwrapMsgComposeNamespace(ns);
    }
}

/**
 * Absolute-URL recovery bypasses Vite's `.then(m => m.m)` rewrite used for the
 * co-lazy msg-compose + sent-messages chunk. Accept either shape.
 */
export function unwrapMsgComposeNamespace(ns) {
    if (!ns || typeof ns !== "object") return ns;
    if (typeof ns.setMessagesPageTab === "function") return ns;
    if (ns.m && typeof ns.m.setMessagesPageTab === "function") return ns.m;
    return ns;
}

let activeLoader = createLazyModuleLoader(() => importMsgComposeModule());

export function loadMsgCompose() {
    return activeLoader.load();
}

/**
 * Read-only peek of a successfully loaded msg-compose module.
 * Returns null before load, during in-flight import, and after a cleared failure.
 * Does not create a Promise, native import, recovery import, or mutate cache.
 */
export function getMsgComposeIfLoaded() {
    if (typeof activeLoader.getIfLoaded !== "function") return null;
    return activeLoader.getIfLoaded();
}

/** Quiet warm — failures stay silent but must release cache. */
export function prefetchMsgCompose() {
    void activeLoader.load().catch(() => {});
}

/** @internal test-only */
export function __setMsgComposeLoaderForTests(loader) {
    activeLoader = loader;
}

/** @internal test-only */
export function __resetMsgComposeLoaderForTests() {
    activeLoader = createLazyModuleLoader(() => importMsgComposeModule());
}
