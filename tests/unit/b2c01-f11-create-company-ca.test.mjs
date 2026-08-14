/**
 * B2C-01-F1.1 — truthful i18n, reliable lazy loader, no production test-hook.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLazyModuleLoader } from "../../js/dispatcher/plan-import-loader.js";
import {
  isTrustedSaCreateFlowPathname,
  isTrustedSaCreateFlowRecoveryUrl,
  createSaCreateCompanyFlowLoader,
  getSaCreateFlowIfLoaded
} from "../../js/admin/sa-create-company-flow-loader.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ORIGIN = "http://127.0.0.1:8772";

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const F1_KEYS = [
  "sa_create_retry_ca",
  "sa_create_partial_company_ok_ca_fail",
  "sa_create_close_partial_confirm",
  "sa_create_close_unknown_confirm",
  "sa_create_leave_partial",
  "sa_create_partial_abandoned_hint",
  "sa_create_unknown_abandoned_hint",
  "sa_create_unknown_check_company",
  "sa_create_busy_wait",
  "sa_create_ca_requires_pending",
  "sa_create_chunk_load_failed",
  "sa_create_company_exists"
];

test("F1.1 UTF-8: F1 keys have exact en/de/sr and no mojibake", () => {
  const src = read("translations.js");
  // Escape-only detector so review patches never embed mojibake glyph literals.
  const bad = /\u0393\u00C7|\u251C|\u2500|\u253C|\uFFFD/;
  for (const key of F1_KEYS) {
    assert.match(src, new RegExp(`${key}:\\s*\\{`));
    const idx = src.indexOf(`${key}:`);
    const chunk = src.slice(idx, idx + 900);
    for (const lang of ["en", "de", "sr"]) {
      const m = chunk.match(new RegExp(`${lang}:\\s*"([^"]*)"`));
      assert.ok(m, `${key}.${lang} missing`);
      assert.ok(m[1].length > 0, `${key}.${lang} empty`);
      assert.equal(bad.test(m[1]), false, `${key}.${lang} mojibake`);
    }
  }
  assert.match(src, /Company create result is not confirmed/);
  assert.match(src, /Ergebnis der Firmenerstellung ist nicht bestätigt/);
  assert.match(src, /Ishod kreiranja firme nije potvrđen/);
  assert.match(src, /Create-company module could not be loaded/);
});

test("F1.1 no production window.__saCreateFlowTestApi", () => {
  const flow = read("js/admin/sa-create-company-flow.js");
  const sa = read("js/admin/superadmin.js");
  assert.doesNotMatch(flow, /__saCreateFlowTestApi/);
  assert.doesNotMatch(sa, /__saCreateFlowTestApi/);
});

test("F1.1 loader: parallel share + rejected clears cache", async () => {
  let attempts = 0;
  let resolveGate;
  const gate = new Promise((r) => { resolveGate = r; });
  const loader = createLazyModuleLoader(async () => {
    attempts += 1;
    await gate;
    return { ok: true };
  });
  const p1 = loader.load();
  const p2 = loader.load();
  assert.equal(p1, p2);
  resolveGate();
  await Promise.all([p1, p2]);
  assert.equal(attempts, 1);

  let n = 0;
  const flaky = createLazyModuleLoader(async () => {
    n += 1;
    if (n === 1) throw new Error("chunk_fail");
    return { ok: true };
  });
  await assert.rejects(() => flaky.load(), /chunk_fail/);
  assert.equal(flaky.peekCached(), null);
  const mod = await flaky.load();
  assert.equal(mod.ok, true);
  assert.equal(n, 2);
});

test("F1.1 trusted recovery allowlist same-origin only", () => {
  assert.equal(isTrustedSaCreateFlowPathname("/assets/sa-create-company-flow-AbC123.js"), true);
  assert.equal(isTrustedSaCreateFlowPathname("/js/admin/sa-create-company-flow.js"), true);
  assert.equal(isTrustedSaCreateFlowPathname("/assets/sa-create-company-flow-loader-x.js"), false);
  assert.equal(isTrustedSaCreateFlowPathname("/assets/plan-import-AbC123.js"), false);
  const good = `${ORIGIN}/assets/sa-create-company-flow-abc.js`;
  assert.equal(isTrustedSaCreateFlowRecoveryUrl(good, ORIGIN), good);
  assert.equal(isTrustedSaCreateFlowRecoveryUrl("https://evil.example/assets/sa-create-company-flow-abc.js", ORIGIN), null);
  assert.equal(isTrustedSaCreateFlowRecoveryUrl("//evil.example/assets/sa-create-company-flow-abc.js", ORIGIN), null);
});

test("F1.1 superadmin separates load vs execution catch + close without module", () => {
  const sa = read("js/admin/superadmin.js");
  assert.match(sa, /withSaCreateFlowModule/);
  assert.match(sa, /sa_create_chunk_load_failed/);
  assert.match(sa, /execution failed/);
  assert.match(sa, /dismissSaCreateModalShellLocal|getSaCreateFlowIfLoaded/);
  assert.match(sa, /sa-create-company-flow-loader/);
});

test("F1.1 unknown close uses distinct truthful key; partial does not claim on unknown", () => {
  const flow = read("js/admin/sa-create-company-flow.js");
  assert.match(flow, /sa_create_close_unknown_confirm/);
  assert.match(flow, /leaveConfirmMessageKey/);
  assert.match(flow, /UNKNOWN_REQUIRES_CHECK/);
  assert.doesNotMatch(flow, /showToast\(\s*res\?\.error/);
  assert.match(flow, /mapSaCreateApiError/);
});

test("F1.1 refresh contract: defer on CA path; single terminal refresh helpers", () => {
  const flow = read("js/admin/sa-create-company-flow.js");
  assert.match(flow, /deferRefresh:\s*true/);
  assert.match(flow, /quietSuccess:\s*true/);
  assert.match(flow, /showSaCreateOutcomeToast/);
  assert.doesNotMatch(flow, /clearSaCreateOutcomeToasts/);
  assert.doesNotMatch(flow, /_saCreateRefreshCount/);
  assert.doesNotMatch(flow, /window\.__b2c01f1/);
});

test("F1.1 E2E uses real Retry/Close UI (no test-hook evaluate)", () => {
  const e2e = read("tests/e2e/b2c01-f1-create-company-ca.spec.js");
  assert.doesNotMatch(e2e, /__saCreateFlowTestApi\.(retryCa|close|submit|getState)/);
  assert.match(e2e, /#sa-create-company-btn/);
  assert.match(e2e, /sa-create-leave-confirm/);
  assert.match(e2e, /#sa-create-leave-confirm-btn/);
});

test("F1.1 markup present in both staff.html and index.legacy-monolith.html", () => {
  for (const rel of ["staff.html", "index.legacy-monolith.html"]) {
    const html = read(rel);
    assert.match(html, /id=["']sa-create-partial-banner["']/, rel);
    assert.match(html, /id=["']sa-create-leave-confirm["']/, rel);
    assert.match(html, /id=["']sa-create-leave-confirm-btn["']/, rel);
    assert.doesNotMatch(html, /id=["']sa-create-admin-btn["']/, rel);
  }
});

test("F1.1 abandoned hint does not claim Manage account can create missing CA", () => {
  const src = read("translations.js");
  const idx = src.indexOf("sa_create_partial_abandoned_hint");
  const chunk = src.slice(idx, idx + 600);
  assert.doesNotMatch(chunk, /create a missing|fehlenden Admin erstellen|kreirati missing/i);
});

test("F1.1 getIfLoaded does not start import (pure loader factory)", async () => {
  // Production singleton is not mutated — pure factory under test.
  assert.equal(typeof getSaCreateFlowIfLoaded, "function");
  let attempts = 0;
  const loader = createSaCreateCompanyFlowLoader(async () => {
    attempts += 1;
    return { ok: true };
  });
  assert.equal(loader.getIfLoaded(), null);
  assert.equal(attempts, 0);
  await loader.load();
  assert.equal(attempts, 1);
  assert.ok(loader.getIfLoaded());
});
