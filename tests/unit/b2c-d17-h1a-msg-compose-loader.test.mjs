/**
 * B2C-D17-H1-A — msg-compose lazy loader race/retry/recovery contract.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLazyModuleLoader } from "../../js/dispatcher/plan-import-loader.js";
import {
  isTrustedMsgComposePathname,
  isTrustedMsgComposeRecoveryUrl,
  importMsgComposeModule,
  loadMsgCompose,
  getMsgComposeIfLoaded,
  prefetchMsgCompose,
  __setMsgComposeLoaderForTests,
  __resetMsgComposeLoaderForTests
} from "../../js/dispatcher/msg-compose-loader.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ORIGIN = "http://127.0.0.1:8772";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("H1-A parallel callers share one in-flight import", async () => {
  let attempts = 0;
  const gate = deferred();
  const loader = createLazyModuleLoader(async () => {
    attempts += 1;
    await gate.promise;
    return { ok: true };
  });
  const p1 = loader.load();
  const p2 = loader.load();
  assert.equal(p1, p2);
  await Promise.resolve();
  assert.equal(attempts, 1);
  gate.resolve();
  const [a, b] = await Promise.all([p1, p2]);
  assert.equal(a, b);
  assert.equal(attempts, 1);
});

test("H1-A success cache reuses module", async () => {
  let attempts = 0;
  const loader = createLazyModuleLoader(async () => {
    attempts += 1;
    return { n: attempts };
  });
  const first = await loader.load();
  const second = await loader.load();
  assert.equal(first, second);
  assert.equal(attempts, 1);
});

test("H1-A rejected import clears cache; next attempt succeeds", async () => {
  let attempts = 0;
  const loader = createLazyModuleLoader(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("chunk_fail");
    return { ok: true };
  });
  await assert.rejects(() => loader.load(), /chunk_fail/);
  assert.equal(loader.peekCached(), null);
  const mod = await loader.load();
  assert.equal(mod.ok, true);
  assert.equal(attempts, 2);
});

test("H1-A trusted recovery pathnames", () => {
  assert.equal(isTrustedMsgComposePathname("/assets/msg-compose-AbC123.js"), true);
  assert.equal(isTrustedMsgComposePathname("/js/dispatcher/msg-compose.js"), true);
  assert.equal(isTrustedMsgComposePathname("/assets/msg-compose-loader-BqgwSonb.js"), false);
  assert.equal(isTrustedMsgComposePathname("/assets/plan-import-AbC123.js"), false);
  assert.equal(isTrustedMsgComposePathname("/assets/msg-compose-AbC123.js.exe"), false);
  assert.equal(isTrustedMsgComposePathname("/assets/xmsg-compose-AbC123.js"), false);
  assert.equal(isTrustedMsgComposePathname("/assets/msg-compose%2eevil.js"), false);
});

test("H1-A recovery URL: same-origin ok; foreign/protocol-relative/credentials rejected", () => {
  const good = `${ORIGIN}/assets/msg-compose-abc.js`;
  assert.equal(isTrustedMsgComposeRecoveryUrl(good, ORIGIN), good);
  assert.equal(isTrustedMsgComposeRecoveryUrl(`${good}?x=1`, ORIGIN), good);
  assert.equal(isTrustedMsgComposeRecoveryUrl("https://evil.example/assets/msg-compose-abc.js", ORIGIN), null);
  assert.equal(isTrustedMsgComposeRecoveryUrl("//evil.example/assets/msg-compose-abc.js", ORIGIN), null);
  assert.equal(
    isTrustedMsgComposeRecoveryUrl("http://user:pass@127.0.0.1:8772/assets/msg-compose-abc.js", ORIGIN),
    null
  );
  assert.equal(isTrustedMsgComposeRecoveryUrl(`${ORIGIN}/js/dispatcher/evil.js`, ORIGIN), null);
});

test("H1-A sticky failure recovers via trusted URL only", async () => {
  let nativeTries = 0;
  let recoveryUrl = null;
  const mod = await importMsgComposeModule({
    nativeImport: async () => {
      nativeTries += 1;
      throw new Error(`Failed to fetch module script: ${ORIGIN}/assets/msg-compose-dead.js`);
    },
    recoveryImport: async (url) => {
      recoveryUrl = url;
      return { recovered: true };
    },
    getPerformanceEntries: () => [{ name: `${ORIGIN}/assets/msg-compose-dead.js` }],
    getPageOrigin: () => ORIGIN,
    now: () => 42
  });
  assert.equal(nativeTries, 1);
  assert.equal(mod.recovered, true);
  assert.equal(recoveryUrl, `${ORIGIN}/assets/msg-compose-dead.js?bc_recovery=42`);
});

test("H1-A foreign Performance entry does not unlock recovery", async () => {
  await assert.rejects(
    () => importMsgComposeModule({
      nativeImport: async () => {
        throw new Error("Failed to fetch");
      },
      recoveryImport: async () => ({ bad: true }),
      getPerformanceEntries: () => [{ name: "https://attacker.example/assets/msg-compose-abc.js" }],
      getPageOrigin: () => ORIGIN
    }),
    /Failed to fetch/
  );
});

test("H1-A.1 recovery unwraps Vite co-lazy namespace (.m)", async () => {
  const mod = await importMsgComposeModule({
    nativeImport: async () => {
      throw new Error(`Failed to fetch dynamically imported module: ${ORIGIN}/assets/msg-compose-AbC123.js`);
    },
    recoveryImport: async () => ({
      m: { setMessagesPageTab: () => "ok", populateTemplateSelect: () => {} },
      s: { archiveDispatcherMessage: () => {} }
    }),
    getPerformanceEntries: () => [],
    getPageOrigin: () => ORIGIN,
    now: () => 42
  });
  assert.equal(typeof mod.setMessagesPageTab, "function");
  assert.equal(mod.setMessagesPageTab(), "ok");
});

test("H1-A quiet prefetch failure does not poison cache", async () => {
  let attempts = 0;
  const loader = createLazyModuleLoader(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("prefetch_fail");
    return { ok: true };
  });
  __setMsgComposeLoaderForTests(loader);
  prefetchMsgCompose();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(loader.peekCached(), null);
  const mod = await loadMsgCompose();
  assert.equal(mod.ok, true);
  assert.equal(attempts, 2);
  __resetMsgComposeLoaderForTests();
});

test("H1-A post-load callback error is not treated as load failure", async () => {
  let loadAttempts = 0;
  const loader = createLazyModuleLoader(async () => {
    loadAttempts += 1;
    return {
      setMessagesPageTab: () => {
        throw new Error("render_boom");
      }
    };
  });
  const mod = await loader.load();
  assert.equal(loadAttempts, 1);
  assert.throws(() => mod.setMessagesPageTab("personal"), /render_boom/);
  const again = await loader.load();
  assert.equal(again, mod);
  assert.equal(loadAttempts, 1);
});

test("H1-A.1 getIfLoaded is read-only and does not start import", async () => {
  let attempts = 0;
  const loader = createLazyModuleLoader(async () => {
    attempts += 1;
    return { id: "mod" };
  });
  __setMsgComposeLoaderForTests(loader);
  assert.equal(loader.getIfLoaded(), null);
  assert.equal(getMsgComposeIfLoaded(), null);
  assert.equal(attempts, 0);

  const gate = deferred();
  const slow = createLazyModuleLoader(async () => {
    attempts += 1;
    await gate.promise;
    return { id: "slow" };
  });
  __setMsgComposeLoaderForTests(slow);
  const inflight = slow.load();
  await Promise.resolve();
  assert.equal(slow.getIfLoaded(), null);
  assert.equal(getMsgComposeIfLoaded(), null);
  assert.equal(attempts, 1);
  gate.resolve();
  const mod = await inflight;
  await Promise.resolve();
  assert.equal(slow.getIfLoaded(), mod);
  assert.equal(getMsgComposeIfLoaded(), mod);
  assert.equal(attempts, 1);

  const failing = createLazyModuleLoader(async () => {
    attempts += 1;
    throw new Error("boom");
  });
  __setMsgComposeLoaderForTests(failing);
  await assert.rejects(() => failing.load(), /boom/);
  assert.equal(failing.getIfLoaded(), null);
  assert.equal(getMsgComposeIfLoaded(), null);
  __resetMsgComposeLoaderForTests();
});

test("H1-A.1 section handler separates load catch from execution catch", () => {
  const sections = fs.readFileSync(path.join(root, "js/surface/register-staff-sections.js"), "utf8");
  const body = sections.match(
    /"dispatcher-messages":\s*async\s*\(\)\s*=>\s*\{([\s\S]*?)\},\s*\n\s*"superadmin-dashboard"/
  )?.[1] || "";
  assert.match(body, /await\s+loadMsgCompose\s*\(/);
  assert.match(body, /msg_compose_chunk_load_failed/);
  assert.match(body, /error_generic/);
  const loadCatchIdx = body.indexOf("msg_compose_chunk_load_failed");
  const execTryIdx = body.indexOf("setMessagesPageTab", loadCatchIdx);
  const execCatchIdx = body.indexOf("error_generic");
  assert.ok(loadCatchIdx > 0);
  assert.ok(execTryIdx > loadCatchIdx);
  assert.ok(execCatchIdx > execTryIdx);
});

test("H1-A.1 i18n translateUI peeks without loadMsgCompose", () => {
  const i18n = fs.readFileSync(path.join(root, "js/ui/i18n.js"), "utf8");
  assert.match(i18n, /getMsgComposeIfLoaded/);
  assert.doesNotMatch(i18n, /loadMsgCompose\s*\(/);
});

test("H1-A staff graph no longer statically imports msg-compose/sent-messages", () => {
  const install = fs.readFileSync(path.join(root, "js/install-staff.js"), "utf8");
  const sections = fs.readFileSync(path.join(root, "js/surface/register-staff-sections.js"), "utf8");
  const reg = fs.readFileSync(path.join(root, "js/register-onclick-staff.js"), "utf8");
  assert.doesNotMatch(install, /dispatcher\/msg-compose\.js/);
  assert.doesNotMatch(install, /dispatcher\/sent-messages\.js/);
  assert.doesNotMatch(sections, /from ["']\.\.\/dispatcher\/msg-compose\.js["']/);
  assert.match(sections, /msg-compose-loader/);
  assert.doesNotMatch(reg, /from ["']\.\/dispatcher\/msg-compose\.js["']/);
  assert.doesNotMatch(reg, /from ["']\.\/dispatcher\/sent-messages\.js["']/);
  assert.match(reg, /loadMsgCompose/);
  assert.match(reg, /msg_compose_chunk_load_failed/);
  assert.match(reg, /error_generic/);
});
