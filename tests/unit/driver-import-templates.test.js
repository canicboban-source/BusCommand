const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { inflateRawSync } = require("zlib");
const {
  CANONICAL_HEADER,
  parseDriverCsv,
  parseDriverXlsx,
  safeProfilePayload
} = (() => {
  const csv = require("../../server/driver-csv");
  const { safeProfilePayload } = require("../../server/driver-routes");
  return { ...csv, safeProfilePayload };
})();

const ROOT = path.join(__dirname, "../..");
const FORBIDDEN = /pin|initial_pin|password|passcode|company_code|activation_code|login_code/i;

function readXlsxEntry(xlsxPath, entryName) {
  const buf = fs.readFileSync(xlsxPath);
  let offset = 0;
  while (offset + 30 <= buf.length) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) break;
    const method = buf.readUInt16LE(offset + 8);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString("utf8");
    const dataStart = offset + 30 + nameLen + extraLen;
    const data = buf.subarray(dataStart, dataStart + compressedSize);
    offset = dataStart + compressedSize;
    if (name !== entryName) continue;
    if (method === 0) return data.toString("utf8");
    if (method === 8) return inflateRawSync(data).toString("utf8");
    throw new Error(`unsupported zip compression ${method} for ${entryName}`);
  }
  throw new Error(`zip entry not found: ${entryName}`);
}

const FILES = [
  "public/templates/BusCommand_Drivers_Import_v1.csv",
  "public/templates/BusCommand_Drivers_Import_v1.xlsx",
  "public/downloads/BusCommand_Driver_Roster_Template.csv",
  "public/downloads/BusCommand_Driver_Roster_Template.xlsx"
];

test("public driver templates share the canonical header and generic example", () => {
  for (const rel of FILES.filter((file) => file.endsWith(".csv"))) {
    const csv = fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/^\uFEFF/, "");
    assert.match(csv, new RegExp(`^${CANONICAL_HEADER}\\n`));
    assert.match(csv, /EMP-001,Sample,Driver,driver01@example\.invalid,\+43100000000,1010/);
    assert.doesNotMatch(csv, FORBIDDEN);
    assert.doesNotMatch(csv, /Mustermann|Marko|Petrovi|Lasta|VOR 320/i);
  }
});

test("public driver XLSX files are real workbooks without formulas, macros or hidden sheets", () => {
  for (const rel of FILES.filter((file) => file.endsWith(".xlsx"))) {
    const full = path.join(ROOT, rel);
    const raw = fs.readFileSync(full);
    assert.equal(raw[0], 0x50);
    assert.equal(raw[1], 0x4b);
    const workbook = readXlsxEntry(full, "xl/workbook.xml");
    assert.match(workbook, /sheet name="Drivers"/);
    assert.doesNotMatch(workbook, /state="hidden"/);
    assert.equal(raw.includes(Buffer.from("vbaProject")), false);
    const sheet = readXlsxEntry(full, "xl/worksheets/sheet1.xml");
    assert.doesNotMatch(sheet, /<f[ >]/);
    const parsed = parseDriverXlsx(raw);
    assert.equal(parsed[0].eid, "EMP-001");
    assert.equal(parsed[0].postal_code, "1010");
    assert.equal(parsed[0].phone, "+43100000000");
  }
});

test("copy pipeline and landing/staff links expose both template files", () => {
  const copier = fs.readFileSync(path.join(ROOT, "scripts/copy-static-to-dist.js"), "utf8");
  assert.match(copier, /BusCommand_Drivers_Import_v1\.csv/);
  assert.match(copier, /BusCommand_Drivers_Import_v1\.xlsx/);
  assert.match(copier, /BusCommand_Driver_Roster_Template\.csv/);
  assert.match(copier, /BusCommand_Driver_Roster_Template\.xlsx/);
  const staff = fs.readFileSync(path.join(ROOT, "staff.html"), "utf8");
  assert.match(staff, /\/templates\/BusCommand_Drivers_Import_v1\.csv/);
  assert.match(staff, /\/templates\/BusCommand_Drivers_Import_v1\.xlsx/);
  assert.match(staff, /accept="[^"]*\.xlsx/);
  const landing = fs.readFileSync(path.join(ROOT, "scripts/landing/official-landing.html"), "utf8");
  assert.match(landing, /\/downloads\/BusCommand_Driver_Roster_Template\.csv/);
  assert.match(landing, /\/downloads\/BusCommand_Driver_Roster_Template\.xlsx/);
  assert.match(landing, /dlCard5Title/);
});

test("import profile persistence writes postalCode and stays unactivated", () => {
  const drivers = parseDriverCsv(fs.readFileSync(path.join(ROOT, "public/templates/BusCommand_Drivers_Import_v1.csv"), "utf8"));
  const profile = safeProfilePayload(drivers[0], "group-01", "tenant-a", "ts");
  assert.equal(profile.postalCode, "1010");
  assert.equal(profile.codeActivated, false);
  assert.equal(profile.firstName, "Driver");
  assert.equal(profile.lastName, "Sample");
  const routes = fs.readFileSync(path.join(ROOT, "server/driver-routes.js"), "utf8");
  assert.match(routes, /function safeProfilePayload[\s\S]*codeActivated: false/);
  const start = routes.indexOf('"/api/staff/drivers/import"');
  const end = routes.indexOf('"/api/staff/drivers/:driverId/resend-activation"');
  const slice = routes.slice(start, end);
  assert.match(slice, /generateActivationOtp/);
  assert.match(slice, /item\.otp = null/);
  assert.doesNotMatch(slice, /res\.status\(201\).*otp/);
});
