/**
 * Build complementary Aug 2026 plans for VOR 320 crew of 5:
 * Canic Boban (real plan) + 4 colleagues from vozaci_test list.
 * On each Ferien/Schule day Boban's F/S code is kept; the other four
 * of {F05…F09} or {S05…S09} go to colleagues (no duplicate duty code).
 */
import fs from "node:fs";
import path from "node:path";

const fixtures = path.join(process.cwd(), "tests", "fixtures");
const bobanPath = path.join(fixtures, "canic-boban-2026-08.csv");

const CREW = [
  { eid: "100615", name: "Canic Boban", first: "Boban", last: "Canic", email: "cane@gmx.at", phone: "+4369917137535", pin: "59991", bus: "91504", home: null },
  { eid: "100601", name: "Marko Petrović", first: "Marko", last: "Petrović", email: "marko.petrovic@example.com", phone: "+430000001001", pin: "12345", bus: "91503", home: "F05" },
  { eid: "100602", name: "Nikola Jovanović", first: "Nikola", last: "Jovanović", email: "nikola.jovanovic@example.com", phone: "+430000001002", pin: "12345", bus: "91505", home: "F07" },
  { eid: "100603", name: "Stefan Ilić", first: "Stefan", last: "Ilić", email: "stefan.ilic@example.com", phone: "+430000001003", pin: "12345", bus: "91101", home: "F09" },
  { eid: "100604", name: "Aleksandar Nikolić", first: "Aleksandar", last: "Nikolić", email: "aleksandar.nikolic@example.com", phone: "+430000001004", pin: "12345", bus: "91104", home: "F08" }
];

const COLLEAGUES = CREW.filter((c) => c.eid !== "100615");
const DAY_NAMES = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

function parseBoban() {
  const lines = fs.readFileSync(bobanPath, "utf8").trim().split(/\r?\n/).slice(1);
  return lines.map((line) => {
    const [datum, dan, , dienst, rezim, bus] = line.split(";");
    return { datum, dan, dienst, rezim, bus };
  });
}

function codeFamily(dienst) {
  const m = String(dienst || "").match(/^320\.([FS])(\d{2})$/i);
  if (!m) return null;
  return { letter: m[1].toUpperCase(), num: m[2], full: `320.${m[1].toUpperCase()}${m[2]}` };
}

function remainingCodes(bobanFull, letter) {
  const all = ["05", "06", "07", "08", "09"].map((n) => `320.${letter}${n}`);
  return all.filter((c) => c !== bobanFull);
}

function assignColleagues(remaining, letter) {
  // Prefer each colleague's home slot (Fxx → same number under S when Schule).
  const preferred = COLLEAGUES.map((c) => `320.${letter}${c.home.slice(1)}`);
  const assigned = new Map();
  const pool = [...remaining];

  COLLEAGUES.forEach((c, idx) => {
    const want = preferred[idx];
    const hit = pool.indexOf(want);
    if (hit >= 0) {
      assigned.set(c.eid, pool.splice(hit, 1)[0]);
    }
  });
  COLLEAGUES.forEach((c) => {
    if (!assigned.has(c.eid) && pool.length) {
      assigned.set(c.eid, pool.shift());
    }
  });
  return assigned;
}

function row(datum, dan, dienst, rezim, bus, eid, name, deo = "pre podne") {
  return [datum, dan, "320", dienst, rezim || "", bus || "", eid, name, deo].join(";");
}

const header = "datum;dan;linija;dienst;rezim;bus;firma_id;ime_prezime;deo_dana";
const bobanDays = parseBoban();
const byDriver = Object.fromEntries(CREW.map((c) => [c.eid, []]));
const coverageNotes = [];

for (const day of bobanDays) {
  const fam = codeFamily(day.dienst);
  // Always keep Boban's real row.
  byDriver["100615"].push(
    row(day.datum, day.dan, day.dienst, day.rezim, day.bus, "100615", "Canic Boban",
      /sonntag|samstag|701/i.test(`${day.dan}${day.dienst}`) ? "nedelja" : "pre podne")
  );

  if (fam) {
    const rem = remainingCodes(fam.full, fam.letter);
    const map = assignColleagues(rem, fam.letter);
    const used = [fam.full];
    COLLEAGUES.forEach((c) => {
      const code = map.get(c.eid);
      if (!code) return;
      used.push(code);
      byDriver[c.eid].push(
        row(day.datum, day.dan, code, day.rezim || (fam.letter === "S" ? "Schule in NOe" : "Ferien in NOe"),
          c.bus, c.eid, c.name)
      );
    });
    coverageNotes.push({ date: day.datum, boban: fam.full, covered: used.sort() });
    continue;
  }

  // Boban weekend 701: colleagues off (single Sunday/holiday duty).
  if (/^320\.7/i.test(day.dienst)) {
    COLLEAGUES.forEach((c) => {
      byDriver[c.eid].push(row(day.datum, day.dan, "SLOBODNO", "", "", c.eid, c.name, ""));
    });
    coverageNotes.push({ date: day.datum, boban: day.dienst, covered: ["SLOBODNO×4"] });
    continue;
  }

  // Boban Urlaub / bare Dienst: colleagues cover F05,F07,F08,F09 (leave F06 open).
  if (/urlaub|^dienst$/i.test(day.dienst)) {
    const codes = ["320.F05", "320.F07", "320.F08", "320.F09"];
    COLLEAGUES.forEach((c, i) => {
      byDriver[c.eid].push(
        row(day.datum, day.dan, codes[i], "Ferien in NOe", c.bus, c.eid, c.name)
      );
    });
    coverageNotes.push({ date: day.datum, boban: day.dienst, covered: codes });
  }
}

// Extra: ensure colleagues have a light Saturday pattern when Boban has 701 on 15.08 — already handled.
// Drivers template (BusCommand CA import shape)
const driversCsv = [
  "eid,first_name,last_name,phone,email",
  ...CREW.map((c) => [c.eid, c.first, c.last, c.phone, c.email].join(","))
].join("\n") + "\n";

const groupRows = [header];
for (const c of CREW) {
  groupRows.push(...byDriver[c.eid]);
}
// Sort by date then name for readability
const body = groupRows.slice(1).sort((a, b) => {
  const da = a.split(";")[0].split(".").reverse().join("-");
  const db = b.split(";")[0].split(".").reverse().join("-");
  if (da !== db) return da.localeCompare(db);
  return a.localeCompare(b);
});
const groupCsv = [header, ...body].join("\n") + "\n";

fs.writeFileSync(path.join(fixtures, "vor320-crew-drivers.csv"), driversCsv);
fs.writeFileSync(path.join(fixtures, "vor320-group-plan-2026-08.csv"), groupCsv);

for (const c of COLLEAGUES) {
  const slug = c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-");
  const csv = [header, ...byDriver[c.eid]].join("\n") + "\n";
  fs.writeFileSync(path.join(fixtures, `vor320-${slug}-2026-08.csv`), csv);
}

// Copy Boban individual already exists; also write crew meta for tests
fs.writeFileSync(
  path.join(fixtures, "vor320-crew-meta.json"),
  JSON.stringify({ crew: CREW, coverageSample: coverageNotes.slice(0, 5), days: bobanDays.length }, null, 2)
);

console.log("Wrote vor320-group-plan-2026-08.csv rows:", body.length);
console.log("Drivers:", CREW.map((c) => c.name).join(", "));
console.log("Sample coverage:", coverageNotes[1]);
