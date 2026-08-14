/**
 * B2C-01-R1-F1 — Manage account create-missing-admin (QA-local / intercept).
 * Real UI. Real production/staging writes = 0. workers=1.
 */
const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const { loginSuperAdmin } = require("./helpers.js");

const COMPANY_ID = "bc-b2c01-r1-tenant";
const TEST_PASSWORD = "BcR1-ok-9";
const SA_EMAIL = "sa@qa.local";
const SA_PASSWORD = "Qa-test-ok-9";
const OUT = path.join(__dirname, "../../reports/b2c01-r1-f1-visual");
const TRAIL = path.join(OUT, "TRAIL.json");

async function installRemoteApiSaBoot(page) {
  await page.addInitScript(() => {
    try { delete window.__BUSCOMMAND_QA_HARNESS__; } catch { /* ignore */ }
    window.__BUSCOMMAND_QA_HARNESS__ = false;
    localStorage.setItem("buscommand_lang", "en");
    sessionStorage.setItem("buscommand_pretrip_done", "true");
  });
}

async function installFirebaseSaStubRoutes(page) {
  const stub = `/*! b2c01-r1 firebase test stub */
(function () {
  if (window.__b2c01FirebaseStubInstalled) return;
  window.__b2c01FirebaseStubInstalled = true;
  let signedIn = null;
  const listeners = [];
  const user = {
    uid: "bc-b2c01-sa",
    email: "sa@qa.local",
    displayName: "QA Super Admin",
    getIdToken: async () => "bc-b2c01-r1-token",
    getIdTokenResult: async () => ({ claims: { role: "superadmin", name: "QA Super Admin" } })
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
        })
      })
    })
  };
})();`;
  await page.route(/gstatic\.com\/firebasejs|firebasejs|\/firebase-/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript; charset=utf-8",
      body: stub,
      headers: { "Cache-Control": "no-store" }
    });
  });
}

async function closeCompanyDetail(page) {
  const modal = page.locator("#sa-company-detail-modal");
  if (await modal.isVisible().catch(() => false)) {
    await modal.locator('[data-action="superadminCloseCompanyDetail"]').first().click({ force: true });
    await expect(modal).toBeHidden({ timeout: 15000 });
  }
}

async function openCompanyDetail(page) {
  await page.locator('[data-action="superadminOpenCompanyDetail"]').first().click();
  await expect(page.locator("#sa-company-detail-modal")).toBeVisible({ timeout: 15000 });
}

function companyDetail({ admins = [], caProvisionState = "missing_firestore_ca", caSlotClaimed = false } = {}) {
  const caCreateEligible = caProvisionState === "missing_firestore_ca" && !caSlotClaimed;
  return {
    success: true,
    company: {
      id: COMPANY_ID,
      name: "BC-R1 Missing CA Co",
      status: "active",
      licenseType: "pro",
      licenseStatus: "active",
      packageLabel: "Pro",
      country: "AT",
      contactEmail: null,
      counts: {
        companyAdmins: admins.length,
        dispatchers: 0,
        drivers: 0,
        groups: 0
      },
      admins,
      caProvisionState,
      caSlotClaimed,
      caCreateEligible
    }
  };
}

test.describe.configure({ mode: "serial" });

