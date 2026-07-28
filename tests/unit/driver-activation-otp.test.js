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
