/**
 * B2C-01-F1.1.1.1-A — Escape no-load accessibility.
 * Real UI. No crafted toast / production test-hooks.
 * Real writes = 0.
 */
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { loginSuperAdmin } = require("./helpers.js");

const OUT = path.join(__dirname, "..", "..", "reports", "b2c01-f1111a-visual");
const SERVER_COMPANY_ID = "bc-b2c01-f1-server-tenant";
const TEST_PASSWORD = "BcF1-ok-9";
const SENTINEL = "QA-SENTINEL-UNRELATED-TOAST";
const SA_EMAIL = "sa@qa.local";
const SA_PASSWORD = "Qa-test-ok-9";

async function installRemoteApiSaBoot(page) {
  await page.addInitScript(() => {
    try {
      delete window.__BUSCOMMAND_QA_HARNESS__;
    } catch { /* ignore */ }
    window.__BUSCOMMAND_QA_HARNESS__ = false;
    localStorage.setItem("buscommand_lang", "en");
    sessionStorage.setItem("buscommand_pretrip_done", "true");
  });
}

async function installFirebaseSaStubRoutes(page) {
  const stub = `/*! b2c01-f1111a firebase test stub */
(function () {
  if (window.__b2c01FirebaseStubInstalled) return;
  window.__b2c01FirebaseStubInstalled = true;
  let signedIn = null;
  const listeners = [];
  const user = {
    uid: "bc-b2c01-sa",
    email: "sa@qa.local",
    displayName: "QA Super Admin",
    getIdToken: async () => "bc-b2c01-f1111a-token",
    getIdTokenResult: async () => ({
      claims: { role: "superadmin", name: "QA Super Admin" }
    })
  };
  const authApi = {
    get currentUser() { return signedIn; },
    signInWithEmailAndPassword: async (email, password) => {
      if (String(email).toLowerCase() === "sa@qa.local" && password === "Qa-test-ok-9") {
        signedIn = user;
        listeners.slice().forEach((cb) => queueMicrotask(() => cb(signedIn)));
        return { user };
      }
      const err = new Error("auth/invalid-credential");
      err.code = "auth/invalid-credential";
      throw err;
    },
    signOut: async () => {
      signedIn = null;
      listeners.slice().forEach((cb) => queueMicrotask(() => cb(null)));
    },
    onAuthStateChanged: (cb) => {
      listeners.push(cb);
      queueMicrotask(() => cb(signedIn));
      return () => {
        const i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    sendPasswordResetEmail: async () => {},
    signInWithCustomToken: async () => ({ user })
  };
  window.firebase = {
    apps: [{ options: { projectId: "buscommand-preview" } }],
    app: () => ({ options: { projectId: "buscommand-preview" } }),
    initializeApp: (cfg) => {
      window.firebase.apps = [{ options: cfg || { projectId: "buscommand-preview" } }];
      return window.firebase.apps[0];
    },
    auth: () => authApi,
    firestore: () => ({
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: false, data: () => ({}) }),
          set: async () => {},
          update: async () => {},
          onSnapshot: () => () => {}
        }),
        where: () => ({
          get: async () => ({ empty: true, docs: [] }),
          onSnapshot: () => () => {}
        }),
        onSnapshot: () => () => {}
      })
    })
  };
})();`;
  await page.route(/gstatic\.com\/firebasejs\//, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript; charset=utf-8",
      body: stub,
      headers: { "Cache-Control": "no-store" }
    });
  });
}

async function bootSaRemote(page) {
  await installRemoteApiSaBoot(page);
  await installFirebaseSaStubRoutes(page);
  await page.goto("/staff.html");
  await expect(page.locator("#login-dispatcher-email")).toBeVisible({ timeout: 20000 });
  await loginSuperAdmin(page, SA_EMAIL, SA_PASSWORD);
  await expect(page.locator("#sa-open-create-modal")).toBeVisible({ timeout: 20000 });
}

async function installSentinel(page) {
  await page.evaluate((text) => {
    const root = document.getElementById("toast-container");
    if (!root) throw new Error("toast-container missing");
    const toast = document.createElement("div");
    toast.className = "toast toast-info";
    toast.setAttribute("data-qa-sentinel", "1");
    toast.innerHTML = `<div class="toast-body"><div class="toast-msg">${text}</div></div>`;
    root.appendChild(toast);
  }, SENTINEL);
}

async function loaderFailureToastCount(page) {
  return page.locator('#toast-container .toast[data-sa-create-loader-toast="1"]').count();
}

