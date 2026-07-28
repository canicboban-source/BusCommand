import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = relative => fs.readFileSync(new globalThis.URL(relative, import.meta.url), "utf8");
const context = { window: {} };
vm.runInNewContext(read("../../translations.js"), context);
const dictionaries = context.window.TRANSLATIONS;

test("company settings has complete pilot-language labels, policies and errors", () => {
  const keys = [
    "settings_title", "settings_subtitle", "ca_settings_kicker", "ca_settings_saved",
    "ca_settings_unsaved", "ca_settings_saving", "ca_settings_save_error",
    "ca_settings_hq_title", "ca_settings_hq_hint", "ca_settings_country",
    "ca_settings_timezone", "ca_settings_timezone_locked", "ca_settings_language",
    "ca_settings_contact_email", "country_at", "country_rs", "ca_settings_save",
    "ca_settings_error_country_invalid", "ca_settings_error_language_invalid",
    "ca_settings_error_email_invalid", "ca_settings_license_title",
    "ca_settings_license_hint", "ca_settings_privacy_title", "ca_settings_no_gps",
    "ca_settings_no_push", "ca_settings_auto_logout", "ca_settings_export_hint",
    "ca_settings_export_drivers_hint", "ca_settings_demo_title",
    "ca_audit_event_company_profile_settings_updated", "ca_audit_event_company_data_exported"
  ];
  for (const language of ["en", "de", "sr"]) {
    for (const key of keys) {
      assert.ok(dictionaries[language][key], `${language}.${key} missing`);
      assert.notEqual(dictionaries[language][key], key);
    }
  }
});

