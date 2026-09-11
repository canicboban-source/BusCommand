// @ts-check
import { test, expect } from "@playwright/test";

test.describe("Official Landing Page Enterprise E2E", () => {
  test("desktop layout, navigation, trilingual switch, incident 05:08, pricing, pilot success flow, and zero overflow", async ({ page }) => {
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];

    page.on("console", msg => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", err => {
      pageErrors.push(err.message);
    });
    page.on("requestfailed", req => {
      const url = req.url();
      if (!url.includes("favicon")) {
        failedRequests.push(`${req.method()} ${url} - ${req.failure()?.errorText}`);
      }
    });

    // Mock successful pilot submission without real email
    await page.route("**/api/public/pilot-request", async route => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          recipient: "info@buscommand.com",
          status: "sent"
        })
      });
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    // 1. Title and branding
    await expect(page).toHaveTitle(/BusCommand/);
    const logo = page.locator("img.brand-logo-img");
    await expect(logo).toBeVisible();

    // 2. Zero horizontal overflow on 1440px
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientW = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollW).toBeLessThanOrEqual(clientW + 2);

    // 3. Trilingual Switcher
    const heroH1 = page.locator("#hero-h1");
    await expect(heroH1).toContainText("Kad plan pukne");

    // German
    await page.click("#lang-btn-de");
    await expect(heroH1).toContainText("Wenn der Plan bricht");
    await expect(page.locator("#pricing-title")).toContainText("Preise");
    await expect(page.locator("#nav-incident")).toContainText("VORFALL");

    // English
    await page.click("#lang-btn-en");
    await expect(heroH1).toContainText("When the plan fails");
    await expect(page.locator("#pricing-title")).toContainText("Pricing");
    await expect(page.locator("#nav-incident")).toContainText("INCIDENT");

    // Back to Serbian
    await page.click("#lang-btn-sr");
    await expect(heroH1).toContainText("Kad plan pukne");

    // 4. Incident 05:08 Stepper Check
    const storyTitle = page.locator("#story-title");
    await expect(storyTitle).toContainText("Dnevni raspored je sinhronizovan");

    await page.click("#step-btn-1");
    await expect(storyTitle).toContainText("Vozač javlja da je nedostupan");

    await page.click("#step-btn-2");
    await expect(storyTitle).toContainText("Radar izoluje praznu smenu");

    await page.click("#step-btn-3");
    await expect(storyTitle).toContainText("Dispečer dodeljuje zamenu");

    await page.click("#step-btn-4");
    await expect(storyTitle).toContainText("Vozač potvrđuje 1 dodirom");
    await expect(page.locator("#mock-status-badge")).toContainText("POTVRĐENO");

    // 5. Operational Surfaces Tabs
    await expect(page.locator("#role-panel-dispo")).toBeVisible();
    await page.click("#role-btn-driver");
    await expect(page.locator("#role-panel-driver")).toBeVisible();
    await expect(page.locator("#role-panel-dispo")).toBeHidden();
    await page.click("#role-btn-admin");
    await expect(page.locator("#role-panel-admin")).toBeVisible();

    // 6. Pricing Tiers
    const priceCards = page.locator(".price-card");
    await expect(priceCards.nth(0)).toContainText("€89");
    await expect(priceCards.nth(1)).toContainText("€190");
    await expect(priceCards.nth(2)).toContainText("€390");
    await expect(priceCards.nth(3)).toContainText("€690");

    // 7. Pilot Form Real Submission Flow (Success) - Neutral Fixtures
    await page.fill("#p-comp", "Demo Bus Company");
    await page.fill("#p-name", "Jane Doe");
    await page.fill("#p-email", "pilot@example.com");
    await page.fill("#p-phone", "+381 11 123 4567");
    await page.fill("#p-buses", "25");
    await page.fill("#p-msg", "Zahtev za uvoz 15 linija i 25 vozača.");

    await page.click("#pilotSubmitBtn");

    const feedback = page.locator("#pilot-feedback");
    await expect(feedback).toBeVisible();
    await expect(feedback).toContainText("Hvala na prijavi!");
    await expect(feedback).toHaveClass(/pilot-feedback-success/);

    // 8. Zero Console Errors, Zero Page Errors, Zero Failed Requests (excluding favicons)
    const severeErrors = consoleErrors.filter(e => !e.includes("favicon"));
    expect(severeErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });

  test("pilot form error flow truthfully handles 503 SMTP_NOT_CONFIGURED", async ({ page }) => {
    const consoleErrors = [];
    const pageErrors = [];

    page.on("console", msg => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", err => {
      pageErrors.push(err.message);
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const feedback = page.locator("#pilot-feedback");

    await page.route("**/api/public/pilot-request", async route => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          code: "SMTP_NOT_CONFIGURED",
          error: "Sistem za slanje email obaveštenja trenutno nije dostupan."
        })
      });
    });

    await page.fill("#p-comp", "Test Transport Co");
    await page.fill("#p-name", "John Doe");
    await page.fill("#p-email", "test@example.com");
    await page.click("#pilotSubmitBtn");

    await expect(feedback).toBeVisible();
    await expect(feedback).toContainText("Sistem za slanje email obaveštenja trenutno nije dostupan.");
    await expect(feedback).toHaveClass(/pilot-feedback-error/);

    // Ensure no unexpected errors happened outside the intended 503 pilot-request response
    const unexpectedErrors = consoleErrors.filter(
      e => !e.includes("favicon") && !e.includes("503") && !e.includes("pilot-request")
    );
    expect(unexpectedErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("mobile viewports (390px and 320px) zero horizontal overflow and responsive elements", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", err => {
      pageErrors.push(err.message);
    });

    // iPhone 14 (390px)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    let scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    let clientW = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollW).toBeLessThanOrEqual(clientW + 1);

    await expect(page.locator("#hero-h1")).toBeVisible();
    await expect(page.locator("#hero-cta-minute")).toBeVisible();
    await expect(page.locator("#pilotForm")).toBeVisible();

    // Narrow mobile (320px)
    await page.setViewportSize({ width: 320, height: 568 });
    scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    clientW = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollW).toBeLessThanOrEqual(clientW + 1);

    expect(pageErrors).toEqual([]);
  });
});
