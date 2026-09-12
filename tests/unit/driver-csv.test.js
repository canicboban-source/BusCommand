const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseDriverCsv,
  parseDriverXlsx,
  driversToCanonicalCsv,
  CANONICAL_HEADER,
  detectDelimiter,
  DriverImportError
} = require("../../server/driver-csv");

const CANONICAL = "eid,last_name,first_name,email,phone,postal_code\nEMP-001,Sample,Driver,driver01@example.invalid,+43100000000,1010\n";

test("parses canonical header and PLZ aliases onto postal_code", () => {
  const a = parseDriverCsv(CANONICAL);
  assert.equal(a[0].eid, "EMP-001");
  assert.equal(a[0].last_name, "Sample");
  assert.equal(a[0].first_name, "Driver");
  assert.equal(a[0].postal_code, "1010");
  const aliased = parseDriverCsv("employee_id,prezime,ime,mail,mobile,plz\nE1,Ivic,Ana,ana@example.invalid,+43100000000,1010\n");
  assert.equal(aliased[0].eid, "E1");
  assert.equal(aliased[0].last_name, "Ivic");
  assert.equal(aliased[0].first_name, "Ana");
  assert.equal(aliased[0].email, "ana@example.invalid");
  assert.equal(aliased[0].phone, "+43100000000");
  assert.equal(aliased[0].postal_code, "1010");
});

test("accepts empty postal_code and preserves leading zeros as text", () => {
  const drivers = parseDriverCsv("eid,last_name,first_name,email,phone,postal_code\nE1,A,B,a@b.invalid,0043123,01010\n");
  assert.equal(drivers[0].phone, "0043123");
  assert.equal(drivers[0].postal_code, "01010");
});

test("quoted EN, semicolon DE and tab SR still parse without credential columns", () => {
  assert.equal(parseDriverCsv('eid,first_name,last_name,phone,email,postal_code\nE1,"Ana, Maria",Ivic,+43100000000,ana@example.invalid,1010')[0].first_name, "Ana, Maria");
  assert.equal(parseDriverCsv("mitarbeiter_id;Nachname;Vorname;Telefon;E-Mail;PLZ\nE2;Muster;Max;+43100000001;max@example.invalid;1020")[0].last_name, "Muster");
  assert.equal(parseDriverCsv("maticni_broj\tprezime\time\ttelefon\temail\tpostleitzahl\nE3\tMilic\tMila\t+43100000002\tmila@example.invalid\t1030")[0].first_name, "Mila");
  assert.equal(detectDelimiter("a\tb\tc"), "\t");
});

test("rejects PIN, company_code and activation columns fail-closed without echoing values", () => {
  for (const header of ["pin", "Initial_PIN", "company_code", "activation_code", "password", "passcode", "Firmencode", "licni_kod_za_app"]) {
    assert.throws(
      () => parseDriverCsv(`eid,last_name,first_name,email,phone,postal_code,${header}\nE1,A,B,a@b.invalid,+431,1010,SECRET\n`),
      (error) => {
        assert.equal(error.code, "CREDENTIAL_COLUMNS_FORBIDDEN");
        assert.doesNotMatch(error.message, /SECRET/i);
        return true;
      }
    );
  }
});

test("rejects duplicate EID and missing required fields", () => {
  assert.throws(
    () => parseDriverCsv("eid,last_name,first_name,email,phone,postal_code\nE1,A,B,a@a.invalid,123,1\nE1,C,D,b@b.invalid,124,1\n"),
    /Duplikat eid/
  );
  assert.throws(() => parseDriverCsv("eid,first_name\nE1,A"), /Nedostaju kolone/);
  assert.throws(
    () => parseDriverCsv('eid,last_name,first_name,email,phone\nE1,"A,B,a@a.invalid,123'),
    /nezatvorenu/
  );
});

test("rejects imports larger than the bounded company batch", () => {
  const header = CANONICAL_HEADER;
  const rows = Array.from({ length: 250 }, (_, index) => `${index},A,B,a${index}@example.invalid,+1,1010`);
  assert.throws(() => parseDriverCsv([header, ...rows].join("\n")), /249/);
});

test("rejects duplicate canonical columns and alias+canonical pairs", () => {
  const cases = [
    "eid,last_name,last_name,first_name,email,phone,postal_code",
    "eid,last_name,prezime,first_name,email,phone,postal_code",
    "eid,last_name,first_name,email,phone,postal_code,PLZ",
    "eid,last_name,first_name,email,mail,phone,postal_code",
    "eid,EID,last_name,first_name,email,phone,postal_code"
  ];
  for (const header of cases) {
    assert.throws(
      () => parseDriverCsv(`${header}\nE1,A,B,a@b.invalid,+43100000000,1010\n`),
      (error) => {
        assert.equal(error.code, "DUPLICATE_CANONICAL_COLUMN");
        assert.doesNotMatch(error.message, /a@b\.invalid|\+43100000000|E1/);
        return true;
      }
    );
  }
});

