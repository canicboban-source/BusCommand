const { test, expect } = require("@playwright/test");
const { seedDemoState, loginDispatcher } = require("./helpers.js");
const crypto = require("crypto");

function importState() {
  return {
    language: "en",
    companyId: "qa-local",
    e2eFixture: true,
    groups: [{ id: "101", name: "Line 101", color: "#3D7EF5", active: true, companyId: "qa-local" }],
    dispatchers: [
      {
        id: "dispo-qa-1",
        name: "QA Dispatcher",
        email: "dispo@qa.local",
        password: "Qa-test-ok-9",
        passwordChanged: true,
        groups: ["101"],
        companyId: "qa-local",
        active: true
      }
    ],
    companyAdmins: [{
      id: "ca-qa-1",
      name: "QA CA",
      email: "ca@qa.local",
      password: "Qa-test-ok-9",
      companyId: "qa-local",
      active: true
    }],
    drivers: [{
      id: "11111111-1111-4111-8111-111111111111",
      name: "Import CTA Driver",
      pin: "1234",
      bus: "91101",
      groupId: "101",
      lineId: "101",
      active: true,
      companyId: "qa-local"
    }],
    buses: [{
      id: "bus-91101",
      number: "91101",
      groupId: "101",
      lineId: "101",
      active: true,
      opsStatus: "active",
      companyId: "qa-local"
    }],
    schedules: [],
    shifts: [],
    reports: [],
    vacations: [],
    messages: [],
    lostItems: [],
    onboardingDone: true,
    companyAdminOnboardingDone: true
  };
}

async function openMonthlyImport(page) {
  await page.evaluate(() => {
    window.state.activeGroupHubId = "101";
    if (window.currentUser) window.currentUser.activeGroupId = "101";
    // QA harness has no Firebase ID token; avoid hanging apiFetch during mocked import routes.
    if (window.Auth && typeof window.Auth.getIdToken === "function") {
      window.Auth.getIdToken = async () => "e2e-disp-token";
    }
    if (typeof window.openMonthlyPlansFull === "function") {
      window.openMonthlyPlansFull();
    }
  });
  await expect(page.locator("#dispatcher-monthly-plans-full")).not.toHaveClass(/hidden/, { timeout: 10000 });
  await page.locator('#dispatcher-monthly-plans-full [data-action="openMonthlyPlanImport"]').first().click();
  await expect(page.locator("#plan-import-dropzone")).toBeVisible();
}

function pendingItem({
  duty = "101.S01",
  month = "2026-08",
  driverId = "11111111-1111-4111-8111-111111111111",
  driverName = "Import CTA Driver",
  needsDriverPick = false,
  ambiguousName = false
} = {}) {
  return {
    fileName: `dienstplan-import-${month}.txt`,
    driverId,
    driverName,
    needsDriverPick,
    ambiguousName,
    month,
    parsedShifts: {
      3: {
        type: "morning",
        name: duty,
        routeCode: duty,
        bus: "91101",
        start: "05:00",
        end: "13:00"
      }
    },
    dayCount: 1,
    parseQuality: "ok",
    format: "loose-text",
    fileType: "text/plain",
    fileData: null
  };
}

