const { test, expect } = require("@playwright/test");
const path = require("path");
const { seedDemoState, loginDispatcher, loginDriver } = require("./helpers.js");

test.describe("UI smoke", () => {
  async function openPendingDriverActivation(page) {
    await page.goto("/driver.html");
    await page.evaluate(() => {
      window.__testFirebaseSessionActive = true;
      const originalAuth = window.firebase.auth;
      window.firebase.auth = () => ({ signOut: async () => {
        window.__testFirebaseSessionActive = false;
        window.__testFirebaseSignOutCount = (window.__testFirebaseSignOutCount || 0) + 1;
      } });
      window.firebase.auth.restore = () => { window.firebase.auth = originalAuth; };
      window.openDriverActivation();
    });
  }

  test("login screen loads", async ({ page }) => {
    await page.goto("/staff.html");
    await expect(page.locator("#login-screen")).toBeVisible();
    await expect(page.locator("#app-branding-title")).toContainText("BusCommand");
  });

  test("QA harness never initializes Firebase", async ({ page }) => {
    await seedDemoState(page);
    await page.goto("/staff.html");
    await expect(page.locator("#login-screen")).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.USE_LOCAL_STATE === true)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.firebase?.apps?.length ?? 0)).toBe(0);
  });

  test("production mode fails closed without Preview Firebase variables", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("buscommand_lang", "en"));
    await page.goto("/staff.html?mode=production");
    await expect(page.locator("#login-logo")).toContainText("BusCommand");
    await expect(page.locator("#login-logo")).not.toContainText("FleetPulse");
    await expect(page.locator("#fp-mode-badge")).toBeHidden();
    await expect(page.locator("#login-trial-badge")).toBeHidden();
    await expect(page.locator("label[for='login-driver-pin']")).toHaveText("Login code");
    await expect(page.locator("[data-action='resetApp']")).toHaveCount(0);
    await expect(page.getByText("Reset App", { exact: true })).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Demo admin:");
    await expect(page.locator("body")).not.toContainText("Demo driver:");
    // The driver reads a translated sentence; the internal reason stays in the
    // console.
    await expect(page.locator("#login-error-driver")).toContainText("Sign-in is currently unavailable");
    await expect(page.locator("#login-error-driver")).not.toContainText("Firebase");
    await expect.poll(() => page.evaluate(() => window.firebase?.apps?.length ?? 0)).toBe(0);
  });

  test("production UI permissions block dispatcher administration", async ({ page }) => {
    await page.goto("/staff.html?mode=production");
    await expect(page.locator("#dispatcher-nav [data-action-args='[\"dispatcher-settings\"]']")).toHaveCount(0);
    await expect(page.locator("#dispatcher-nav [data-action-args='[\"company-admin-settings\"]']")).toHaveCount(0);
    await expect(page.locator("#company-admin-nav [data-action-args='[\"company-admin-settings\"]']")).toHaveCount(1);
    await expect(page.locator("#sa-demo-company-pin")).toBeHidden();
  });

  test("QA harness dispatcher login reaches dispo shell without settings", async ({ page }) => {
    // URL ?demo= is forbidden; ephemeral QA harness seeds accounts for the test only.
    await seedDemoState(page);
    await page.goto("/staff.html", { waitUntil: "networkidle" });
    await loginDispatcher(page, "dispo@qa.local", "Qa-test-ok-9");
    await expect(page.locator("#app-container")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#login-screen")).toBeHidden();
    await expect(page.locator("#dispatcher-nav [data-action-args*='settings']")).toHaveCount(0);
    expect(await page.evaluate(() => window.switchSection("dispatcher-settings"))).toBe(false);
  });

  test("company admin email login", async ({ page }) => {
    await seedDemoState(page);
    await page.goto("/staff.html");
    await page.locator("#tab-dispatcher-btn").click();
    await page.locator("#login-dispatcher-email").fill("ca@qa.local");
    await page.locator("#login-dispatcher-password").fill("Qa-test-ok-9");
    await page.locator("#dispatcher-login-btn").click();
    await expect(page.locator("#app-container")).toBeVisible();
    await expect(page.locator("#company-admin-nav [data-action-args='[\"company-admin-settings\"]']")).toHaveCount(1);
    expect(await page.evaluate(() => window.switchSection("company-admin-settings"))).toBe(true);
    await expect(page.locator("#company-admin-settings")).toBeVisible();
  });

  test("company admin validates headquarters policy, persists settings and exports safe CSV", async ({ page }) => {
    const state = require("./helpers.js").minimalDemoState();
    state.profile = {
      name: "BusCommand Demo",
      country: "AT",
      timezone: "Europe/Vienna",
      defaultLanguage: "en",
      contactEmail: "office@example.at"
    };
    state.settings = {
      plan: "trial",
      status: "active",
      maxDrivers: 50,
      maxDispatchers: 5
    };
    state.drivers[0].active = true;
    state.drivers[0].eid = "must-not-export";
    state.drivers[0].loginCodeHash = "must-not-export";
    await seedDemoState(page, state);
    await page.goto("/staff.html", { waitUntil: "networkidle" });
    await loginDispatcher(page, "ca@qa.local", "Qa-test-ok-9");
    await page.evaluate(() => window.switchSection("company-admin-settings"));

    const settings = page.locator("#company-admin-settings");
    await expect(settings).toBeVisible();
    await expect(page.locator("#ca-settings-timezone")).toHaveValue("Europe/Vienna");
    await expect(page.locator("#ca-settings-max-drivers")).toHaveText("50");
    await expect(settings).toContainText("No GPS tracking");
    await expect(settings).toContainText("No push messages");
    await expect(settings).toContainText("30 minutes");
    await expect(settings.locator("#clear-sos-modal, #print-schedule-modal")).toHaveCount(0);

    await page.locator("#ca-settings-country").selectOption("RS");
    await expect(page.locator("#ca-settings-timezone")).toHaveValue("Europe/Belgrade");
    await page.locator("#ca-settings-contact-email").fill("not-an-email");
    await page.locator("#ca-settings-save").click();
    await expect(page.locator("[data-company-settings-error='contactEmail']")).not.toBeEmpty();
    await expect.poll(() => page.evaluate(() => window.state.profile.country)).toBe("AT");

    await page.locator("#ca-settings-contact-email").fill("office@example.rs");
    await page.locator("#ca-settings-language").selectOption("sr");
    await page.locator("#ca-settings-save").click();
    await expect.poll(() => page.evaluate(() => window.state.profile)).toMatchObject({
      country: "RS",
      timezone: "Europe/Belgrade",
      defaultLanguage: "sr",
      contactEmail: "office@example.rs"
    });
    await expect(page.locator("#ca-settings-save-state")).toHaveClass(/is-saved/);

    const downloadPromise = page.waitForEvent("download");
    await settings.locator('[data-action="exportDriversCSV"]').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("buscommand_drivers.csv");
    const csv = await require("fs").promises.readFile(await download.path(), "utf8");
    expect(csv).toContain("E2E Driver");
    expect(csv).not.toContain("must-not-export");

    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("company admin overview is tenant scoped, truthful and responsive", async ({ page }) => {
    const state = require("./helpers.js").minimalDemoState();
    state.buses = [
      { id: "bus-101", number: "101", groupId: "101", lineId: "101", companyId: "qa-local" },
      { id: "foreign-bus", number: "999", groupId: "101", lineId: "101", companyId: "other-company" }
    ];
    state.drivers.push({ id: "foreign-driver", name: "Foreign", groupId: "101", companyId: "other-company" });
    await seedDemoState(page, state);
    await page.goto("/staff.html", { waitUntil: "networkidle" });
    await loginDispatcher(page, "ca@qa.local", "Qa-test-ok-9");
    await page.evaluate(() => window.switchSection("company-admin-dashboard"));

    await expect(page.locator("#company-admin-dashboard")).toBeVisible();
    await expect(page.locator("#ca-stat-drivers")).toHaveText("1");
    await expect(page.locator("#ca-stat-buses")).toHaveText("1");
    await expect(page.locator("#ca-stat-plans")).toHaveText("0");
    await expect(page.locator("#ca-firm-license-card")).not.toContainText("{days}");
    await expect(page.locator("#company-admin-dashboard")).not.toContainText("Online now");
    await expect(page.locator(".company-overview-status.is-incomplete")).toHaveAttribute("title", /active plan/i);

    await page.evaluate(() => {
      window.state.servicePlans = [{ id: "plan-101", groupId: "101", status: "active" }];
      window.switchSection("company-admin-dashboard");
    });
    await expect(page.locator("#ca-stat-plans")).toHaveText("1");
    await expect(page.locator(".company-overview-status.is-ready")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".company-overview-table thead")).toBeHidden();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("company admin previews, validates and saves tenant branding safely", async ({ page }) => {
    await seedDemoState(page);
    await page.goto("/staff.html", { waitUntil: "networkidle" });
    await loginDispatcher(page, "ca@qa.local", "Qa-test-ok-9");
    await page.evaluate(() => window.switchSection("company-admin-branding"));

    await expect(page.locator("#company-admin-branding")).toBeVisible();
    await expect(page.locator("#ca-branding-save-state")).toHaveAttribute("data-state", "saved");
    await page.locator("#settings-brand-name").fill("Alpine Transit");
    await expect(page.locator("#ca-branding-preview-name")).toHaveText("Alpine Transit");
    // Shell title stays on last saved branding until a successful save.
    await expect(page.locator("#app-branding-title")).toHaveText("QA Tenant");
    await expect(page.locator("#ca-branding-save-state")).toHaveAttribute("data-state", "unsaved");

    await page.locator("#settings-primary-color-hex").fill("green");
    await page.evaluate(() => {
      const logoData = document.getElementById("settings-brand-logo-data");
      if (logoData) logoData.value = "http://example.test/logo.png";
    });
    await page.locator("#ca-branding-save").click();
    await expect(page.locator("[data-branding-error='primaryColor']")).toContainText("#RRGGBB");
    await expect(page.locator("[data-branding-error='logoUrl']")).toContainText("HTTPS");
    await expect.poll(() => page.evaluate(() => window.state.branding.name || "")).toBe("QA Tenant");

    await page.locator("#settings-primary-color-hex").fill("#10b981");
    await page.locator("[data-action='clearCompanyBrandingLogo']").click();
    await page.locator("#ca-branding-save").click();
    await expect.poll(() => page.evaluate(() => window.state.branding)).toMatchObject({
      name: "Alpine Transit",
      primaryColor: "#10B981",
      logoUrl: ""
    });
    await expect(page.locator("#app-branding-title")).toHaveText("Alpine Transit");
    await expect(page.locator("#ca-branding-save-state")).toHaveAttribute("data-state", "saved");

    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("company admin creates, edits, filters and safely deletes only empty groups", async ({ page }) => {
    const state = require("./helpers.js").minimalDemoState();
    state.buses = [{ id: "bus-101", number: "101", groupId: "101", lineId: "101", companyId: "qa-local" }];
    state.servicePlans = [{ id: "plan-101", groupId: "101", status: "active", companyId: "qa-local" }];
    await seedDemoState(page, state);
    await page.goto("/staff.html", { waitUntil: "networkidle" });
    await loginDispatcher(page, "ca@qa.local", "Qa-test-ok-9");
    await page.evaluate(() => window.switchSection("company-admin-groups"));

    await expect(page.locator("#company-admin-groups")).toBeVisible();
    await expect(page.locator("#ca-groups-stat-total")).toHaveText("1");
    await expect(page.locator("#ca-groups-stat-ready")).toHaveText("1");
    const usedGroup = page.locator(".company-group-row").filter({ hasText: "Line 101" });
    await expect(usedGroup.locator(".company-group-delete-btn")).toBeDisabled();

    await page.locator("#ca-new-group-line-id").fill("north");
    await page.locator("#ca-new-group-name").fill("N");
    await page.locator("#ca-save-group").click();
    await expect(page.locator("[data-group-error='id']")).toContainText("1 to 6 digits");
    await expect(page.locator("[data-group-error='name']")).toContainText("at least 2");

    await page.locator("#ca-new-group-line-id").fill("310");
    await page.locator("#ca-new-group-name").fill("North depot");
    await page.locator("#ca-new-group-desc").fill("Pilot line");
    await page.locator("#ca-new-group-color-hex").fill("#10b981");
    await page.locator("#ca-save-group").click();
    await expect.poll(() => page.evaluate(() => window.state.groups.find(group => group.id === "310"))).toMatchObject({
      name: "North depot",
      description: "Pilot line",
      color: "#10B981"
    });
    await expect(page.locator("#ca-groups-stat-total")).toHaveText("2");

    await page.locator("#ca-groups-search").fill("north");
    await expect(page.locator(".company-group-row")).toHaveCount(1);
    await page.locator("#ca-groups-search").fill("");
    const emptyGroup = page.locator(".company-group-row").filter({ hasText: "North depot" });
    await emptyGroup.getByRole("button", { name: "Edit" }).click();
    await expect(page.locator("#ca-new-group-line-id")).toBeDisabled();
    await page.locator("#ca-new-group-name").fill("North operations");
    await page.locator("#ca-save-group").click();
    await expect.poll(() => page.evaluate(() => window.state.groups.find(group => group.id === "310")?.name)).toBe("North operations");

    const editedGroup = page.locator(".company-group-row").filter({ hasText: "North operations" });
    await editedGroup.locator(".company-group-delete-btn").click();
    await expect(page.locator("#global-confirm-modal")).toBeVisible();
    await page.locator("#global-confirm-yes").click();
    await expect.poll(() => page.evaluate(() => window.state.groups.some(group => group.id === "310"))).toBe(false);
    await expect(page.locator("#ca-groups-stat-total")).toHaveText("1");

    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("company admin activity log stays truthful when no server events exist", async ({ page }) => {
    await seedDemoState(page);
    await page.goto("/staff.html");
    await loginDispatcher(page, "ca@qa.local", "Qa-test-ok-9");
    expect(await page.evaluate(() => window.switchSection("company-admin-audit"))).toBe(true);

    await expect(page.locator("#company-admin-audit")).toBeVisible();
    await expect(page.locator(".company-audit-table tbody tr")).toHaveCount(0);
    await expect(page.locator("#ca-audit-list")).toContainText(
      /No matching activity|Nema odgovarajuće aktivnosti/i
    );
    await page.locator("#ca-audit-category").selectOption("plans");
    await expect(page.locator(".company-audit-table tbody tr")).toHaveCount(0);
    await page.locator("[data-action='resetCompanyAuditFilters']").click();
    await expect(page.locator(".company-audit-table tbody tr")).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("company admin validates and publishes the versioned XLSX service plan", async ({ page }) => {
    const state = require("./helpers.js").minimalDemoState();
    state.groups = [
      { id: "north", name: "North depot", color: "#3D7EF5", active: true, companyId: "qa-local" },
      { id: "south", name: "South depot", color: "#10B981", active: true, companyId: "qa-local" }
    ];
    await seedDemoState(page, state);
    await page.goto("/staff.html", { waitUntil: "networkidle" });
    await loginDispatcher(page, "ca@qa.local", "Qa-test-ok-9");
    expect(await page.evaluate(() => window.switchSection("company-admin-service-plan"))).toBe(true);

    await expect(page.locator("#company-admin-service-plan")).toBeVisible();
    await page.locator("#ca-service-plan-group").selectOption("north");
    await page.locator("#ca-service-plan-file").setInputFiles(
      path.resolve(__dirname, "../../tests/fixtures/qa-dienstplan-sample.xlsx")
    );
    await expect(page.locator("#ca-service-plan-preview")).toContainText("Ready to activate");
    await expect(page.locator("#ca-service-plan-preview")).toContainText("First publication for this group");
    await expect(page.locator(".service-plan-table tbody tr")).toHaveCount(1);
    await expect(page.locator(".service-plan-table")).toContainText("310.S01");
    await expect(page.locator("#ca-publish-service-plan")).toContainText("Activate catalog");
    await expect(page.locator(".ca-catalog-activation-bar")).toBeVisible();
    await page.locator(".service-plan-duty-link").click();
    await expect(page.locator(".service-plan-duty-drawer")).toBeVisible();
    await expect(page.locator(".service-plan-activity-list article")).toHaveCount(25);
    await page.locator(".service-plan-duty-drawer .btn-icon-nav").click();
    await expect(page.locator(".service-plan-duty-drawer")).toHaveCount(0);
    await page.locator("#ca-publish-service-plan").click();
    await expect.poll(() => page.evaluate(() => window.state.servicePlans?.length || 0)).toBe(1);
    await page.locator("#ca-service-plan-group").selectOption("south");
    await page.locator("#ca-service-plan-file").setInputFiles(
      path.resolve(__dirname, "../../tests/fixtures/qa-dienstplan-sample.xlsx")
    );
    await page.locator("#ca-publish-service-plan").click();
    await expect.poll(() => page.evaluate(() => window.state.servicePlans?.length || 0)).toBe(2);
    await expect.poll(() => page.evaluate(() => window.state.servicePlans.map(plan => plan.groupId).sort())).toEqual(["north", "south"]);
    await expect(page.locator("#ca-current-service-plans")).toContainText("North depot");
    await expect(page.locator("#ca-current-service-plans")).toContainText("South depot");
    await expect(page.locator("#ca-current-service-plans")).toContainText("66");
  });

  test("company admin imports, filters and controls driver accounts", async ({ page }) => {
    await seedDemoState(page);
    await page.goto("/staff.html", { waitUntil: "networkidle" });
    await loginDispatcher(page, "ca@qa.local", "Qa-test-ok-9");
    expect(await page.evaluate(() => window.switchSection("company-admin-drivers"))).toBe(true);

    await expect(page.locator("#company-admin-drivers")).toBeVisible();
    await expect(page.locator("#ca-drivers-stat-total")).toHaveText("1");
    await page.locator("#ca-drivers-import-group").selectOption("101");
    await page.locator("#ca-drivers-import-file").setInputFiles({
      name: "drivers-e2e.csv",
      mimeType: "text/csv",
      buffer: Buffer.from([
        "eid,first_name,last_name,phone,email,company_code",
        "E2E-001,Ana,Jovanovic,+43660000001,ana.jovanovic@example.com,TEST-001",
        "E2E-002,Marko,Petrovic,+43660000002,marko.petrovic@example.com,TEST-002"
      ].join("\n"))
    });
    await expect(page.locator("#ca-drivers-import-preview tbody tr")).toHaveCount(2);
    await expect(page.locator("#ca-drivers-import-preview")).not.toContainText("BC-ANA-2026");
    await expect(page.locator("#ca-drivers-import-preview")).not.toContainText("TEST-001");
    await expect(page.locator(".company-drivers-legacy-notice")).toBeVisible();
    await page.locator("#ca-drivers-import-preview .company-drivers-import-button").click();
    await expect(page.locator("#ca-drivers-stat-total")).toHaveText("3");

    await page.locator("#ca-drivers-search").fill("Ana Jovanovic");
    await expect(page.locator("#ca-drivers-directory tbody tr")).toHaveCount(1);
    await expect(page.locator("#ca-drivers-directory")).toContainText("ana.jovanovic@example.com");

    await page.locator("#ca-drivers-search").fill("");
    // Seed driver starts active (assignment E2E); deactivate explicitly to exercise inactive filter.
    await page.evaluate(() => {
      const seed = (window.state.drivers || []).find((d) => d.id === "drv-e2e" || d.name === "E2E Driver");
      if (seed) seed.active = false;
      if (typeof window.renderCompanyAdminDrivers === "function") window.renderCompanyAdminDrivers();
    });
    await page.locator("#ca-drivers-status-filter").selectOption("inactive");
    await expect(page.locator("#ca-drivers-directory tbody tr")).toHaveCount(1);
    await page.locator("#ca-drivers-directory .company-driver-status-action").click();
    await page.locator("#global-confirm-yes").click();
    await expect(page.locator("#ca-drivers-stat-active")).toHaveText("3");
    await expect(page.locator("#ca-drivers-directory tbody tr")).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#ca-drivers-status-filter").selectOption("");
    await expect(page.locator("#company-admin-drivers")).toBeVisible();
    await expect(page.locator(".company-drivers-summary")).toBeVisible();
    const mobileWidths = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth
    }));
    expect(mobileWidths.document).toBeLessThanOrEqual(mobileWidths.viewport + 1);
  });

  test("company admin reviews immutable service plan history", async ({ page }) => {
    const state = require("./helpers.js").minimalDemoState();
    state.groups = [{ id: "north", name: "North depot", color: "#3D7EF5", active: true, companyId: "qa-local" }];
    const duty = {
      code: "310.S01", dayType: "SCHOOL_WEEKDAY", workStart: "04:02", firstTripStart: "04:33",
      lastTripEnd: "14:00", workEnd: "14:35", activities: [
        { dutyCode: "310.S01", sequence: 1, type: "FAHRT", start: "04:33", end: "14:00", from: "Depot", to: "Central" }
      ]
    };
    state.servicePlans = [
      { id: "north-310-66-2026-02-09", groupId: "north", planCode: "310", planVersion: "66", validFrom: "2026-02-09", timezone: "Europe/Vienna", status: "superseded", publishedAt: "2026-02-01T09:00:00.000Z", publishedBy: "admin-1", dutyCount: 1, duties: [duty] },
      { id: "north-310-67-2026-03-01", groupId: "north", planCode: "310", planVersion: "67", validFrom: "2026-03-01", timezone: "Europe/Vienna", status: "active", publishedAt: "2026-02-20T09:00:00.000Z", publishedBy: "admin-2", dutyCount: 1, duties: [{ ...duty, workStart: "04:05" }] }
    ];
    await seedDemoState(page, state);
    await page.goto("/staff.html", { waitUntil: "networkidle" });
    await loginDispatcher(page, "ca@qa.local", "Qa-test-ok-9");
    expect(await page.evaluate(() => window.switchSection("company-admin-service-plan"))).toBe(true);
    await expect(page.locator("#company-admin-service-plan")).toBeVisible();
    await page.locator("#ca-service-plan-group").selectOption("north");

    await expect(page.locator("#ca-service-plan-history tbody tr")).toHaveCount(2);
    await expect(page.locator("#ca-service-plan-history")).toContainText("67");
    await expect(page.locator("#ca-service-plan-history")).toContainText("66");
    await page.locator("#ca-service-plan-history tbody tr").filter({ hasText: "66" }).getByRole("button", { name: /View/i }).click();
    await expect(page.locator(".service-plan-history-detail")).toContainText("310.S01");
    await page.locator(".service-plan-history-duties summary").click();
    await expect(page.locator(".service-plan-history-detail .service-plan-activity-list article")).toHaveCount(1);
    await page.locator(".service-plan-history-detail-header .btn-secondary").click();
    await expect(page.locator(".service-plan-history-detail")).toHaveCount(0);
    await page.locator("#ca-service-plan-history tbody tr").filter({ hasText: "66" }).getByRole("button", { name: /Restore this version/i }).click();
    await expect(page.locator("#ca-service-plan-history")).toContainText("ACTIVE");
    await expect(page.locator("#ca-current-service-plans")).toContainText("66");
  });

  test("rapid dispatcher creation double-click creates one account", async ({ page }) => {
    await seedDemoState(page);
    await page.goto("/staff.html");
    await loginDispatcher(page, "ca@qa.local", "Qa-test-ok-9");
    expect(await page.evaluate(() => window.switchSection("company-admin-team"))).toBe(true);
    await expect(page.locator("#company-admin-team")).toBeVisible();
    await page.locator("#ca-new-disp-name").fill("Single Dispatcher");
    await page.locator("#ca-new-disp-email").fill("single@example.test");
    await page.locator("#ca-new-disp-password").fill("safe-test-password-123");
    await page.locator(".company-team-group-option").first().click();
    await page.locator("#ca-add-dispatcher-btn").scrollIntoViewIfNeeded();
    await page.locator("#ca-add-dispatcher-btn").dblclick();
    await expect.poll(() => page.evaluate(() =>
      window.state.dispatchers.filter(dispatcher => dispatcher.email === "single@example.test").length
    )).toBe(1);
    await expect(page.locator("#ca-add-dispatcher-btn")).toBeEnabled();
  });

  test("company admin manages dispatcher access, assignments, filters and mobile layout", async ({ page }) => {
    const state = require("./helpers.js").minimalDemoState();
    state.groups.push({ id: "102", name: "Line 102", color: "#10B981", active: true, companyId: "qa-local" });
    await seedDemoState(page, state);
    await page.goto("/staff.html");
    await loginDispatcher(page, "ca@qa.local", "Qa-test-ok-9");
    expect(await page.evaluate(() => window.switchSection("company-admin-team"))).toBe(true);
    await expect(page.locator("#company-admin-team")).toBeVisible();

    await expect(page.locator("#ca-team-stat-total")).toHaveText("1");
    await page.locator("#ca-add-dispatcher-btn").scrollIntoViewIfNeeded();
    await page.locator("#ca-add-dispatcher-btn").click({ force: true });
    await expect(page.locator("[data-dispatcher-error='name']")).not.toBeEmpty();

    await page.locator("#ca-new-disp-name").fill("Ana Dispatcher");
    await page.locator("#ca-new-disp-email").fill("ana@example.test");
    await page.locator("#ca-new-disp-password").fill("safe-password-123");
    await page.locator(".company-team-group-option").filter({ has: page.locator('.ca-new-disp-group[value="101"]') }).click();
    await page.locator("#ca-add-dispatcher-btn").click({ force: true });
    await expect(page.locator("#ca-team-stat-total")).toHaveText("2");
    const ana = page.locator(".company-team-card").filter({ hasText: "ana@example.test" });
    await expect(ana).toContainText("Line 101");

    await ana.getByRole("button", { name: /Groups/i }).click();
    await ana.locator(".company-team-group-option").filter({ has: page.locator(".ca-disp-grp-chk[value='102']") }).click();
    await ana.getByRole("button", { name: /Save changes/i }).click();
    await expect(page.locator(".company-team-card").filter({ hasText: "ana@example.test" })).toContainText("Line 102");

    await page.locator("#ca-team-search").fill("Ana");
    await expect(page.locator(".company-team-card")).toHaveCount(1);
    await page.locator("#ca-team-search").fill("");
    const updatedAna = page.locator(".company-team-card").filter({ hasText: "ana@example.test" });
    // Active dispatchers expose a single profile action as .row-actions-direct (not ⋯ menu).
    await updatedAna.locator('[data-action="toggleCaDispProfileEdit"]').click();
    await updatedAna.locator('input[id^="ca-disp-edit-phone-"]').fill("+4369912345678");
    await updatedAna.getByRole("button", { name: /Save changes/i }).click();
    await expect(page.locator(".company-team-card").filter({ hasText: "ana@example.test" })).toContainText("+4369912345678");

    await updatedAna.locator(".company-team-status-toggle").click();
    await page.locator("#global-confirm-yes").click();
    await expect(page.locator(".company-team-card").filter({ hasText: "ana@example.test" })).toContainText("Deactivated");
    await page.locator("#ca-team-status-filter").selectOption("inactive");
    await expect(page.locator(".company-team-card")).toHaveCount(1);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("#company-admin-team")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow).toBe(false);

    // Row-actions portal needs a desktop hit target; restore width before Delete.
    await page.setViewportSize({ width: 1280, height: 800 });
    const inactiveAna = page.locator(".company-team-card").filter({ hasText: "ana@example.test" });
    await inactiveAna.locator(".row-actions-trigger").click();
    await page.locator('.row-actions-item[data-action="removeCompanyDispatcher"]:visible').click();
    await expect(page.locator("#global-confirm-message")).toContainText("Historical plans and audit records remain");
    await page.locator("#global-confirm-yes").click();
    await expect(page.locator(".company-team-card").filter({ hasText: "ana@example.test" })).toHaveCount(0);
    await expect(page.locator("#ca-team-stat-total")).toHaveText("1");
  });

  test("driver PIN login", async ({ page }) => {
    await seedDemoState(page);
    await page.goto("/driver.html");
    await loginDriver(page);
    await expect(page.locator("#driver-dashboard")).toBeVisible();
  });

  test("driver dashboard stays usable when route data is incomplete", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    const state = require("./helpers.js").minimalDemoState();
    state.routes = [];
    state.reports = [{ id: "incomplete", driver: "E2E Driver", status: "Aktivno" }];
    await seedDemoState(page, state);
    await page.goto("/staff.html");
    await loginDriver(page);
    await page.evaluate(() => {
      window.state.routes = [];
      window.state.reports = [{ id: "incomplete", driver: window.currentUser.name, status: "Aktivno" }];
      window.switchSection("driver-dashboard");
    });
    await expect(page.locator("#driver-dashboard")).toBeVisible();
    await expect(page.locator("#driver-route-num")).toHaveText("—");
    await expect(page.locator("#driver-bus-num")).toHaveText("101");
    expect(pageErrors).toEqual([]);
  });

  test("SOS alarm flow", async ({ page }) => {
    await seedDemoState(page);
    await page.goto("/staff.html");
    await loginDriver(page);
    await page.evaluate(() => {
      const modal = document.getElementById("global-confirm-modal");
      if (modal && !modal.classList.contains("hidden") && typeof closeConfirmModal === "function") {
        closeConfirmModal();
      }
    });
    await page.evaluate(() => triggerSOSAlert());
    await expect(page.locator("#sos-trigger-modal")).toBeVisible();
    await page.evaluate(() => confirmSOSTrigger());
    await expect(page.locator("#driver-sos-banner")).toBeVisible();
    await page.evaluate(() => {
      if (window.state) {
        return window.state.sosActive === true;
      }
      return false;
    }).then((active) => expect(active).toBe(true));
  });

  test("dispatcher assigns shift", async ({ page }) => {
    await seedDemoState(page);
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await page.evaluate(() => {
      // FAZA 3: assignment preflight requires the driver's bus to exist in fleet.
      window.state.buses = [{
        id: "bus-e2e-101",
        number: "101",
        groupId: "101",
        groupIds: ["101"],
        lineId: "101",
        active: true,
        opsStatus: "ready",
        companyId: "qa-local"
      }];
      window.state.shiftCatalogs = window.state.shiftCatalogs || {};
      window.state.shiftCatalogs["101"] = {
        line: "101",
        lineId: "101",
        entries: {
          "310.E2E": {
            code: "310.E2E",
            type: "morning",
            start: "06:00",
            end: "14:00",
            label: "E2E duty"
          }
        }
      };
      window.state.shiftCatalog = window.state.shiftCatalogs["101"];
      window.state.activeGroupFilter = "101";
      window.state.activeGroupHubId = "101";
    });
    await page.evaluate(() => window.switchSection("dispatcher-shifts"));
    await expect(page.locator("#dispatcher-shifts")).toBeVisible();
    await page.locator("#shift-driver-select").selectOption("E2E Driver");
    const today = new Date().toISOString().slice(0, 10);
    await page.locator("#shift-date-input").fill(today);
    await page.locator("#shift-name-input").fill("310.E2E");
    await expect(page.locator("#shift-type-select")).toHaveCount(0);
    await expect(page.locator("#shift-start-input")).toHaveCount(0);
    await page.getByRole("button", { name: /Assign Shift|Dodeli/i }).click();
    const shiftCount = await page.evaluate(() => {
      const today = new Date().toISOString().slice(0, 10);
      return (window.state.shifts || []).filter(
        (s) => s.driverName === "E2E Driver" && s.date === today
      ).length;
    });
    expect(shiftCount).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => {
      const today = new Date().toISOString().slice(0, 10);
      const shift = (window.state.shifts || []).find((item) => item.driverName === "E2E Driver" && item.date === today);
      return shift ? `${shift.start}-${shift.end}` : "";
    })).toBe("06:00-14:00");
  });

  test("rapid quick-report double click creates one report", async ({ page }) => {
    await seedDemoState(page);
    await page.goto("/staff.html");
    await loginDriver(page);
    await page.evaluate(() => {
      const modal = document.getElementById("global-confirm-modal");
      if (modal && !modal.classList.contains("hidden") && typeof closeConfirmModal === "function") {
        closeConfirmModal();
      }
    });
    const reportButton = page.locator('[data-action="sendQuickReport"][data-action-args=\'["Stau"]\']');
    await expect(reportButton).toHaveCount(1);
    await reportButton.dblclick();
    await expect.poll(() => page.evaluate(() =>
      (window.state.reports || []).filter(report => report.type === "delay:10").length
    )).toBe(1);
  });

  test("driver submits validated breakdown and lost-item forms", async ({ page }) => {
    await seedDemoState(page);
    await page.goto("/staff.html");
    await loginDriver(page);
    await page.evaluate(() => {
      const modal = document.getElementById("global-confirm-modal");
      if (modal && !modal.classList.contains("hidden") && typeof closeConfirmModal === "function") closeConfirmModal();
      window.switchSection("driver-reports");
    });
    await expect(page.locator("#driver-reports")).toBeVisible();
    await page.locator("#breakdown-type").selectOption("bd_brakes");
    await page.locator("#breakdown-severity").selectOption("sev_critical");
    await page.locator("#breakdown-desc").fill("Brake pressure warning near Central Station");
    await page.locator("#breakdown-report-form button[type='submit']").click();
    await expect.poll(() => page.evaluate(() =>
      (window.state.reports || []).filter(report => report.type === "breakdown:bd_brakes").length
    )).toBe(1);

    await page.evaluate(() => window.switchSection("driver-reports"));
    await page.locator("#lost-item-type").selectOption("lost_wallet");
    await page.locator("#lost-item-location").fill("Seat 12");
    await page.locator("#lost-item-desc").fill("Red leather wallet");
    await page.locator("#lost-item-form button[type='submit']").click();
    await expect.poll(() => page.evaluate(() =>
      (window.state.lostItems || []).filter(item => item.type === "lost_wallet" && item.location === "Seat 12").length
    )).toBe(1);
  });

  test("driver archives a read message without deleting it", async ({ page }) => {
    const state = require("./helpers.js").minimalDemoState();
    state.messages = [{
      id: "msg-archive-e2e", recipient: "E2E Driver", sender: "Dispatcher",
      text: "Return to depot", date: "2026-07-20", time: "12:00", read: true
    }];
    await seedDemoState(page, state);
    await page.goto("/staff.html");
    await loginDriver(page);
    await page.evaluate(() => {
      const modal = document.getElementById("global-confirm-modal");
      if (modal && !modal.classList.contains("hidden") && typeof closeConfirmModal === "function") closeConfirmModal();
      window.switchSection("driver-dashboard");
    });
    const archiveButton = page.locator('[data-action="archiveMessage"]');
    await expect(archiveButton).toHaveCount(1);
    await archiveButton.click();
    await expect.poll(() => page.evaluate(() => {
      const message = (window.state.messages || []).find(item => item.id === "msg-archive-e2e");
      return Boolean(message && message.archivedBy?.includes("E2E Driver"));
    })).toBe(true);
    await expect(page.locator("#driver-messages-archive details")).toBeVisible();
  });

  test("driver requests a validated leave period", async ({ page }) => {
    await seedDemoState(page);
    await page.goto("/staff.html");
    await loginDriver(page);
    const start = await page.evaluate(() => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 14);
      return d.toISOString().slice(0, 10);
    });
    const end = await page.evaluate((s) => {
      const d = new Date(`${s}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() + 2);
      return d.toISOString().slice(0, 10);
    }, start);
    await page.evaluate(() => {
      if (!document.getElementById("global-confirm-modal")?.classList.contains("hidden")) {
        if (typeof window.closeConfirmModal === "function") window.closeConfirmModal();
      }
      window.switchSection("driver-vacation");
    });
    await page.locator("#vacation-start").fill(start);
    await page.locator("#vacation-end").fill(end);
    await page.locator("#vacation-type").selectOption("lt_vacation");
    await page.locator("#vacation-reason").fill("Family leave");
    await page.locator("#vacation-form button[type='submit']").click();
    const confirmYes = page.locator("#global-confirm-modal #global-confirm-yes");
    await expect(confirmYes).toBeVisible();
    await confirmYes.click();
    await expect.poll(() => page.evaluate(() => window.state.vacations?.[0]?.days)).toBe(3);
    await expect(page.locator("#driver-vacation-history .badge.pending")).toHaveCount(1);
  });

  test("driver calendar uses assigned data across month navigation", async ({ page }) => {
    const state = require("./helpers.js").minimalDemoState();
    const month = new Date().toISOString().slice(0, 7);
    state.schedules = [{
      id: `E2E Driver_${month}`, driverId: "drv-e2e", driverName: "E2E Driver", month,
      fileName: "", fileType: "application/json", fileData: "",
      parsedShifts: { 1: { type: "morning", name: "<img src=x onerror=alert(1)>" } }
    }];
    state.vacations = [{
      id: "vac-calendar", driverId: "drv-e2e", driver: "E2E Driver", type: "lt_vacation",
      start: `${month}-02`, end: `${month}-02`, days: 1, status: "approved"
    }];
    await seedDemoState(page, state);
    await page.goto("/staff.html");
    await loginDriver(page);
    await page.evaluate(() => {
      if (!document.getElementById("global-confirm-modal")?.classList.contains("hidden")) closeConfirmModal();
      window.switchSection("driver-calendar");
    });

    const expectedDays = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
    await expect(page.locator("#calendar-days-container .calendar-day:not(.empty-day)")).toHaveCount(expectedDays);
    await expect(page.locator(`[data-date="${month}-01"] .day-info`)).toHaveText("<img src=x onerror=alert(1)>");
    await expect(page.locator(`[data-date="${month}-01"] img`)).toHaveCount(0);
    await expect(page.locator(`[data-date="${month}-02"] .day-info.vacation`)).toHaveCount(1);

    await page.locator('[data-action="changeCalendarMonth"][data-action-args="[1]"]').click();
    await expect(page.locator("#calendar-month-year")).not.toBeEmpty();
    await expect(page.locator("#calendar-days-container")).not.toContainText("Morning shift");
    await page.setViewportSize({ width: 320, height: 700 });
    const calendarBounds = await page.locator("#driver-calendar .calendar-grid").boundingBox();
    expect(calendarBounds.x).toBeGreaterThanOrEqual(0);
    expect(calendarBounds.x + calendarBounds.width).toBeLessThanOrEqual(320);
  });

  test("dispatcher approves a pending leave request", async ({ page }) => {
    const state = require("./helpers.js").minimalDemoState();
    state.vacations = [{
      id: "vac-e2e", driver: "E2E Driver", driverId: "drv-e2e", type: "lt_vacation",
      start: "2026-08-01", end: "2026-08-03", days: 3, reason: "Family leave", status: "pending"
    }];
    await seedDemoState(page, state);
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await page.evaluate((vacation) => {
      window.state.vacations = [vacation];
      window.switchSection("dispatcher-vacations");
    }, state.vacations[0]);
    const approve = page.locator('#dispatcher-vacation-requests-table [data-action="handleVacation"][data-action-args*="approved"]');
    await expect(approve).toHaveCount(1);
    await approve.click();
    await page.locator("#global-confirm-yes").click();
    await expect.poll(() => page.evaluate(() => window.state.vacations?.[0]?.status)).toBe("approved");
    await expect(page.locator("#dispatcher-vacation-requests-table [data-action='handleVacation']")).toHaveCount(0);
  });

  test("pending driver sees only activation and direct operational navigation is blocked", async ({ page }) => {
    await openPendingDriverActivation(page);
    await page.evaluate(() => window.openDriverActivation());
    await expect(page.locator("#driver-activation-modal")).toBeVisible();
    await expect(page.locator("#app-container")).toHaveCount(0);
    await expect(page.locator("#pre-trip-modal")).toHaveCount(0);
    await expect(page.locator("#pre-trip-form input[type='checkbox']")).toHaveCount(0);
    await expect(page.locator("#pre-trip-damage-file")).toHaveCount(0);
    await expect(page.locator("#pre-trip-form button[type='submit']")).toHaveCount(0);
    await expect(page.locator("#mobile-bottom-nav")).toHaveCount(0);
    await expect(page.getByText("Send report & start duty", { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => window.switchSection("driver-dashboard"))).toBe(false);
    await expect(page.locator("#driver-dashboard")).toHaveCount(0);
  });

  test("pending activation modal covers and centers safely on a 320px viewport", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await openPendingDriverActivation(page);

    const layout = await page.evaluate(() => {
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const box = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON();
      return {
        viewport,
        backdrop: box("#driver-activation-modal"),
        card: box("#driver-activation-modal .modal-content"),
        title: box("#driver-activation-title"),
        badgeHidden: document.querySelector("#fp-mode-badge")?.hidden !== false,
        backdropPosition: getComputedStyle(document.querySelector("#driver-activation-modal")).position
      };
    });

    expect(layout.backdropPosition).toBe("fixed");
    expect(layout.backdrop.x).toBe(0);
    expect(layout.backdrop.y).toBe(0);
    expect(layout.backdrop.width).toBe(layout.viewport.width);
    expect(layout.backdrop.height).toBe(layout.viewport.height);
    expect(Math.abs((layout.card.x + layout.card.width / 2) - layout.viewport.width / 2)).toBeLessThan(2);
    expect(layout.card.x).toBeGreaterThanOrEqual(0);
    expect(layout.card.x + layout.card.width).toBeLessThanOrEqual(layout.viewport.width);
    expect(layout.card.y).toBeGreaterThanOrEqual(0);
    expect(layout.card.y + layout.card.height).toBeLessThanOrEqual(layout.viewport.height);
    expect(layout.badgeHidden).toBe(true);
    await expect(page.locator("#driver-activation-code")).toBeVisible();
    await expect(page.locator("#driver-activation-cancel")).toBeVisible();
    await expect(page.locator("#driver-activation-submit")).toBeVisible();
    await expect(page.locator("#app-container, #mobile-bottom-nav, #pre-trip-form")).toHaveCount(0);

    await page.locator("#driver-activation-cancel").click();
    await expect(page.locator("#login-screen")).toBeVisible();
    expect(await page.evaluate(() => window.__testFirebaseSessionActive)).toBe(false);
  });

  test("Cancel signs out pending Firebase session, clears files and returns login", async ({ page }) => {
    await page.goto("/driver.html");
    await page.locator("#pre-trip-damage-file").setInputFiles({
      name: "safe-test-image.png", mimeType: "image/png", buffer: Buffer.from("safe-test")
    });
    await page.evaluate(() => {
      const originalAuth = window.firebase.auth;
      window.firebase.auth = () => ({ signOut: async () => {
        window.__testFirebaseSessionActive = false;
        window.__testFirebaseSignOutCount = (window.__testFirebaseSignOutCount || 0) + 1;
      } });
      window.firebase.auth.restore = () => { window.firebase.auth = originalAuth; };
      window.__testFirebaseSessionActive = true;
      window.openDriverActivation();
    });
    await page.locator("#driver-activation-cancel").click();
    await expect(page.locator("#login-screen")).toBeVisible();
    await expect(page.locator("#driver-activation-modal")).toBeHidden();
    expect(await page.evaluate(() => ({
      active: window.__testFirebaseSessionActive,
      count: window.__testFirebaseSignOutCount,
      currentUser: window.currentUser
    }))).toEqual({ active: false, count: 1, currentUser: null });
    await expect(page.locator("#pre-trip-damage-file")).toHaveValue("");
  });

  test("Escape, backdrop close and browser Back cannot expose pending driver UI", async ({ page }) => {
    for (const exit of ["escape", "backdrop", "back"]) {
      await openPendingDriverActivation(page);
      if (exit === "escape") await page.keyboard.press("Escape");
      if (exit === "backdrop") await page.evaluate(() => document.getElementById("driver-activation-modal").click());
      if (exit === "back") await page.goBack();
      await expect(page.locator("#login-screen")).toBeVisible();
      await expect(page.locator("#app-container")).toBeHidden();
      expect(await page.evaluate(() => window.__testFirebaseSessionActive)).toBe(false);
    }
  });
});
