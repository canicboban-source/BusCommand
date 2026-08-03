import assert from "node:assert/strict";
import test from "node:test";

globalThis.window = globalThis.window || {
  location: { hostname: "localhost", protocol: "http:", href: "http://localhost/" },
  state: { servicePlans: [], shiftCatalogs: {} },
  currentUser: null
};

const { inferOperationalShiftType } = await import("../../js/core/line-shift-catalog.js");
const { servicePlanToCatalog } = await import("../../js/core/service-plan.js");

test("inferOperationalShiftType never maps S/F letters to Früh/Spät", () => {
  // S = škola, F = ferije — type is only a technical API bucket from clock times.
  assert.equal(inferOperationalShiftType({ code: "310.S01", start: "04:23", end: "11:17" }), "morning");
  assert.equal(inferOperationalShiftType({ code: "310.F01", start: "04:23", end: "11:17" }), "morning");
  assert.equal(inferOperationalShiftType({ code: "310.F20", start: "13:10", end: "21:00" }), "afternoon");
  assert.equal(inferOperationalShiftType({ code: "310.701", start: "22:00", end: "05:00" }), "night");
  assert.equal(inferOperationalShiftType({ code: "310.X2" }), "bereitschaft");
});

test("servicePlanToCatalog keeps 310.S01 dayType + exact plan times", () => {
  const plan = {
    planCode: "310",
    planVersion: "66",
    groupId: "line-310",
    duties: [
      {
        code: "310.S01",
        dayType: "SCHOOL_WEEKDAY",
        workStart: "04:23",
        firstTripStart: "04:33",
        lastTripEnd: "11:00",
        workEnd: "11:17"
      },
      {
        code: "310.F01",
        dayType: "HOLIDAY_WEEKDAY",
        workStart: "04:03",
        firstTripStart: "04:33",
        lastTripEnd: "13:00",
        workEnd: "13:30"
      },
      {
        code: "310.601",
        dayType: "SATURDAY",
        workStart: "04:03",
        firstTripStart: "04:33",
        lastTripEnd: "14:00",
        workEnd: "14:20"
      },
      {
        code: "310.701",
        dayType: "SUNDAY_HOLIDAY",
        workStart: "07:40",
        firstTripStart: "08:08",
        lastTripEnd: "16:00",
        workEnd: "16:20"
      }
    ]
  };

  const entries = servicePlanToCatalog(plan, "line-310");
  assert.equal(Object.keys(entries).length, 4);

  const s01 = entries["310.S01"];
  assert.equal(s01.dayType, "SCHOOL_WEEKDAY");
  assert.equal(s01.start, "04:23");
  assert.equal(s01.end, "11:17");
  assert.notEqual(s01.type, "service");
  // Must not treat letter S as Spätdienst/afternoon.
  assert.notEqual(s01.type, "afternoon");

  assert.equal(entries["310.F01"].dayType, "HOLIDAY_WEEKDAY");
  assert.equal(entries["310.F01"].start, "04:03");
  assert.equal(entries["310.F01"].end, "13:30");

  assert.equal(entries["310.601"].dayType, "SATURDAY");
  assert.equal(entries["310.701"].dayType, "SUNDAY_HOLIDAY");
  assert.equal(entries["310.701"].start, "07:40");
});
