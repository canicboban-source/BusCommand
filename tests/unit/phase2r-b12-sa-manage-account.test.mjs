/**
 * FAZA 2R-B.1.2 — Super Admin company account modal: no dead Open CTA.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("production company detail modal has no dead Open footer button", () => {
  const html = readFileSync(join(root, "index.legacy-monolith.html"), "utf8");
  assert.doesNotMatch(html, /id="sa-detail-open-app-btn"/);
  assert.doesNotMatch(html, /data-action="superadminOpenCompany"/);
  assert.match(html, /id="sa-detail-support-btn"/);
  assert.match(html, /data-action="superadminStartSupport"/);
  assert.match(html, /data-i18n="sa_support_start_audited"/);
  assert.match(html, /data-i18n="sa_detail_title"/);
  assert.match(html, /Manage company account/);
});

test("table CTA label is Manage account (EN/DE/SR)", () => {
  const tr = readFileSync(join(root, "translations.js"), "utf8");
  assert.match(tr, /sa_detail_open:\s*\{\s*en:\s*"Manage account"/);
  assert.match(tr, /de:\s*"Konto verwalten"/);
  assert.match(tr, /sr:\s*"Upravljaj nalogom"/);
  assert.match(tr, /sa_detail_title:\s*\{\s*en:\s*"Manage company account"/);
  assert.match(tr, /sa_support_start_audited:\s*\{/);
});

test("fillCompanyDetailModal wires support CTA and account title — never Open toast CTA", () => {
  const src = readFileSync(join(root, "js/admin/superadmin.js"), "utf8");
  const fillStart = src.indexOf("function fillCompanyDetailModal");
  const fillEnd = src.indexOf("function renderCompanyDetailDispatcher", fillStart);
  assert.ok(fillStart > -1 && fillEnd > fillStart);
  const fill = src.slice(fillStart, fillEnd);
  assert.doesNotMatch(fill, /sa-detail-open-app-btn/);
  assert.doesNotMatch(fill, /btn_open/);
  assert.doesNotMatch(fill, /sa_open_prod_hint/);
  assert.match(fill, /sa-detail-support-btn/);
  assert.match(fill, /sa_detail_title/);
  assert.match(fill, /supportSessionEnabled/);
  assert.match(src, /function renderCompanyDetailSettingsForm/);
  assert.match(src, /superadminSaveCompanySettings/);
  assert.match(src, /t\("sa_detail_open"\)/);
});

test("legacy Open path is not toast-only in production", () => {
  const src = readFileSync(join(root, "js/admin/superadmin.js"), "utf8");
  const openStart = src.indexOf("function superadminOpenCompany");
  const openEnd = src.indexOf("let _pendingDetailCompanyId", openStart);
  const openFn = src.slice(openStart, openEnd);
  assert.match(openFn, /superadminStartSupport\(id\)/);
  assert.doesNotMatch(openFn, /sa_open_prod_hint/);
  assert.doesNotMatch(openFn, /showToast\([\s\S]*Start support/);
});
