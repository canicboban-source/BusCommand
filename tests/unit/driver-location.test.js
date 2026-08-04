const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  isLiveGpsEnabled,
  sanitizeLocationPayload,
  shouldAcceptLocationSample,
  publicLastLocation,
  buildLoginReminderStub
} = require("../../server/driver-location");

test("liveGps is off unless features.liveGps === true", () => {
  assert.equal(isLiveGpsEnabled({}), false);
  assert.equal(isLiveGpsEnabled({ features: { liveGps: false } }), false);
  assert.equal(isLiveGpsEnabled({ features: { liveGps: true } }), true);
  assert.equal(isLiveGpsEnabled({ features: { liveMap: true } }), false);
});

test("location payload sanitizes coords and rejects stale samples", () => {
  const now = new Date("2026-08-04T12:00:00.000Z");
  const ok = sanitizeLocationPayload({
    lat: 47.95123456,
    lng: 16.20123456,
    accuracy: 25,
    recordedAt: "2026-08-04T11:59:30.000Z"
  }, now);
  assert.equal(ok.ok, true);
  assert.equal(ok.location.lat, 47.95123);
  assert.equal(ok.location.lng, 16.20123);
  assert.equal(ok.location.purpose, "active_shift_ops");

  const stale = sanitizeLocationPayload({
    lat: 47.95,
    lng: 16.2,
    recordedAt: "2026-08-04T11:00:00.000Z"
  }, now);
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, "stale_sample");
});

test("location throttle respects minimum interval", () => {
  const now = new Date("2026-08-04T12:00:30.000Z");
  assert.equal(shouldAcceptLocationSample(null, now), true);
  assert.equal(shouldAcceptLocationSample({
    updatedAt: "2026-08-04T12:00:10.000Z"
  }, now), false);
  assert.equal(shouldAcceptLocationSample({
    updatedAt: "2026-08-04T11:59:50.000Z"
  }, now), true);
});

test("public last location strips unknown shapes", () => {
  assert.equal(publicLastLocation(null), null);
  assert.deepEqual(publicLastLocation({ lat: 48.1, lng: 16.3, accuracy: 12 }), {
    lat: 48.1,
    lng: 16.3,
    accuracy: 12,
    recordedAt: null
  });
});

test("login reminder stub stays silent without upcoming start", () => {
  assert.equal(buildLoginReminderStub({ policy: { status: "active" } }), null);
  assert.equal(buildLoginReminderStub({ policy: { status: "off_duty" } }), null);
});

test("provisioning and routes keep liveGps OFF by default", () => {
  const provisioning = fs.readFileSync(path.join(__dirname, "../../server/provisioning.js"), "utf8");
  const routes = fs.readFileSync(path.join(__dirname, "../../server/driver-routes.js"), "utf8");
  const gps = fs.readFileSync(path.join(__dirname, "../../js/maps/gps-track.js"), "utf8");
  assert.match(provisioning, /liveGps:\s*false/);
  assert.match(routes, /\/api\/driver\/location/);
  assert.match(routes, /LIVE_GPS_DISABLED/);
  assert.match(routes, /staff_map_access/);
  assert.match(gps, /configureDriverGpsGate/);
  assert.match(gps, /postDriverLocation/);
});
