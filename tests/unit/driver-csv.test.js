const test = require("node:test");
const assert = require("node:assert/strict");
const { parseDriverCsv, detectDelimiter } = require("../../server/driver-csv");

test("parses quoted EN, semicolon DE and tab SR CSV", () => {
  assert.equal(parseDriverCsv('eid,first_name,last_name,phone,email,company_code\nE1,"Ana, Maria",Ivic,+431,ana@example.com,CODE001')[0].first_name, "Ana, Maria");
  assert.equal(parseDriverCsv("Personalnummer;Vorname;Nachname;Telefon;E-Mail;Firmencode\nE2;Max;Muster;+432;max@example.com;CODE002")[0].last_name, "Muster");
  assert.equal(parseDriverCsv("maticni_broj\time\tprezime\ttelefon\temail\tfirmin_kod\nE3\tMila\tMilic\t+433\tmila@example.com\tCODE003")[0].first_name, "Mila");
  assert.equal(detectDelimiter("a\tb\tc"), "\t");
});

test("parses pilot pack ime_prezime;firma_id and ignores licni_kod as login PIN", () => {
  const csv = [
    "ime_prezime;email;firma_id;licni_kod_za_app;telefon;grupa",
    "Marko Petrović;marko.petrovic@example.com;100601;12345;+43 000 000 1001;G1",
    "Nikola Jovanović;nikola.jovanovic@example.com;100602;12345;+43 000 000 1002;G1"
  ].join("\n");
  const drivers = parseDriverCsv(csv);
  assert.equal(drivers.length, 2);
  assert.equal(drivers[0].eid, "100601");
  assert.equal(drivers[0].first_name, "Marko");
  assert.equal(drivers[0].last_name, "Petrović");
  assert.equal(drivers[0].group, "G1");
  // Personal/login codes are not imported from CSV (OTP + personal-code API only).
  assert.equal(drivers[0].company_code, "");
  assert.equal(drivers[1].company_code, "");
});

test("accepts the secure activation format without a plaintext personal/company code", () => {
  const csv = [
    "ime_prezime;email;firma_id;telefon;grupa_csv;linija;status",
    "Marko Petrović;marko.petrovic@example.com;100601;+43 000 000 1001;G1;320;Aktivan",
    "Nikola Jovanović;nikola.jovanovic@example.com;100602;+43 000 000 1002;G1;320;Aktivan"
  ].join("\n");
  const drivers = parseDriverCsv(csv);
  assert.equal(drivers.length, 2);
  assert.equal(drivers[0].eid, "100601");
  assert.equal(drivers[0].company_code, "");
  assert.equal(drivers[1].company_code, "");
});

test("rejects duplicate EID; shared company codes are uniquified instead of rejected", () => {
  assert.throws(() => parseDriverCsv("eid,first_name,last_name,phone,email,company_code\nE1,A,A,1,a@a.com,C1\nE1,B,B,2,b@b.com,C2"), /Duplikat eid/);
  const shared = parseDriverCsv("eid,first_name,last_name,phone,email,company_code\nE1,A,A,1,a@a.com,C1\nE2,B,B,2,b@b.com,c1");
  assert.equal(shared[0].company_code, "C1-E1");
  assert.equal(shared[1].company_code, "c1-E2");
});

test("rejects missing fields and malformed quotes", () => {
  assert.throws(() => parseDriverCsv("eid,first_name\nE1,A"), /Nedostaju CSV kolone/);
  assert.throws(() => parseDriverCsv('eid,first_name,last_name,phone,email,company_code\nE1,"A,B,1,a@a.com,C1'), /nezatvorenu/);
});

test("rejects imports larger than the bounded company batch", () => {
  const header = "eid,first_name,last_name,phone,email,company_code";
  const rows = Array.from({ length: 251 }, (_, index) => `${index},A,B,+1,a${index}@example.com,CODE-${index}`);
  assert.throws(() => parseDriverCsv([header, ...rows].join("\n")), /250/);
});
