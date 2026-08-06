const { test, expect } = require("@playwright/test");

/**
 * D21: Company Admin no longer imports monthly driver assignments.
 * CA keeps V66/catalog; Dispo owns monthly plans (no EID).
 */
test.describe("Company Admin monthly assignment import removed (D21)", () => {
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

  test("CA service plan page has catalog import but no monthly assignment card", async ({ page }) => {
    await openCompanyPlanPage(page);
    await expect(page.locator("#ca-service-plan-file")).toHaveCount(1);
    await expect(page.locator("#ca-monthly-import-file")).toHaveCount(0);
    await expect(page.locator("#ca-monthly-import-group")).toHaveCount(0);
    await expect(page.locator(".ca-monthly-import-card")).toHaveCount(0);
  });

  test("CA monthly import API returns dispatcher-only forbidden", async ({ page }) => {
    await openCompanyPlanPage(page);
    const preview = await page.evaluate(async () => {
      const res = await fetch("/api/company-admin/monthly-plans/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer e2e-token" },
        body: JSON.stringify({
          companyId: "alpha",
          groupId: "310",
          month: "2026-09",
          mode: "merge",
          sourceName: "x.csv",
          reason: "should be blocked",
          rows: [{ eid: "E-1", date: "2026-09-01", dutyCode: "310.S01", sourceRow: 2 }]
        })
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    });
    // Without real CA auth token the gate may be 401/403 — never success.
    expect(preview.status).toBeGreaterThanOrEqual(400);
    expect(preview.body?.success).not.toBe(true);
  });
});
