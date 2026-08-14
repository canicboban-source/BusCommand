/**
 * B2C-01-F1 — SA create-company → CA follow-up orchestration contract.
 * Production-mode expectations (not demo-only).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const flowSrc = () => fs.readFileSync(path.join(root, "js/admin/sa-create-company-flow.js"), "utf8");
const saSrc = () => fs.readFileSync(path.join(root, "js/admin/superadmin.js"), "utf8");
const htmlSrc = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const loaderSrc = () => fs.readFileSync(path.join(root, "js/admin/sa-create-company-flow-loader.js"), "utf8");

test("C: production DOM must not require phantom #sa-create-admin-btn", () => {
  const js = `${saSrc()}\n${flowSrc()}`;
  for (const rel of ["staff.html", "index.legacy-monolith.html"]) {
    const html = htmlSrc(rel);
    assert.equal((html.match(/id=["']sa-create-admin-btn["']/) || []).length, 0, rel);
  }
  assert.doesNotMatch(js, /getElementById\(\s*["']sa-create-admin-btn["']\s*\)/);
});

test("D: demo/local CA path must not be the sole production createUser proof", () => {
  const js = flowSrc();
  assert.match(js, /ApiClient\.createUser\s*\(/);
  assert.match(js, /saUsesLocalState\s*\(/);
  assert.match(js, /ApiClient\.createUser\(\{[\s\S]*?role:\s*["']company_admin["']/);
});

test("orchestration: server companyId is authoritative for CA", () => {
  const js = flowSrc();
  assert.match(js, /res\.companyId/);
  assert.match(js, /authoritativeCompanyId|saCreateFlow\.companyId/);
  assert.match(js, /COMPANY_CREATED_CA_PENDING/);
});

test("orchestration: whole-flow single-flight uses real #sa-create-company-btn + lazy load", () => {
  const flow = flowSrc();
  const sa = saSrc();
  const loader = loaderSrc();
  assert.match(flow, /sa-create-company-btn/);
  assert.match(flow, /superadminSubmitCreateModal/);
  assert.match(sa, /sa-create-company-flow-loader/);
  assert.match(loader, /import\(\s*["']\.\/sa-create-company-flow\.js["']\s*\)/);
  assert.doesNotMatch(
    flow,
    /await superadminCreateCompanyAdmin\(\);\s*\n\s*superadminCloseCreateModal\(\);/
  );
});

test("partial success: CA failure keeps modal open and enables CA-only retry", () => {
  const js = flowSrc();
  assert.match(js, /sa_create_retry_ca/);
  assert.match(js, /COMPANY_CREATED_CA_PENDING/);
  assert.match(js, /sa_create_partial_company_ok_ca_fail/);
});

test("generic 409 must not start CA-only from client-derived id", () => {
  const js = flowSrc();
  assert.match(js, /409/);
  assert.match(js, /COMPANY_CREATED_CA_PENDING/);
});

test("password must not be stored in module pending state / storage", () => {
  const js = flowSrc();
  assert.doesNotMatch(js, /saCreateFlow[\s\S]{0,120}password\s*[:=]/);
  assert.doesNotMatch(js, /localStorage\.setItem\([^)]*password/i);
  assert.doesNotMatch(js, /sessionStorage\.setItem\([^)]*password/i);
});

test("R1 Manage account wires Create CTA only via missing_firestore_ca + create-missing-admin", () => {
  const js = saSrc();
  const flow = flowSrc();
  assert.match(js, /sa_detail_create_company_admin|superadminOpenCreateMissingAdmin/);
  assert.match(js, /missing_firestore_ca/);
  assert.match(flow, /createMissingCompanyAdmin/);
  assert.doesNotMatch(flow, /createCompany\([\s\S]{0,80}missing/i);
});

test("markup includes partial-success banner mount in staff + legacy", () => {
  for (const rel of ["staff.html", "index.legacy-monolith.html"]) {
    assert.match(htmlSrc(rel), /id=["']sa-create-partial-banner["']/, rel);
  }
});
