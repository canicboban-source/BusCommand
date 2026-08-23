/**
 * B2C-01-F1 … F1.1.1.1 — production-mode create-company → CA follow-up.
 * Real UI only. No production USE_LOCAL_STATE override / __b2c01f1 / ForTests hooks.
 * Boots without QA harness so imported USE_LOCAL_STATE is false; Firebase is test-routed.
 * Real writes = 0.
 */
const { test, expect } = require("@playwright/test");
const { loginSuperAdmin } = require("./helpers.js");

const SERVER_COMPANY_ID = "bc-b2c01-f1-server-tenant";
const TEST_PASSWORD = "BcF1-ok-9";
const SENTINEL = "QA-SENTINEL-UNRELATED-TOAST";
const SA_EMAIL = "sa@qa.local";
const SA_PASSWORD = "Qa-test-ok-9";

function createProbe() {
  return {
    company: 0,
    ca: 0,
    lastCaBody: null,
    dashCompanies: 0,
    dashOverview: 0,
    dashAdmins: 0,
    chunkRequests: 0
  };
}

/** Test-side remote boot: harness off → runtime USE_LOCAL_STATE=false. */
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

/**
 * Replace Firebase CDN scripts with a test Auth/Firestore stub BEFORE app modules run.
 * No production globals; intercept only.
 */
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

async function bootSaRemote(page) {
  await installRemoteApiSaBoot(page);
  await installFirebaseSaStubRoutes(page);
  await stubSaDashboardApis(page);
  await page.goto("/staff.html");
  await expect(page.locator("#login-dispatcher-email")).toBeVisible({ timeout: 20000 });
  await loginSuperAdmin(page, SA_EMAIL, SA_PASSWORD);
  await expect(page.locator("#sa-open-create-modal")).toBeVisible({ timeout: 20000 });
  await expect(page.locator("#superadmin-companies-list")).toBeVisible({ timeout: 10000 });
}

async function openCreateModal(page) {
  const chunkPromise = page.waitForResponse((res) => /sa-create-company-flow/.test(res.url()) && res.status() === 200, { timeout: 5000 }).catch(() => null);
  await page.locator("#sa-open-create-modal").click();
  await expect(page.locator("#sa-create-company-modal")).toBeVisible();
  await chunkPromise;
  await expect
    .poll(async () => {
      if (await page.locator("#sa-new-name").evaluate((el) => document.activeElement === el).catch(() => false)) {
        return "name";
      }
      if (await page.locator("#sa-ca-name").evaluate((el) => document.activeElement === el).catch(() => false)) {
        return "ca";
      }
      return "";
    }, { timeout: 10000 })
    .not.toBe("");
}

async function fillCreateForm(page, { withCa = true } = {}) {
  await page.locator("#sa-new-name").fill("BC-B2C01-F1-Co");
  await page.locator("#sa-new-tenant").fill("bc-b2c01-f1-client-slug");
  if (withCa) {
    await page.locator("#sa-ca-name").fill("BC-B2C01-F1 Admin");
    await page.locator("#sa-ca-email").fill("bc-b2c01-f1-admin@example.invalid");
    await page.locator("#sa-ca-password").fill(TEST_PASSWORD);
  }
}

