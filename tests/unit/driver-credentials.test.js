const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const DRIVER_ROUTES_SOURCE = require("fs").readFileSync(require("path").join(__dirname, "../../server/driver-routes.js"), "utf8");
const {
  COST, safeProfilePayload, credentialPayload,
  verifyDriverLogin, verifyCompanyCode, SENSITIVE_DRIVER_FIELDS, createRequireActivatedDriver,
  registerDriverRoutes, inclusiveDays, vacationOverlaps
} = require("../../server/driver-routes");

test("new import payload splits safe profile from OTP activation credentials", async () => {
  const driver = { eid: "TEST-EID", first_name: "Test", last_name: "Driver", phone: "+1", email: "test@example.invalid" };
  const companyCodeHash = await bcrypt.hash("company-test-code", COST);
  const activationCodeHash = await bcrypt.hash("482913", COST);
  const profile = safeProfilePayload(driver, "310", "alpha", "timestamp");
  const credentials = credentialPayload(driver, {
    companyCodeHash,
    activationCodeHash,
    activationExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    createdAt: "timestamp"
  });
  for (const field of SENSITIVE_DRIVER_FIELDS) assert.equal(Object.hasOwn(profile, field), false);
  assert.equal(profile.groupId, "310");
  assert.equal(profile.companyId, "alpha");
  assert.equal(credentials.loginCodeHash, undefined);
  assert.equal(credentials.activationUsedAt, null);
  assert.match(credentials.activationCodeHash, /^\$2[aby]\$12\$/);
  assert.match(credentials.companyCodeHash, /^\$2[aby]\$12\$/);
  assert.doesNotMatch(DRIVER_ROUTES_SOURCE, /TEMPORARY_CODE\s*=\s*"123456"/);
  assert.match(DRIVER_ROUTES_SOURCE, /activate-personal-code/);
  assert.match(DRIVER_ROUTES_SOURCE, /generateActivationOtp/);
  assert.match(DRIVER_ROUTES_SOURCE, /resend-activation/);
});

test("first login uses unique OTP; personal code replaces it; OTP cannot reuse after consume", async () => {
  const otp = "482913";
  const personal = "998877";
  const activationCodeHash = await bcrypt.hash(otp, COST);
  const loginCodeHash = await bcrypt.hash(personal, COST);
  const pending = {
    activationCodeHash,
    activationExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    activationUsedAt: null
  };
  assert.equal(await verifyDriverLogin({ active: true, codeActivated: false }, pending, otp), true);
  assert.equal(await verifyDriverLogin({ active: true, codeActivated: false }, {
    ...pending,
    activationUsedAt: new Date().toISOString()
  }, otp), false);
  assert.equal(await verifyDriverLogin({ active: true, codeActivated: true }, { loginCodeHash }, personal), true);
  assert.equal(await verifyDriverLogin({ active: true, codeActivated: true }, { loginCodeHash }, otp), false);
  assert.equal(await verifyCompanyCode({ companyCodeHash: await bcrypt.hash("company-a-code", COST) }, "company-a-code"), true);
});

test("credential operations ignore sensitive fields in a legacy public profile", async () => {
  const legacyHash = await bcrypt.hash("legacy-public-code", COST);
  const legacyProfile = {
    active: true,
    codeActivated: false,
    eid: "legacy-public-eid",
    companyCodeHash: legacyHash,
    loginCodeHash: legacyHash
  };
  assert.equal(await verifyDriverLogin(legacyProfile, null, "legacy-public-code"), false);
  assert.equal(await verifyCompanyCode(null, "legacy-public-code"), false);
});

