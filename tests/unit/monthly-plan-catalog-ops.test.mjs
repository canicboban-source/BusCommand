import assert from "node:assert/strict";
import test from "node:test";

globalThis.window = globalThis.window || {
  location: { hostname: "localhost", protocol: "http:", href: "http://localhost/" },
  state: { servicePlans: [], shiftCatalogs: {}, shiftCatalog: null },
  currentUser: null
};

const {
  ensureShiftCatalogForEdit,
  getShiftCatalogForLine,
  persistCatalogForLine
} = await import("../../js/core/line-shift-catalog.js");
const { previewMassDayRange, isMassAbsenceType } = await import("../../js/core/monthly-plan-ops.js");

test("ensureShiftCatalogForEdit does not invent fallback duties by default", () => {
  globalThis.window.state.shiftCatalogs = {};
  globalThis.window.state.shiftCatalog = null;
  const cat = ensureShiftCatalogForEdit("310");
  assert.equal(Object.keys(cat.entries).length, 0);
  assert.equal(getShiftCatalogForLine("310").entries["310.F01"], undefined);
});

test("locked active catalog stays replace-only without fallbacks", () => {
  globalThis.window.state.shiftCatalogs = {};
  globalThis.window.state.shiftCatalog = null;
  persistCatalogForLine("310", {
    "310.S01": { code: "310.S01", type: "afternoon", start: "13:00", end: "21:00" }
  }, { replace: true, locked: true, source: "company-service-plan" });

  const cat = ensureShiftCatalogForEdit("310");
  assert.equal(cat.locked, true);
  assert.equal(Object.keys(cat.entries).sort().join(","), "310.S01");
  assert.equal(cat.entries["310.F01"], undefined);
});

test("mass absence helpers accept only neutral absence types", () => {
  assert.equal(isMassAbsenceType("off"), true);
  assert.equal(isMassAbsenceType("vacation"), true);
  assert.equal(isMassAbsenceType("sick"), true);
  assert.equal(isMassAbsenceType("morning"), false);
  assert.equal(previewMassDayRange(1, 3, 30).affectedCount, 3);
});