async function installSentinelToast(page) {
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

async function expectSentinelAlive(page) {
  await expect(page.locator('[data-qa-sentinel="1"]')).toBeVisible();
  await expect(page.locator('[data-qa-sentinel="1"] .toast-msg')).toContainText(SENTINEL);
}

function attachDashboardRefreshProbe(page, probe) {
  page.on("request", (req) => {
    if (req.method() !== "GET") return;
    const u = req.url();
    if (/\/api\/admin\/companies(?:\?|$)/.test(u)) probe.dashCompanies += 1;
    else if (/\/api\/admin\/overview(?:\?|$)/.test(u)) probe.dashOverview += 1;
    else if (/\/api\/admin\/company-admins(?:\?|$)/.test(u)) probe.dashAdmins += 1;
  });
}

function refreshWaves(probe) {
  return Math.min(probe.dashCompanies, probe.dashOverview, probe.dashAdmins);
}

async function stubSaDashboardApis(page, { createdCa = null, companyRecord = null } = {}) {
  await page.route("**/api/admin/companies", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
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
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    const admins = createdCa?.value ? [createdCa.value] : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, companyAdmins: admins })
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

function installIntercepts(page, probe, { companyMode = "success", caMode = "success", createdCa = null, companyRecord = null } = {}) {
  page.route("**/api/admin/create-company", async (route) => {
    probe.company += 1;
    if (companyMode === "timeout") {
      await route.abort("timedout");
      return;
    }
    if (companyMode === "409") {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: "Firma već postoji ili je djelimično inicijalizovana.",
          code: "COMPANY_EXISTS"
        })
      });
      return;
    }
    const body = route.request().postDataJSON();
    if (companyRecord) {
      companyRecord.value = {
        id: SERVER_COMPANY_ID,
        name: body?.name || "BC-B2C01-F1-Co",
        status: "active"
      };
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        companyId: SERVER_COMPANY_ID,
        name: body?.name || "BC-B2C01-F1-Co",
        licenseType: "pro"
      })
    });
  });

  page.route("**/api/admin/create-user", async (route) => {
    const body = route.request().postDataJSON();
    probe.ca += 1;
    probe.lastCaBody = {
      email: body?.email,
      role: body?.role,
      companyId: body?.companyId,
      name: body?.name
    };
    if (caMode === "fail") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ success: false, error: "Greška pri kreiranju korisnika." })
      });
      return;
    }
    if (caMode === "fail-once" && probe.ca <= 1) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ success: false, error: "Greška pri kreiranju korisnika." })
      });
      return;
    }
    if (createdCa) {
      createdCa.value = {
        id: "bc-b2c01-f1-uid",
        name: body?.name || "BC-B2C01-F1 Admin",
        email: body?.email || "",
        companyId: body?.companyId || SERVER_COMPANY_ID,
        active: true
      };
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true, uid: "bc-b2c01-f1-uid", email: body?.email })
    });
  });
}

async function toastTexts(page) {
  return page.locator("#toast-container .toast-msg, .toast-msg").allTextContents();
}

async function loaderFailureToastCount(page) {
  return page.locator('#toast-container .toast[data-sa-create-loader-toast="1"]').count();
}

