import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { pilotRequestBody, validateBody } = require("../../server/validation.js");
const {
  escapeHtml,
  sanitizeHeader,
  isPlatformSmtpConfigured,
  setPlatformTransport,
  createPlatformTransport,
  buildPilotEmailContent,
  sendPilotEmail,
  TARGET_EMAIL
} = require("../../server/pilot-service.js");
const { rateLimit } = require("../../server/rate-limit.js");

describe("Pilot Request Hardened Unit & Security Suite", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    setPlatformTransport(null);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    setPlatformTransport(null);
  });

  test("TARGET_EMAIL is strictly fixed to info@buscommand.com", () => {
    assert.equal(TARGET_EMAIL, "info@buscommand.com");
  });

  test("escapeHtml prevents HTML/script injection attacks", () => {
    const raw = '<script>alert("xss")</script> & \'test"';
    const escaped = escapeHtml(raw);
    assert.equal(escaped, "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &#039;test&quot;");
    assert.ok(!escaped.includes("<script>"));
  });

  test("sanitizeHeader removes CR and LF to prevent email header injection", () => {
    const dirty = "Demo Corp\r\nBcc: evil@attacker.com\nSubject: Injected";
    const clean = sanitizeHeader(dirty);
    assert.ok(!clean.includes("\r"));
    assert.ok(!clean.includes("\n"));
    assert.equal(clean, "Demo Corp Bcc: evil@attacker.com Subject: Injected");
  });

  test("validation: accepts valid neutral applications in SR, DE, EN with Unicode (without client metadata)", () => {
    for (const lang of ["sr", "de", "en"]) {
      const validPayload = {
        companyName: "München Linienbus & Špedicija d.o.o.",
        contactName: "Dragan Petrović",
        email: "pilot@example.com",
        phone: "+49 89 123456",
        fleetSize: "25",
        tier: "starter",
        message: "Planiramo uvoz 15 linija sa smenama.",
        lang
      };
      const result = pilotRequestBody.safeParse(validPayload);
      assert.ok(result.success, "Validation failed for lang " + lang);
      assert.equal(result.data.companyName, "München Linienbus & Špedicija d.o.o.");
      assert.equal(result.data.email, "pilot@example.com");
      assert.equal(result.data.lang, lang);
    }
  });

  test("validation: rejects client-supplied timestamp or source (.strict())", () => {
    const withTimestamp = pilotRequestBody.safeParse({
      companyName: "Demo Bus Company",
      contactName: "Jane Doe",
      email: "pilot@example.com",
      timestamp: "2026-09-12T00:00:00.000Z"
    });
    assert.ok(!withTimestamp.success, "Must reject client-supplied timestamp");
    assert.ok(withTimestamp.error.issues.some(i => i.code === "unrecognized_keys" && i.keys.includes("timestamp")));

    const withSource = pilotRequestBody.safeParse({
      companyName: "Demo Bus Company",
      contactName: "Jane Doe",
      email: "pilot@example.com",
      source: "malicious_spoofed_source"
    });
    assert.ok(!withSource.success, "Must reject client-supplied source");
    assert.ok(withSource.error.issues.some(i => i.code === "unrecognized_keys" && i.keys.includes("source")));
  });

  test("validation: rejects unknown additional fields (.strict())", () => {
    const payloadWithExtra = {
      companyName: "Demo Bus Company",
      contactName: "Jane Doe",
      email: "pilot@example.com",
      maliciousField: "DROP TABLE users;",
      adminOverride: true
    };
    const result = pilotRequestBody.safeParse(payloadWithExtra);
    assert.ok(!result.success, "Must reject unknown fields");
    assert.ok(result.error.issues.some(i => i.code === "unrecognized_keys"));
  });

  test("validation: rejects invalid email address", () => {
    const badEmails = ["notanemail", "pilot@", "@example.com", "pilot@example", "pilot@.com"];
    for (const email of badEmails) {
      const result = pilotRequestBody.safeParse({
        companyName: "Demo Bus Company",
        contactName: "Jane Doe",
        email
      });
      assert.ok(!result.success, "Should have rejected email: " + email);
    }
  });

  test("validation: rejects empty or whitespace-only required fields", () => {
    const emptyComp = pilotRequestBody.safeParse({
      companyName: "   ",
      contactName: "Jane Doe",
      email: "pilot@example.com"
    });
    assert.ok(!emptyComp.success);

    const emptyContact = pilotRequestBody.safeParse({
      companyName: "Demo Bus Company",
      contactName: "  \t  ",
      email: "pilot@example.com"
    });
    assert.ok(!emptyContact.success);
  });

  test("validation: rejects invalid tier enum", () => {
    const badTier = pilotRequestBody.safeParse({
      companyName: "Demo Bus Company",
      contactName: "Jane Doe",
      email: "pilot@example.com",
      tier: "unlimited_vip_enterprise"
    });
    assert.ok(!badTier.success);
  });

  test("validation: rejects honeypot trigger (anti-bot)", () => {
    const botPayload = {
      companyName: "Automated Spammer",
      contactName: "Bot",
      email: "spam@example.com",
      hp: "https://spamlink.com"
    };
    const result = pilotRequestBody.safeParse(botPayload);
    assert.ok(!result.success, "Honeypot must fail validation");
    assert.ok(result.error.issues.some(i => i.path.includes("hp")));
  });

  test("validation: rejects header injection sequences across string fields", () => {
    const fieldsWithNewlines = [
      { companyName: "Demo\nBcc: evil@example.com", contactName: "Jane", email: "pilot@example.com" },
      { companyName: "Demo", contactName: "Jane\rBcc: evil@example.com", email: "pilot@example.com" },
      { companyName: "Demo", contactName: "Jane", email: "pilot@example.com\r\nCc: hacker@example.com" },
      { companyName: "Demo", contactName: "Jane", email: "pilot@example.com", phone: "+381\n111" }
    ];
    for (const item of fieldsWithNewlines) {
      const result = pilotRequestBody.safeParse(item);
      assert.ok(!result.success, "Header injection must be rejected");
    }
  });

  test("validation: rejects oversized field lengths", () => {
    const result = pilotRequestBody.safeParse({
      companyName: "X".repeat(201),
      contactName: "Y".repeat(201),
      email: "pilot@example.com",
      message: "Z".repeat(2001)
    });
    assert.ok(!result.success);
  });

  test("buildPilotEmailContent formats headers, text, and html escaping safely", () => {
    const content = buildPilotEmailContent({
      companyName: "Alps Shuttle <GmbH>",
      contactName: "Hans Müller",
      email: "pilot@example.com",
      phone: "+43 1 987654",
      fleetSize: "40",
      tier: "pro",
      lang: "de",
      message: "<img src=x onerror=alert(1)> Bitte um Angebot."
    });

    assert.ok(content.subject.includes("[BusCommand Pilot] Nova prijava: Alps Shuttle <GmbH> (40 vozila)"));
    assert.ok(content.text.includes("pilot@example.com"));
    assert.ok(content.html.includes("&lt;img src=x onerror=alert(1)&gt;"));
    assert.ok(!content.html.includes("<img"));
  });

  test("buildPilotEmailContent: safely guards against invalid timestamp without throwing", () => {
    const res = buildPilotEmailContent({
      companyName: "Demo Corp",
      contactName: "Tester",
      email: "pilot@example.com",
      timestamp: "INVALID_DATE_VALUE"
    });
    assert.ok(res.html.includes("Vreme:"));
    assert.ok(res.text.includes("Vreme:"));
  });

  test("no runtime stub: unconfigured SMTP always fails closed regardless of environment flags", async () => {
    for (const testEnv of [
      { NODE_ENV: "production", BUSCOMMAND_QA_HARNESS: "1" },
      { NODE_ENV: "test", BUSCOMMAND_QA_HARNESS: "1" },
      { NODE_ENV: "development", BUSCOMMAND_FORCE_EMAIL_STUB: "1" },
      { NODE_ENV: "staging" }
    ]) {
      const res = await sendPilotEmail({
        data: {
          companyName: "Demo Bus Company",
          contactName: "Jane Doe",
          email: "pilot@example.com"
        },
        env: testEnv
      });
      assert.equal(res.status, "smtp_not_configured");
      assert.notEqual(res.status, "sent");
      assert.notEqual(res.status, "stub_sent");
    }
  });

  test("generic SMTP_* variables alone do not configure pilot transport", () => {
    const genericOnlyEnv = {
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "587",
      SMTP_USER: "user@example.com",
      SMTP_PASS: "secret"
    };
    assert.equal(isPlatformSmtpConfigured(genericOnlyEnv), false, "Generic SMTP_* must not configure pilot");
    assert.equal(createPlatformTransport(genericOnlyEnv), null, "Transport must not be created from generic SMTP_*");
  });

  test("complete PLATFORM_SMTP_* variables configure transport", () => {
    const platformEnv = {
      PLATFORM_SMTP_HOST: "smtppro.zoho.eu",
      PLATFORM_SMTP_PORT: "465",
      PLATFORM_SMTP_USER: "info@buscommand.com",
      PLATFORM_SMTP_PASS: "dummy_zoho_token_for_test"
    };
    assert.equal(isPlatformSmtpConfigured(platformEnv), true);
    const transport = createPlatformTransport(platformEnv);
    assert.ok(transport);
    assert.equal(transport.options.host, "smtppro.zoho.eu");
    assert.equal(transport.options.port, 465);
    assert.equal(transport.options.secure, true);
  });

  test("sendPilotEmail: uses dependency injected transport when provided", async () => {
    let capturedOptions = null;
    const mockTransport = {
      sendMail: async (opts) => {
        capturedOptions = opts;
        return { messageId: "injected-msg-456" };
      }
    };

    setPlatformTransport(mockTransport);

    const res = await sendPilotEmail({
      data: {
        companyName: "Injected Transport Corp",
        contactName: "Alex Test",
        email: "pilot@example.com",
        fleetSize: "10"
      },
      env: { NODE_ENV: "production" }
    });

    assert.equal(res.status, "sent");
    assert.equal(res.messageId, "injected-msg-456");
    assert.equal(capturedOptions.to, TARGET_EMAIL);
    assert.equal(capturedOptions.replyTo, "pilot@example.com");
  });

  test("sendPilotEmail: fails closed with smtp_not_configured when unconfigured in production", async () => {
    const prodEnv = {
      NODE_ENV: "production",
      BUSCOMMAND_QA_HARNESS: "",
      PLATFORM_SMTP_HOST: ""
    };

    assert.equal(isPlatformSmtpConfigured(prodEnv), false);

    const res = await sendPilotEmail({
      data: {
        companyName: "Demo Bus Company",
        contactName: "Admin",
        email: "pilot@example.com"
      },
      env: prodEnv
    });

    assert.equal(res.status, "smtp_not_configured");
    assert.ok(res.error.includes("PLATFORM_SMTP_HOST"));
  });

  test("sendPilotEmail: handles transport error / timeout gracefully", async () => {
    const failingTransport = {
      sendMail: async () => {
        throw new Error("SMTP connection timed out after 10000ms");
      }
    };

    const res = await sendPilotEmail({
      data: {
        companyName: "Timeout Co",
        contactName: "Admin",
        email: "pilot@example.com"
      },
      transportOverride: failingTransport
    });

    assert.equal(res.status, "error");
    assert.ok(res.error.includes("SMTP connection timed out"));
  });

  test("Zoho EU contract: port 465 forces secure: true (SSL)", () => {
    const zohoEnv = {
      PLATFORM_SMTP_HOST: "smtppro.zoho.eu",
      PLATFORM_SMTP_PORT: "465",
      PLATFORM_SMTP_USER: "info@buscommand.com",
      PLATFORM_SMTP_PASS: "dummy_zoho_token_for_test_only"
    };
    const transport = createPlatformTransport(zohoEnv);
    assert.ok(transport, "Transport should be created");
    assert.equal(transport.options.host, "smtppro.zoho.eu");
    assert.equal(transport.options.port, 465);
    assert.equal(transport.options.secure, true, "Port 465 must use secure=true (SSL)");
  });

  test("Zoho EU contract: production without PLATFORM_SMTP_PASS returns fail-closed 503, never stub success", async () => {
    const prodZohoEnv = {
      NODE_ENV: "production",
      PLATFORM_SMTP_HOST: "smtppro.zoho.eu",
      PLATFORM_SMTP_PORT: "465",
      PLATFORM_SMTP_USER: "info@buscommand.com"
      // PLATFORM_SMTP_PASS intentionally omitted
    };

    assert.equal(isPlatformSmtpConfigured(prodZohoEnv), false, "Must be false without password");

    const res = await sendPilotEmail({
      data: {
        companyName: "Demo Bus Company",
        contactName: "Admin",
        email: "pilot@example.com"
      },
      env: prodZohoEnv
    });

    assert.equal(res.status, "smtp_not_configured");
    assert.notEqual(res.status, "sent");
    assert.notEqual(res.status, "stub_sent");
  });

  describe("Middleware Model & Limit Verification (Synthetic Express Harness — not production api-server.js)", () => {
    let server;
    let baseUrl;

    beforeEach(async () => {
      const app = express();

      // Mirror the exact body parser middleware structure of api-server.js
      const defaultJsonParser = express.json({ limit: "64kb" });
      const servicePlanJsonParser = express.json({ limit: "4mb" });

      app.use((req, res, next) => {
        const isServicePlanWrite = req.path.startsWith("/api/company-admin/service-plans/");
        return (isServicePlanWrite ? servicePlanJsonParser : defaultJsonParser)(req, res, next);
      });

      app.post(
        "/api/public/pilot-request",
        rateLimit(10, 60 * 1000),
        validateBody(pilotRequestBody),
        async (req, res) => {
          const data = req.validatedBody;
          const emailResult = await sendPilotEmail({
            data: {
              ...data,
              timestamp: new Date().toISOString(),
              source: "BusCommand landing — 30-day pilot"
            },
            env: process.env
          });

          if (emailResult.status === "smtp_not_configured") {
            return res.status(503).json({
              success: false,
              code: "SMTP_NOT_CONFIGURED",
              error: "SMTP nije konfigurisan"
            });
          }

          if (emailResult.status === "error") {
            return res.status(502).json({
              success: false,
              code: "EMAIL_DELIVERY_FAILED",
              error: "Greška transporta"
            });
          }

          return res.status(200).json({
            success: true,
            recipient: TARGET_EMAIL,
            status: emailResult.status
          });
        }
      );

      // Dedicated mock endpoint for service plans to prove 4mb parser is not constrained
      app.post("/api/company-admin/service-plans/import", (req, res) => {
        return res.status(200).json({ success: true, receivedBytes: JSON.stringify(req.body).length });
      });

      // Standard Express error handler
      app.use((err, req, res, next) => {
        if (err.status === 413 || err.statusCode === 413 || err.type === "entity.too.large") {
          return res.status(413).json({ success: false, error: "Payload Too Large", limit: "64kb" });
        }
        res.status(500).json({ success: false, error: err.message });
      });

      await new Promise(resolve => {
        server = app.listen(0, "127.0.0.1", () => {
          baseUrl = "http://127.0.0.1:" + server.address().port;
          resolve();
        });
      });
    });

    afterEach(async () => {
      if (server) {
        await new Promise(resolve => server.close(resolve));
      }
    });

    test("HTTP 200: accepts valid submission with injected transport", async () => {
      setPlatformTransport({
        sendMail: async () => ({ messageId: "test-injected-1" })
      });

      const resp = await fetch(baseUrl + "/api/public/pilot-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: "Demo Bus Company",
          contactName: "Jane Doe",
          email: "pilot@example.com",
          fleetSize: "30",
          tier: "pro",
          lang: "sr"
        })
      });

      assert.equal(resp.status, 200);
      const body = await resp.json();
      assert.equal(body.success, true);
      assert.equal(body.recipient, "info@buscommand.com");
      assert.equal(body.status, "sent");
    });

    test("HTTP 413: pilot payload exceeding 64kb is strictly rejected", async () => {
      const oversizedPayload = JSON.stringify({
        companyName: "Oversized Corp",
        contactName: "Tester",
        email: "pilot@example.com",
        message: "A".repeat(68 * 1024)
      });

      const resp = await fetch(baseUrl + "/api/public/pilot-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: oversizedPayload
      });

      assert.equal(resp.status, 413, "Payload exceeding 64kb must return 413 Payload Too Large");
      const body = await resp.json();
      assert.equal(body.success, false);
      assert.equal(body.error, "Payload Too Large");
    });

    test("Body parser order proof: service-plans 4mb parser is NOT constrained by pilot 64kb limit", async () => {
      const largeServicePlan = JSON.stringify({
        planName: "Large Monthly Roster",
        shifts: Array.from({ length: 2500 }, (_, i) => ({ id: i, name: "Shift-" + i, code: "F01-LONG-LINE-DESCRIPTION" }))
      });
      assert.ok(largeServicePlan.length > 64 * 1024, "Payload must be > 64kb to prove non-constraint");

      const resp = await fetch(baseUrl + "/api/company-admin/service-plans/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: largeServicePlan
      });

      assert.equal(resp.status, 200, "Service plan must accept payload > 64kb up to 4mb");
      const body = await resp.json();
      assert.equal(body.success, true);
    });

    test("HTTP 400: rejects unexpected extra fields", async () => {
      const resp = await fetch(baseUrl + "/api/public/pilot-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: "Demo Bus Company",
          contactName: "Jane Doe",
          email: "pilot@example.com",
          extraField: "not_allowed"
        })
      });

      assert.equal(resp.status, 400);
      const body = await resp.json();
      assert.equal(body.success, false);
    });

    test("HTTP 400: rejects invalid email address", async () => {
      const resp = await fetch(baseUrl + "/api/public/pilot-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: "Demo Bus Company",
          contactName: "Jane Doe",
          email: "not-an-email"
        })
      });

      assert.equal(resp.status, 400);
      const body = await resp.json();
      assert.equal(body.success, false);
      assert.ok(body.error.includes("email") || body.error.includes("Nevalidan"));
    });

    test("HTTP 400: rejects honeypot spam bot", async () => {
      const resp = await fetch(baseUrl + "/api/public/pilot-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: "Spam Bot Inc",
          contactName: "Bot",
          email: "bot@example.com",
          hp: "filled-by-bot"
        })
      });

      assert.equal(resp.status, 400);
      const body = await resp.json();
      assert.equal(body.success, false);
    });

    test("HTTP 503: fails closed when SMTP is unconfigured in production", async () => {
      process.env.NODE_ENV = "production";
      delete process.env.PLATFORM_SMTP_HOST;

      const resp = await fetch(baseUrl + "/api/public/pilot-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: "Production Operator",
          contactName: "Manager",
          email: "manager@example.com"
        })
      });

      assert.equal(resp.status, 503);
      const body = await resp.json();
      assert.equal(body.success, false);
      assert.equal(body.code, "SMTP_NOT_CONFIGURED");
    });

    test("HTTP 503: Zoho EU contract production fails closed without PLATFORM_SMTP_PASS", async () => {
      process.env.NODE_ENV = "production";
      process.env.PLATFORM_SMTP_HOST = "smtppro.zoho.eu";
      process.env.PLATFORM_SMTP_PORT = "465";
      process.env.PLATFORM_SMTP_USER = "info@buscommand.com";
      delete process.env.PLATFORM_SMTP_PASS;

      const resp = await fetch(baseUrl + "/api/public/pilot-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: "Production Operator",
          contactName: "Manager",
          email: "manager@example.com"
        })
      });

      assert.equal(resp.status, 503);
      const body = await resp.json();
      assert.equal(body.success, false);
      assert.equal(body.code, "SMTP_NOT_CONFIGURED");
    });

    test("HTTP 502: returns gateway error on SMTP transport failure", async () => {
      setPlatformTransport({
        sendMail: async () => {
          throw new Error("SMTP server rejected credentials 535");
        }
      });

      const resp = await fetch(baseUrl + "/api/public/pilot-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: "Demo Bus Company",
          contactName: "Jane Doe",
          email: "pilot@example.com"
        })
      });

      assert.equal(resp.status, 502);
      const body = await resp.json();
      assert.equal(body.success, false);
      assert.equal(body.code, "EMAIL_DELIVERY_FAILED");
    });
  });
});
