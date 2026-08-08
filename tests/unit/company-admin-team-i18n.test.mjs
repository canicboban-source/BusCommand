import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = relative => fs.readFileSync(new globalThis.URL(relative, import.meta.url), "utf8");
const context = { window: {} };
vm.runInNewContext(read("../../translations.js"), context);
const dictionaries = context.window.TRANSLATIONS;

test("dispatcher team has complete pilot-language labels, states and errors", () => {
  const keys = [
    "ca_team_kicker", "ca_team_policy", "ca_team_total", "ca_team_active", "ca_team_inactive",
    "ca_team_form_hint", "ca_team_password_help", "ca_team_groups_help", "ca_team_catalog_title",
    "ca_team_search_placeholder", "ca_team_filter_active", "ca_team_filter_inactive", "ca_disp_inactive",
    "ca_disp_deactivate", "ca_disp_activate", "ca_send_reset_link", "ca_revoke_sessions",
    "ca_edit_disp_profile", "ca_edit_disp_profile_hint", "ca_disp_phone_label",
    "ca_disp_profile_saved", "ca_disp_profile_saved_relogin", "ca_disp_profile_save_failed",
    "ca_disp_delete", "ca_confirm_delete_disp", "ca_disp_deleted", "ca_disp_delete_failed",
    "ca_disp_delete_requires_inactive", "ca_disp_delete_confirmation_failed",
    "ca_disp_delete_in_progress", "ca_disp_delete_incomplete",
    "ca_team_error_email_invalid", "ca_team_error_password_short", "ca_team_error_groups_required",
    "ca_team_error_phone_invalid", "ca_team_error_phone_long",
    "ca_confirm_deactivate_disp", "ca_sessions_revoked", "ca_reset_email_sent",
    "ca_audit_event_dispatcher_activated", "ca_audit_event_dispatcher_deactivated",
    "ca_audit_event_dispatcher_sessions_revoked", "ca_audit_event_dispatcher_deleted",
    "ca_audit_event_dispatcher_profile_updated"
  ];
  for (const language of ["en", "de", "sr"]) {
    for (const key of keys) {
      assert.ok(dictionaries[language][key], `${language}.${key} missing`);
      assert.notEqual(dictionaries[language][key], key);
    }
  }
});

test("dispatcher team markup is semantic, labelled and contains no legacy multi-select or fixed reset secret", () => {
  const html = read("../../staff.html");
  const source = read("../../js/admin/company-admin-team.js");
  assert.match(html, /data-submit-action="addCompanyDispatcher"/);
  assert.match(html, /for="ca-new-disp-name"/);
  assert.match(html, /aria-live="polite"/);
  assert.doesNotMatch(html, /id="ca-disp-groups-select"/);
  assert.match(source, /removeCompanyDispatcher/);
  assert.match(source, /toggleCaDispProfileEdit/);
  assert.match(source, /company-team-status-toggle/);
  assert.match(source, /trash-2/);
  assert.doesNotMatch(source, /ChangeMe123|TEMP_RESET_PASSWORD/);
});
