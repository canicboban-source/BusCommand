const fs = require("fs");
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const admin = require("firebase-admin");

function getDb() {
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: "demo-buscommand-scale" });
  }
  return admin.firestore();
}

function belgradeDateStr(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Belgrade",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function addCalendarDays(dateStr, days) {
  const parts = String(dateStr || "").split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function setShift(driverId, date, bus) {
  const db = getDb();
  const shiftRef = db.collection("companies").doc("qa-scale-a").collection("shifts").doc(`${driverId}_${date}`);
  const payload = {
    driverId,
    groupId: "310",
    date,
    type: "morning",
    name: "310.S01",
    routeCode: "310.S01",
    bus,
    start: "05:00",
    end: "13:00",
    driverName: "Marko Jovanović",
    assignedBy: "qa-seed",
    assignedAt: admin.firestore.Timestamp.now(),
    confirmedByDriver: false,
    confirmedAt: null,
    shiftFingerprint: null,
    confirmationSourceShiftDate: null,
    confirmationBoundRevision: 1,
    revision: 1,
    priorSnapshot: { empty: true, revision: 0 }
  };
  await shiftRef.set(payload, { merge: true });
  return { status: 200, body: { success: true, driverId, date, bus } };
}

async function main() {
  const seed = JSON.parse(fs.readFileSync(__dirname + "/p1a-radar-live-seed-output.json", "utf8").replace(/^\uFEFF/, ""));
  const today = new Date();
  const D0 = belgradeDateStr(today);
  const D1 = addCalendarDays(D0, 1);
  const D2 = addCalendarDays(D0, 2);

  const rA0 = await setShift(seed.driverA, D0, "radar-a");
  const rA2 = await setShift(seed.driverA, D2, "radar-a");
  const rB1 = await setShift(seed.driverB, D1, "radar-b");

  fs.writeFileSync(__dirname + "/p1b-radar-live-write-output.json", JSON.stringify({ D0, D1, D2, rA0, rA2, rB1, driverA: seed.driverA, driverB: seed.driverB }, null, 2));
  console.log("WROTE p1b-radar-live-write-output.json");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { belgradeDateStr, addCalendarDays, setShift, main };
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
