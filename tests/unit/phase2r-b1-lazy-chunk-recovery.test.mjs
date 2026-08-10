/**
 * FAZA 2R-B.1 — plan-import lazy chunk failure recovery (fail-first + final).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createLazyModuleLoader,
  loadPlanImport,
  prefetchPlanImport,
  __setPlanImportLoaderForTests,
  __resetPlanImportLoaderForTests
} from "../../js/dispatcher/plan-import-loader.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("2R-B.1 A: failed prefetch then user action retries — attempts=2, action once", async () => {
  let attempts = 0;
  let actionCalls = 0;
  const loader = createLazyModuleLoader(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("chunk_fail_1");
    return {
      handleBulkPlanFileInput: async () => {
        actionCalls += 1;
        return "ok";
      }
    };
  });

  await assert.rejects(() => loader.load(), /chunk_fail_1/);
  assert.equal(loader.peekCached(), null, "rejected promise must not stay cached");

  const mod = await loader.load();
  const result = await mod.handleBulkPlanFileInput({ fake: true });
  assert.equal(result, "ok");
  assert.equal(attempts, 2);
  assert.equal(actionCalls, 1);
});

test("2R-B.1 B: parallel callers during pending success share one import", async () => {
  let attempts = 0;
  let actionCalls = 0;
  const gate = deferred();
  const loader = createLazyModuleLoader(async () => {
    attempts += 1;
    await gate.promise;
    return {
      confirmBulkPlanImport: async () => {
        actionCalls += 1;
        return "committed";
      }
    };
  });

  const p1 = loader.load();
  const p2 = loader.load();
  assert.equal(p1, p2, "in-flight promise must be shared");
  await Promise.resolve();
  assert.equal(attempts, 1, "only one chunk importer call while pending");

  gate.resolve();
  const [m1, m2] = await Promise.all([p1, p2]);
  assert.equal(m1, m2);
  await m1.confirmBulkPlanImport();
  await m2.confirmBulkPlanImport();
  assert.equal(attempts, 1);
  assert.equal(actionCalls, 2, "module actions may run twice when called twice — chunk import once");
});

test("2R-B.1 B2: parallel callers do not double chunk request when both await then act once shared", async () => {
  let attempts = 0;
  let actionCalls = 0;
  const gate = deferred();
  const loader = createLazyModuleLoader(async () => {
    attempts += 1;
    await gate.promise;
    return {
      runOnce: async () => {
        actionCalls += 1;
      }
    };
  });

  const shared = async () => {
    const mod = await loader.load();
    await mod.runOnce();
  };
  const a = shared();
  const b = shared();
  gate.resolve();
  await Promise.all([a, b]);
  assert.equal(attempts, 1);
  assert.equal(actionCalls, 2);
});

test("2R-B.1 C: explicit user-action load failure is catchable; next attempt can succeed", async () => {
  let attempts = 0;
  const toasts = [];
  const loader = createLazyModuleLoader(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("chunk_fail_user");
    return {
      handleBulkPlanDrop: async () => "dropped"
    };
  });

  async function withPlanImportModule(run) {
    let mod;
    try {
      mod = await loader.load();
    } catch {
      toasts.push("plan_import_chunk_load_failed");
      return undefined;
    }
    return run(mod);
  }

  const first = await withPlanImportModule((mod) => mod.handleBulkPlanDrop({}));
  assert.equal(first, undefined);
  assert.deepEqual(toasts, ["plan_import_chunk_load_failed"]);
  assert.equal(loader.peekCached(), null);

  const second = await withPlanImportModule((mod) => mod.handleBulkPlanDrop({}));
  assert.equal(second, "dropped");
  assert.equal(attempts, 2);
});

test("2R-B.1 C2: module runtime errors are not swallowed as chunk-load failures", async () => {
  const loader = createLazyModuleLoader(async () => ({
    confirmBulkPlanImport: async () => {
      throw new Error("COMMIT_LOGIC_FAIL");
    }
  }));

  async function withPlanImportModule(run) {
    let mod;
    try {
      mod = await loader.load();
    } catch {
      return "chunk_toast";
    }
    return run(mod);
  }

  await assert.rejects(
    () => withPlanImportModule((mod) => mod.confirmBulkPlanImport()),
    /COMMIT_LOGIC_FAIL/
  );
});

test("2R-B.1 race: older failure must not clear a newer in-flight success", async () => {
  let attempts = 0;
  const failGate = deferred();
  const okGate = deferred();
  const loader = createLazyModuleLoader(async () => {
    attempts += 1;
    if (attempts === 1) {
      await failGate.promise;
      throw new Error("slow_fail");
    }
    await okGate.promise;
    return { ok: true };
  });

  const first = loader.load();
  // Force clear + start second while first still pending (simulate after a sync reject path
  // would normally clear — here we manually reset only if peek is still first? We instead
  // reject first after second has replaced cache via identity clear).
  // Start second by clearing after first is set, then calling load again is wrong.
  // Identity check: reject first AFTER we already replaced cache with second.
  loader.reset();
  const second = loader.load();
  okGate.resolve();
  const mod = await second;
  assert.equal(mod.ok, true);

  failGate.resolve();
  await assert.rejects(() => first, /slow_fail/);
  // Newer success must remain cached.
  assert.equal(await loader.load(), mod);
  assert.equal(attempts, 2);
});

test("2R-B.1 prefetch failure releases cache via production helpers", async () => {
  let attempts = 0;
  const loader = createLazyModuleLoader(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("prefetch_fail");
    return { ok: true };
  });
  __setPlanImportLoaderForTests(loader);
  try {
    prefetchPlanImport();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(loader.peekCached(), null);
    const mod = await loadPlanImport();
    assert.equal(mod.ok, true);
    assert.equal(attempts, 2);
  } finally {
    __resetPlanImportLoaderForTests();
  }
});

test("2R-B.1 D: plan-import stays lazy; staff.html must not modulepreload it", () => {
  const reg = fs.readFileSync(path.join(root, "js/register-onclick-staff.js"), "utf8");
  assert.match(reg, /from\s*["']\.\/dispatcher\/plan-import-loader\.js["']/);
  assert.match(reg, /withPlanImportModule/);
  assert.match(reg, /plan_import_chunk_load_failed/);
  assert.doesNotMatch(
    reg,
    /import\s*\{[^}]*confirmBulkPlanImport[^}]*\}\s*from\s*["']\.\/dispatcher\/plan-import\.js["']/
  );

  const loaderSrc = fs.readFileSync(path.join(root, "js/dispatcher/plan-import-loader.js"), "utf8");
  assert.match(loaderSrc, /import\("\.\/plan-import\.js"\)/);
  assert.match(loaderSrc, /cached === attempt/);
  assert.match(loaderSrc, /bc_recovery/);
  assert.match(loaderSrc, /@vite-ignore/);

  const staffHtml = path.join(root, "dist", "staff.html");
  if (!fs.existsSync(staffHtml)) return;
  const html = fs.readFileSync(staffHtml, "utf8");
  const preloads = [...html.matchAll(/rel=["']modulepreload["'][^>]*href=["']([^"']+)["']/g)]
    .map((m) => m[1]);
  for (const href of preloads) {
    assert.doesNotMatch(href, /plan-import/i, `must not preload ${href}`);
  }
});

test("2R-B.1 i18n: plan_import_chunk_load_failed exists for de/en/sr only product langs", () => {
  const src = fs.readFileSync(path.join(root, "translations.js"), "utf8");
  assert.match(src, /plan_import_chunk_load_failed:\s*"Monthly import module could not be loaded/);
  assert.match(src, /plan_import_chunk_load_failed:\s*"Modul za mesečni uvoz nije učitan/);
  assert.match(src, /plan_import_chunk_load_failed:\s*"Monatsimport-Modul konnte nicht geladen werden/);
  const occurrences = (src.match(/plan_import_chunk_load_failed\s*:/g) || []).length;
  assert.equal(occurrences, 3, "exactly one key per product language");
  assert.doesNotMatch(
    src.slice(src.indexOf("plan_import_chunk_load_failed")),
    /plan_import_chunk_load_failed:[^,]*(rollback|sačuvano na serveru|stay in place|ostaju na mestu)/i
  );
});
