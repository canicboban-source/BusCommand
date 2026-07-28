#!/usr/bin/env node
/**
 * Live L7 support-session smoke against buscommand-preview.
 * Uses test accounts from Desktop pack (or argv).
 */
const fs = require("fs");
const path = require("path");

const BASE = "https://buscommand-preview.onrender.com";
const API_KEY = "AIzaSyCr9Q8b36nRRX_JIEmYgbLGaS7LEG1LRIo";
const COMPANY_ID = "bc-test";
const ROOT = path.join(__dirname, "..");
const KEY_PATH = path.join(ROOT, "firebase-admin-key.json");
const PACK_PATH = path.join(process.env.USERPROFILE || "", "Desktop", "BusCommand-Test-Nalozi", "test-nalozi.json");

function loadAccounts() {
  if (fs.existsSync(PACK_PATH)) {
    const pack = JSON.parse(fs.readFileSync(PACK_PATH, "utf8"));
    return {
      sa: pack.accounts.superadmin,
      ca: pack.accounts.company_admin
    };
  }
  throw new Error(`Nedostaje pack: ${PACK_PATH}`);
}

async function signIn(email, password) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    }
  );
  const body = await res.json();
  if (!res.ok) throw new Error(`Auth ${email}: ${body.error?.message || res.status}`);
  const payload = JSON.parse(Buffer.from(body.idToken.split(".")[1], "base64url").toString());
  return { token: body.idToken, claims: { role: payload.role, companyId: payload.companyId, uid: payload.user_id } };
}

async function api(method, urlPath, token, body) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

function adminSdk() {
  const admin = require("firebase-admin");
  const sa = require(KEY_PATH);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
  return admin;
}

async function setSupportFlag(enabled) {
  const admin = adminSdk();
  const ref = admin.firestore().collection("companies").doc(COMPANY_ID).collection("settings").doc("main");
  await ref.set({
    features: { supportSession: enabled },
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

async function readRecentAudit(limit = 10) {
  const admin = adminSdk();
  const snap = await admin.firestore()
    .collection("companies").doc(COMPANY_ID)
    .collection("audit_log")
    .orderBy("timestamp", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      action: data.action,
      actorId: data.actorId,
      actorRole: data.actorRole,
      details: data.details || null
    };
  });
}

function ok(label, cond, detail) {
  const mark = cond ? "PASS" : "FAIL";
  console.log(`[${mark}] ${label}${detail ? ` — ${detail}` : ""}`);
  return cond;
}

async function main() {
  const results = [];
  const accounts = loadAccounts();
  console.log("L7 live smoke —", BASE, "company=", COMPANY_ID);

  const saAuth = await signIn(accounts.sa.email, accounts.sa.password);
  results.push(ok("SA login + claims", saAuth.claims.role === "superadmin", JSON.stringify(saAuth.claims)));

  const caAuth = await signIn(accounts.ca.email, accounts.ca.password);
  results.push(ok("CA login + claims", caAuth.claims.role === "company_admin" && caAuth.claims.companyId === COMPANY_ID, JSON.stringify(caAuth.claims)));

  // 1) Flag OFF → 403
  await setSupportFlag(false);
  const off = await api("POST", `/api/admin/companies/${COMPANY_ID}/support-sessions`, saAuth.token, {
    category: "incident",
    reason: "L7 smoke test reason long enough"
  });
  results.push(ok(
    "Flag OFF → 403 SUPPORT_SESSION_DISABLED",
    off.status === 403 && off.json.code === "SUPPORT_SESSION_DISABLED",
    `${off.status} ${JSON.stringify(off.json)}`
  ));

  // 2) Flag ON → start
  await setSupportFlag(true);
  const start = await api("POST", `/api/admin/companies/${COMPANY_ID}/support-sessions`, saAuth.token, {
    category: "incident",
    reason: "L7 smoke test: start support session now"
  });
  const sessionId = start.json?.session?.id;
  results.push(ok(
    "Flag ON → SA start 201",
    start.status === 201 && start.json.success && sessionId,
    `${start.status} id=${sessionId || "?"} ${JSON.stringify(start.json.session || start.json)}`
  ));

  // 3) CA sees active session
  const caGet = await api("GET", "/api/company-admin/support-session", caAuth.token);
  results.push(ok(
    "CA get active session",
    caGet.status === 200 && caGet.json.session?.id === sessionId && caGet.json.session?.status === "active",
    `${caGet.status} ${JSON.stringify(caGet.json.session || caGet.json)}`
  ));

  // SA active endpoint
  const saActive = await api("GET", `/api/admin/companies/${COMPANY_ID}/support-sessions/active`, saAuth.token);
  results.push(ok(
    "SA get active session",
    saActive.status === 200 && saActive.json.session?.id === sessionId,
    `${saActive.status} ${JSON.stringify(saActive.json.session || saActive.json)}`
  ));

  // 4) CA ends
  const caEnd = await api("POST", "/api/company-admin/support-session/end", caAuth.token, {});
  results.push(ok(
    "CA end session",
    caEnd.status === 200 && caEnd.json.success,
    `${caEnd.status} ${JSON.stringify(caEnd.json)}`
  ));

  const caGet2 = await api("GET", "/api/company-admin/support-session", caAuth.token);
  results.push(ok(
    "CA no active session after end",
    caGet2.status === 200 && caGet2.json.session == null,
    `${caGet2.status} ${JSON.stringify(caGet2.json)}`
  ));

  // 5) Audit
  const audit = await readRecentAudit(20);
  const started = audit.some((a) => a.action === "support_session_started");
  const ended = audit.some((a) => a.action === "support_session_ended");
  results.push(ok("Audit support_session_started", started, audit.filter((a) => String(a.action).startsWith("support_")).map((a) => a.action).join(", ") || "none"));
  results.push(ok("Audit support_session_ended", ended));

  // Leave flag ON as pack documents (or OFF for safety?) — leave ON since pack says ON for testing
  await setSupportFlag(true);

  const passed = results.filter(Boolean).length;
  const failed = results.length - passed;
  console.log("");
  console.log(`Summary: ${passed}/${results.length} passed, ${failed} failed`);

  const report = {
    at: new Date().toISOString(),
    base: BASE,
    companyId: COMPANY_ID,
    passed,
    failed,
    total: results.length,
    auditSupport: audit.filter((a) => String(a.action).startsWith("support_"))
  };
  const outDir = path.dirname(PACK_PATH);
  fs.writeFileSync(path.join(outDir, "l7-smoke-result.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log("Report:", path.join(outDir, "l7-smoke-result.json"));

  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
