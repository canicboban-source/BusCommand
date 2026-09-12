// @ts-check
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const EVIDENCE_DIR = "F:\\BusCommand-Audit-Exports\\LANDING-FINAL-FIX-01-20260912-175000";

function sha256File(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

test.describe("Official Landing Page Enterprise E2E", () => {
  test("desktop layout, hero visual dominance, navigation, trilingual switch, incident 05:08, pricing, pilot success flow, and zero overflow", async ({ page }) => {
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

    // 1. Title and branding with strict asset integrity
    await expect(page).toHaveTitle(/BusCommand/);
    const logo = page.locator("img.brand-logo-img");
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute("alt", "BusCommand Logo");

    const logoMetrics = await logo.evaluate((img) => ({
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      src: img.currentSrc || img.src
    }));
    expect(logoMetrics.complete).toBe(true);
    expect(logoMetrics.naturalWidth).toBeGreaterThan(0);
    expect(logoMetrics.naturalHeight).toBeGreaterThan(0);
    expect(logoMetrics.src).toContain("/brand/buscommand-logo-reference.png");

    // 2. Zero horizontal overflow on 1440px
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientW = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollW).toBeLessThanOrEqual(clientW + 2);

    // 3. Hero Visual Dominance, Authentic Bus Check, and Desktop Mobile-Visual Hide
    const heroBg = page.locator(".hero-bus-bg");
    await expect(heroBg).toBeVisible();

    const bgComputed = await heroBg.evaluate((el) => window.getComputedStyle(el).backgroundImage);
    expect(bgComputed).not.toBe("none");
    expect(bgComputed).toContain("/brand/hero-clean-1920x1080.jpg");

    // Desktop must hide mobile bus visual element
    await expect(page.locator("#hero-mobile-visual")).toBeHidden();

    const heroImgMetrics = await page.evaluate(async () => {
      return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
          resolve({
            loaded: true,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight
          });
        };
        img.onerror = () => resolve({ loaded: false, naturalWidth: 0, naturalHeight: 0 });
        img.src = "/brand/hero-clean-1920x1080.jpg";
      });
    });
    expect(heroImgMetrics.loaded).toBe(true);
    expect(heroImgMetrics.naturalWidth).toBeGreaterThan(0);
    expect(heroImgMetrics.naturalHeight).toBeGreaterThan(0);

    // Verify desktop hero content does not cover right-hand bus focal zone
    const heroContentBox = await page.locator(".hero-content").boundingBox();
    expect(heroContentBox).toBeTruthy();
    if (heroContentBox) {
      expect(heroContentBox.x + heroContentBox.width).toBeLessThanOrEqual(860);
    }

    // 4. Trilingual Switcher & Deep I18N Completeness
    const heroEyebrow = page.locator("#hero-eyebrow");
    const heroH1 = page.locator("#hero-h1");

    // SR Hero Eyebrow Check (clean Serbian)
    await expect(heroEyebrow).toContainText("OPERATIVNA KONTROLA ZA AUTOBUSKE KOMPANIJE");
    await expect(heroH1).toContainText("Kad plan pukne");
    await expect(page.locator("html")).toHaveAttribute("lang", "sr");

    // SR Pilot Section Verification (natural pilot wording)
    await expect(page.locator("#pilot-badge")).toContainText("BESPLATAN PILOT OD 30 DANA");
    await expect(page.locator("#pilotTitle")).toContainText("Prijavite se za 30-dnevni pilot");
    await expect(page.locator("#pilotSubmitBtn")).toContainText("Pošaljite prijavu za pilot");

    // German Switch Verification
    await page.click("#lang-btn-de");
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(heroEyebrow).toContainText("BETRIEBSSTEUERUNG FÜR BUSUNTERNEHMEN");
    await expect(heroH1).toContainText("Wenn der Plan bricht");
    await expect(page.locator("#pricing-title")).toContainText("Preise");
    await expect(page.locator("#nav-incident")).toContainText("VORFALL");

    // German Role Tabs Verification (DISPOSITION, FAHRER-PWA, FIRMENADMIN)
    await expect(page.locator("#role-btn-dispo")).toContainText("DISPOSITION");
    await expect(page.locator("#role-btn-driver")).toContainText("FAHRER-PWA");
    await expect(page.locator("#role-btn-admin")).toContainText("FIRMENADMIN");

    // German Role Specific Terms (DISPO-LEITSTAND, Plan-Lock-Konfliktschutz)
    await expect(page.locator("#role-panel-dispo")).toContainText("DISPO-LEITSTAND");
    await expect(page.locator("#role-panel-dispo")).toContainText("Plan-Lock-Konfliktschutz");

    // German Compare Verification (Generic ERP, accurate claims, no Truck ERP)
    await expect(page.locator("#cmp-sec-title")).toContainText("Excel vs. Standard-ERP vs. BusCommand");
    await expect(page.locator("#cmp-card1-title")).toContainText("Excel & WhatsApp");
    await expect(page.locator("#cmp-card2-title")).toContainText("Generisches ERP");
    await expect(page.locator("#cmp-card3-title")).toContainText("BusCommand SaaS");
    await expect(page.locator('[data-i18n="cmpC1B5"]')).toContainText("Keine einheitliche, durchsuchbare Änderungshistorie");
    await expect(page.locator('[data-i18n="cmpC3B1"]')).toContainText("Schneller, geführter Fahrerersatz");

    // German Role Admin & Pulse
    await expect(page.locator("#role-admin-title")).toContainText("Firmen-Admin Kontrollzentrum");
    await expect(page.locator("#pulseTitle")).toContainText("Fahrerausfall im System erfasst");

    // German Pilot Section Verification (DE badge, title, desc, guarantees)
    await expect(page.locator("#pilot-badge")).toContainText("KOSTENLOSER 30-TAGE-PILOT");
    await expect(page.locator("#pilotTitle")).toContainText("30-Tage-Pilot anfragen");
    await expect(page.locator("#pilotDesc")).toContainText("Unser Team importiert");
    await expect(page.locator("#lbl-comp-name")).toContainText("Firmenname");
    await expect(page.locator("#p-comp")).toHaveAttribute("placeholder", /z\.B\./);
    await expect(page.locator("#pilotSubmitBtn")).toContainText("Pilot-Anfrage senden");
    await expect(page.locator("#pilot-guar-title")).toContainText("5 Pilot-Garantien");
    await expect(page.locator("#dl-sec-title")).toContainText("Offizielle Dokumente");

    // English Switch Verification
    await page.click("#lang-btn-en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(heroEyebrow).toContainText("OPERATIONAL CONTROL FOR BUS COMPANIES");
    await expect(heroH1).toContainText("When the plan fails");
    await expect(page.locator("#pricing-title")).toContainText("Pricing");
    await expect(page.locator("#nav-incident")).toContainText("INCIDENT");

    // English Role Tabs Verification
    await expect(page.locator("#role-btn-dispo")).toContainText("DISPATCHER");
    await expect(page.locator("#role-btn-driver")).toContainText("DRIVER PWA");
    await expect(page.locator("#role-btn-admin")).toContainText("COMPANY ADMIN");

    // English Compare Verification (Generic ERP, accurate claims, no Truck ERP)
    await expect(page.locator("#cmp-sec-title")).toContainText("Excel vs. Generic ERP vs. BusCommand");
    await expect(page.locator("#cmp-card1-title")).toContainText("Spreadsheets & Chats");
    await expect(page.locator("#cmp-card2-title")).toContainText("Generic ERP");
    await expect(page.locator("#cmp-card3-title")).toContainText("BusCommand SaaS");
    await expect(page.locator('[data-i18n="cmpC1B5"]')).toContainText("No consistent, searchable audit history");
    await expect(page.locator('[data-i18n="cmpC3B1"]')).toContainText("Fast guided driver replacement workflow");

    // English Role Admin & Pulse
    await expect(page.locator("#role-admin-title")).toContainText("Company Admin Management Console");
    await expect(page.locator("#pulseTitle")).toContainText("Driver sickness logged");

    // English Pilot Section Verification (EN badge, title, desc, guarantees)
    await expect(page.locator("#pilot-badge")).toContainText("30-DAY FREE PILOT");
    await expect(page.locator("#pilotTitle")).toContainText("Apply for your 30-day pilot");
    await expect(page.locator("#pilotDesc")).toContainText("Our team imports your existing roster");
    await expect(page.locator("#lbl-comp-name")).toContainText("Company Name");
    await expect(page.locator("#p-comp")).toHaveAttribute("placeholder", /e\.g\./);
    await expect(page.locator("#pilotSubmitBtn")).toContainText("Submit pilot request");
    await expect(page.locator("#pilot-guar-title")).toContainText("5 Pilot Guarantees");
    await expect(page.locator("#dl-sec-title")).toContainText("Official Technical Documents");

    // Ensure no Serbian residue in English
    const compTextEn = await page.locator("#compare").innerText();
    expect(compTextEn).not.toContain("Nema potvrde smene");
    expect(compTextEn).not.toContain("Pozivi vozača");
    expect(compTextEn).not.toContain("Rasute verzije");
    expect(compTextEn).not.toContain("Generički");
    expect(compTextEn).not.toContain("Truck ERP");

    const pilotTextEn = await page.locator("#pilot").innerText();
    expect(pilotTextEn).not.toContain("BESPLATAN PILOT OD 30 DANA");
    expect(pilotTextEn).not.toContain("Prijavite se za 30-dnevni pilot");
    expect(pilotTextEn).not.toContain("Bez kreditne kartice");

    const rolesTextEn = await page.locator("#roles").innerText();
    expect(rolesTextEn).not.toContain("Operativne površine");
    expect(rolesTextEn).not.toContain("Dispečer");

    // Back to Serbian
    await page.click("#lang-btn-sr");
    await expect(page.locator("html")).toHaveAttribute("lang", "sr");
    await expect(heroEyebrow).toContainText("OPERATIVNA KONTROLA ZA AUTOBUSKE KOMPANIJE");
    await expect(heroH1).toContainText("Kad plan pukne");
    await expect(page.locator("#cmp-card2-title")).toContainText("Generički ERP");
    await expect(page.locator('[data-i18n="cmpC1B3"]')).toContainText("Nema potvrde smene");
    await expect(page.locator('[data-i18n="cmpC1B5"]')).toContainText("Nema jedinstvene i pretražive istorije izmena");
    await expect(page.locator('[data-i18n="cmpC3B1"]')).toContainText("Brz i vođen postupak zamene vozača");

    // 5. Sticky Navigation Anchor Offsets Check (Header does not occlude headings)
    for (const navId of ["#nav-incident", "#nav-roles", "#nav-system", "#nav-compare", "#nav-downloads", "#nav-pricing"]) {
      await page.click(navId);
      await page.waitForTimeout(150);
      const targetSecId = await page.locator(navId).getAttribute("href");
      if (targetSecId) {
        const heading = page.locator(`${targetSecId} .section-head h2, ${targetSecId} h2`).first();
        const box = await heading.boundingBox();
        expect(box).toBeTruthy();
        if (box) {
          // Header height is 72px; heading must be at or below header
          expect(box.y).toBeGreaterThanOrEqual(60);
        }
      }
    }

    // 6. Incident 05:08 Stepper Check
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

    // 7. Operational Surfaces Tabs
    await expect(page.locator("#role-panel-dispo")).toBeVisible();
    await page.click("#role-btn-driver");
    await expect(page.locator("#role-panel-driver")).toBeVisible();
    await expect(page.locator("#role-panel-dispo")).toBeHidden();
    await page.click("#role-btn-admin");
    await expect(page.locator("#role-panel-admin")).toBeVisible();

    // 8. Pricing Tiers
    const priceCards = page.locator(".price-card");
    await expect(priceCards.nth(0)).toContainText("€89");
    await expect(priceCards.nth(1)).toContainText("€190");
    await expect(priceCards.nth(2)).toContainText("€390");
    await expect(priceCards.nth(3)).toContainText("€690");

    // 9. Pilot Form Real Submission Flow (Success) - Neutral Fixtures
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

    // 10. Zero Console Errors, Zero Page Errors, Zero Failed Requests (excluding favicons)
    const severeErrors = consoleErrors.filter(e => !e.includes("favicon"));
    expect(severeErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });

  test("pilot form error flow truthfully handles 503 SMTP_NOT_CONFIGURED", async ({ page }) => {
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    const badResponses = [];

    page.on("console", msg => {
      if (msg.type() === "error") {
        consoleErrors.push({ text: msg.text(), url: msg.location().url });
      }
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

    page.on("response", resp => {
      if (resp.status() >= 400) {
        badResponses.push({
          status: resp.status(),
          method: resp.request().method(),
          url: resp.url()
        });
      }
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

    const [pilotResponse] = await Promise.all([
      page.waitForResponse(
        resp => {
          try {
            return new URL(resp.url()).pathname === "/api/public/pilot-request" && resp.request().method() === "POST";
          } catch {
            return false;
          }
        }
      ),
      page.click("#pilotSubmitBtn")
    ]);

    expect(pilotResponse.status()).toBe(503);

    const responseJson = await pilotResponse.json();
    expect(responseJson.success).toBe(false);
    expect(responseJson.code).toBe("SMTP_NOT_CONFIGURED");

    await expect(feedback).toBeVisible();
    await expect(feedback).toContainText("Sistem za slanje email obaveštenja trenutno nije dostupan.");
    await expect(feedback).toHaveClass(/pilot-feedback-error/);

    const isExpectedPilotFailure = (r) => {
      try {
        return new URL(r.url).pathname === "/api/public/pilot-request" &&
          r.method === "POST" &&
          r.status === 503;
      } catch {
        return false;
      }
    };

    const expectedPilotResponses = badResponses.filter(isExpectedPilotFailure);
    const unexpectedResponses = badResponses.filter(r => !isExpectedPilotFailure(r));

    expect(expectedPilotResponses.length).toBe(1);
    expect(unexpectedResponses).toEqual([]);
    expect(badResponses.length).toBe(1);

    const isExpected503ConsoleError = (item) => {
      try {
        const pathname = new URL(item.url).pathname;
        const hasExactPath = pathname === "/api/public/pilot-request";
        const hasResourcePattern = item.text.includes("Failed to load resource");
        const has503 = item.text.includes("503");
        return hasExactPath && hasResourcePattern && has503;
      } catch {
        return false;
      }
    };

    const expectedConsoleErrors = consoleErrors.filter(isExpected503ConsoleError);
    expect(expectedConsoleErrors.length).toBeLessThanOrEqual(1);

    const unexpectedConsoleErrors = consoleErrors.filter(item => !isExpected503ConsoleError(item));
    expect(unexpectedConsoleErrors).toEqual([]);

    expect(pageErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });

  test("mobile viewports (390px and 320px) header geometry and zero horizontal overflow", async ({ page }) => {
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
    await expect(page.locator(".btn-driver-nav")).toBeVisible();
    await expect(page.locator(".btn-staff-nav")).toBeVisible();

    // 390px Mobile Hero Bus Visual
    const busVisual390 = page.locator("#hero-mobile-visual");
    await expect(busVisual390).toBeVisible();
    const busImg390 = page.locator("#hero-mobile-bus");
    await expect(busImg390).toBeVisible();
    const bus390Metrics = await busImg390.evaluate((img) => ({
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight
    }));
    expect(bus390Metrics.complete).toBe(true);
    expect(bus390Metrics.naturalWidth).toBeGreaterThan(0);
    expect(bus390Metrics.naturalHeight).toBeGreaterThan(0);

    // Narrow mobile (320px)
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/");
    scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    clientW = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollW).toBeLessThanOrEqual(clientW + 1);

    const headerBox = await page.locator(".site-header").boundingBox();
    expect(headerBox).toBeTruthy();
    if (headerBox) {
      expect(headerBox.x).toBeGreaterThanOrEqual(0);
      expect(headerBox.x + headerBox.width).toBeLessThanOrEqual(320);
    }

    await expect(page.locator(".cloud-region")).toBeHidden();
    await expect(page.locator(".btn-driver-nav")).toBeVisible();
    await expect(page.locator(".btn-staff-nav")).toBeVisible();
    await expect(page.locator("#nav-driver-btn")).toHaveAttribute("href", "/driver");
    await expect(page.locator("#nav-staff-btn")).toHaveAttribute("href", "/staff");

    const logoBox = await page.locator("img.brand-logo-img").boundingBox();
    expect(logoBox).toBeTruthy();
    if (logoBox) {
      expect(logoBox.x).toBeGreaterThanOrEqual(0);
      expect(logoBox.width).toBeGreaterThan(0);
    }

    const logo320Metrics = await page.locator("img.brand-logo-img").evaluate((img) => ({
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight
    }));
    expect(logo320Metrics.complete).toBe(true);
    expect(logo320Metrics.naturalWidth).toBeGreaterThan(0);
    expect(logo320Metrics.naturalHeight).toBeGreaterThan(0);

    // 320px Mobile Hero Bus Visual & Strict Bounds
    const busVisual320 = page.locator("#hero-mobile-visual");
    await expect(busVisual320).toBeVisible();
    const bus320Box = await busVisual320.boundingBox();
    expect(bus320Box).toBeTruthy();
    if (bus320Box) {
      expect(bus320Box.x).toBeGreaterThanOrEqual(0);
      expect(bus320Box.x + bus320Box.width).toBeLessThanOrEqual(321);
      expect(bus320Box.height).toBeGreaterThanOrEqual(140);
      expect(bus320Box.height).toBeLessThanOrEqual(200);
    }
    const busImg320 = page.locator("#hero-mobile-bus");
    await expect(busImg320).toBeVisible();
    const bus320Metrics = await busImg320.evaluate((img) => ({
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight
    }));
    expect(bus320Metrics.complete).toBe(true);
    expect(bus320Metrics.naturalWidth).toBeGreaterThan(0);
    expect(bus320Metrics.naturalHeight).toBeGreaterThan(0);

    const langSwitchBox = await page.locator(".lang-switch").boundingBox();
    expect(langSwitchBox).toBeTruthy();
    if (langSwitchBox) {
      expect(langSwitchBox.x).toBeGreaterThanOrEqual(0);
      expect(langSwitchBox.x + langSwitchBox.width).toBeLessThanOrEqual(320);
    }

    for (const langId of ["#lang-btn-sr", "#lang-btn-en", "#lang-btn-de"]) {
      const btn = page.locator(langId);
      await expect(btn).toBeVisible();
      const btnBox = await btn.boundingBox();
      expect(btnBox).toBeTruthy();
      if (btnBox) {
        expect(btnBox.x).toBeGreaterThanOrEqual(0);
        expect(btnBox.x + btnBox.width).toBeLessThanOrEqual(320);
        expect(btnBox.width).toBeGreaterThanOrEqual(18);
        expect(btnBox.height).toBeGreaterThanOrEqual(20);
      }
    }

    const loginBtn = page.locator(".btn-staff-nav");
    await expect(loginBtn).toBeVisible();
    const loginBox = await loginBtn.boundingBox();
    expect(loginBox).toBeTruthy();
    if (loginBox) {
      expect(loginBox.x).toBeGreaterThanOrEqual(0);
      expect(loginBox.x + loginBox.width).toBeLessThanOrEqual(320);
      expect(loginBox.width).toBeGreaterThanOrEqual(40);
      expect(loginBox.height).toBeGreaterThanOrEqual(24);
    }

    if (logoBox && langSwitchBox && loginBox) {
      expect(logoBox.x + logoBox.width).toBeLessThanOrEqual(langSwitchBox.x + 2);
      expect(langSwitchBox.x + langSwitchBox.width).toBeLessThanOrEqual(loginBox.x + 2);
    }

    // Hero CTA visibility and bounding box on 320px
    const heroCta = page.locator("#hero-cta-minute");
    await expect(heroCta).toBeVisible();
    const heroCtaBox = await heroCta.boundingBox();
    expect(heroCtaBox).toBeTruthy();
    if (heroCtaBox) {
      expect(heroCtaBox.x).toBeGreaterThanOrEqual(0);
      expect(heroCtaBox.x + heroCtaBox.width).toBeLessThanOrEqual(321);
    }

    // Pricing cards do not cause horizontal overflow on 320px
    const priceCards = page.locator("#pricing .price-card");
    const pCount = await priceCards.count();
    expect(pCount).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < pCount; i++) {
      const cBox = await priceCards.nth(i).boundingBox();
      expect(cBox).toBeTruthy();
      if (cBox) {
        expect(cBox.x).toBeGreaterThanOrEqual(0);
        expect(cBox.x + cBox.width).toBeLessThanOrEqual(321);
      }
    }

    // Pilot form does not cause horizontal overflow on 320px
    const pilotForm = page.locator("#pilotForm");
    await expect(pilotForm).toBeVisible();
    const pilotFormBox = await pilotForm.boundingBox();
    expect(pilotFormBox).toBeTruthy();
    if (pilotFormBox) {
      expect(pilotFormBox.x).toBeGreaterThanOrEqual(0);
      expect(pilotFormBox.x + pilotFormBox.width).toBeLessThanOrEqual(321);
    }

    expect(pageErrors).toEqual([]);
  });

  test("pricing navigation positioning and sticky header clearance", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.click("#nav-pricing");
    await page.waitForTimeout(600);

    const check = await page.evaluate(() => {
      const header = document.querySelector(".site-header");
      const heading = document.querySelector("#pricing .section-head h2");
      const hRect = header ? header.getBoundingClientRect() : null;
      const headRect = heading ? heading.getBoundingClientRect() : null;
      return {
        headerTop: hRect ? hRect.top : -999,
        headerBottom: hRect ? hRect.bottom : -999,
        headingTop: headRect ? headRect.top : -999,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth
      };
    });

    expect(Math.abs(check.headerTop)).toBeLessThanOrEqual(1);
    expect(check.headingTop).toBeGreaterThanOrEqual(check.headerBottom + 16);
    expect(check.scrollWidth).toBeLessThanOrEqual(check.clientWidth + 1);
  });

  test("owner visual review screenshots capture and integrity validation", async ({ page }) => {
    let canCapture = false;
    try {
      if (fs.existsSync(EVIDENCE_DIR)) {
        canCapture = true;
      } else if (process.platform === "win32" && fs.existsSync("F:\\BusCommand-Audit-Exports")) {
        fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
        canCapture = true;
      }
    } catch {
      canCapture = false;
    }

    if (!canCapture) {
      test.skip(!canCapture, "Evidence directory not available in this environment");
      return;
    }

    // Helper to wait for font and image readiness
    const waitForReady = async () => {
      await page.evaluate(async () => {
        await document.fonts.ready;
        const imgs = Array.from(document.querySelectorAll("img"));
        await Promise.all(imgs.map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise(res => { img.onload = res; img.onerror = res; });
        }));
      });
      await page.waitForTimeout(100);
    };

    // ─── DESKTOP VIEWPORT SCREENSHOTS (fullPage: false) ───

    // 1. desktop-1440-hero-en-assets-loaded.png (1440x900)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.click("#lang-btn-en");
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForReady();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "desktop-1440-hero-en-assets-loaded.png"),
      fullPage: false
    });

    // 1b. desktop-1366-hero-en.png (1366x768)
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/");
    await page.click("#lang-btn-en");
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForReady();
    // Verify no overflow and CTAs visible at 1366px
    const overflow1366 = await page.evaluate(() => document.documentElement.scrollWidth > 1366);
    expect(overflow1366).toBe(false);
    const ctaBounds1366 = await page.evaluate(() => {
      const ctas = Array.from(document.querySelectorAll(".hero-ctas .btn"));
      return ctas.map(b => { const r = b.getBoundingClientRect(); return { w: r.width, h: r.height }; });
    });
    expect(ctaBounds1366.length).toBeGreaterThanOrEqual(2);
    for (const b of ctaBounds1366) { expect(b.w).toBeGreaterThan(0); expect(b.h).toBeGreaterThan(0); }
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "desktop-1366-hero-en.png"),
      fullPage: false
    });
    // Reset to 1920 for next screenshot
    await page.setViewportSize({ width: 1920, height: 1080 });

    // 2. desktop-1920-hero-sr-assets-loaded.png (1920x1080)
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/");
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForReady();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "desktop-1920-hero-sr-assets-loaded.png"),
      fullPage: false
    });

    // 3. desktop-1440-pricing-en.png (1440x900)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.click("#lang-btn-en");
    await page.click("#nav-pricing");
    await page.waitForTimeout(600);
    await waitForReady();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "desktop-1440-pricing-en.png"),
      fullPage: false
    });

    // 4. desktop-1440-pilot-en.png (1440x900)
    await page.evaluate(() => {
      const el = document.querySelector("#pilot");
      if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
    });
    await page.waitForTimeout(300);
    await waitForReady();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "desktop-1440-pilot-en.png"),
      fullPage: false
    });

    // 5. desktop-1440-roles-de.png (1440x900)
    await page.click("#lang-btn-de");
    await page.click("#nav-roles");
    await page.waitForTimeout(500);
    await waitForReady();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "desktop-1440-roles-de.png"),
      fullPage: false
    });

    // ─── MOBILE VIEWPORT SCREENSHOTS (fullPage: false) ───

    // 320x568 Viewport:
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/");
    await page.click("#lang-btn-en");
    await page.waitForTimeout(150);

    // 6. mobile-320-header-logo-en.png
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForReady();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "mobile-320-header-logo-en.png"),
      fullPage: false
    });

    // 7a. mobile-320-bus-detail-en.png — locator screenshot of #hero-mobile-visual element only
    {
      const busEl = page.locator("#hero-mobile-visual");
      await busEl.scrollIntoViewIfNeeded();
      await waitForReady();
      // Assert asset loaded before screenshot
      const busMetrics = await page.evaluate(() => {
        const img = document.querySelector("#hero-mobile-bus");
        return img ? { complete: img.complete, nw: img.naturalWidth, nh: img.naturalHeight } : null;
      });
      expect(busMetrics).not.toBeNull();
      expect(busMetrics.complete).toBe(true);
      expect(busMetrics.nw).toBeGreaterThan(0);
      expect(busMetrics.nh).toBeGreaterThan(0);
      await busEl.screenshot({
        path: path.join(EVIDENCE_DIR, "mobile-320-bus-detail-en.png")
      });
    }

    // 7b. mobile-320-hero-viewport-en.png — the hero band around the bus visual.
    // At 320x568 the bus already sits fully inside the first screen, so scrolling it
    // into view cannot move the page and a plain viewport capture would be byte-identical
    // to the header capture above. Clipping to the bus band is what makes it distinct.
    {
      await page.evaluate(() => window.scrollTo(0, 0));
      await waitForReady();
      const busBox = await page.locator("#hero-mobile-visual").boundingBox();
      expect(busBox).not.toBeNull();
      const clipY = Math.max(0, Math.round(busBox.y) - 36);
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, "mobile-320-hero-viewport-en.png"),
        clip: { x: 0, y: clipY, width: 320, height: Math.min(Math.round(busBox.height) + 72, 568 - clipY) }
      });
    }

    // 8. mobile-320-incident-en.png
    await page.evaluate(() => {
      const el = document.querySelector("#incident");
      if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
    });
    await page.waitForTimeout(250);
    await waitForReady();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "mobile-320-incident-en.png"),
      fullPage: false
    });

    // 9. mobile-320-roles-en.png
    await page.evaluate(() => {
      const el = document.querySelector("#roles");
      if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
    });
    await page.waitForTimeout(250);
    await waitForReady();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "mobile-320-roles-en.png"),
      fullPage: false
    });

    // 10. mobile-320-compare-en.png
    await page.evaluate(() => {
      const el = document.querySelector("#compare");
      if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
    });
    await page.waitForTimeout(250);
    await waitForReady();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "mobile-320-compare-en.png"),
      fullPage: false
    });

    // 11. mobile-320-pricing-en.png
    await page.evaluate(() => {
      const el = document.querySelector("#pricing");
      if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
    });
    await page.waitForTimeout(250);
    await waitForReady();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "mobile-320-pricing-en.png"),
      fullPage: false
    });

    // 12. mobile-320-pilot-en.png
    await page.evaluate(() => {
      const el = document.querySelector("#pilot");
      if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
    });
    await page.waitForTimeout(250);
    await waitForReady();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "mobile-320-pilot-en.png"),
      fullPage: false
    });

    // 13. mobile-320-footer-en.png
    await page.evaluate(() => {
      const el = document.querySelector(".site-footer");
      if (el) el.scrollIntoView({ behavior: "instant", block: "end" });
    });
    await page.waitForTimeout(250);
    await waitForReady();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "mobile-320-footer-en.png"),
      fullPage: false
    });

    // 390x844 Viewport:
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.click("#lang-btn-en");
    await page.waitForTimeout(150);

    // 14. mobile-390-hero-bus-en.png
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForReady();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "mobile-390-hero-bus-en.png"),
      fullPage: false
    });

    // 15. mobile-390-pricing-en.png
    await page.evaluate(() => {
      const el = document.querySelector("#pricing");
      if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
    });
    await page.waitForTimeout(250);
    await waitForReady();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "mobile-390-pricing-en.png"),
      fullPage: false
    });

    // 16. mobile-390-pilot-en.png
    await page.evaluate(() => {
      const el = document.querySelector("#pilot");
      if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
    });
    await page.waitForTimeout(250);
    await waitForReady();
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, "mobile-390-pilot-en.png"),
      fullPage: false
    });

    // Verify every screenshot this test actually writes exists and is non-empty.
    const requiredFiles = [
      "desktop-1440-hero-en-assets-loaded.png",
      "desktop-1366-hero-en.png",
      "desktop-1920-hero-sr-assets-loaded.png",
      "desktop-1440-pricing-en.png",
      "desktop-1440-pilot-en.png",
      "desktop-1440-roles-de.png",
      "mobile-320-header-logo-en.png",
      "mobile-320-bus-detail-en.png",
      "mobile-320-hero-viewport-en.png",
      "mobile-320-incident-en.png",
      "mobile-320-roles-en.png",
      "mobile-320-compare-en.png",
      "mobile-320-pricing-en.png",
      "mobile-320-pilot-en.png",
      "mobile-320-footer-en.png",
      "mobile-390-hero-bus-en.png",
      "mobile-390-pricing-en.png",
      "mobile-390-pilot-en.png"
    ];

    for (const f of requiredFiles) {
      const p = path.join(EVIDENCE_DIR, f);
      expect(fs.existsSync(p)).toBe(true);
      expect(fs.statSync(p).size).toBeGreaterThan(1000);
    }

    // Every screenshot must show a different part of the page — identical hashes
    // would mean a capture silently reused the previous frame.
    const digests = new Map();
    for (const f of requiredFiles) {
      const digest = sha256File(path.join(EVIDENCE_DIR, f));
      expect(digests.has(digest), `${f} is byte-identical to ${digests.get(digest)}`).toBe(false);
      digests.set(digest, f);
    }
    expect(digests.size).toBe(requiredFiles.length);
  });

  test("prominent public headings use grayscale antialiasing at 320px and 390px", async ({ page }) => {
    const chromaOf = async (locator, { ignoreCyanGradient = false } = {}) => {
      await locator.scrollIntoViewIfNeeded();
      const png = await locator.screenshot();
      return page.evaluate(async ({ bytes, ignoreCyanGradient: ignoreCyan }) => {
        const blob = new Blob([new Uint8Array(bytes)], { type: "image/png" });
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(bitmap, 0, 0);
        const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        let maxChroma = 0, glyphPixels = 0, colouredPixels = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          if ((r + g + b) / 3 < 60) continue;
          // Hero accent word is an intentional cyan gradient — exclude those pixels.
          if (ignoreCyan && b > r + 20) continue;
          glyphPixels++;
          const chroma = Math.max(r, g, b) - Math.min(r, g, b);
          if (chroma > maxChroma) maxChroma = chroma;
          if (chroma > 20) colouredPixels++;
        }
        return { maxChroma, glyphPixels, colouredPixels };
      }, { bytes: Array.from(png), ignoreCyanGradient });
    };

    for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.evaluate(async () => { await document.fonts.ready; });

      const layers = await page.evaluate(() => {
        const dump = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const cs = getComputedStyle(el);
          return { transform: cs.transform, backfaceVisibility: cs.backfaceVisibility };
        };
        return {
          hero: dump(".hero-h1"),
          pricing: dump("#pricing-title"),
          footer: dump(".quiet-close h2")
        };
      });
      for (const [name, paint] of Object.entries(layers)) {
        expect(paint, `${name} heading missing`).not.toBeNull();
        expect(paint.transform, `${name} heading must be on its own compositing layer`).toBe("matrix(1, 0, 0, 1, 0, 0)");
        expect(paint.backfaceVisibility, `${name} heading`).toBe("hidden");
      }

      const footer = await chromaOf(page.locator(".quiet-close h2"));
      expect(footer.glyphPixels).toBeGreaterThan(500);
      expect(footer.colouredPixels).toBe(0);
      expect(footer.maxChroma).toBeLessThanOrEqual(20);

      const pricing = await chromaOf(page.locator("#pricing-title"));
      expect(pricing.glyphPixels).toBeGreaterThan(80);
      expect(pricing.colouredPixels).toBe(0);
      expect(pricing.maxChroma).toBeLessThanOrEqual(20);

      const hero = await chromaOf(page.locator(".hero-h1"), { ignoreCyanGradient: true });
      expect(hero.glyphPixels).toBeGreaterThan(200);
      expect(hero.colouredPixels).toBe(0);
      expect(hero.maxChroma).toBeLessThanOrEqual(20);
    }

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/");
    await page.evaluate(async () => { await document.fonts.ready; });
    const desktopLayers = await page.evaluate(() => {
      const dump = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        return getComputedStyle(el).transform;
      };
      return {
        hero: dump(".hero-h1"),
        pricing: dump("#pricing-title"),
        footer: dump(".quiet-close h2")
      };
    });
    expect(desktopLayers.hero).toBe("none");
    expect(desktopLayers.pricing).toBe("none");
    expect(desktopLayers.footer).toBe("none");
  });

  test("public landing DOM uses only generic localized identities across SR, EN and DE", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/");
    await page.evaluate(async () => { await document.fonts.ready; });

    const FORBIDDEN = /Marko|Luka|Petrović|Kovačević|320\.s01|320\.S01|VOR 320|VOR 321|BC 5676-BC|BC 9012|Lasta|RegioBus|City Transit/;
    const expected = {
      sr: { driver: "Vozač 01", repl: "Zamenski vozač 02", duty: "Smena 001", veh: "Vozilo 001" },
      en: { driver: "Driver 01", repl: "Replacement Driver 02", duty: "Duty 001", veh: "Vehicle 001" },
      de: { driver: "Fahrer 01", repl: "Ersatzfahrer 02", duty: "Dienst 001", veh: "Fahrzeug 001" }
    };
    const foreign = {
      sr: [],
      en: ["Vozač 01", "Zamenski vozač 02", "Smena 001", "Vozilo 001", "Linija 001", "Grupa 01", "Nedostupan", "U vožnji", "Cenovnik"],
      de: ["Vozač 01", "Zamenski vozač 02", "Smena 001", "Vozilo 001", "Linija 001", "Grupa 01", "Driver 01", "Replacement Driver 02", "Duty 001", "Vehicle 001", "Route 001", "Group 01", "Nedostupan", "U vožnji"]
    };

    for (const lang of ["sr", "en", "de"]) {
      await page.click(`#lang-btn-${lang}`);
      await page.waitForTimeout(400);

      const observed = await page.evaluate((forbiddenSource) => {
        const forbidden = new RegExp(forbiddenSource);
        const attrs = [];
        for (const el of document.querySelectorAll("*")) {
          for (const attr of ["title", "placeholder", "aria-label", "alt", "data-i18n", "data-i18n-title", "data-i18n-placeholder"]) {
            const value = el.getAttribute(attr);
            if (value && forbidden.test(value) && !/^data-i18n/.test(attr)) attrs.push(`${attr}="${value}"`);
          }
        }
        const hidden = [...document.querySelectorAll(".role-panel, [hidden], [aria-hidden='true']")]
          .map(el => el.innerText || "")
          .join("\n");
        return {
          body: document.body.innerText,
          attrs,
          hidden,
          titles: [...document.querySelectorAll("[title]")].map(el => el.getAttribute("title")),
          placeholders: [...document.querySelectorAll("[placeholder]")].map(el => el.getAttribute("placeholder")),
          mockDriver: document.querySelector("#mock-driver-name")?.textContent,
          pinAlert: document.querySelector("#pin-alert")?.getAttribute("title"),
          pinStandby: document.querySelector("#pin-standby")?.getAttribute("title"),
          busNumber: document.querySelector("#mock-bus-number")?.textContent,
          lineDeparture: document.querySelector("#mock-line-departure")?.textContent,
          todayDuty: document.querySelector("[data-i18n='valTodayDuty']")?.textContent
        };
      }, FORBIDDEN.source);

      expect(FORBIDDEN.test(observed.body), `${lang} visible copy still has a forbidden identifier`).toBe(false);
      expect(FORBIDDEN.test(observed.hidden), `${lang} hidden panel still has a forbidden identifier`).toBe(false);
      expect(observed.attrs, `${lang} attributes still have a forbidden identifier`).toEqual([]);
      expect(observed.titles.join("\n")).not.toMatch(FORBIDDEN);
      expect(observed.placeholders.join("\n")).not.toMatch(FORBIDDEN);

      expect(observed.mockDriver).toBe(expected[lang].driver);
      expect(observed.busNumber).toBe(expected[lang].veh);
      expect(observed.todayDuty).toContain(expected[lang].duty);
      expect(observed.pinAlert).toContain(expected[lang].driver);
      expect(observed.pinStandby).toContain(expected[lang].repl);

      for (const token of foreign[lang]) {
        const hay = [observed.body, observed.hidden, observed.titles.join("\n"), observed.placeholders.join("\n")].join("\n");
        expect(hay.includes(token), `${lang} still exposes foreign identity ${JSON.stringify(token)}`).toBe(false);
      }
    }
  });

  test("vertical rhythm between Documents/Pricing and Roles/System stays inside owner bounds", async ({ page }) => {
    const viewports = [
      { width: 1920, height: 1080, min: 96, max: 160 },
      { width: 1366, height: 768, min: 96, max: 160 },
      { width: 390, height: 844, min: 64, max: 220 },
      { width: 320, height: 568, min: 64, max: 220 }
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/");
      await page.evaluate(async () => { await document.fonts.ready; });
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(200);
      await page.evaluate(() => window.scrollTo(0, 0));

      const gaps = await page.evaluate(() => {
        // Painted edges, not section boxes: sections are flush, so the perceived
        // empty band is the distance between the outermost painted children.
        const paintedEdges = (root) => {
          let minTop = Infinity, maxBottom = -Infinity;
          const walk = (el) => {
            const cs = getComputedStyle(el);
            if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return;
            const r = el.getBoundingClientRect();
            const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
            const isAtom = /^(IMG|SVG|INPUT|TEXTAREA|BUTTON|HR|CANVAS)$/.test(el.tagName);
            const hasBox = cs.borderTopWidth !== "0px" || cs.borderBottomWidth !== "0px"
              || (cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent")
              || cs.backgroundImage !== "none";
            if (r.height > 0 && r.width > 0 && (hasText || isAtom || hasBox)) {
              minTop = Math.min(minTop, r.top + window.scrollY);
              maxBottom = Math.max(maxBottom, r.bottom + window.scrollY);
            }
            for (const child of el.children) walk(child);
          };
          walk(root);
          return { top: minTop, bottom: maxBottom };
        };

        const roles = document.querySelector("#roles");
        const downloads = paintedEdges(document.querySelector("#downloads"));
        const pricing = paintedEdges(document.querySelector("#pricing"));
        const rolesEdges = paintedEdges(roles);
        const nextEdges = paintedEdges(roles.nextElementSibling);
        return {
          documentsToPricing: pricing.top - downloads.bottom,
          rolesToNext: nextEdges.top - rolesEdges.bottom,
          nextId: roles.nextElementSibling.id,
          horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth
        };
      });

      expect(gaps.nextId).toBe("system");
      expect(gaps.horizontalOverflow).toBeLessThanOrEqual(0);
      for (const key of ["documentsToPricing", "rolesToNext"]) {
        expect(gaps[key], `${key} at ${vp.width}px was ${gaps[key]}px`).toBeGreaterThanOrEqual(vp.min);
        expect(gaps[key], `${key} at ${vp.width}px was ${gaps[key]}px`).toBeLessThanOrEqual(vp.max);
      }
    }
  });

  test("German desktop header children stay inside the viewport without overlap", async ({ page }) => {
    const viewports = [
      { width: 1920, height: 1080 },
      { width: 1440, height: 900 },
      { width: 1366, height: 768 }
    ];
    const selectors = [".brand", ".cloud-region", ".nav", ".head-actions", ".lang-switch", ".btn-driver-nav", ".btn-staff-nav"];
    const disjoint = [
      [".brand", ".cloud-region"],
      [".cloud-region", ".nav"],
      [".nav", ".head-actions"],
      [".brand", ".head-actions"],
      [".lang-switch", ".btn-driver-nav"],
      [".btn-driver-nav", ".btn-staff-nav"],
      [".lang-switch", ".btn-staff-nav"]
    ];

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await page.goto("/");
      await page.click("#lang-btn-de");
      await page.evaluate(async () => { await document.fonts.ready; });
      await page.waitForTimeout(200);

      await expect(page.locator(".brand-logo-img")).toBeVisible();
      await expect(page.locator(".brand span")).toBeVisible();
      await expect(page.locator(".cloud-region")).toBeVisible();
      await expect(page.locator(".nav")).toBeVisible();
      await expect(page.locator(".lang-switch")).toBeVisible();
      await expect(page.locator(".btn-driver-nav")).toBeVisible();
      await expect(page.locator(".btn-staff-nav")).toBeVisible();
      await expect(page.locator("#nav-driver-btn")).toHaveAttribute("href", "/driver");
      await expect(page.locator("#nav-staff-btn")).toHaveAttribute("href", "/staff");
      await expect(page.locator(".btn-driver-nav .nav-cta-full")).toBeVisible();
      await expect(page.locator(".btn-driver-nav .nav-cta-full")).toHaveText("Fahrer-App");
      await expect(page.locator(".btn-driver-nav .nav-cta-short")).toBeHidden();
      await expect(page.locator(".btn-staff-nav .nav-cta-full")).toBeVisible();
      await expect(page.locator(".btn-staff-nav .nav-cta-full")).toHaveText("Mitarbeiter-Login");
      await expect(page.locator(".btn-staff-nav .nav-cta-short")).toBeHidden();

      const boxes = await page.evaluate((sels) => {
        const map = {};
        for (const sel of sels) {
          const el = document.querySelector(sel);
          if (!el) {
            map[sel] = null;
            continue;
          }
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          map[sel] = {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            visible: cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0
          };
        }
        return { map, vw: window.innerWidth };
      }, selectors);

      for (const sel of selectors) {
        const box = boxes.map[sel];
        expect(box, `${sel} missing at ${vp.width}`).toBeTruthy();
        expect(box.visible, `${sel} not visible at ${vp.width}`).toBe(true);
        expect(box.width, `${sel} width at ${vp.width}`).toBeGreaterThan(0);
        expect(box.x, `${sel} x at ${vp.width}`).toBeGreaterThanOrEqual(-0.5);
        expect(box.x + box.width, `${sel} right edge at ${vp.width}`).toBeLessThanOrEqual(boxes.vw + 0.5);
      }

      const overlap = (a, b) =>
        a.x + a.width > b.x + 0.5 &&
        b.x + b.width > a.x + 0.5 &&
        a.y + a.height > b.y + 0.5 &&
        b.y + b.height > a.y + 0.5;

      for (const [left, right] of disjoint) {
        expect(
          overlap(boxes.map[left], boxes.map[right]),
          `${left} intersects ${right} at ${vp.width}`
        ).toBe(false);
      }
    }
  });

  test("incident plan card and PWA card never collide in SR, EN and DE", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/");
    await page.evaluate(async () => { await document.fonts.ready; });

    const expected = {
      sr: { lock: "Status Plan Lock-a:", pwa: "BusCommand Vozač", duty: "Smena 001", driver: "Vozač 01", veh: "Vozilo 001" },
      en: { lock: "Plan Lock status:", pwa: "BusCommand Driver", duty: "Duty 001", driver: "Driver 01", veh: "Vehicle 001" },
      de: { lock: "Plan-Lock-Status:", pwa: "BusCommand Fahrer", duty: "Dienst 001", driver: "Fahrer 01", veh: "Fahrzeug 001" }
    };

    for (const lang of ["sr", "en", "de"]) {
      await page.click(`#lang-btn-${lang}`);
      await page.waitForTimeout(250);
      await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
      await page.locator("#nav-incident").click();
      await page.waitForFunction(() => {
        const y = window.scrollY;
        return y > 200;
      });
      await page.waitForTimeout(200);

      const metrics = await page.evaluate(() => {
        const plan = document.querySelector("#incident .mock-card");
        const pwa = document.querySelector("#incident .pwa-phone");
        const stage = document.querySelector("#incident .interactive-stage");
        const overlap = (a, b) =>
          a.x + a.width > b.x + 0.5 &&
          b.x + b.width > a.x + 0.5 &&
          a.y + a.height > b.y + 0.5 &&
          b.y + b.height > a.y + 0.5;
        const box = (el) => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        };
        const planBox = box(plan);
        const pwaBox = box(pwa);
        const stageBox = box(stage);
        const inside = (inner, outer) =>
          inner.x >= outer.x - 0.5 &&
          inner.y >= outer.y - 0.5 &&
          inner.x + inner.width <= outer.x + outer.width + 0.5 &&
          inner.y + inner.height <= outer.y + outer.height + 0.5;
        const rows = [...document.querySelectorAll("#incident .mock-row")].map((row) => ({
          text: row.innerText.replace(/\s+/g, " ").trim(),
          scrollWidth: row.scrollWidth,
          clientWidth: row.clientWidth,
          children: [...row.children].map((child) => ({
            text: child.innerText.replace(/\s+/g, " ").trim(),
            scrollWidth: child.scrollWidth,
            clientWidth: child.clientWidth
          }))
        }));
        return {
          intersect: overlap(planBox, pwaBox),
          planInside: inside(planBox, stageBox),
          pwaInside: inside(pwaBox, stageBox),
          planBox,
          pwaBox,
          rows,
          pwaName: document.querySelector("[data-i18n='pwaAppName']")?.innerText,
          lockLabel: document.querySelector("[data-i18n='lblPlanLockStatus']")?.innerText,
          cardText: [
            document.querySelector("#incident .mock-card")?.innerText || "",
            document.querySelector("#incident .pwa-phone")?.innerText || ""
          ].join("\n")
        };
      });

      expect(metrics.intersect, `${lang} plan/PWA cards intersect`).toBe(false);
      expect(metrics.planInside, `${lang} plan card escaped incident stage`).toBe(true);
      expect(metrics.pwaInside, `${lang} PWA card escaped incident stage`).toBe(true);
      expect(metrics.pwaName).toBe(expected[lang].pwa);
      expect(metrics.lockLabel).toBe(expected[lang].lock);

      expect(metrics.cardText).toContain(expected[lang].duty);
      expect(metrics.cardText).toContain(expected[lang].driver);
      expect(metrics.cardText).toContain(expected[lang].veh);

      for (const row of metrics.rows) {
        expect(row.scrollWidth, `${lang} row overflow: ${row.text}`).toBeLessThanOrEqual(row.clientWidth + 1);
        for (const child of row.children) {
          expect(child.scrollWidth, `${lang} cell overflow: ${child.text}`).toBeLessThanOrEqual(child.clientWidth + 1);
        }
      }
    }
  });

  test("mobile header keeps both Driver and Staff actions tappable in SR, EN and DE", async ({ page }) => {
    const viewports = [
      { width: 390, height: 844 },
      { width: 320, height: 568 }
    ];
    const labels = {
      en: { driver: "Driver", staff: "Staff", driverFull: "Driver App", staffFull: "Staff Login" },
      de: { driver: "Fahrer", staff: "Team", driverFull: "Fahrer-App", staffFull: "Mitarbeiter-Login" },
      sr: { driver: "Vozač", staff: "Osoblje", driverFull: "Aplikacija za vozača", staffFull: "Prijava osoblja" }
    };

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await page.goto("/");
      await page.evaluate(async () => { await document.fonts.ready; });

      for (const lang of ["en", "de", "sr"]) {
        await page.click(`#lang-btn-${lang}`);
        await page.waitForTimeout(200);

        const driver = page.locator("#nav-driver-btn");
        const staff = page.locator("#nav-staff-btn");
        await expect(driver).toBeVisible();
        await expect(staff).toBeVisible();
        await expect(driver).toHaveAttribute("href", "/driver");
        await expect(staff).toHaveAttribute("href", "/staff");
        await expect(driver.locator(".nav-cta-short")).toBeVisible();
        await expect(staff.locator(".nav-cta-short")).toBeVisible();
        await expect(driver.locator(".nav-cta-full")).toBeHidden();
        await expect(staff.locator(".nav-cta-full")).toBeHidden();
        await expect(driver.locator(".nav-cta-short")).toHaveText(labels[lang].driver);
        await expect(staff.locator(".nav-cta-short")).toHaveText(labels[lang].staff);
        await expect(driver).toHaveAttribute("aria-label", labels[lang].driverFull);
        await expect(staff).toHaveAttribute("aria-label", labels[lang].staffFull);
        await expect(driver).toHaveAttribute("title", labels[lang].driverFull);
        await expect(staff).toHaveAttribute("title", labels[lang].staffFull);

        const geometry = await page.evaluate((vw) => {
          const sels = [".brand", ".lang-switch", ".btn-driver-nav", ".btn-staff-nav", "#lang-btn-de", "#lang-btn-sr", "#lang-btn-en"];
          const map = {};
          for (const sel of sels) {
            const el = document.querySelector(sel);
            const r = el.getBoundingClientRect();
            map[sel] = { x: r.x, y: r.y, width: r.width, height: r.height };
          }
          const overlap = (a, b) =>
            a.x + a.width > b.x + 0.5 &&
            b.x + b.width > a.x + 0.5 &&
            a.y + a.height > b.y + 0.5 &&
            b.y + b.height > a.y + 0.5;
          return {
            map,
            vw,
            scrollOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            overlaps: {
              langDriver: overlap(map[".lang-switch"], map[".btn-driver-nav"]),
              driverStaff: overlap(map[".btn-driver-nav"], map[".btn-staff-nav"]),
              brandActions: overlap(map[".brand"], map[".btn-staff-nav"]),
              brandLang: overlap(map[".brand"], map[".lang-switch"])
            }
          };
        }, vp.width);

        expect(geometry.scrollOverflow).toBeLessThanOrEqual(1);
        expect(geometry.overlaps.langDriver, `${lang} lang/driver overlap at ${vp.width}`).toBe(false);
        expect(geometry.overlaps.driverStaff, `${lang} driver/staff overlap at ${vp.width}`).toBe(false);
        expect(geometry.overlaps.brandActions, `${lang} brand/staff overlap at ${vp.width}`).toBe(false);
        expect(geometry.overlaps.brandLang, `${lang} brand/lang overlap at ${vp.width}`).toBe(false);

        for (const sel of [".btn-driver-nav", ".btn-staff-nav", "#lang-btn-de", "#lang-btn-sr", "#lang-btn-en"]) {
          const box = geometry.map[sel];
          expect(box.width, `${sel} width at ${vp.width} ${lang}`).toBeGreaterThanOrEqual(40);
          expect(box.height, `${sel} height at ${vp.width} ${lang}`).toBeGreaterThanOrEqual(40);
          expect(box.x).toBeGreaterThanOrEqual(-0.5);
          expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 0.5);
        }

        if (vp.width <= 320) {
          await expect(page.locator(".brand span")).toBeHidden();
        } else {
          await expect(page.locator(".brand-logo-img")).toBeVisible();
        }
        await expect(page.locator(".brand-logo-img")).toBeVisible();
      }
    }
  });

  test("real Incident nav click keeps scrollX at 0 and does not clip header or stage", async ({ page }) => {
    const waitScrollIdle = async () => {
      await page.evaluate(async () => {
        const started = performance.now();
        let lastY = window.scrollY;
        let lastX = window.scrollX;
        let stable = 0;
        while (performance.now() - started < 2500) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
          if (window.scrollY === lastY && window.scrollX === lastX) stable += 1;
          else {
            stable = 0;
            lastY = window.scrollY;
            lastX = window.scrollX;
          }
          if (stable >= 12) break;
        }
      });
    };

    const assertAfterIncidentNav = async (label) => {
      await expect(page.locator("#nav-incident")).toBeVisible();
      await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
      await page.locator("#nav-incident").click();
      await waitScrollIdle();

      const metrics = await page.evaluate(() => {
        const box = (el) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return {
            x: r.x,
            y: r.y,
            w: r.width,
            h: r.height,
            visible: cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0
          };
        };
        const fullyInside = (b, vw) =>
          !!b && b.visible && b.x >= -0.5 && b.x + b.w <= vw + 0.5;
        const overlap = (a, b) =>
          a.x + a.w > b.x + 0.5 &&
          b.x + b.w > a.x + 0.5 &&
          a.y + a.h > b.y + 0.5 &&
          b.y + b.h > a.y + 0.5;
        const vw = window.innerWidth;
        const brand = box(document.querySelector(".brand"));
        const cloud = box(document.querySelector(".cloud-region"));
        const headActions = box(document.querySelector(".head-actions"));
        const timeline = box(document.querySelector("#incident .story-timeline"));
        const stage = box(document.querySelector("#incident .interactive-stage"));
        const plan = box(document.querySelector("#incident .mock-card"));
        const pwa = box(document.querySelector("#incident .pwa-phone"));
        return {
          scrollX: window.scrollX,
          innerWidth: vw,
          htmlScrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth,
          brandInside: fullyInside(brand, vw),
          cloudVisible: !!(cloud && cloud.visible),
          cloudInside: !cloud || !cloud.visible || fullyInside(cloud, vw),
          headActionsInside: fullyInside(headActions, vw),
          timelineInside: fullyInside(timeline, vw),
          stageInside: fullyInside(stage, vw),
          cardsIntersect: plan && pwa ? overlap(plan, pwa) : true,
          brand,
          cloud,
          headActions,
          timeline,
          stage
        };
      });

      expect(metrics.scrollX, `${label} window.scrollX`).toBe(0);
      expect(metrics.htmlScrollWidth, `${label} html.scrollWidth`).toBeLessThanOrEqual(metrics.innerWidth);
      expect(metrics.bodyScrollWidth, `${label} body.scrollWidth`).toBeLessThanOrEqual(metrics.innerWidth);
      expect(metrics.brandInside, `${label} brand clipped`).toBe(true);
      expect(metrics.cloudInside, `${label} cloud-region clipped`).toBe(true);
      expect(metrics.headActionsInside, `${label} head-actions clipped`).toBe(true);
      expect(metrics.timelineInside, `${label} story-timeline clipped`).toBe(true);
      expect(metrics.stageInside, `${label} interactive-stage clipped`).toBe(true);
      expect(metrics.cardsIntersect, `${label} plan/PWA intersect`).toBe(false);
    };

    const langs = ["de", "en", "sr"];
    for (const lang of langs) {
      await page.setViewportSize({ width: 1366, height: 768 });
      await page.goto("/");
      await page.evaluate(async () => { await document.fonts.ready; });
      await page.click(`#lang-btn-${lang}`);
      await page.waitForTimeout(250);
      await assertAfterIncidentNav(`1366-${lang}`);
    }

    for (const vp of [
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 }
    ]) {
      await page.setViewportSize(vp);
      await page.goto("/");
      await page.evaluate(async () => { await document.fonts.ready; });
      await page.click("#lang-btn-de");
      await page.waitForTimeout(250);
      await assertAfterIncidentNav(`${vp.width}-de`);
    }
  });
});
