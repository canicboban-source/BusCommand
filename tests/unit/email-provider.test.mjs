import test from "node:test";
import assert from "node:assert/strict";
import { sendEmail, buildShiftConfirmationEmail, buildExpiryWarningEmail, isStubMode } from "../../server/email-provider.js";
import { companyEmailSmtpBody } from "../../server/validation.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("email provider returns stub_sent in test/harness mode", async () => {
  const result = await sendEmail({
    smtp: { host: "mail.test.com", port: 587, user: "office@test.com", pass: "secret", from: "office@test.com" },
    to: "driver@example.com",
    subject: "Test",
    text: "Hello",
    env: { BUSCOMMAND_FORCE_EMAIL_STUB: "1" }
  });
  assert.equal(result.status, "stub_sent");
  assert.ok(result.messageId);
});

test("email provider rejects invalid recipient", async () => {
  const result = await sendEmail({
    smtp: { host: "mail.test.com", port: 587, user: "office@test.com", pass: "secret", from: "office@test.com" },
    to: "not-an-email",
    subject: "Test",
    text: "Hello",
    env: { BUSCOMMAND_FORCE_EMAIL_STUB: "1" }
  });
  assert.equal(result.status, "invalid_recipient");
});

test("email provider rejects missing from address", async () => {
  const result = await sendEmail({
    smtp: { host: "mail.test.com", port: 587, user: "office@test.com", pass: "secret", from: "" },
    to: "driver@example.com",
    subject: "Test",
    text: "Hello",
    env: { BUSCOMMAND_FORCE_EMAIL_STUB: "1" }
  });
  assert.equal(result.status, "no_from_address");
});

test("buildShiftConfirmationEmail produces EN/DE/SR content", () => {
  const en = buildShiftConfirmationEmail({
    driverName: "Marko",
    targetDate: "2025-01-15",
    shiftLabel: "Line 3",
    startTime: "06:00",
    endTime: "14:00",
    busNumber: "17",
    companyName: "TestBus"
  }, "en");
  assert.match(en.subject, /Shift confirmation/);
  assert.match(en.text, /Hello Marko/);
  assert.match(en.html, /Line 3/);

  const de = buildShiftConfirmationEmail({
    driverName: "Marko",
    targetDate: "2025-01-15",
    shiftLabel: "Line 3",
    startTime: "06:00",
    endTime: "14:00",
    busNumber: "17",
    companyName: "TestBus"
  }, "de");
  assert.match(de.subject, /Schichtbestätigung/);
  assert.match(de.text, /Hallo Marko/);

  const sr = buildShiftConfirmationEmail({
    driverName: "Marko",
    targetDate: "2025-01-15",
    shiftLabel: "Line 3",
    startTime: "06:00",
    endTime: "14:00",
    busNumber: "17",
    companyName: "TestBus"
  }, "sr");
  assert.match(sr.subject, /Potvrda smene/);
  assert.match(sr.text, /Zdravo Marko/);
});

test("buildExpiryWarningEmail distinguishes expired vs soon-to-expire", () => {
  const expired = buildExpiryWarningEmail({
    driverName: "Marko",
    fieldName: "Driving licence",
    expiryDate: "2025-01-01",
    daysLeft: 0,
    companyName: "TestBus"
  }, "en");
  assert.match(expired.subject, /URGENT.*expired/i);
  assert.match(expired.html, /#dc2626/); // red for expired

  const soon = buildExpiryWarningEmail({
    driverName: "Marko",
    fieldName: "CPC certificate",
    expiryDate: "2025-02-01",
    daysLeft: 7,
    companyName: "TestBus"
  }, "en");
  assert.match(soon.subject, /expires in 7 days/);
  assert.match(soon.html, /#f59e0b/); // amber for warning
});

test("isStubMode detects test/harness environments", () => {
  assert.equal(isStubMode({ BUSCOMMAND_QA_HARNESS: "1" }), true);
  assert.equal(isStubMode({ BUSCOMMAND_FORCE_EMAIL_STUB: "1" }), true);
  assert.equal(isStubMode({ PLAYWRIGHT_TEST: "1" }), true);
  assert.equal(isStubMode({}), false);
});

test("SMTP validation schema accepts valid config", () => {
  const parsed = companyEmailSmtpBody.safeParse({
    companyId: "test-co",
    host: "mail.test.com",
    port: 587,
    user: "office@test.com",
    pass: "secret123",
    from: "office@test.com",
    enabled: true
  });
  assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
  assert.equal(parsed.data.enabled, true);
  assert.equal(parsed.data.port, 587);
});

test("SMTP validation schema rejects missing host", () => {
  const parsed = companyEmailSmtpBody.safeParse({
    companyId: "test-co",
    host: "",
    port: 587,
    user: "office@test.com",
    pass: "secret123",
    from: "office@test.com",
    enabled: true
  });
  assert.ok(!parsed.success);
});

test("SMTP validation schema rejects invalid port", () => {
  const parsed = companyEmailSmtpBody.safeParse({
    companyId: "test-co",
    host: "mail.test.com",
    port: 99999,
    user: "office@test.com",
    pass: "secret123",
    from: "office@test.com",
    enabled: true
  });
  assert.ok(!parsed.success);
});

test("SMTP validation schema rejects invalid email in from field", () => {
  const parsed = companyEmailSmtpBody.safeParse({
    companyId: "test-co",
    host: "mail.test.com",
    port: 587,
    user: "office@test.com",
    pass: "secret123",
    from: "not-an-email",
    enabled: true
  });
  assert.ok(!parsed.success);
});

test("email SMTP i18n keys exist in all 3 languages", () => {
  const translations = readFileSync(resolve("translations.js"), "utf8");
  const keys = ["ca_settings_email_kicker", "ca_settings_email_title", "ca_smtp_host", "ca_smtp_port", "ca_smtp_user", "ca_smtp_pass", "ca_smtp_from", "ca_smtp_enabled", "ca_smtp_save", "ca_smtp_saved"];
  for (const key of keys) {
    const count = (translations.match(new RegExp(`${key}:`, "g")) || []).length;
    assert.equal(count, 3, `${key} must appear in all 3 languages (got ${count})`);
  }
});

test("staff.html contains SMTP settings form", () => {
  const html = readFileSync(resolve("staff.html"), "utf8");
  assert.match(html, /id="ca-email-smtp-form"/);
  assert.match(html, /id="ca-smtp-host"/);
  assert.match(html, /id="ca-smtp-port"/);
  assert.match(html, /id="ca-smtp-user"/);
  assert.match(html, /id="ca-smtp-pass"/);
  assert.match(html, /id="ca-smtp-from"/);
  assert.match(html, /id="ca-smtp-enabled"/);
  assert.match(html, /data-submit-action="saveEmailSmtpSettings"/);
});

test("api-server exposes POST and GET email-smtp endpoints", () => {
  const src = readFileSync(resolve("api-server.js"), "utf8");
  assert.match(src, /\/api\/company-admin\/email-smtp/);
  assert.match(src, /requireCompanyAdmin/);
  // Password must never be returned in GET
  assert.match(src, /const \{ pass: _pass, \.\.\.safe \} = data/);
});
