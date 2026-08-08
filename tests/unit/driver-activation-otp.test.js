const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const {
  generateActivationOtp,
  activationExpiresAt,
  verifyActivationOtp,
  isValidPersonalLoginCode,
  hashSecret,
  ACTIVATION_TTL_MS,
  OTP_RE
} = require("../../server/driver-activation-otp");
const { createSmsProvider } = require("../../server/sms-provider");

test("activation OTP is six digits and never the shared 123456 constant path", () => {
  const seen = new Set();
  for (let i = 0; i < 40; i += 1) {
    const otp = generateActivationOtp();
    assert.match(otp, OTP_RE);
    assert.notEqual(otp, "placeholder");
    seen.add(otp);
  }
  assert.ok(seen.size > 1);
});

test("OTP verifies within TTL and fails when expired or consumed", async () => {
  const otp = "482913";
  const hash = await hashSecret(otp, 4);
  const credentials = {
    activationCodeHash: hash,
    activationExpiresAt: activationExpiresAt(),
    activationUsedAt: null
  };
  assert.equal(await verifyActivationOtp(credentials, otp), true);
  assert.equal(await verifyActivationOtp(credentials, "000000"), false);
  assert.equal(await verifyActivationOtp({
    ...credentials,
    activationUsedAt: new Date().toISOString()
  }, otp), false);
  assert.equal(await verifyActivationOtp({
    ...credentials,
    activationExpiresAt: new Date(Date.now() - 1000).toISOString()
  }, otp), false);
  assert.ok(ACTIVATION_TTL_MS === 24 * 60 * 60 * 1000);
});

test("personal login code requires 5-12 digits", () => {
  assert.equal(isValidPersonalLoginCode("12345"), true);
  assert.equal(isValidPersonalLoginCode("123456789012"), true);
  assert.equal(isValidPersonalLoginCode("1234"), false);
  assert.equal(isValidPersonalLoginCode("12ab5"), false);
  assert.equal(isValidPersonalLoginCode("123456"), true);
});

test("SMS stub never echoes plaintext codes and production defaults to none", async () => {
  const forced = createSmsProvider({
    env: { NODE_ENV: "development", SMS_PROVIDER: "seven", SEVEN_API_KEY: "x", BUSCOMMAND_QA_HARNESS: "1" }
  });
  assert.equal(forced.mode, "stub");

  const stub = createSmsProvider({ env: { NODE_ENV: "development", SMS_PROVIDER: "stub" } });
  const result = await stub.sendActivationSms({
    phone: "+43123456789",
    companyId: "demo",
    driverId: "drv-1",
    otp: "SHOULD-NOT-APPEAR"
  });
  assert.equal(result.status, "stub_queued");
  assert.equal(result.meta.otpDigits, 17);
  assert.equal(JSON.stringify(result).includes("SHOULD-NOT-APPEAR"), false);

  const missing = await stub.sendActivationSms({
    phone: "+43123456789",
    companyId: "demo",
    driverId: "drv-1"
  });
  assert.equal(missing.status, "error");
  assert.equal(missing.reason, "missing_otp");

  const prod = createSmsProvider({ env: { NODE_ENV: "production" } });
  assert.equal(prod.mode, "none");
  const skipped = await prod.sendActivationSms({ phone: "+43123456789", companyId: "x", driverId: "y", otp: "123456" });
  assert.equal(skipped.status, "skipped");
});

test("Twilio adapter sends form body and never returns plaintext OTP", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({ sid: "SM_test_123" })
    };
  };
  const twilio = createSmsProvider({
    env: {
      SMS_PROVIDER: "twilio",
      TWILIO_ACCOUNT_SID: "ACtest",
      TWILIO_AUTH_TOKEN: "tokentest",
      TWILIO_FROM_NUMBER: "+4915888623971",
      APP_PUBLIC_URL: "https://www.buscommand.com"
    },
    fetchImpl
  });
  const sent = await twilio.sendActivationSms({
    phone: "+4369917137535",
    companyId: "qa",
    driverId: "drv-9",
    portalUrl: "/driver.html?company=qa",
    otp: "SECRET99"
  });
  assert.equal(sent.status, "sent");
  assert.equal(sent.providerMessageId, "SM_test_123");
  assert.equal(JSON.stringify(sent).includes("SECRET99"), false);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /Accounts\/ACtest\/Messages\.json/);
  assert.match(calls[0].options.body, /To=%2B4369917137535/);
  assert.match(calls[0].options.body, /SECRET99/);
  assert.match(calls[0].options.body, /www\.buscommand\.com/);

  const missingCreds = createSmsProvider({
    env: { SMS_PROVIDER: "twilio" },
    fetchImpl
  });
  const fail = await missingCreds.sendActivationSms({
    phone: "+4369917137535",
    companyId: "qa",
    driverId: "drv-9",
    otp: "123456"
  });
  assert.equal(fail.status, "error");
  assert.equal(fail.reason, "missing_twilio_credentials");

  const trialBlocked = createSmsProvider({
    env: {
      SMS_PROVIDER: "twilio",
      TWILIO_ACCOUNT_SID: "ACtest",
      TWILIO_AUTH_TOKEN: "tokentest",
      TWILIO_FROM_NUMBER: "+4915888623971"
    },
    fetchImpl: async () => ({
      ok: false,
      json: async () => ({ code: 572006, message: "Invalid template name" })
    })
  });
  const blocked = await trialBlocked.sendActivationSms({
    phone: "+4369917137535",
    companyId: "qa",
    driverId: "drv-9",
    otp: "123456"
  });
  assert.equal(blocked.status, "error");
  assert.equal(blocked.reason, "twilio_trial_requires_upgrade_for_custom_body");
});

test("seven.io adapter sends form body and never returns plaintext OTP", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({ success: "100", messages: [{ id: "777" }] })
    };
  };
  const seven = createSmsProvider({
    env: {
      SMS_PROVIDER: "seven",
      SEVEN_API_KEY: "seven-test-key",
      SEVEN_FROM: "SMS",
      APP_PUBLIC_URL: "https://www.buscommand.com"
    },
    fetchImpl
  });
  const sent = await seven.sendActivationSms({
    phone: "+4369917137535",
    companyId: "qa",
    driverId: "drv-9",
    portalUrl: "/driver.html?company=qa",
    otp: "SECRET77"
  });
  assert.equal(seven.mode, "seven");
  assert.equal(sent.status, "sent");
  assert.equal(sent.providerMessageId, "777");
  assert.equal(JSON.stringify(sent).includes("SECRET77"), false);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /gateway\.seven\.io\/api\/sms/);
  assert.equal(calls[0].options.headers["X-Api-Key"], "seven-test-key");
  assert.match(calls[0].options.body, /SECRET77/);
  assert.match(calls[0].options.body, /from=SMS/);
});

test("import and resend pass OTP into the SMS adapter", () => {
  const source = require("fs").readFileSync(require("path").join(__dirname, "../../server/driver-routes.js"), "utf8");
  assert.match(source, /sendActivationSms\(\{[\s\S]*?otp:\s*item\.otp/);
  assert.match(source, /sendActivationSms\(\{[\s\S]*?otp\b/);
  assert.match(source, /runTransaction\(async \(tx\) => \{[\s\S]*?activationUsedAt/);
});

test("bcrypt round-trip for hashed OTP", async () => {
  const otp = generateActivationOtp();
  const hash = await bcrypt.hash(otp, 4);
  assert.equal(await bcrypt.compare(otp, hash), true);
});