test.describe("Dispo monthly import server preview/commit", () => {
  test("local mode refuses fake success toast", async ({ page }) => {
    await seedDemoState(page, importState());
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await openMonthlyImport(page);

    await page.evaluate((item) => {
      window.USE_LOCAL_STATE = true;
      window.__setPendingPlanImportsForTest([item]);
    }, pendingItem());

    await page.locator('[data-testid="plan-import-server-preview-btn"]').click();
    await expect(page.locator("body")).toContainText(/requires a live server|zahteva serverski|braucht Server/i);
    await expect(page.locator("body")).not.toContainText(/monthly plans saved|mesečnih planova sačuvano|Monatspläne gespeichert/i);
    const shifts = await page.evaluate(() => (window.state.shifts || []).length);
    expect(shifts).toBe(0);
  });

  test("preview → confirm commit; validation reject leaves no partial plan", async ({ page }) => {
    const fingerprint = crypto.createHash("sha256").update("e2e-phase2").digest("hex");
    const importId = "11111111-2222-4333-8444-555555555555";
    let previewCalls = 0;
    let commitCalls = 0;

    await page.route("**/api/staff/monthly-plans/import/preview", async (route) => {
      previewCalls += 1;
      const body = route.request().postDataJSON();
      const badDuty = (body.rows || []).some((row) => String(row.routeCode || "").includes("UNKNOWN"));
      if (badDuty) {
        await route.fulfill({
          status: 422,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            code: "PLAN_IMPORT_VALIDATION_FAILED",
            details: [{ row: 1, code: "DUTY_NOT_IN_ACTIVE_CATALOG", dutyCode: "UNKNOWN.DUTY" }]
          })
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          importId,
          fingerprint,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          preview: {
            fingerprint,
            groupId: body.groupId,
            month: body.month,
            sourceName: body.sourceName,
            reason: body.reason,
            summary: { rows: 1, drivers: 1, assignments: 1, removals: 0 },
            rows: [{
              driverId: body.rows[0].driverId,
              date: body.rows[0].date,
              type: "morning",
              name: "101.S01",
              bus: "91101",
              action: "assign"
            }]
          }
        })
      });
    });

    await page.route("**/api/staff/monthly-plans/import/commit", async (route) => {
      commitCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          importId,
          summary: { rows: 1, drivers: 1, assignments: 1, removals: 0 },
          idempotent: false
        })
      });
    });

    await seedDemoState(page, importState());
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await openMonthlyImport(page);

    // Reject path first
    await page.evaluate((item) => {
      window.USE_LOCAL_STATE = false;
      window.__setPendingPlanImportsForTest([item]);
    }, pendingItem({ duty: "UNKNOWN.DUTY" }));

    await page.locator('[data-testid="plan-import-server-preview-btn"]').click();
    await expect(page.locator('[data-testid="plan-import-validation-errors"]')).toBeVisible({ timeout: 10000 });
    expect(await page.evaluate(() => (window.state.shifts || []).length)).toBe(0);
    expect(commitCalls).toBe(0);

    // Happy path
    await page.evaluate((item) => {
      window.USE_LOCAL_STATE = false;
      window.__setPendingPlanImportsForTest([item]);
    }, pendingItem());

    await page.locator('[data-testid="plan-import-server-preview-btn"]').click();
    await expect(page.locator('[data-testid="plan-import-server-preview"]')).toBeVisible({ timeout: 10000 });
    expect(await page.evaluate(() => (window.state.shifts || []).length)).toBe(0);

    await page.route("**/api/**/load*", async (route) => route.continue()).catch(() => {});
    await page.evaluate(() => {
      // Avoid Firestore reload noise in QA harness after commit.
      window.loadStateFromFirestore = async () => ({
        shifts: [{
          driverId: "11111111-1111-4111-8111-111111111111",
          driverName: "Import CTA Driver",
          date: "2026-08-03",
          type: "morning",
          name: "101.S01",
          bus: "91101",
          routeCode: "101.S01",
          groupId: "101",
          revision: 1
        }],
        schedules: []
      });
    });

    await page.locator('[data-testid="plan-import-confirm-commit-btn"]').click();
    await expect.poll(() => commitCalls).toBe(1);
    await expect.poll(() => previewCalls).toBeGreaterThanOrEqual(2);

    await expect.poll(async () => page.evaluate(() =>
      (window.state.shifts || []).some((s) => s.date === "2026-08-03" && s.type === "morning")
    )).toBeTruthy();
  });

  test("multi-month pending is blocked before any API call", async ({ page }) => {
    let previewCalls = 0;
    let commitCalls = 0;
    await page.route("**/api/staff/monthly-plans/import/preview", async (route) => {
      previewCalls += 1;
      await route.fulfill({ status: 500, body: "{}" });
    });
    await page.route("**/api/staff/monthly-plans/import/commit", async (route) => {
      commitCalls += 1;
      await route.fulfill({ status: 500, body: "{}" });
    });

    await seedDemoState(page, importState());
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await openMonthlyImport(page);

    await page.evaluate((items) => {
      window.USE_LOCAL_STATE = false;
      window.__setPendingPlanImportsForTest(items);
    }, [pendingItem({ month: "2026-08" }), pendingItem({ month: "2026-09" })]);

    await page.locator('[data-testid="plan-import-server-preview-btn"]').click();
    await expect(page.locator('[data-testid="plan-import-multi-month-block"]')).toBeVisible({ timeout: 10000 });
    expect(previewCalls).toBe(0);
    expect(commitCalls).toBe(0);
  });

  test("duplicate driver names send the manually selected driverId", async ({ page }) => {
    const idA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const idB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    let seenDriverId = null;

    await page.route("**/api/staff/monthly-plans/import/preview", async (route) => {
      const body = route.request().postDataJSON();
      seenDriverId = body.rows?.[0]?.driverId || null;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          importId: "11111111-2222-4333-8444-555555555555",
          fingerprint: crypto.createHash("sha256").update("dup").digest("hex"),
          preview: {
            summary: { rows: 1, drivers: 1, assignments: 1, removals: 0 },
            rows: [{ driverId: seenDriverId, date: "2026-08-03", type: "morning", name: "101.S01", bus: "91101", action: "assign" }]
          }
        })
      });
    });

    const state = importState();
    state.drivers = [
      { id: idA, name: "Same Name", pin: "1111", bus: "1", groupId: "101", lineId: "101", active: true, companyId: "qa-local" },
      { id: idB, name: "Same Name", pin: "2222", bus: "2", groupId: "101", lineId: "101", active: true, companyId: "qa-local" }
    ];
    await seedDemoState(page, state);
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await openMonthlyImport(page);

    await page.evaluate(({ item, idB: pick }) => {
      window.USE_LOCAL_STATE = false;
      window.state.drivers = [
        { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Same Name", groupId: "101", active: true },
        { id: pick, name: "Same Name", groupId: "101", active: true }
      ];
      window.__setPendingPlanImportsForTest([{
        ...item,
        driverId: null,
        driverName: "Same Name",
        needsDriverPick: true,
        ambiguousName: true
      }]);
    }, { item: pendingItem({ driverName: "Same Name", driverId: null, needsDriverPick: true, ambiguousName: true }), idB });

    await expect(page.locator('[data-testid="plan-import-driver-ambiguous"]')).toBeVisible();
    await page.locator('[data-testid="plan-import-driver-select"]').selectOption(idB);
    await page.locator('[data-testid="plan-import-server-preview-btn"]').click();
    await expect(page.locator('[data-testid="plan-import-server-preview"]')).toBeVisible({ timeout: 10000 });
    expect(seenDriverId).toBe(idB);
  });

  test("preview network exception leaves UI not busy and retry enabled", async ({ page }) => {
    await page.route("**/api/staff/monthly-plans/import/preview", async (route) => {
      await route.abort("failed");
    });
    await seedDemoState(page, importState());
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await openMonthlyImport(page);
    await page.evaluate((item) => {
      window.USE_LOCAL_STATE = false;
      window.__setPendingPlanImportsForTest([item]);
    }, pendingItem());
    await page.locator('[data-testid="plan-import-server-preview-btn"]').click();
    await expect(page.locator('[data-testid="plan-import-preview-transport-failed"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="plan-import-phase"]')).toHaveAttribute("data-plan-import-phase", /preview_transport_failed|rejected/);
    await expect(page.locator('[data-testid="plan-import-server-preview-btn"]')).toBeEnabled();
    await expect(page.locator('[data-testid="plan-import-pending-row"]')).toBeVisible();
  });

  test("lost commit response keeps job as commit_unknown; retry is idempotent success", async ({ page }) => {
    const fingerprint = crypto.createHash("sha256").update("e2e-unknown").digest("hex");
    const importId = "22222222-2222-4222-8222-222222222222";
    let commitCalls = 0;

    await page.route("**/api/staff/monthly-plans/import/preview", async (route) => {
      const body = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          importId,
          fingerprint,
          preview: {
            fingerprint,
            summary: { rows: 1, drivers: 1, assignments: 1, removals: 0 },
            rows: [{
              driverId: body.rows[0].driverId,
              date: body.rows[0].date,
              type: "morning",
              name: "101.S01",
              bus: "91101",
              action: "assign"
            }]
          }
        })
      });
    });

    await page.route("**/api/staff/monthly-plans/import/commit", async (route) => {
      commitCalls += 1;
      if (commitCalls === 1) {
        await route.abort("failed");
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          importId,
          summary: { rows: 1 },
          idempotent: true
        })
      });
    });

    await seedDemoState(page, importState());
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await openMonthlyImport(page);
    await page.evaluate((item) => {
      window.USE_LOCAL_STATE = false;
      window.__setPendingPlanImportsForTest([item]);
    }, pendingItem());

    await page.locator('[data-testid="plan-import-server-preview-btn"]').click();
    await expect(page.locator('[data-testid="plan-import-server-preview"]')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="plan-import-confirm-commit-btn"]').click();
    await expect(page.locator('[data-testid="plan-import-commit-unknown"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="plan-import-phase"]')).toHaveAttribute("data-plan-import-phase", "commit_unknown");
    await expect(page.locator("body")).toContainText(importId);
    await expect(page.locator("body")).not.toContainText(/Import was not committed|No partial success|Delimične izmene su poništene/i);

    await page.evaluate(() => {
      window.loadStateFromFirestore = async () => ({
        shifts: [{
          driverId: "11111111-1111-4111-8111-111111111111",
          date: "2026-08-03",
          type: "morning",
          name: "101.S01",
          bus: "91101",
          revision: 1,
          groupId: "101"
        }],
        schedules: []
      });
    });

    await page.locator('[data-testid="plan-import-retry-commit-btn"]').click();
    await expect.poll(() => commitCalls).toBe(2);
    await expect.poll(async () => page.evaluate(() =>
      (window.state.shifts || []).some((s) => s.date === "2026-08-03")
    )).toBeTruthy();
  });

  test("server recoveryRequired response shows recovery UI via real intercept", async ({ page }) => {
    const fingerprint = crypto.createHash("sha256").update("e2e-recovery").digest("hex");
    const importId = "33333333-3333-4333-8333-333333333333";
    await page.route("**/api/staff/monthly-plans/import/preview", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          importId,
          fingerprint,
          preview: {
            summary: { rows: 1 },
            rows: [{ driverId: "11111111-1111-4111-8111-111111111111", date: "2026-08-03", type: "morning", name: "101.S01", action: "assign" }]
          }
        })
      });
    });
    await page.route("**/api/staff/monthly-plans/import/commit", async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          code: "MONTHLY_IMPORT_RECOVERY_REQUIRED",
          recoveryRequired: true,
          compensated: false,
          error: "Uvoz nije potvrđen. Stanje zahteva proveru — plan se ne smatra čistim."
        })
      });
    });

    await seedDemoState(page, importState());
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await openMonthlyImport(page);
    await page.evaluate((item) => {
      window.USE_LOCAL_STATE = false;
      window.__setPendingPlanImportsForTest([item]);
    }, pendingItem());
    await page.locator('[data-testid="plan-import-server-preview-btn"]').click();
    await expect(page.locator('[data-testid="plan-import-server-preview"]')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="plan-import-confirm-commit-btn"]').click();
    await expect(page.locator('[data-testid="plan-import-recovery-required"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="plan-import-retained-id"]')).toContainText(importId);
    await expect(page.locator('[data-testid="plan-import-confirm-commit-btn"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="plan-import-retry-commit-btn"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="plan-import-validation-errors"]')).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/nothing was saved|ništa nije sačuvano|nichts gespeichert/i);
    await expect(page.locator("body")).not.toContainText(/Automatski povrat nije uspeo/i);
    await expect(page.locator("body")).not.toContainText(/Partial changes were rolled back|Delimične izmene su poništene|Teiländerungen wurden zurückgenommen/i);
    await expect(page.locator("body")).not.toContainText(/monthly plans saved|mesečnih planova sačuvano|Monatspläne gespeichert/i);
  });

  test("IN_PROGRESS commit keeps same importId and does not claim rollback", async ({ page }) => {
    const fingerprint = crypto.createHash("sha256").update("e2e-in-progress").digest("hex");
    const importId = "44444444-4444-4444-8444-444444444444";
    let commitCalls = 0;
    await page.route("**/api/staff/monthly-plans/import/preview", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          importId,
          fingerprint,
          preview: {
            summary: { rows: 1 },
            rows: [{
              driverId: "11111111-1111-4111-8111-111111111111",
              date: "2026-08-03",
              type: "morning",
              name: "101.S01",
              bus: "91101",
              action: "assign"
            }]
          }
        })
      });
    });
    await page.route("**/api/staff/monthly-plans/import/commit", async (route) => {
      commitCalls += 1;
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          code: "MONTHLY_IMPORT_IN_PROGRESS",
          retryable: true,
          recoveryRequired: false,
          compensated: false,
          error: "Uvoz se još obrađuje — pokušajte ponovo uskoro."
        })
      });
    });

    await seedDemoState(page, importState());
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await openMonthlyImport(page);
    await page.evaluate((item) => {
      window.USE_LOCAL_STATE = false;
      window.__setPendingPlanImportsForTest([item]);
    }, pendingItem());
    await page.locator('[data-testid="plan-import-server-preview-btn"]').click();
    await expect(page.locator('[data-testid="plan-import-server-preview"]')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-testid="plan-import-confirm-commit-btn"]').click();
    await expect(page.locator('[data-testid="plan-import-commit-in-progress"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="plan-import-phase"]')).toHaveAttribute("data-plan-import-phase", "commit_in_progress");
    await expect(page.locator('[data-testid="plan-import-retained-id"]')).toContainText(importId);
    await expect(page.locator('[data-testid="plan-import-retry-commit-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="plan-import-validation-errors"]')).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/nothing was saved|ništa nije sačuvano|nichts gespeichert/i);
    await expect(page.locator("body")).not.toContainText(/rolled back|poništene|zurückgenommen/i);
    expect(commitCalls).toBe(1);
  });

  test("malicious fileName/driver/duty render as text only (no script handlers)", async ({ page }) => {
    const fingerprint = crypto.createHash("sha256").update("e2e-xss").digest("hex");
    const importId = "55555555-5555-4555-8555-555555555555";
    const evilFile = '<img src=x onerror=alert(1)>';
    const evilDuty = '"><svg onload=alert(1)>';
    await page.route("**/api/staff/monthly-plans/import/preview", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          importId,
          fingerprint,
          preview: {
            summary: { rows: 1 },
            rows: [{
              driverId: "11111111-1111-4111-8111-111111111111",
              date: "2026-08-03",
              type: "morning",
              name: evilDuty,
              bus: evilFile,
              action: "assign"
            }]
          }
        })
      });
    });

    await seedDemoState(page, importState());
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await openMonthlyImport(page);
    await page.evaluate(({ item, evilFile: fileName }) => {
      window.USE_LOCAL_STATE = false;
      window.__setPendingPlanImportsForTest([{ ...item, fileName, driverName: fileName }]);
    }, { item: pendingItem(), evilFile });

    await page.locator('[data-testid="plan-import-server-preview-btn"]').click();
    await expect(page.locator('[data-testid="plan-import-server-preview"]')).toBeVisible({ timeout: 10000 });

    const fileCell = page.locator('[data-testid="plan-import-file-name"]');
    await expect(fileCell).toContainText("<img src=x onerror=alert(1)>");
    const imgNodes = await page.locator('[data-testid="plan-import-file-name"] img').count();
    expect(imgNodes).toBe(0);
    const svgNodes = await page.locator('[data-testid="plan-import-server-preview"] svg').count();
    expect(svgNodes).toBe(0);
    await expect(page.locator('[data-testid="plan-import-server-preview"]')).toContainText(evilDuty);
  });
});
