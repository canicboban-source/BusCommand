const { test, expect } = require("@playwright/test");
const { seedDemoState, loginDispatcher } = require("./helpers.js");
const { createEphemeralQaState } = require("./qa-factory.js");

/** Payload chunk only — never count msg-compose-loader-*.js */
const PAYLOAD_RE = /\/assets\/msg-compose-(?!loader-)[^/?#]+\.js(?:\?|$)/i;

test.describe.configure({ mode: "serial" });

function msgState(lang = "en") {
  const fixture = createEphemeralQaState({
    companyId: "qa-local",
    groupId: "101",
    driverName: "Msg QA Driver",
    dispoEmail: "dispo@qa.local",
    password: "Qa-test-ok-9",
    driverId: "11111111-1111-4111-8111-111111111111"
  });
  fixture.state.e2eFixture = true;
  fixture.state.activeGroupHubId = "101";
  fixture.state.activeLineId = "101";
  fixture.state.language = lang;
  fixture.state.drivers[0].active = true;
  fixture.state.drivers[0].bus = "91101";
  fixture.state.buses = [{
    id: "bus-91101",
    number: "91101",
    groupId: "101",
    lineId: "101",
    active: true,
    companyId: "qa-local"
  }];
  return fixture.state;
}

function trackPayload(page) {
  const urls = [];
  page.on("request", (req) => {
    if (PAYLOAD_RE.test(req.url())) urls.push(req.url());
  });
  return urls;
}

async function clickMessages(page) {
  await page.locator('a.nav-item[data-action="switchSection"][data-action-args*="dispatcher-messages"]').click();
}

async function expectComposeLive(page) {
  await expect(page.locator("#dispatcher-messages")).not.toHaveClass(/hidden/, { timeout: 20000 });
  const form = page.locator("#dispatcher-message-form-messages");
  await expect(form).toBeVisible();
  const template = page.locator("#message-template-messages");
  await expect(template).toBeVisible();
  await expect.poll(async () => template.locator("option").count()).toBeGreaterThan(1);
  const recipient = page.locator("#dispatcher-message-form-messages select").first();
  await expect(recipient).toBeVisible();
  await expect.poll(async () => recipient.locator("option").count()).toBeGreaterThan(0);
  const submit = page.locator(".msg-compose-submit");
  await expect(submit).toBeVisible();
  await expect(submit).toBeEnabled();
}

test.describe("B2C-D17-H1-A.1 true cold-lazy msg-compose", () => {
  test("payload stays 0 until Messages click; compose controls populate", async ({ page }) => {
    test.setTimeout(60000);
    const unhandled = [];
    page.on("pageerror", (err) => unhandled.push(String(err)));
    const payload = trackPayload(page);

    await seedDemoState(page, msgState("en"));
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await page.evaluate(() => {
      if (typeof window.changeLanguage === "function") window.changeLanguage("sr");
    });
    await page.waitForTimeout(600);

    expect(payload.length, "PAYLOAD_REQUESTS_BEFORE_CLICK").toBe(0);

    await clickMessages(page);
    await expectComposeLive(page);
    expect(payload.length).toBeGreaterThanOrEqual(1);

    const firstOpt = await page.locator("#message-template-messages option").nth(1).textContent();
    expect(String(firstOpt || "")).toMatch(/minut|Delay|Verspätung|min/i);
    expect(unhandled).toEqual([]);
  });

  test("controlled failure after click; retry keeps timeOrigin; controls populate", async ({ page }) => {
    test.setTimeout(60000);
    const unhandled = [];
    page.on("pageerror", (err) => unhandled.push(String(err)));
    const payload = trackPayload(page);

    let allow = false;
    let blocked = 0;
    await page.route(PAYLOAD_RE, async (route) => {
      if (!allow) {
        blocked += 1;
        // Prefer HTTP failure so the module URL appears in the error / recovery path.
        await route.fulfill({ status: 503, contentType: "text/plain", body: "chunk_unavailable" });
        return;
      }
      await route.continue();
    });

    await seedDemoState(page, msgState("sr"));
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await page.evaluate(() => {
      if (typeof window.changeLanguage === "function") window.changeLanguage("sr");
    });
    await page.waitForTimeout(400);
    expect(payload.length).toBe(0);

    const timeOriginBefore = await page.evaluate(() => performance.timeOrigin);
    await clickMessages(page);

    const toast = page.locator(".toast-error .toast-msg, .toast-error").first();
    await expect(toast).toBeVisible({ timeout: 15000 });
    await expect(toast).toContainText(/Modul za poruke nije učitan|try again|erneut versuchen/i);
    expect(blocked).toBeGreaterThanOrEqual(1);

    allow = true;
    await page.unroute(PAYLOAD_RE);
    await page.evaluate(() => {
      document.querySelectorAll(".toast, .toast-error").forEach((el) => el.remove());
      if (typeof window.switchSection === "function") window.switchSection("dispatcher-dashboard");
    });
    await page.waitForTimeout(200);
    await clickMessages(page);
    await expectComposeLive(page);

    const timeOriginAfter = await page.evaluate(() => performance.timeOrigin);
    expect(timeOriginAfter).toBe(timeOriginBefore);
    expect(unhandled).toEqual([]);
  });

  test("language: changeLanguage before open does not fetch; after load refreshes without new payload", async ({ page }) => {
    test.setTimeout(60000);
    const payload = trackPayload(page);

    await seedDemoState(page, msgState("en"));
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await page.evaluate(() => {
      if (typeof window.changeLanguage === "function") window.changeLanguage("de");
    });
    await page.waitForTimeout(500);
    expect(payload.length).toBe(0);

    await clickMessages(page);
    await expectComposeLive(page);
    const afterOpen = payload.length;
    expect(afterOpen).toBeGreaterThanOrEqual(1);

    const beforeLang = await page.locator("#message-template-messages option").nth(1).textContent();
    await page.evaluate(() => {
      if (typeof window.changeLanguage === "function") window.changeLanguage("sr");
    });
    await page.waitForTimeout(500);
    expect(payload.length).toBe(afterOpen);

    await expect.poll(async () => {
      const txt = await page.locator("#message-template-messages option").nth(1).textContent();
      return String(txt || "");
    }).not.toBe(String(beforeLang || ""));
  });

  test("execution error after successful load is not msg_compose_chunk_load_failed", async ({ page }) => {
    test.setTimeout(60000);
    const unhandled = [];
    page.on("pageerror", (err) => unhandled.push(String(err)));
    const payload = trackPayload(page);

    await seedDemoState(page, msgState("sr"));
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await clickMessages(page);
    await expectComposeLive(page);
    const loads = payload.length;
    expect(loads).toBeGreaterThanOrEqual(1);

    const patched = await page.evaluate(async () => {
      document.querySelectorAll(".toast, .toast-error").forEach((el) => el.remove());
      const loaderEntry = performance.getEntriesByType("resource")
        .map((e) => e.name)
        .find((n) => /\/assets\/msg-compose-loader-[^/?#]+\.js/i.test(n));
      if (!loaderEntry) return { ok: false, reason: "no-loader-entry" };
      const url = new URL(loaderEntry);
      const api = await import(`${url.pathname}${url.search || ""}`);
      const getIf =
        (typeof api.getMsgComposeIfLoaded === "function" && api.getMsgComposeIfLoaded)
        || (api.m && typeof api.m.getMsgComposeIfLoaded === "function" && api.m.getMsgComposeIfLoaded)
        || null;
      if (!getIf) return { ok: false, reason: "no-getIf", keys: Object.keys(api || {}) };
      const mod = getIf();
      if (!mod || typeof mod.setMessagesPageTab !== "function") {
        return { ok: false, reason: "no-module", modKeys: mod ? Object.keys(mod) : null };
      }
      mod.setMessagesPageTab = () => {
        throw new Error("h1a1_exec_boom");
      };
      return { ok: true };
    });
    expect(patched.ok).toBeTruthy();

    await page.evaluate(() => {
      if (typeof window.switchSection === "function") window.switchSection("dispatcher-dashboard");
    });
    await page.waitForTimeout(200);
    await clickMessages(page);
    await page.waitForTimeout(900);

    const toasts = await page.locator(".toast-error .toast-msg, .toast-error, .toast").allTextContents();
    const joined = toasts.join(" | ");
    expect(joined).not.toMatch(/Modul za poruke nije učitan|Messages module could not be loaded|Nachrichten-Modul konnte nicht geladen/i);
    // Existing generic execution outcome (sr/en/de error_generic) or empty if only console — prefer toast.
    if (joined.trim()) {
      expect(joined).toMatch(/Greška|Error|Fehler/i);
    }
    expect(payload.length).toBe(loads);
    expect(unhandled.filter((u) => !/h1a1_exec_boom/.test(u))).toEqual([]);
  });
});