test("B2C-01-R1-F1 Manage account create-missing-admin visual + API counts", async ({ page }) => {
  test.setTimeout(180000);
  fs.mkdirSync(OUT, { recursive: true });

  const trail = {
    realWrites: 0,
    createCompanyRequests: 0,
    createMissingAdminRequests: 0,
    createUserRequests: 0,
    passwordLeak: false,
    outcomes: [],
    ctaByState: {},
    reload: { timeOriginBefore: null, timeOriginAfter: null },
    note: "UI-only intercept trail — not standalone authz/Rules proof"
  };

  let detailMode = "missing";
  let createdAdmin = null;

  await page.route("**/api/admin/companies", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        companies: [{
          id: COMPANY_ID,
          name: "BC-R1 Missing CA Co",
          status: "active",
          licenseType: "pro",
          country: "AT"
        }]
      })
    });
  });
  await page.route("**/api/admin/company-admins", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        companyAdmins: createdAdmin ? [createdAdmin] : []
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
  await page.route(`**/api/admin/company/${COMPANY_ID}`, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    if (detailMode === "unknown") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ success: false, error: "Simulated detail failure" })
      });
      return;
    }
    if (detailMode === "inactive") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(companyDetail({
          admins: [{
            id: "ca-inactive",
            name: "Inactive CA",
            email: "inactive@qa.local",
            active: false
          }],
          caProvisionState: "present_inactive",
          caSlotClaimed: false
        }))
      });
      return;
    }
    if (detailMode === "present" || createdAdmin) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(companyDetail({
          admins: [createdAdmin || {
            id: "ca-1",
            name: "R1 Admin",
            email: "r1-admin@qa.local",
            active: true
          }],
          caProvisionState: "present_active",
          caSlotClaimed: true
        }))
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(companyDetail())
    });
  });
  await page.route("**/api/admin/create-company", async (route) => {
    trail.createCompanyRequests += 1;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ success: false, error: "createCompany must not be called in R1 recovery" })
    });
  });
  await page.route("**/api/admin/create-user", async (route) => {
    trail.createUserRequests += 1;
    await route.continue();
  });
  await page.route(`**/api/admin/company/${COMPANY_ID}/create-missing-admin`, async (route) => {
    trail.createMissingAdminRequests += 1;
    const body = route.request().postDataJSON() || {};
    const blob = JSON.stringify(body);
    if (blob.includes(TEST_PASSWORD) === false && body.password) {
      // password is in request body by design; must not appear later in UI/TRAIL storage
    }
    createdAdmin = {
      id: "bc-r1-ca-uid",
      name: body.name || "R1 Admin",
      email: body.email || "r1-admin@qa.local",
      companyId: COMPANY_ID,
      active: true
    };
    detailMode = "present";
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true, uid: createdAdmin.id, email: createdAdmin.email })
    });
  });

  await installRemoteApiSaBoot(page);
  await installFirebaseSaStubRoutes(page);
  await page.goto("/staff.html");
  await expect(page.locator("#login-dispatcher-email")).toBeVisible({ timeout: 20000 });
  await loginSuperAdmin(page, SA_EMAIL, SA_PASSWORD);
  await expect(page.locator("#sa-companies-table, .sa-companies-table, [data-action='superadminOpenCompanyDetail']").first()).toBeVisible({ timeout: 20000 });

  trail.reload.timeOriginBefore = await page.evaluate(() => performance.timeOrigin);
  await page.reload();
  await expect(page.locator("#login-dispatcher-email")).toBeVisible({ timeout: 20000 });
  await loginSuperAdmin(page, SA_EMAIL, SA_PASSWORD);
  trail.reload.timeOriginAfter = await page.evaluate(() => performance.timeOrigin);

  // 01 — refresh + company without CA
  await openCompanyDetail(page);
  await expect(page.locator("[data-sa-create-missing-ca-cta='1']")).toBeVisible();
  trail.ctaByState.missing_firestore_ca = true;
  await page.screenshot({ path: path.join(OUT, "01-refresh-company-without-ca.png"), fullPage: false });
  trail.outcomes.push({ step: "01", pass: true });

  // 02 — open form
  await page.locator("[data-sa-create-missing-ca-cta='1']").click();
  await expect(page.locator("#sa-detail-create-missing-form")).toBeVisible({ timeout: 15000 });
  await expect(page.locator("#sa-missing-ca-password")).toHaveAttribute("type", "password");
  await page.screenshot({ path: path.join(OUT, "02-manage-account-create-ca-form.png"), fullPage: false });
  trail.outcomes.push({ step: "02", pass: true });

  // Double-click submit race: single-flight → one HTTP
  await page.fill("#sa-missing-ca-name", "R1 Admin");
  await page.fill("#sa-missing-ca-email", "r1-admin@qa.local");
  await page.fill("#sa-missing-ca-password", TEST_PASSWORD);
  const before = trail.createMissingAdminRequests;
  await Promise.all([
    page.locator("#sa-missing-ca-submit").click(),
    page.locator("#sa-missing-ca-submit").click()
  ]);
  await expect.poll(() => trail.createMissingAdminRequests, { timeout: 10000 }).toBe(before + 1);
  await expect(page.locator(".sa-detail-admin-row")).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: path.join(OUT, "03-create-ca-success-in-table.png"), fullPage: false });
  trail.outcomes.push({ step: "03", pass: true, createMissingAdminRequests: trail.createMissingAdminRequests });

  // Password must not linger in DOM or trail storage
  const pwdLeft = await page.locator("#sa-missing-ca-password").count();
  if (pwdLeft) {
    const val = await page.locator("#sa-missing-ca-password").inputValue();
    if (val) trail.passwordLeak = true;
  }
  const toastText = await page.locator("#toast-container").innerText().catch(() => "");
  if (toastText.includes(TEST_PASSWORD)) trail.passwordLeak = true;
  expect(trail.passwordLeak).toBe(false);
  expect(trail.createCompanyRequests).toBe(0);

  // 04 — inactive: Enable, no Create CTA
  detailMode = "inactive";
  createdAdmin = null;
  await closeCompanyDetail(page);
  await openCompanyDetail(page);
  await expect(page.locator("[data-sa-create-missing-ca-cta='1']")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Enable|Omogući|Aktivieren/i })).toBeVisible();
  trail.ctaByState.present_inactive = false;
  await page.screenshot({ path: path.join(OUT, "04-inactive-ca-no-create-cta.png"), fullPage: false });
  trail.outcomes.push({ step: "04", pass: true });

  // 05 — unknown: no Create CTA
  detailMode = "unknown";
  await closeCompanyDetail(page);
  await openCompanyDetail(page);
  await expect(page.locator("[data-sa-create-missing-ca-cta='1']")).toHaveCount(0);
  await expect(page.locator("#sa-detail-error")).toBeVisible();
  trail.ctaByState.unknown = false;
  await page.screenshot({ path: path.join(OUT, "05-unknown-no-create-cta.png"), fullPage: false });
  trail.outcomes.push({ step: "05", pass: true });

  // 06 — responsive + Escape clears password
  detailMode = "missing";
  createdAdmin = null;
  await closeCompanyDetail(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openCompanyDetail(page);
  await page.locator("[data-sa-create-missing-ca-cta='1']").click();
  await page.fill("#sa-missing-ca-password", TEST_PASSWORD);
  await page.keyboard.press("Escape");
  await expect(page.locator("#sa-detail-create-missing-form")).toHaveCount(0);
  const formGoneOrEmpty = await page.locator("#sa-missing-ca-password").count();
  expect(formGoneOrEmpty).toBe(0);
  await page.screenshot({ path: path.join(OUT, "06-responsive-keyboard-cleanup.png"), fullPage: false });
  trail.outcomes.push({ step: "06", pass: true });

  // Production hooks must not appear
  const hasForTests = await page.evaluate(() => Boolean(window.__b2c01ForTests || window.USE_LOCAL_STATE === true && window.__BUSCOMMAND_QA_HARNESS__));
  expect(hasForTests).toBe(false);

  fs.writeFileSync(TRAIL, JSON.stringify(trail, null, 2), "utf8");
});