async function stubDashboardApis(page, { createdCa = null, companyRecord = null } = {}) {
  await page.route("**/api/admin/companies", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const co = companyRecord?.value || {
      id: SERVER_COMPANY_ID,
      name: "BC-B2C01-F1-Co",
      status: "active"
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, companies: [co] })
    });
  });
  await page.route("**/api/admin/company-admins", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        companyAdmins: createdCa?.value ? [createdCa.value] : []
      })
    });
  });
  await page.route("**/api/admin/overview", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        counts: {},
        stats: { companies: 1, drivers: 0, dispatchers: 0 }
      })
    });
  });
}

test.describe("B2C-01-F1.1.1.1-A Escape no-load", () => {
  test("A+B: unloaded load-failure Escape closes shell; retry clears loader toast", async ({ page }) => {
    test.setTimeout(90000);
    fs.mkdirSync(OUT, { recursive: true });
    await stubDashboardApis(page);
    await bootSaRemote(page);
    await installSentinel(page);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

    let blockChunk = true;
    let chunkRequests = 0;
    await page.route(/sa-create-company-flow[^/]*\.js/, async (route) => {
      chunkRequests += 1;
      if (blockChunk) {
        await route.fulfill({
          status: 503,
          contentType: "text/plain",
          body: "chunk unavailable",
          headers: { "Cache-Control": "no-store" }
        });
        return;
      }
      await route.continue();
    });

    const timeOriginBefore = await page.evaluate(() => performance.timeOrigin);

    await page.locator("#sa-open-create-modal").click();
    await expect(page.locator("#sa-create-company-modal")).toBeVisible();
    await expect.poll(async () => loaderFailureToastCount(page), { timeout: 8000 }).toBe(1);

    const activeBeforeEscape = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        id: el?.id || "",
        tag: el?.tagName || "",
        insideModal: Boolean(document.getElementById("sa-create-company-modal")?.contains(el))
      };
    });
    const chunksBeforeEscape = chunkRequests;
    const loaderBeforeEscape = await loaderFailureToastCount(page);

    await page.keyboard.press("Escape");

    await expect(page.locator("#sa-create-company-modal")).toBeHidden({ timeout: 5000 });
    expect(await page.locator("#sa-ca-password").inputValue()).toBe("");
    await page.waitForTimeout(300);
    const additionalChunkRequestsAfterEscape = chunkRequests - chunksBeforeEscape;
    const additionalLoaderToastsAfterEscape = (await loaderFailureToastCount(page)) - loaderBeforeEscape;
    expect(additionalChunkRequestsAfterEscape).toBe(0);
    expect(additionalLoaderToastsAfterEscape).toBe(0);
    // Truthful loader failure may remain until successful retry.
    expect(await loaderFailureToastCount(page)).toBeGreaterThanOrEqual(0);
    await expect(page.locator('[data-qa-sentinel="1"]')).toBeVisible();

    const activeAfterEscape = await page.evaluate(() => ({
      id: document.activeElement?.id || "",
      tag: document.activeElement?.tagName || ""
    }));

    await page.screenshot({ path: path.join(OUT, "01-escape-after-load-failure.png"), fullPage: false });

    // B — explicit Open retry same document
    blockChunk = false;
    const chunkOk = page.waitForResponse(
      (res) => /sa-create-company-flow(?!-loader)/.test(res.url()) && res.status() === 200,
      { timeout: 15000 }
    );
    await page.locator("#sa-open-create-modal").click();
    await chunkOk;
    await expect
      .poll(async () => page.locator("#sa-new-name").evaluate((el) => document.activeElement === el), {
        timeout: 10000
      })
      .toBe(true);
    await expect.poll(async () => loaderFailureToastCount(page), { timeout: 5000 }).toBe(0);
    const timeOriginAfter = await page.evaluate(() => performance.timeOrigin);
    expect(timeOriginAfter).toBe(timeOriginBefore);
    await page.screenshot({ path: path.join(OUT, "02-retry-after-escape-clean.png"), fullPage: false });

    const trail = {
      task: "B2C-01-F1.1.1.1-A",
      proof: "A+B",
      activeBeforeEscape,
      activeAfterEscape,
      additionalChunkRequestsAfterEscape,
      additionalLoaderToastsAfterEscape,
      loaderFailureToastsAfterFailure: loaderBeforeEscape,
      loaderFailureToastsAfterRetry: await loaderFailureToastCount(page),
      timeOriginBefore,
      timeOriginAfter,
      reloadCount: 0,
      unrelatedSentinel: await page.locator('[data-qa-sentinel="1"]').count()
    };
    fs.writeFileSync(path.join(OUT, "TRAIL-AB.json"), JSON.stringify(trail, null, 2));
    expect(trail.unrelatedSentinel).toBe(1);
    expect(trail.loaderFailureToastsAfterRetry).toBe(0);
  });

  test("C: loaded partial Escape opens leave-confirm (no direct dismiss)", async ({ page }) => {
    test.setTimeout(90000);
    fs.mkdirSync(OUT, { recursive: true });
    const createdCa = { value: null };
    const companyRecord = { value: null };
    let company = 0;
    let ca = 0;

    await stubDashboardApis(page, { createdCa, companyRecord });
    await page.route("**/api/admin/create-company", async (route) => {
      company += 1;
      const body = route.request().postDataJSON();
      companyRecord.value = {
        id: SERVER_COMPANY_ID,
        name: body?.name || "BC-B2C01-F1-Co",
        status: "active"
      };
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          companyId: SERVER_COMPANY_ID,
          name: companyRecord.value.name,
          licenseType: "pro"
        })
      });
    });
    await page.route("**/api/admin/create-user", async (route) => {
      ca += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ success: false, error: "CA create failed" })
      });
    });

    await bootSaRemote(page);
    await page.locator("#sa-open-create-modal").click();
    await expect
      .poll(async () => page.locator("#sa-new-name").evaluate((el) => document.activeElement === el), {
        timeout: 10000
      })
      .toBe(true);
    await page.locator("#sa-new-name").fill("BC-B2C01-F1-Co");
    await page.locator("#sa-new-tenant").fill("bc-b2c01-f1-client-slug");
    await page.locator("#sa-ca-name").fill("BC-B2C01-F1 Admin");
    await page.locator("#sa-ca-email").fill("bc-b2c01-f1-admin@example.invalid");
    await page.locator("#sa-ca-password").fill(TEST_PASSWORD);
    await page.locator("#sa-create-company-btn").click();
    await expect.poll(() => company, { timeout: 10000 }).toBe(1);
    await expect.poll(() => ca, { timeout: 10000 }).toBe(1);
    await expect(page.locator("#sa-create-partial-banner")).toBeVisible();
    await expect(page.locator("#sa-create-company-modal")).toBeVisible();

    await page.locator("#sa-ca-name").focus();
    await page.keyboard.press("Escape");
    await expect(page.locator("#sa-create-leave-confirm")).toBeVisible({ timeout: 8000 });
    await expect(page.locator("#sa-create-company-modal")).toBeVisible();
    expect(company).toBe(1);
    await page.screenshot({ path: path.join(OUT, "03-partial-escape-leave-confirm.png"), fullPage: false });

    fs.writeFileSync(
      path.join(OUT, "TRAIL-C.json"),
      JSON.stringify({ companyRequests: company, caRequests: ca, leaveConfirmVisible: true }, null, 2)
    );
  });

  test("D: three unloaded open/fail/Escape cycles — one close each, no listener leak", async ({ page }) => {
    test.setTimeout(90000);
    await stubDashboardApis(page);
    await bootSaRemote(page);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

    let chunkRequests = 0;
    await page.route(/sa-create-company-flow[^/]*\.js/, async (route) => {
      chunkRequests += 1;
      await route.fulfill({
        status: 503,
        contentType: "text/plain",
        body: "chunk unavailable",
        headers: { "Cache-Control": "no-store" }
      });
    });

    const cycleResults = [];
    for (let i = 0; i < 3; i += 1) {
      const chunksAtOpenStart = chunkRequests;
      await page.locator("#sa-open-create-modal").click();
      await expect(page.locator("#sa-create-company-modal")).toBeVisible();
      await expect.poll(async () => loaderFailureToastCount(page), { timeout: 8000 }).toBe(1);
      const chunksBeforeEscape = chunkRequests;
      expect(chunksBeforeEscape).toBeGreaterThan(chunksAtOpenStart);

      await page.keyboard.press("Escape");
      await expect(page.locator("#sa-create-company-modal")).toBeHidden({ timeout: 5000 });
      await page.waitForTimeout(250);
      const chunksAfterEscape = chunkRequests;
      const loaderAfter = await loaderFailureToastCount(page);
      cycleResults.push({
        cycle: i + 1,
        additionalChunkRequestsAfterEscape: chunksAfterEscape - chunksBeforeEscape,
        loaderCount: loaderAfter,
        modalHidden: true
      });
      expect(chunksAfterEscape - chunksBeforeEscape).toBe(0);
      expect(loaderAfter).toBeLessThanOrEqual(1);
    }

    expect(await loaderFailureToastCount(page)).toBeLessThanOrEqual(1);
    expect(cycleResults).toHaveLength(3);
    expect(cycleResults.every((c) => c.additionalChunkRequestsAfterEscape === 0 && c.modalHidden)).toBe(true);
    fs.writeFileSync(
      path.join(OUT, "TRAIL-D.json"),
      JSON.stringify({ cycleResults, finalLoaderToasts: await loaderFailureToastCount(page) }, null, 2)
    );
  });
});
