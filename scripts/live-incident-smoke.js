#!/usr/bin/env node
/**
 * Live/local smoke: login as dispatcher, create coverage incident for an
 * assigned driver on group 320, resolve with a free replacement + bus.
 *
 * Reads credentials from Desktop pack (outside repo).
 * Requires env:
 *   VITE_FIREBASE_API_KEY (or FIREBASE_WEB_API_KEY)
 *   L7_SMOKE_BASE_URL (default http://localhost:3000)
 *
 * Usage:
 *   set VITE_FIREBASE_API_KEY=...
 *   set L7_SMOKE_BASE_URL=https://www.buscommand.com
 *   node scripts/live-incident-smoke.js
 */
const fs = require("fs");
const path = require("path");

const BASE = process.env.L7_SMOKE_BASE_URL || "http://localhost:3000";
const API_KEY = process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_WEB_API_KEY || "";
const COMPANY_ID = process.env.L7_SMOKE_COMPANY_ID || "bc-test";
const PACK = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  "Desktop",
  "BusCommand-Test-Nalozi",
  "test-nalozi.json"
);

function driverLabel(driver) {
  const name = String(driver?.name || "").trim();
  if (name) return name;
  return `${driver?.firstName || ""} ${driver?.lastName || ""}`.trim() || driver?.eid || driver?.id;
}

async function signIn(email, password) {
  if (!API_KEY) throw new Error("Missing VITE_FIREBASE_API_KEY / FIREBASE_WEB_API_KEY");
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    }
  );
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message || "login failed");
  if (!body.idToken) throw new Error("login missing idToken");
  return body.idToken;
}

async function api(token, method, urlPath, body) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual"
  });
  if (res.status >= 300 && res.status < 400) {
    return {
      status: res.status,
      json: { success: false, error: `redirect:${res.headers.get("location")}` }
    };
  }
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  if (!fs.existsSync(PACK)) throw new Error(`Missing credential pack: ${PACK}`);
  const pack = JSON.parse(fs.readFileSync(PACK, "utf8"));
  const email = pack.accounts.dispatcher.email;
  const password = pack.accounts.dispatcher.password;
  const token = await signIn(email, password);

  const adminKey = path.join(__dirname, "..", "firebase-admin-key.json");
  if (!fs.existsSync(adminKey)) throw new Error("Need firebase-admin-key.json to resolve driver ids");
  const admin = require("firebase-admin");
  const sa = require(adminKey);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
  const db = admin.firestore();
  const driversSnap = await db.collection("companies").doc(COMPANY_ID).collection("drivers").get();
  const drivers = driversSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const covered = drivers.find(d => d.eid === "100601" || /Marko/i.test(driverLabel(d)));
  const free = drivers.find(d =>
    String(d.groupId || d.lineId) === "320"
    && d.id !== covered?.id
    && !["100601", "100602", "100603", "100604", "100605"].includes(String(d.eid))
  ) || drivers.find(d => String(d.groupId || d.lineId) === "320" && d.id !== covered?.id);

  if (!covered || !free) {
    throw new Error(`Need covered+free drivers. covered=${covered?.id} free=${free?.id}`);
  }

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Vienna",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

  console.log(
    "base", BASE,
    "today", today,
    "tokenLen", token.length,
    "covered", driverLabel(covered), covered.id,
    "free", driverLabel(free), free.id
  );

  const probe = await api(token, "GET", "/api/health");
  console.log("health", probe.status, probe.json?.ok || probe.json?.status || probe.json?.error);

  const created = await api(token, "POST", "/api/staff/operational-incidents", {
    driverId: covered.id,
    date: today,
    reason: "Live smoke: driver unavailable for guided coverage test"
  });
  console.log("create", created.status, JSON.stringify(created.json).slice(0, 300));
  if (!created.json.success) process.exit(2);
  const incidentId = created.json.report?.id || created.json.id || created.json.reportId;
  if (!incidentId) throw new Error("No incident id");

  const companyRef = db.collection("companies").doc(COMPANY_ID);
  const origShift = await companyRef.collection("shifts").doc(`${covered.id}_${today}`).get();
  const freeShift = await companyRef.collection("shifts").doc(`${free.id}_${today}`).get();
  const expectedOriginalRevision = Number.isInteger(origShift.data()?.revision) ? origShift.data().revision : 0;
  const expectedReplacementRevision = Number.isInteger(freeShift.data()?.revision) ? freeShift.data().revision : 0;
  const expectedProblemRevision = Number.isInteger(created.json.report?.problemRevision)
    ? created.json.report.problemRevision
    : 0;

  const resolved = await api(token, "PUT", `/api/staff/operational-incidents/${incidentId}/resolve`, {
    replacementDriverId: free.id,
    replacementBus: "32001",
    expectedOriginalRevision,
    expectedReplacementRevision,
    expectedProblemRevision
  });
  console.log("resolve", resolved.status, JSON.stringify(resolved.json).slice(0, 400));
  if (!resolved.json.success) process.exit(3);
  console.log("LIVE_INCIDENT_SMOKE_OK");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
