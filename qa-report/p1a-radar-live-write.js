const fs = require("fs");
const AUTH_BASE = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=any";
const API_BASE = "http://localhost:8768";

function localDateStr(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function plusDays(base, n) { const d = new Date(base); d.setDate(d.getDate() + n); return d; }

async function signIn(email, password) {
  const r = await fetch(AUTH_BASE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const j = await r.json();
  if (!j.idToken) throw new Error("signIn failed: " + JSON.stringify(j));
  return j.idToken;
}

async function assignOnce(token, payload) {
  const r = await fetch(`${API_BASE}/api/staff/shifts/assignment`, {
    method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload)
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function assign(token, payload) {
  let res = await assignOnce(token, payload);
  if (res.status === 409 && res.body?.code === "REVISION_CONFLICT") {
    res = await assignOnce(token, { ...payload, expectedRevision: res.body.conflict?.currentRevision ?? payload.expectedRevision });
  }
  return res;
}

async function main() {
  const seed = JSON.parse(fs.readFileSync(__dirname + "/p1a-radar-live-seed-output.json", "utf8").replace(/^\uFEFF/, ""));
  const token = await signIn("dispo.smoke@qa-scale.local", "Qa-Scale-Test-9");
  const today = new Date();
  const D0 = localDateStr(today), D1 = localDateStr(plusDays(today, 1)), D2 = localDateStr(plusDays(today, 2));

  async function set(driverId, date, bus) {
    return assign(token, { driverId, date, type: "morning", name: "310.S01", routeCode: "310.S01", bus, start: "05:00", end: "13:00", expectedRevision: 0 });
  }

  // Driver A: covered D0. Driver B: NOT covered D0 (regression #1/#2).
  const rA0 = await set(seed.driverA, D0, "radar-a");
  // Driver A: missing D+1 (regression #3). Driver B: missing D+2 (regression #4).
  const rA2 = await set(seed.driverA, D2, "radar-a");
  const rB1 = await set(seed.driverB, D1, "radar-b");

  fs.writeFileSync(__dirname + "/p1a-radar-live-write-output.json", JSON.stringify({ D0, D1, D2, rA0, rA2, rB1 }, null, 2));
  console.log("WROTE p1a-radar-live-write-output.json");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