test("server routes use only driver_credentials and contain no public-profile fallback", () => {
  const source = DRIVER_ROUTES_SOURCE;
  const removedFallbackName = ["LEGACY", "CREDENTIAL", "FALLBACK"].join("_");
  assert.equal(source.includes(removedFallbackName), false);
  assert.doesNotMatch(source, /collection\("drivers"\)\.where\("eid"/);
  assert.match(source, /collection\("driver_credentials"\)\.where\("eid"/);
  assert.match(source, /credentialSnap\.exists \? credentialSnap\.data\(\) : null/g);
  assert.doesNotMatch(source, /batch\.set\(credentialRef/);
  assert.match(source, /batch\.update\(credentialRef/);
});

test("driver deactivation is company-admin only, audited and revokes sessions", () => {
  const source = DRIVER_ROUTES_SOURCE;
  assert.match(source, /app\.put\("\/api\/staff\/drivers\/:driverId\/status", requireStaff/);
  assert.match(source, /req\.staff\.role !== "company_admin"/);
  assert.match(source, /collection\("companies"\)\.doc\(req\.staff\.companyId\)/);
  assert.match(source, /revokeRefreshTokens\(driverId\.data\)/);
  assert.match(source, /"driver_deactivated"/);
  assert.doesNotMatch(source, /collection\("driver_credentials"\).*delete/);
});

test("driver import is company-admin owned, group-scoped, licensed and rate limited", () => {
  const source = DRIVER_ROUTES_SOURCE;
  assert.match(source, /app\.post\("\/api\/staff\/drivers\/import", rateLimit\(5, 60_000\), requireStaff/);
  assert.match(source, /req\.staff\.role !== "company_admin"/);
  assert.match(source, /collection\("groups"\)\.doc\(parsed\.data\.groupId\)/);
  assert.match(source, /existingProfiles\.size \+ drivers\.length > maxDrivers/);
  assert.match(source, /safeProfilePayload\(item\.driver, parsed\.data\.groupId, parsed\.data\.companyId, createdAt\)/);
  assert.match(source, /generateActivationOtp\(\)/);
  assert.match(source, /driver_csv_import"/);
  assert.match(source, /sendActivationSms/);
});

test("driver operational writes use narrow authenticated audited endpoints", () => {
  const source = DRIVER_ROUTES_SOURCE;
  assert.match(source, /app\.post\("\/api\/driver\/reports", rateLimit/);
  assert.match(source, /quickReportSchema\.safeParse\(req\.body\)/);
  assert.match(source, /driverId: req\.driver\.uid/);
  assert.match(source, /"driver_quick_report_created"/);
  assert.match(source, /app\.post\("\/api\/driver\/sos", rateLimit/);
  assert.match(source, /collection\("sos"\)\.doc\(sosId\)/);
  assert.match(source, /collection\("settings"\)\.doc\("sos"\)/);
  assert.match(source, /"driver_sos_created"/);
  assert.match(source, /app\.put\("\/api\/driver\/messages\/:messageId\/read"/);
  assert.match(source, /message\.recipientDriverId !== req\.driver\.uid/);
  assert.match(source, /FieldValue\.arrayUnion\(req\.driver\.uid\)/);
  assert.match(source, /app\.post\("\/api\/driver\/lost-items", rateLimit/);
  assert.match(source, /"driver_lost_item_created"/);
  assert.match(source, /app\.put\("\/api\/driver\/messages\/:messageId\/archive"/);
  assert.match(source, /archivedByIds: admin\(\)\.firestore\.FieldValue\.arrayUnion/);
});

test("vacation workflow validates periods, prevents overlaps and audits status changes", () => {
  const source = DRIVER_ROUTES_SOURCE;
  assert.equal(inclusiveDays("2026-08-01", "2026-08-03"), 3);
  assert.equal(vacationOverlaps(
    { start: "2026-08-03", end: "2026-08-05" },
    { start: "2026-08-01", end: "2026-08-03" }
  ), true);
  assert.equal(vacationOverlaps(
    { start: "2026-08-04", end: "2026-08-05" },
    { start: "2026-08-01", end: "2026-08-03" }
  ), false);
  assert.match(source, /app\.post\("\/api\/driver\/vacations", rateLimit/);
  assert.match(source, /vacationSchema\.safeParse\(req\.body\)/);
  assert.match(source, /where\("driverId", "==", req\.driver\.uid\)/);
  assert.match(source, /"driver_vacation_requested"/);
  assert.match(source, /app\.put\("\/api\/staff\/vacations\/:vacationId\/status", requireStaff/);
  assert.equal(source.includes(String.raw`["pending", "Na \u010dekanju"].includes(currentStatus)`), true);
  assert.match(source, /reviewedBy: req\.staff\.uid/);
});

test("dispatcher vacation review is registered in the delegated action bundle", () => {
  const registry = require("fs").readFileSync(require("path").join(__dirname, "../../js/register-onclick.js"), "utf8");
  assert.match(registry, /import \{ handleVacation \} from "\.\/dispatcher\/vacations\.js"/);
  assert.match(registry, /\n {4}handleVacation,/);
});

test("staff shift assignment is tenant and dispatcher-group scoped", () => {
  const source = DRIVER_ROUTES_SOURCE;
  assert.match(source, /app\.put\("\/api\/staff\/shifts\/assignment", requireStaff/);
  assert.match(source, /shiftAssignmentSchema\.safeParse\(req\.body\)/);
  assert.match(source, /collection\("users"\)\.doc\(req\.staff\.uid\)/);
  assert.match(source, /groups\.includes\(driverGroupId\)/);
  assert.match(source, /driver\.groupId \|\| driver\.lineId/);
  assert.match(source, /where\("driverId", "==", parsed\.data\.driverId\)/);
  assert.match(source, /type === "clear"/);
  assert.match(source, /"shift_assigned"/);
  assert.match(source, /"shift_removed"/);
});

test("driver work session and shift confirmations are server enforced", () => {
  const source = DRIVER_ROUTES_SOURCE;
  assert.match(source, /app\.get\("\/api\/driver\/work-session"/);
  assert.match(source, /evaluateDriverWorkPolicy/);
  assert.match(source, /collection\("driver_sessions"\)\.doc\(req\.driver\.uid\)/);
  assert.match(source, /status !== "active"/);
  assert.match(source, /DRIVER_OFF_DUTY/);
  assert.match(source, /app\.post\("\/api\/driver\/shift-confirmations"/);
  assert.match(source, /"driver_shifts_confirmed"/);
  assert.match(source, /confirmedByDriver:\s*true/);
  assert.match(source, /app\.get\("\/api\/staff\/shift-confirmations"/);
  assert.match(source, /collection\("confirmation_outbox"\)/);
  assert.match(source, /ops"\)\.doc\("confirmation_dispatch"\)/);
  assert.match(source, /summarizeOutboxStatuses/);
  assert.match(source, /classifyOutboxForOps/);
  assert.match(source, /dispatchHealth/);
});

test("Firestore does not permit bypassing validated driver write endpoints", () => {
  const rules = require("fs").readFileSync(require("path").join(__dirname, "../../firestore.rules"), "utf8");
  const reportsBlock = rules.match(/match \/companies\/\{companyId\}\/reports\/\{reportId\}[\s\S]*?\n {4}}/)[0];
  const sosBlock = rules.match(/match \/companies\/\{companyId\}\/sos\/\{sosId\}[\s\S]*?\n {4}}/)[0];
  const vacationsBlock = rules.match(/match \/companies\/\{companyId\}\/vacations\/\{vacId\}[\s\S]*?\n {4}}/)[0];
  const messagesBlock = rules.match(/match \/companies\/\{companyId\}\/messages\/\{msgId\}[\s\S]*?\n {4}}/)[0];
  const legacyAdminsBlock = rules.match(/match \/companies\/\{companyId\}\/company_admins\/\{adminId\}[\s\S]*?\n {4}}/)[0];
  assert.match(reportsBlock, /allow create, update, delete: if false/);
  assert.match(reportsBlock, /isDispatcherAssignedGroup/);
  assert.match(sosBlock, /allow create, update, delete: if false/);
  assert.doesNotMatch(sosBlock, /allow create: if isDriver\(companyId\)/);
  assert.doesNotMatch(sosBlock, /allow create: if isCompanyStaff\(companyId\)/);
  assert.match(vacationsBlock, /allow create, update, delete: if false/);
  assert.match(messagesBlock, /allow delete: if false/);
  assert.doesNotMatch(messagesBlock, /isCompanyStaff\(companyId\).*allow update/);
  assert.match(legacyAdminsBlock, /allow write: if false/);
});

test("missing credentials fail closed even when the public profile contains legacy secrets", async () => {
  const routes = new Map();
  const collectionReads = [];
  const app = {
    use() {},
    get(path, ...handlers) { routes.set(`GET ${path}`, handlers.at(-1)); },
    post(path, ...handlers) { routes.set(`POST ${path}`, handlers.at(-1)); },
    put(path, ...handlers) { routes.set(`PUT ${path}`, handlers.at(-1)); }
  };
  const legacyProfile = {
    active: true,
    codeActivated: false,
    firstName: "Legacy",
    lastName: "Driver",
    eid: "legacy-eid",
    companyCodeHash: await bcrypt.hash("legacy-company-code", COST),
    loginCodeHash: await bcrypt.hash("482913", COST)
  };
  const missingCredentials = { exists: false, data: () => undefined };
  const profileSnapshot = { exists: true, id: "11111111-1111-4111-8111-111111111111", data: () => legacyProfile };
  const companyRef = {
    collection(name) {
      collectionReads.push(name);
      return {
        where() {
          if (name === "drivers") throw new Error("public driver profile must not be queried by EID");
          return { limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) };
        },
        doc: () => ({ get: async () => name === "drivers" ? profileSnapshot : missingCredentials })
      };
    }
  };
  registerDriverRoutes(app, {
    admin: () => ({ auth: () => ({
      verifyIdToken: async () => ({
        uid: profileSnapshot.id,
        role: "driver",
        companyId: "alpha",
        mustChangeLoginCode: true
      })
    }) }),
    db: () => ({
      collection: () => ({ doc: () => companyRef }),
      runTransaction: async (fn) => fn({
        get: async (ref) => ref.get(),
        update() {}
      })
    }),
    hasFirebase: () => true,
    rateLimit: () => (_req, _res, next) => next(),
    clearRateLimit() {},
    getClientIp: () => "test",
    logAudit: async () => {}
  });
  const response = () => ({
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  });

  const identifyRes = response();
  await routes.get("POST /api/public/drivers/identify")({ body: { companyId: "alpha", eid: "legacy-eid" } }, identifyRes);
  assert.equal(identifyRes.statusCode, 404);
  assert.deepEqual(Object.keys(identifyRes.body).sort(), ["code", "error", "success"]);
  assert.equal(identifyRes.body.code, "DRIVER_NOT_FOUND");

  const loginRes = response();
  await routes.get("POST /api/auth/driver-login")({
    body: { companyId: "alpha", driverId: profileSnapshot.id, loginCode: "482913" }
  }, loginRes);
  assert.equal(loginRes.statusCode, 401);
  assert.deepEqual(Object.keys(loginRes.body).sort(), ["code", "error", "success"]);
  assert.equal(loginRes.body.code, "INVALID_LOGIN");

  const activationRes = response();
  await routes.get("POST /api/auth/driver/activate-company-code")({
    body: { companyCode: "legacy-company-code" }, headers: { authorization: "Bearer pending" }
  }, activationRes);
  assert.equal(activationRes.statusCode, 410);
  assert.deepEqual(Object.keys(activationRes.body).sort(), ["code", "error", "success"]);
  assert.ok(collectionReads.includes("driver_credentials"));
});

test("public safe driver shape never exposes credential fields", () => {
  const source = require("fs").readFileSync(require("path").join(__dirname, "../../server/driver-routes.js"), "utf8");
  assert.match(source, /return \{ id: doc\.id \|\| data\.id, name:/);
  assert.doesNotMatch(source.match(/function safeDriver[\s\S]*?\n\}/)[0], /eid|Hash|companyCode|loginCode/);
});

test("pending driver token is rejected before any operational API handler", async () => {
  let writeCount = 0;
  const middleware = createRequireActivatedDriver({
    hasFirebase: () => true,
    admin: () => ({ auth: () => ({ verifyIdToken: async () => ({
      uid: "driver-1", role: "driver", companyId: "alpha", mustChangeLoginCode: true
    }) }) })
  });
  for (const path of ["/api/driver/duty", "/api/driver/report", "/api/driver/problem", "/api/driver/upload", "/api/driver/messages"]) {
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; }
    };
    await middleware(
      { path, headers: { authorization: "Bearer pending-test-token" } },
      response,
      () => { writeCount += 1; }
    );
    assert.equal(response.statusCode, 403, path);
    assert.deepEqual(response.body, {
      success: false,
      code: "ACTIVATION_REQUIRED",
      error: "Aktivacija naloga je obavezna."
    });
  }
  assert.equal(writeCount, 0);
});

test("activated driver token may reach an operational API handler", async () => {
  let nextCalled = false;
  const middleware = createRequireActivatedDriver({
    hasFirebase: () => true,
    admin: () => ({ auth: () => ({ verifyIdToken: async () => ({
      uid: "driver-1", role: "driver", companyId: "alpha", mustChangeLoginCode: false
    }) }) })
  });
  await middleware(
    { headers: { authorization: "Bearer activated-test-token" } },
    { status() { throw new Error("unexpected rejection"); } },
    () => { nextCalled = true; }
  );
  assert.equal(nextCalled, true);
});
