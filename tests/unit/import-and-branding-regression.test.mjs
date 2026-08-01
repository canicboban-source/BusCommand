import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

import {
  MAX_BUS_IMPORT_BYTES,
  parseBusImportText,
  validateBusImportFile
} from "../../js/imports/bus-csv-import.js";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [buses, staffHtml, monolithHtml, i18n, translations, staffCss] = await Promise.all([
  read("../../js/data/buses-routes.js"),
  read("../../staff.html"),
  read("../../index.legacy-monolith.html"),
  read("../../js/ui/i18n.js"),
  read("../../translations.js"),
  read("../../css/staff-desktop.css")
]);

test("bus CSV parser accepts localized headers, removes duplicates and rejects invalid rows", () => {
  const parsed = parseBusImportText("\uFEFFbus_number;note\n91103;active\n\"91104\",\"reserve\"\n91103;duplicate");
  assert.deepEqual(parsed.numbers, ["91103", "91104"]);
  assert.deepEqual(parsed.errors, []);

  const invalid = parseBusImportText("bus\n<script>");
  assert.equal(invalid.numbers.length, 0);
  assert.equal(invalid.errors[0].code, "invalid_number");
  assert.equal(validateBusImportFile({ name: "buses.csv", size: MAX_BUS_IMPORT_BYTES }), true);
  assert.equal(validateBusImportFile({ name: "buses.csv", size: MAX_BUS_IMPORT_BYTES + 1 }), false);
  assert.equal(validateBusImportFile({ name: "buses.xlsx", size: 100 }), false);
});

test("dispatcher bus import is previewed and wired on both staff surfaces", () => {
  assert.match(buses, /pendingBusImport/);
  assert.match(buses, /window\.currentUser\?\.role !== "dispatcher"/);
  assert.match(buses, /ApiClient\.createStaffBus\(number, groupId\)/);
  for (const html of [staffHtml, monolithHtml]) {
    assert.match(html, /id="bus-import-file"/);
    assert.match(html, /data-change-action="handleBusImportFile"/);
    assert.match(html, /id="bus-import-preview"/);
  }
});

test("daily plan wording, responsive controls and permanent BusCommand mark stay explicit", () => {
  for (const html of [staffHtml, monolithHtml]) {
    assert.match(html, /data-i18n="daily_schedule_title"/);
    assert.match(html, /data-i18n="btn_save_daily_schedule"/);
    assert.doesNotMatch(html, /data-action="sendScheduleToDrivers"[\s\S]{0,180}data-i18n="btn_send_message"/);
    assert.match(html, /class="group-hub-stats-grid"/);
    assert.match(html, /class="monthly-plan-filters"/);
  }
  assert.match(i18n, /bc-product-signature/);
  assert.match(i18n, /bc-co-brand/);
  assert.match(i18n, /productBrandMarkHtml\(\{ size: "sm", name: "BusCommand" \}\)/);
  assert.match(staffCss, /@media \(max-width: 640px\)[\s\S]*monthly-plan-filters/);
});

test("SR, EN and DE monthly-plan copy is natural and the 10 MB limit is consistent", () => {
  assert.match(translations, /upload_schedule_title: "Uvoz mesečnog plana rada"/);
  assert.match(translations, /upload_schedule_title: "Import monthly duty roster"/);
  assert.match(translations, /upload_schedule_title: "Dienstplan importieren"/);
  assert.doesNotMatch(translations, /Import Monthly Plans \(Dienstplan\)|Monatspläne importieren \(Dienstplan\)|Uvoz mesečnih planova rada \(Dienstplan\)/);
  assert.match(translations, /ca_plan_file_limit: "Najviše 10 MB"/);
  assert.match(translations, /ca_plan_file_limit: "Maximum 10 MB"/);
  assert.match(translations, /ca_plan_file_limit: "Maximal 10 MB"/);
});