test("accepts E.164 phone and hyphen inside a name; rejects formula-like cells", () => {
  const ok = parseDriverCsv("eid,last_name,first_name,email,phone,postal_code\nE1,Muster-Mann,Max,max@example.invalid,+43100000000,01010\n");
  assert.equal(ok[0].last_name, "Muster-Mann");
  assert.equal(ok[0].phone, "+43100000000");
  assert.equal(ok[0].postal_code, "01010");
  const forbidden = [
    "eid,last_name,first_name,email,phone,postal_code\n=1+1,A,B,a@b.invalid,+43100000000,1010\n",
    "eid,last_name,first_name,email,phone,postal_code\nE1,@SUM(A1:A2),B,a@b.invalid,+43100000000,1010\n",
    "eid,last_name,first_name,email,phone,postal_code\nE1,-CMD|calc,B,a@b.invalid,+43100000000,1010\n",
    "eid,last_name,first_name,email,phone,postal_code\nE1,A,B,a@b.invalid,+CMD|calc,1010\n",
    "eid,last_name,first_name,email,phone,postal_code\n+CMD|calc,A,B,a@b.invalid,+43100000000,1010\n"
  ];
  for (const csv of forbidden) {
    assert.throws(
      () => parseDriverCsv(csv),
      (error) => {
        assert.equal(error.code, "FORMULA_FORBIDDEN");
        assert.doesNotMatch(error.message, /CMD|SUM|1\+1/i);
        return true;
      }
    );
  }
});

test("XLSX formula cells fail closed; extra visible sheets still use the first sheet", () => {
  const XLSX = require("xlsx");
  const formulaWb = XLSX.utils.book_new();
  const formulaSheet = XLSX.utils.aoa_to_sheet([
    ["eid", "last_name", "first_name", "email", "phone", "postal_code"],
    ["EMP-001", "Sample", "Driver", "driver01@example.invalid", "+43100000000", "1010"]
  ]);
  formulaSheet.A2.f = "1+1";
  XLSX.utils.book_append_sheet(formulaWb, formulaSheet, "Drivers");
  assert.throws(
    () => parseDriverXlsx(XLSX.write(formulaWb, { type: "buffer", bookType: "xlsx" })),
    (error) => {
      assert.equal(error.code, "FORMULA_FORBIDDEN");
      return true;
    }
  );

  // Documented MACHINE-FIX-01-R1 scope: extra visible empty sheets are not rejected.
  const extraWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(extraWb, XLSX.utils.aoa_to_sheet([
    ["eid", "last_name", "first_name", "email", "phone", "postal_code"],
    ["EMP-001", "Sample", "Driver", "driver01@example.invalid", "+43100000000", "01010"]
  ]), "Drivers");
  XLSX.utils.book_append_sheet(extraWb, XLSX.utils.aoa_to_sheet([[], []]), "Notes");
  const extra = parseDriverXlsx(XLSX.write(extraWb, { type: "buffer", bookType: "xlsx" }));
  assert.equal(extra[0].postal_code, "01010");
});

test("canonical CSV round-trip keeps last_name before first_name", () => {
  const drivers = parseDriverCsv(CANONICAL);
  const csv = driversToCanonicalCsv(drivers);
  assert.match(csv, /^eid,last_name,first_name,email,phone,postal_code\n/);
  const again = parseDriverCsv(csv);
  assert.equal(again[0].eid, "EMP-001");
  assert.equal(again[0].postal_code, "1010");
});

test("XLSX workbook parses the same contract and keeps leading zeros", () => {
  const XLSX = require("xlsx");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["eid", "last_name", "first_name", "email", "phone", "postal_code"],
    ["EMP-001", "Sample", "Driver", "driver01@example.invalid", "+43100000000", "01010"]
  ]);
  ["A2", "E2", "F2"].forEach((addr) => {
    ws[addr].t = "s";
    ws[addr].z = "@";
  });
  XLSX.utils.book_append_sheet(wb, ws, "Drivers");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const drivers = parseDriverXlsx(buf);
  assert.equal(drivers[0].phone, "+43100000000");
  assert.equal(drivers[0].postal_code, "01010");
  assert.throws(() => parseDriverXlsx(Buffer.from("eid,last_name\n")), DriverImportError);
});
