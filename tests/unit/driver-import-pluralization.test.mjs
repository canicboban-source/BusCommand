import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("tp picks _one keys when count is 1", async () => {
  globalThis.window = {
    state: { language: "en" },
    TRANSLATIONS: {
      en: {
        ca_drivers_preview_ready: "{count} drivers are ready for review.",
        ca_drivers_preview_ready_one: "{count} driver is ready for review.",
        ca_drivers_confirm_import: "Import {count} drivers",
        ca_drivers_confirm_import_one: "Import {count} driver",
        driver_import_success: "Successfully imported {count} drivers!",
        driver_import_success_one: "Successfully imported {count} driver!"
      },
      de: {
        ca_drivers_preview_ready: "{count} Fahrer sind zur Prüfung bereit.",
        ca_drivers_preview_ready_one: "{count} Fahrer ist zur Prüfung bereit."
      }
    }
  };

  const { tp } = await import(pathToFileURL(join(root, "js/ui/i18n-plural.js")).href);

  assert.equal(tp("ca_drivers_preview_ready", 1), "1 driver is ready for review.");
  assert.equal(tp("ca_drivers_preview_ready", 2), "2 drivers are ready for review.");
  assert.equal(tp("ca_drivers_confirm_import", 1), "Import 1 driver");
  assert.equal(tp("driver_import_success", 1), "Successfully imported 1 driver!");
  assert.equal(tp("driver_import_success", 5), "Successfully imported 5 drivers!");

  globalThis.window.state.language = "de";
  assert.equal(tp("ca_drivers_preview_ready", 1), "1 Fahrer ist zur Prüfung bereit.");
  assert.equal(tp("ca_drivers_preview_ready", 3), "3 Fahrer sind zur Prüfung bereit.");
});

test("driver import UI uses tp for pluralized copy", () => {
  const driversAdmin = fs.readFileSync(join(root, "js/admin/company-admin-drivers.js"), "utf8");
  assert.match(driversAdmin, /tp\("ca_drivers_preview_ready"/);
  assert.match(driversAdmin, /tp\("ca_drivers_confirm_import"/);
  assert.match(driversAdmin, /tp\("driver_import_success"/);

  const translations = fs.readFileSync(join(root, "translations.js"), "utf8");
  for (const key of [
    "ca_drivers_preview_ready_one",
    "ca_drivers_confirm_import_one",
    "driver_import_success_one"
  ]) {
    assert.match(translations, new RegExp(`${key}:`));
  }
});
