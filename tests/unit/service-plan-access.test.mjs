import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = relative => fs.readFileSync(new globalThis.URL(relative, import.meta.url), "utf8");

test("published service plan APIs are company-admin owned and dispatcher scoped", () => {
  const api = read("../../api-server.js");
  assert.match(api, /\/api\/company-admin\/service-plans\/preview[\s\S]*?requireCompanyAdmin/);
  assert.match(api, /\/api\/company-admin\/service-plans\/publish[\s\S]*?requireCompanyAdmin/);
  assert.match(api, /\/api\/company-admin\/service-plans\/:planId\/activate[\s\S]*?requireCompanyAdmin/);
  assert.match(api, /\/api\/company-admin\/service-plans\/history[\s\S]*?requireCompanyAdmin/);
  assert.match(api, /\/api\/company-admin\/service-plans\/:planId[\s\S]*?requireCompanyAdmin/);
  assert.match(api, /\/api\/staff\/service-plans\/active[\s\S]*?requireCompanyStaff/);
  assert.match(api, /service_plan_staged/);
  assert.match(api, /service_plan_activated|service_plan_rolled_back/);
  assert.match(api, /groups\.includes\(groupId\)/);
  assert.match(api, /assertCompanyGroupsExist[\s\S]*?req\.body\?\.groupId/);
  assert.match(read("../../server/staff-auth.js"), /parsed\.id !== req\.staffUser\.companyId/);
});

test("firestore keeps service plan writes server-only and separates roster ownership", () => {
  const rules = read("../../firestore.rules");
  assert.match(rules, /service_plans\/\{planId\}[\s\S]*?allow write: if false/);
  assert.match(rules, /service_plans\/\{planId\}\/duties\/\{dutyId\}[\s\S]*?allow write: if false/);
  assert.match(rules, /schedules\/\{scheduleId\}[\s\S]*?allow write: if false/);
  assert.match(rules, /groups\/\{groupId\}[\s\S]*?allow write: if false/);
});

test("company admin UI accepts versioned XLSX CSV and structured PDF without bundled plan data", () => {
  const html = read("../../staff.html");
  const module = read("../../js/admin/company-admin-service-plan.js");
  const parser = read("../../js/imports/service-plan-excel.js");
  const csv = read("../../js/imports/service-plan-csv.js");
  const pdf = read("../../js/imports/service-plan-pdf.js");
  assert.match(html, /id="ca-service-plan-file"[^>]*accept="[^"]*\.xlsx[^"]*\.csv[^"]*\.pdf/);
  assert.match(html, /id="ca-service-plan-group"[\s\S]*?handleCompanyServicePlanGroupChange/);
  assert.doesNotMatch(html, /\/templates\/BusCommand_Dienstplan_Import_v1\.(xlsx|csv|pdf)/);
  assert.match(html, /\/templates\/BusCommand_Dienstplan_Blank_v1\.xlsx/);
  assert.match(html, /\/templates\/BusCommand_Dienstplan_Blank_v1\.csv/);
  assert.match(html, /\/templates\/BusCommand_Drivers_Import_v1\.csv/);
  assert.match(module, /ApiClient\.previewServicePlan/);
  assert.match(module, /ApiClient\.publishServicePlan/);
  assert.match(module, /ApiClient\.activateServicePlan/);
  assert.match(module, /ca-catalog-activation-bar/);
  assert.match(module, /activateCompanyServicePlanVersion/);
  assert.match(module, /pendingImport\.groupId !== selectedGroupId\(\)/);
  assert.match(module, /function comparePlanDuties/);
  assert.match(module, /service-plan-table/);
  assert.match(module, /openCompanyServicePlanDuty/);
  assert.match(module, /ca_plan_group_mismatch/);
  assert.match(module, /ApiClient\.getServicePlanHistory/);
  assert.match(module, /ApiClient\.getServicePlanVersion/);
  assert.match(module, /service-plan-history-detail/);
  assert.match(parser, /parseServicePlanCsvFile|service-plan-csv/);
  assert.match(parser, /parseServicePlanPdfFile|service-plan-pdf/);
  assert.match(csv, /section/);
  assert.match(pdf, /unsupported_pdf/);
  assert.match(pdf, /BUSCOMMAND-DIENSTPLAN-START/);
  assert.match(pdf, /parseCompanyDienstplanText|looksLikeCompanyDienstplan/);
  assert.doesNotMatch(parser, /samo \.xlsx šablon/);
});

test("Company Admin cannot use the staff shift-assignment endpoint", () => {
  const routes = read("../../server/driver-routes.js");
  assert.match(routes, /\/api\/staff\/shifts\/assignment[\s\S]*?req\.staff\.role !== "dispatcher"/);
});