test.describe("B2C-01-F1 production create-company CA follow-up", () => {
  test.beforeEach(async ({ page }) => {
    await bootSaRemote(page);
  });

  test("A: company success with complete CA fields calls createUser once with server companyId", async ({ page }) => {
    const probe = createProbe();
    const createdCa = { value: null };
    const companyRecord = { value: null };
    await stubSaDashboardApis(page, { createdCa, companyRecord });
    attachDashboardRefreshProbe(page, probe);
    installIntercepts(page, probe, { companyMode: "success", caMode: "success", createdCa, companyRecord });
    await installSentinelToast(page);
    const refreshBefore = refreshWaves(probe);
    await openCreateModal(page);
    await fillCreateForm(page, { withCa: true });
    await page.locator("#sa-create-company-btn").click();
    await expect.poll(() => probe.company, { timeout: 10000 }).toBe(1);
    await expect.poll(() => probe.ca, { timeout: 10000 }).toBe(1);
    expect(probe.lastCaBody.companyId).toBe(SERVER_COMPANY_ID);
    expect(probe.lastCaBody.role).toBe("company_admin");
    await expect(page.locator("#sa-create-company-modal")).toBeHidden({ timeout: 8000 });
    expect(await page.evaluate(() => Boolean(window.__saCreateFlowTestApi || window.__b2c01f1))).toBe(false);
    await expect.poll(() => refreshWaves(probe) - refreshBefore, { timeout: 8000 }).toBe(1);
    await expect(page.locator("#superadmin-companies-list")).toContainText("BC-B2C01-F1 Admin", { timeout: 8000 });
    await expectSentinelAlive(page);
  });

  test("A2: company-only success refreshes dashboard exactly once (no createUser)", async ({ page }) => {
    const probe = createProbe();
    const companyRecord = { value: null };
    attachDashboardRefreshProbe(page, probe);
    await stubSaDashboardApis(page, { companyRecord });
    installIntercepts(page, probe, { companyMode: "success", caMode: "success", companyRecord });
    const refreshBefore = refreshWaves(probe);
    await openCreateModal(page);
    await fillCreateForm(page, { withCa: false });
    await page.locator("#sa-create-company-btn").click();
    await expect.poll(() => probe.company, { timeout: 10000 }).toBe(1);
    await page.waitForTimeout(400);
    expect(probe.ca).toBe(0);
    await expect(page.locator("#sa-create-company-modal")).toBeHidden({ timeout: 8000 });
    await expect.poll(() => refreshWaves(probe) - refreshBefore, { timeout: 8000 }).toBe(1);
  });

  test("B: company success + CA fail keeps modal; real Retry is CA-only", async ({ page }) => {
    const probe = createProbe();
    const createdCa = { value: null };
    const companyRecord = { value: null };
    attachDashboardRefreshProbe(page, probe);
    await stubSaDashboardApis(page, { createdCa, companyRecord });
    installIntercepts(page, probe, { companyMode: "success", caMode: "fail-once", createdCa, companyRecord });
    await installSentinelToast(page);
    const refreshBefore = refreshWaves(probe);
    await openCreateModal(page);
    await fillCreateForm(page, { withCa: true });
    await page.locator("#sa-create-company-btn").click();
    await expect.poll(() => probe.company).toBe(1);
    await expect.poll(() => probe.ca).toBe(1);
    await expect(page.locator("#sa-create-partial-banner")).toBeVisible();
    await expect(page.locator("#sa-create-company-btn")).toContainText(/Retry company admin|Firmenadmin erneut|Ponovi kreiranje/i);
    await expect.poll(() => refreshWaves(probe) - refreshBefore, { timeout: 8000 }).toBe(1);
    await expectSentinelAlive(page);

    const refreshMid = refreshWaves(probe);
    await page.locator("#sa-ca-password").fill(TEST_PASSWORD);
    await page.locator("#sa-create-company-btn").click();
    await expect.poll(() => probe.ca, { timeout: 10000 }).toBe(2);
    await expect.poll(() => refreshWaves(probe) - refreshMid, { timeout: 8000 }).toBe(1);
    expect(probe.company).toBe(1);
    await expect(page.locator("#sa-create-company-modal")).toBeHidden({ timeout: 8000 });
    await expectSentinelAlive(page);
  });

  test("generic 409 does not call createUser and shows localized exists message", async ({ page }) => {
    const probe = createProbe();
    await stubSaDashboardApis(page);
    installIntercepts(page, probe, { companyMode: "409", caMode: "success" });
    await openCreateModal(page);
    await fillCreateForm(page, { withCa: true });
    await page.locator("#sa-create-company-btn").click();
    await expect.poll(() => probe.company).toBe(1);
    await page.waitForTimeout(500);
    expect(probe.ca).toBe(0);
    const toasts = await toastTexts(page);
    expect(toasts.join("\n")).toMatch(/already exists|existiert bereits|već postoji/i);
  });

  test("company timeout/unknown does not call createUser; unknown close is truthful", async ({ page }) => {
    const probe = createProbe();
    await stubSaDashboardApis(page);
    installIntercepts(page, probe, { companyMode: "timeout", caMode: "success" });
    await installSentinelToast(page);
    await openCreateModal(page);
    await fillCreateForm(page, { withCa: true });
    await page.locator("#sa-create-company-btn").click();
    await expect(page.locator("#sa-create-partial-banner")).toBeVisible({ timeout: 10000 });
    expect(probe.ca).toBe(0);
    await page.locator("#sa-create-company-modal .modal-close").click();
    await expect(page.locator("#sa-create-leave-confirm")).toBeVisible({ timeout: 8000 });
    await expect(page.locator("#sa-create-leave-confirm-msg")).toContainText(/not confirmed|nicht bestätigt|nije potvrđen/i);
    await page.locator("#sa-create-leave-confirm-btn").click();
    await expectSentinelAlive(page);
  });

  test("unrelated sentinel toast survives partial → retry → success", async ({ page }) => {
    const probe = createProbe();
    const createdCa = { value: null };
    await stubSaDashboardApis(page, { createdCa });
    installIntercepts(page, probe, { companyMode: "success", caMode: "fail-once", createdCa });
    await installSentinelToast(page);
    await openCreateModal(page);
    await fillCreateForm(page, { withCa: true });
    await page.locator("#sa-create-company-btn").click();
    await expect.poll(() => probe.ca).toBe(1);
    await expectSentinelAlive(page);
    await page.locator("#sa-ca-password").fill(TEST_PASSWORD);
    await page.locator("#sa-create-company-btn").click();
    await expect.poll(() => probe.ca).toBe(2);
    await expect(page.locator("#sa-create-company-modal")).toBeHidden({ timeout: 8000 });
    await expectSentinelAlive(page);
  });

  test("double click single-flight keeps company requests at 1", async ({ page }) => {
    const probe = createProbe();
    await stubSaDashboardApis(page);
    installIntercepts(page, probe, { companyMode: "success", caMode: "success" });
    await openCreateModal(page);
    await fillCreateForm(page, { withCa: true });
    const btn = page.locator("#sa-create-company-btn");
    await btn.click({ noWaitAfter: true });
    await btn.click({ force: true, noWaitAfter: true }).catch(() => {});
    await expect.poll(() => probe.company, { timeout: 8000 }).toBe(1);
  });

  test("partial close via real Cancel requires confirmation; reopen restores CA-only", async ({ page }) => {
    const probe = createProbe();
    await stubSaDashboardApis(page);
    installIntercepts(page, probe, { companyMode: "success", caMode: "fail" });
    await openCreateModal(page);
    await fillCreateForm(page, { withCa: true });
    await page.locator("#sa-create-company-btn").click();
    await expect.poll(() => probe.ca).toBe(1);
    await page.locator('#sa-create-company-modal [data-action="superadminCloseCreateModal"].btn-secondary').click();
    await expect(page.locator("#sa-create-leave-confirm")).toBeVisible({ timeout: 8000 });
    await page.locator("#sa-create-leave-confirm-btn").click();
    await openCreateModal(page);
    await expect(page.locator("#sa-create-partial-banner")).toBeVisible();
    await expect(page.locator("#sa-create-company-btn")).toContainText(/Retry company admin|Firmenadmin erneut|Ponovi kreiranje/i);
    expect(probe.company).toBe(1);
  });

  test("no credential leak into toasts or storage", async ({ page }) => {
    const probe = createProbe();
    await stubSaDashboardApis(page);
    installIntercepts(page, probe, { companyMode: "success", caMode: "success" });
    await openCreateModal(page);
    await fillCreateForm(page, { withCa: true });
    await expect(page.locator("#sa-ca-password")).toHaveAttribute("type", "password");
    await page.locator("#sa-create-company-btn").click();
    await expect.poll(() => probe.ca, { timeout: 10000 }).toBe(1);
    const leak = await page.evaluate((pwd) => {
      const toasts = Array.from(document.querySelectorAll("#toast-container .toast-msg"))
        .map((el) => el.textContent || "")
        .join("\n");
      return {
        toastHasPwd: toasts.includes(pwd),
        lsHasPwd: JSON.stringify(localStorage).includes(pwd),
        ssHasPwd: JSON.stringify(sessionStorage).includes(pwd),
        stateHasPwd: JSON.stringify(window.state || {}).includes(pwd),
        hasSaCreateFlowTestApi: typeof window.__saCreateFlowTestApi !== "undefined",
        hasB2c01f1: typeof window.__b2c01f1 !== "undefined",
        // main-staff mirrors imported USE_LOCAL_STATE; create-flow must not override it.
        useLocalStateMirroredFalse: window.USE_LOCAL_STATE === false
      };
    }, TEST_PASSWORD);
    expect(leak.toastHasPwd).toBe(false);
    expect(leak.lsHasPwd).toBe(false);
    expect(leak.ssHasPwd).toBe(false);
    expect(leak.stateHasPwd).toBe(false);
    expect(leak.hasSaCreateFlowTestApi).toBe(false);
    expect(leak.hasB2c01f1).toBe(false);
    expect(leak.useLocalStateMirroredFalse).toBe(true);
  });

  test("F1.1.1.1 lazy load: Close no extra chunk; retry clears loader toast", async ({ page }) => {
    const probe = createProbe();
    const createdCa = { value: null };
    const companyRecord = { value: null };
    await stubSaDashboardApis(page, { createdCa, companyRecord });
    installIntercepts(page, probe, { companyMode: "success", caMode: "success", createdCa, companyRecord });
    await installSentinelToast(page);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

    let blockChunk = true;
    let failedChunk = 0;
    let okChunk = 0;
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

    const timeOriginBefore = await page.evaluate(() => performance.timeOrigin);

    // 1) Cold open → one loader-failure toast; sentinel stays
    await page.locator("#sa-open-create-modal").click();
    await expect(page.locator("#sa-create-company-modal")).toBeVisible();
    await expect.poll(async () => loaderFailureToastCount(page), { timeout: 8000 }).toBe(1);
    await expect.poll(async () => (await toastTexts(page)).join("\n"), { timeout: 2000 }).toMatch(
      /could not be loaded|konnte nicht geladen|nije učitan/i
    );
    await expectSentinelAlive(page);
    expect(probe.company).toBe(0);
    expect(probe.ca).toBe(0);
    const failedAfterOpen = failedChunk;

    // 2a) X close — no additional chunk requests, no extra loader toast
    const failedBeforeCloseX = failedChunk;
    const okBeforeCloseX = okChunk;
    await page.locator("#sa-create-company-modal .modal-close").click();
    await expect(page.locator("#sa-create-company-modal")).toBeHidden({ timeout: 5000 });
    await page.waitForTimeout(300);
    expect(failedChunk - failedBeforeCloseX).toBe(0);
    expect(okChunk - okBeforeCloseX).toBe(0);
    await expect.poll(async () => loaderFailureToastCount(page), { timeout: 2000 }).toBe(1);
    expect(await page.locator("#sa-ca-password").inputValue()).toBe("");

    // Re-open under block to exercise footer Close
    await page.locator("#sa-open-create-modal").click();
    await expect(page.locator("#sa-create-company-modal")).toBeVisible();
    await expect.poll(async () => failedChunk, { timeout: 8000 }).toBe(failedAfterOpen + 1);
    await expect.poll(async () => loaderFailureToastCount(page), { timeout: 8000 }).toBe(1);
    const failedBeforeFooter = failedChunk;
    await page.locator('#sa-create-company-modal [data-action="superadminCloseCreateModal"].btn-secondary').click();
    await expect(page.locator("#sa-create-company-modal")).toBeHidden({ timeout: 5000 });
    await page.waitForTimeout(300);
    expect(failedChunk - failedBeforeFooter).toBe(0);
    expect(await page.locator("#sa-ca-password").inputValue()).toBe("");

    // 3) Explicit Open retry same document — loader toast cleared; sentinel remains
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
    await expectSentinelAlive(page);
    const timeOriginAfter = await page.evaluate(() => performance.timeOrigin);
    expect(timeOriginAfter).toBe(timeOriginBefore);

    await fillCreateForm(page, { withCa: true });
    await page.locator("#sa-create-company-btn").click();
    await expect.poll(() => probe.company, { timeout: 12000 }).toBe(1);
    await expect.poll(() => probe.ca, { timeout: 12000 }).toBe(1);
    await expect(page.locator("#sa-create-company-modal")).toBeHidden({ timeout: 8000 });
    await expect.poll(async () => loaderFailureToastCount(page), { timeout: 3000 }).toBe(0);
    await expect(page.locator("#superadmin-companies-list")).toContainText("BC-B2C01-F1 Admin", { timeout: 8000 });
    await expectSentinelAlive(page);
    expect(failedAfterOpen).toBeGreaterThanOrEqual(1);
    expect(okChunk).toBeGreaterThanOrEqual(1);
  });

  test("F1.1.1.1 execution error shows error_generic, not loader-failure toast", async ({ page }) => {
    const probe = createProbe();
    await stubSaDashboardApis(page);
    installIntercepts(page, probe, { companyMode: "success", caMode: "success" });
    await installSentinelToast(page);

    let chunkHits = 0;
    page.on("request", (req) => {
      if (/sa-create-company-flow(?!-loader)[^/]*\.js/.test(req.url())) chunkHits += 1;
    });

    await openCreateModal(page);
    const chunksAfterOpen = chunkHits;
    await expect.poll(async () => loaderFailureToastCount(page), { timeout: 2000 }).toBe(0);

    await page.locator("#sa-create-company-modal .modal-close").click();
    await expect(page.locator("#sa-create-company-modal")).toBeHidden({ timeout: 5000 });

    // Test-side isolation: force a throw inside the already-loaded flow open path.
    // Shell sync focus may call getElementById("sa-new-name") once before the module run;
    // blow on the second call so the error is caught by withSaCreateFlowModule (error_generic).
    await page.evaluate(() => {
      const proto = Document.prototype;
      const orig = proto.getElementById;
      let blows = 0;
      proto.getElementById = function patchedGetElementById(id) {
        if (id === "sa-new-name") {
          blows += 1;
          if (blows >= 2) {
            proto.getElementById = orig;
            throw new Error("forced-execution-failure");
          }
        }
        return orig.call(this, id);
      };
    });

    await page.locator("#sa-open-create-modal").click();
    await expect.poll(async () => (await toastTexts(page)).join("\n"), { timeout: 8000 }).toMatch(
      /^(?:Error|Greška|Fehler)$/m
    );
    expect(await loaderFailureToastCount(page)).toBe(0);
    expect(chunkHits).toBe(chunksAfterOpen);
    await expectSentinelAlive(page);
    expect(probe.company).toBe(0);
  });
});
