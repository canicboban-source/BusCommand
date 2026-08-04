const { test, expect } = require("@playwright/test");

test.describe("Company Admin whole-group monthly import", () => {
  async function openCompanyPlanPage(page) {
    await page.goto("/staff.html?mode=production", { waitUntil: "networkidle" });
    await page.evaluate(() => {
      window.currentUser = {
        uid: "ca-test",
        id: "ca-test",
        role: "company-admin",
        companyId: "alpha",
        name: "CA Test"
      };
      const tabSessionId = "ca-monthly-import-e2e";
      const deviceId = "ca-monthly-import-device";
      sessionStorage.setItem("buscommand_user", JSON.stringify(window.currentUser));
      sessionStorage.setItem("buscommand_tab_session", tabSessionId);
      localStorage.setItem("buscommand_device_id", deviceId);
      localStorage.setItem("buscommand_active_session", JSON.stringify({ deviceId, tabSessionId, at: Date.now() }));
      window.firebase.auth = () => ({
        currentUser: { getIdToken: async () => "e2e-token" }
      });
      window.state.groups = [{ id: "310", name: "Line 310", companyId: "alpha", active: true }];
      document.getElementById("login-screen").style.display = "none";
      const app = document.getElementById("app-container");
      app.classList.remove("hidden");
      app.style.display = "";
      window.switchSection("company-admin-service-plan");
    });
    await expect(page.locator("#company-admin-service-plan")).toBeVisible();
  }

  test("previews and commits an EID group CSV", async ({ page }) => {
    let committed = false;
    await page.route("**/api/company-admin/monthly-plans/import/preview", route => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        preview: {
          id: "import-1",
          fingerprint: "a".repeat(64),
          summary: { drivers: 2, assignments: 3, removals: 0 },
          rows: [
            { driverName: "Ana Driver", date: "2026-09-01", dutyCode: "310.S01", action: "assign" },
            { driverName: "Boris Driver", date: "2026-09-01", dutyCode: "310.F01", action: "assign" }
          ]
        }
      })
    }));
    await page.route("**/api/company-admin/monthly-plans/import/commit", async route => {
      const payload = route.request().postDataJSON();
      committed = payload.importId === "import-1" && payload.fingerprint === "a".repeat(64);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          id: "import-1",
          summary: { drivers: 2, assignments: 3, removals: 0 }
        })
      });
    });

    await openCompanyPlanPage(page);
    await page.locator("#ca-monthly-import-group").selectOption("310");
    await page.locator("#ca-monthly-import-month").fill("2026-09");
    await page.locator("#ca-monthly-import-reason").fill("September roster");
    await page.locator("#ca-monthly-import-file").setInputFiles({
      name: "monthly-310-2026-09.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("eid,date,duty_code\nE-100,2026-09-01,310.S01\nE-200,2026-09-01,310.F01")
    });

    await expect(page.locator("#ca-monthly-import-preview")).toContainText("Rows recognized: 2");
    await page.getByRole("button", { name: "Validate plan" }).click();
    await expect(page.locator("#ca-monthly-import-preview")).toContainText("Ana Driver");
    await expect(page.locator("#ca-monthly-import-preview")).toContainText("Assignments");
    await page.getByRole("button", { name: "Publish monthly plan" }).click();
    await expect.poll(() => committed).toBe(true);
    await expect(page.locator("#ca-monthly-import-preview")).toContainText("Choose a group, month and file");
  });

  test("rejects a duplicate EID/date before any server request", async ({ page }) => {
    let previewRequests = 0;
    await page.route("**/api/company-admin/monthly-plans/import/preview", route => {
      previewRequests += 1;
      return route.abort();
    });
    await openCompanyPlanPage(page);
    await page.locator("#ca-monthly-import-month").fill("2026-09");
    await page.locator("#ca-monthly-import-file").setInputFiles({
      name: "duplicate.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("eid,date,duty_code\nE-100,2026-09-01,310.S01\nE-100,2026-09-01,310.S02")
    });
    await expect(page.locator("#ca-monthly-import-preview")).toContainText("Choose a group, month and file");
    await expect.poll(() => previewRequests).toBe(0);
  });
});
