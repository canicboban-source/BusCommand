/**
 * B2C-01-F1.1.1.1 visual trail — Close no-load + loader toast lifecycle + CA success.
 * Output: reports/b2c01-f1111-visual/
 */
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { loginSuperAdmin } = require("./helpers.js");

const OUT = path.join(__dirname, "..", "..", "reports", "b2c01-f1111-visual");
const SERVER_COMPANY_ID = "bc-b2c01-f1-server-tenant";
const TEST_PASSWORD = "BcF1-ok-9";
const SENTINEL = "QA-SENTINEL-UNRELATED-TOAST";
const SA_EMAIL = "sa@qa.local";
const SA_PASSWORD = "Qa-test-ok-9";
const CA_NAME = "BC-B2C01-F1 Admin";
const CA_EMAIL = "bc-b2c01-f1-admin@example.invalid";

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
  const stub = `/*! b2c01-f1111 firebase test stub */
(function () {
  if (window.__b2c01FirebaseStubInstalled) return;
  window.__b2c01FirebaseStubInstalled = true;
  let signedIn = null;
  const listeners = [];
  const user = {
    uid: "bc-b2c01-sa",
    email: "sa@qa.local",
    displayName: "QA Super Admin",
    getIdToken: async () => "bc-b2c01-f1111-token",
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

async function installSentinel(page) {
  await page.evaluate((text) => {
    const root = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = "toast toast-info";
    toast.setAttribute("data-qa-sentinel", "1");
    toast.innerHTML = `<div class="toast-body"><div class="toast-msg">${text}</div></div>`;
    root.appendChild(toast);
  }, SENTINEL);
}

async function waitModalReady(page) {
  await expect(page.locator("#sa-create-company-modal")).toBeVisible();
  await expect
    .poll(async () => page.locator("#sa-new-name").evaluate((el) => document.activeElement === el), {
      timeout: 10000
    })
    .toBe(true);
}

test("B2C-01-F1.1.1.1 visual trail screenshots", async ({ page }) => {
  test.setTimeout(120000);
  fs.mkdirSync(OUT, { recursive: true });

  const createdCa = { value: null };
  const companyRecord = { value: null };
  const counts = { company: 0, ca: 0 };
  let failedChunk = 0;
  let okChunk = 0;
  let blockChunk = true;

  await page.route("**/api/admin/companies", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const co = companyRecord.value || {
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
        companyAdmins: createdCa.value ? [createdCa.value] : []
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
  await page.route("**/api/admin/create-company", async (route) => {
    counts.company += 1;
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
    counts.ca += 1;
    const body = route.request().postDataJSON();
    createdCa.value = {
      id: "bc-b2c01-f1-uid",
      name: body?.name || CA_NAME,
      email: body?.email || CA_EMAIL,
      companyId: body?.companyId || SERVER_COMPANY_ID,
      active: true
    };
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true, uid: "bc-b2c01-f1-uid", email: body?.email })
    });
  });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

  await page.route(/sa-create-company-flow[^/]*\.js/, async (route) => {
    if (blockChunk) {
      failedChunk += 1;
      await route.fulfill({
        status: 503,
        contentType: "text/plain",
        body: "chunk unavailable",
        headers: { "Cache-Control": "no-store" }
      });
      return;
    }
    okChunk += 1;
    await route.continue();
  });

  await installRemoteApiSaBoot(page);
  await installFirebaseSaStubRoutes(page);
  await page.goto("/staff.html");
  await expect(page.locator("#login-dispatcher-email")).toBeVisible({ timeout: 20000 });
  await loginSuperAdmin(page, SA_EMAIL, SA_PASSWORD);
  await expect(page.locator("#sa-open-create-modal")).toBeVisible({ timeout: 20000 });
  await installSentinel(page);

  const timeOriginBefore = await page.evaluate(() => performance.timeOrigin);

  // 01 — load failure, one loader toast
  await page.locator("#sa-open-create-modal").click();
  await expect(page.locator("#sa-create-company-modal")).toBeVisible();
  await expect.poll(async () => page.locator('#toast-container .toast[data-sa-create-loader-toast="1"]').count(), {
    timeout: 8000
  }).toBe(1);
  const loaderFailureToastsAfterFailure = await page.locator('#toast-container .toast[data-sa-create-loader-toast="1"]').count();
  const initialFailedChunkRequests = failedChunk;
  await page.screenshot({ path: path.join(OUT, "01-load-failure-one-toast.png"), fullPage: false });

  // 02 — Close after failure, no reload / no additional chunk
  const failedBeforeClose = failedChunk;
  await page.locator("#sa-create-company-modal .modal-close").click();
  await expect(page.locator("#sa-create-company-modal")).toBeHidden({ timeout: 5000 });
  await page.waitForTimeout(400);
  const closeAdditionalChunkRequests = failedChunk - failedBeforeClose;
  expect(closeAdditionalChunkRequests).toBe(0);
  expect(await page.locator("#sa-ca-password").inputValue()).toBe("");
  await page.screenshot({ path: path.join(OUT, "02-close-after-failure-no-reload.png"), fullPage: false });

  // 03 — retry success, clean loader toast tray
  blockChunk = false;
  const chunkOk = page.waitForResponse(
    (res) => /sa-create-company-flow(?!-loader)/.test(res.url()) && res.status() === 200,
    { timeout: 15000 }
  );
  await page.locator("#sa-open-create-modal").click();
  await chunkOk;
  await waitModalReady(page);
  await expect.poll(async () => page.locator('#toast-container .toast[data-sa-create-loader-toast="1"]').count(), {
    timeout: 5000
  }).toBe(0);
  const loaderFailureToastsAfterRetry = await page.locator('#toast-container .toast[data-sa-create-loader-toast="1"]').count();
  const unrelatedSentinelAfterRetry = await page.locator('[data-qa-sentinel="1"]').count();
  expect(unrelatedSentinelAfterRetry).toBe(1);
  await page.screenshot({ path: path.join(OUT, "03-retry-success-clean-toast-tray.png"), fullPage: false });

  // 04 — CA success in table
  await page.locator("#sa-new-name").fill("BC-B2C01-F1-Co");
  await page.locator("#sa-new-tenant").fill("bc-b2c01-f1-client-slug");
  await page.locator("#sa-ca-name").fill(CA_NAME);
  await page.locator("#sa-ca-email").fill(CA_EMAIL);
  await page.locator("#sa-ca-password").fill(TEST_PASSWORD);
  await page.locator("#sa-create-company-btn").click();
  await expect(page.locator("#sa-create-company-modal")).toBeHidden({ timeout: 12000 });
  await expect(page.locator("#superadmin-companies-list")).toContainText(CA_NAME, { timeout: 10000 });
  await page.locator("#sa-companies-panel").scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: path.join(OUT, "04-ca-success-in-table.png"), fullPage: false });

  const timeOriginAfter = await page.evaluate(() => performance.timeOrigin);
  expect(timeOriginAfter).toBe(timeOriginBefore);

  const trail = {
    task: "B2C-01-F1.1.1.1",
    intercept: true,
    realWrites: 0,
    timeOriginBefore,
    timeOriginAfter,
    reloadCount: 0,
    initialFailedChunkRequests,
    closeAdditionalChunkRequests,
    loaderFailureToastsAfterFailure,
    loaderFailureToastsAfterRetry,
    unrelatedSentinelAfterRetry,
    createCompanyCount: counts.company,
    createUserCount: counts.ca,
    okChunkRequests: okChunk,
    success: counts.company === 1 && counts.ca === 1
      && closeAdditionalChunkRequests === 0
      && loaderFailureToastsAfterFailure === 1
      && loaderFailureToastsAfterRetry === 0
      && unrelatedSentinelAfterRetry === 1
      && timeOriginAfter === timeOriginBefore,
    note: "UI path only - not authz/API/Rules. No production USE_LOCAL_STATE override or ForTests hooks."
  };
  fs.writeFileSync(path.join(OUT, "TRAIL.json"), JSON.stringify(trail, null, 2));
  expect(trail.success).toBe(true);
});
