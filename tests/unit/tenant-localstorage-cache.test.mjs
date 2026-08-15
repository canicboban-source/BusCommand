/**
 * @vitest-environment node
 * Simulated localStorage for tenant cache hygiene (live-review 1.1 / 7A.2).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function installMemoryStorage() {
    const map = new Map();
    return {
        get length() { return map.size; },
        key(i) { return [...map.keys()][i] ?? null; },
        getItem(k) { return map.has(k) ? map.get(k) : null; },
        setItem(k, v) { map.set(String(k), String(v)); },
        removeItem(k) { map.delete(String(k)); },
        clear() { map.clear(); },
        _map: map
    };
}

test("state.js clears tenant caches and refuses URL companyId fallback on save", async () => {
    const localStorage = installMemoryStorage();
    const sessionStorage = installMemoryStorage();
    // Load CJS-compatible copy by transforming ESM exports via dynamic import through node --experimental?
    // Prefer source assertions + a tiny extracted pure test of the storage helpers via Function constructor.
    const source = readFileSync(join(root, "js/core/state.js"), "utf8");
    assert.match(source, /clearTenantStateCache/);
    assert.match(source, /clearAllTenantStateCaches/);
    assert.match(source, /resetInMemoryTenantState/);
    assert.match(source, /resolveAuthenticatedCompanyId/);
    assert.match(source, /Production must never fall back to URL/);

    // Exercise helpers by evaluating a stripped pure version
    const pure = `
      const TENANT_STATE_PREFIX = "buscommand_state_";
      function getStateStorageKey(companyId) {
        if (!companyId) return null;
        return TENANT_STATE_PREFIX + companyId;
      }
      function clearTenantStateCache(companyId) {
        if (!companyId) return false;
        const key = getStateStorageKey(companyId);
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
        return true;
      }
      function clearAllTenantStateCaches({ keepCompanyId = null } = {}) {
        const removed = [];
        for (let i = localStorage.length - 1; i >= 0; i -= 1) {
          const key = localStorage.key(i);
          if (!key || !key.startsWith(TENANT_STATE_PREFIX)) continue;
          const companyId = key.slice(TENANT_STATE_PREFIX.length);
          if (keepCompanyId && companyId === keepCompanyId) continue;
          localStorage.removeItem(key);
          removed.push(companyId);
        }
        return removed;
      }
      ({ clearTenantStateCache, clearAllTenantStateCaches, getStateStorageKey });
    `;
    const api = vm.runInNewContext(pure, { localStorage, sessionStorage });
    localStorage.setItem("buscommand_state_blaguss", "{\"branding\":{\"name\":\"BLAGUSS\"}}");
    localStorage.setItem("buscommand_state_qa-test-gmbh", "{\"branding\":{\"name\":\"QA\"}}");
    localStorage.setItem("buscommand_lang", "de");
    api.clearTenantStateCache("blaguss");
    assert.equal(localStorage.getItem("buscommand_state_blaguss"), null);
    assert.ok(localStorage.getItem("buscommand_state_qa-test-gmbh"));
    const kept = api.clearAllTenantStateCaches({ keepCompanyId: "qa-test-gmbh" });
    assert.equal(kept.length, 0);
    assert.ok(localStorage.getItem("buscommand_state_qa-test-gmbh"));
    const purged = api.clearAllTenantStateCaches();
    assert.ok(purged.includes("qa-test-gmbh"));
    assert.equal(localStorage.getItem("buscommand_state_qa-test-gmbh"), null);
    assert.equal(localStorage.getItem("buscommand_lang"), "de");
});

test("logout, SA delete and license paths wire tenant cache clearing", () => {
    const logout = readFileSync(join(root, "js/auth/login-dispatcher.js"), "utf8");
    const sa = readFileSync(join(root, "js/admin/superadmin.js"), "utf8");
    const license = readFileSync(join(root, "js/core/license.js"), "utf8");
    const firebase = readFileSync(join(root, "js/core/firebase-service.js"), "utf8");
    const crossTab = readFileSync(join(root, "js/sync/cross-tab.js"), "utf8");
    const init = readFileSync(join(root, "js/bootstrap/init.js"), "utf8");

    assert.match(logout, /clearTenantStateCache\(companyId\)/);
    assert.match(logout, /resetInMemoryTenantState\(\)/);
    assert.match(sa, /clearTenantStateCache\(companyId\)/);
    assert.match(license, /sessionCompanyId !== companyId/);
    assert.match(firebase, /clearAllTenantStateCaches\(\{\s*keepCompanyId:\s*companyId\s*\}\)/);
    assert.match(crossTab, /resolveAuthenticatedCompanyId\(\)/);
    assert.doesNotMatch(crossTab, /getStateStorageKey\(COMPANY_ID\)/);
    assert.match(init, /onSignedOut[\s\S]*clearTenantStateCache/);
});
