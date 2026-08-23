const { test, expect } = require("@playwright/test");
const { seedDemoState, loginDriver } = require("./helpers.js");

test.describe("Driver PWA Push Notification Opt-in (Slice 1B)", () => {
  test("driver can opt in to push notifications via header action", async ({ page }) => {
    page.on("console", msg => console.log("BROWSER LOG:", msg.text()));
    page.on("pageerror", err => console.log("BROWSER ERROR:", err));

    let fcmConfigRequested = false;
    let tokenPostReceived = false;
    let registeredToken = null;

    // Intercept FCM endpoints
    await page.route("**/api/driver/fcm-config", async (route) => {
      fcmConfigRequested = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          enabled: true,
          vapidKey: "test-synthetic-public-vapid-key-e2e-12345"
        })
      });
    });

    await page.route("**/api/driver/fcm-token", async (route) => {
      const req = route.request();
      if (req.method() === "POST") {
        tokenPostReceived = true;
        const body = JSON.parse(req.postData() || "{}");
        registeredToken = body.token;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true })
        });
      } else {
        await route.continue();
      }
    });

    await seedDemoState(page);
    await page.goto("/driver.html");
    await loginDriver(page);

    await page.evaluate(() => {
      window.__MOCK_FCM_TOKEN__ = "synthetic-e2e-fcm-token-abcdef1234567890";
      window.Notification = {
        permission: "default",
        requestPermission: async () => {
          window.Notification.permission = "granted";
          return "granted";
        }
      };
    });

    // Header notification opt-in button must be present on Driver surface
    const pushBtn = page.locator("#driver-push-toggle-btn");
    await expect(pushBtn).toBeVisible();

    // Verify button was not auto-activated without explicit click
    expect(fcmConfigRequested).toBe(false);
    expect(tokenPostReceived).toBe(false);

    // Click to opt-in
    await pushBtn.click();

    // Verify fcm-config and token registration endpoints were called
    await expect.poll(() => fcmConfigRequested, { timeout: 5000 }).toBe(true);
    await expect.poll(() => tokenPostReceived, { timeout: 5000 }).toBe(true);

    // Verify token was registered
    expect(registeredToken).toBe("synthetic-e2e-fcm-token-abcdef1234567890");

    // Verify button state has active class
    await expect(pushBtn).toHaveClass(/active/);
  });

  test("push toggle button is strictly absent from staff surface", async ({ page }) => {
    await seedDemoState(page);
    await page.goto("/staff.html");
    const pushBtn = page.locator("#driver-push-toggle-btn");
    await expect(pushBtn).toHaveCount(0);
  });

  test("service worker registers /sw-driver.js with /driver.html scope", async ({ page }) => {
    await seedDemoState(page);
    await page.goto("/driver.html");

    const swScope = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return null;
      try {
        const reg = await navigator.serviceWorker.getRegistration("/driver.html");
        return reg ? reg.scope : "registered-in-window";
      } catch {
        return null;
      }
    });

    expect(swScope).toBeTruthy();
  });
});
