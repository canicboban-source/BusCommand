import assert from "node:assert/strict";
import test from "node:test";

globalThis.window = globalThis.window || {
    location: { hostname: "localhost", search: "" },
    state: { drivers: [], routes: [] },
    TRANSLATIONS: { en: {}, sr: {}, de: {} }
};

test("live-map runtime safety: projection preserves GPS and strips sensitive/trail fields", async () => {
    const { sanitizeDriverRecordForClient } = await import("../../js/core/firebase-service.js");

    const fullDriverRecord = {
        id: "drv-001",
        firstName: "Petar",
        lastName: "Petrovic",
        phone: "+38160123456",
        email: "petar@example.com",
        pin: "1234",
        eid: "EID-999",
        passwordHash: "secret-hash",
        companyId: "comp-1",
        trail: [{ lat: 44.1, lng: 20.1 }],
        history: [{ lat: 44.1, lng: 20.1 }],
        lastLocation: {
            lat: 44.81761,
            lng: 20.46332,
            accuracy: 12,
            recordedAt: "2026-09-10T12:00:00.000Z",
            updatedAt: "2026-09-10T12:00:05.000Z",
            trail: [{ lat: 44.1, lng: 20.1 }]
        }
    };

    const projected = sanitizeDriverRecordForClient(fullDriverRecord, "dispatcher");
    assert.equal(projected.id, "drv-001");
    assert.equal(projected.name, "Petar Petrovic");
    assert.equal(projected.pin, undefined, "PIN must be stripped for dispatcher");
    assert.equal(projected.eid, undefined, "EID must be stripped for dispatcher");
    assert.equal(projected.passwordHash, undefined, "passwordHash must be stripped");
    assert.equal(projected.companyId, undefined, "companyId must be stripped");
    assert.equal(projected.trail, undefined, "trail must not be passed");
    assert.equal(projected.history, undefined, "history must not be passed");

    assert.ok(projected.lastLocation, "lastLocation must be preserved for dispatcher");
    assert.equal(projected.lastLocation.lat, 44.81761);
    assert.equal(projected.lastLocation.lng, 20.46332);
    assert.equal(projected.lastLocation.accuracy, 12);
    assert.equal(projected.lastLocation.recordedAt, "2026-09-10T12:00:00.000Z");
    assert.equal(projected.lastLocation.updatedAt, "2026-09-10T12:00:05.000Z");
    assert.equal(projected.lastLocation.trail, undefined, "nested trail must not be passed");
});

test("live-map runtime safety: liveCoordinates validates freshness and bounds", async () => {
    const { liveCoordinates } = await import("../../js/maps/live-map-core.js");
    const now = Date.now();

    // Valid recent coordinate
    const validDriver = {
        id: "drv-1",
        lastLocation: {
            lat: 44.8176,
            lng: 20.4633,
            recordedAt: new Date(now - 30_000).toISOString()
        }
    };
    assert.deepEqual(liveCoordinates(validDriver, now), [44.8176, 20.4633]);

    // Stale coordinate (> 5 min)
    const staleDriver = {
        id: "drv-2",
        lastLocation: {
            lat: 44.8176,
            lng: 20.4633,
            recordedAt: new Date(now - 350_000).toISOString()
        }
    };
    assert.equal(liveCoordinates(staleDriver, now), null, "Stale coordinate must be rejected");

    // Future coordinate (> 1 min skew)
    const futureDriver = {
        id: "drv-3",
        lastLocation: {
            lat: 44.8176,
            lng: 20.4633,
            recordedAt: new Date(now + 120_000).toISOString()
        }
    };
    assert.equal(liveCoordinates(futureDriver, now), null, "Future coordinate must be rejected");

    // Invalid coordinate numbers
    const invalidCoords = {
        id: "drv-4",
        lastLocation: {
            lat: 95.0,
            lng: 20.4633
        }
    };
    assert.equal(liveCoordinates(invalidCoords, now), null, "Out-of-bounds lat must be rejected");
});

test("live-map runtime safety: separate markers for same-name drivers & HTML escaping", async () => {
    const mockLeaflet = {
        map: () => ({
            setView: () => ({ addTo: () => {} }),
            removeLayer: () => {},
            invalidateSize: () => {}
        }),
        tileLayer: () => ({ addTo: () => {} }),
        divIcon: (opts) => ({ type: "divIcon", opts }),
        marker: (coords, opts) => {
            const m = {
                coords,
                opts,
                popup: null,
                setLatLng: function (c) { this.coords = c; return this; },
                setPopupContent: function (p) { this.popup = p; return this; },
                setIcon: function (i) { this.opts.icon = i; return this; },
                bindPopup: function (p) { this.popup = p; return this; },
                addTo: function () { return this; }
            };
            return m;
        }
    };

    globalThis.L = mockLeaflet;
    globalThis.window = {
        currentUser: { role: "dispatcher", groups: [] },
        state: {
            drivers: [
                {
                    id: "drv-alpha",
                    name: "Jovan Jovanović",
                    bus: "BG-101<script>alert(1)</script>",
                    active: true,
                    lastLocation: { lat: 44.81, lng: 20.46, recordedAt: new Date().toISOString() }
                },
                {
                    id: "drv-beta",
                    name: "Jovan Jovanović",
                    bus: 'BG-102" onmouseover="alert(2)',
                    active: true,
                    lastLocation: { lat: 44.82, lng: 20.47, recordedAt: new Date().toISOString() }
                }
            ],
            routes: [],
            sosActive: false
        },
        TRANSLATIONS: { en: {}, sr: {}, de: {} }
    };

    const { updateMapMarkers } = await import("../../js/maps/live-map-core.js");
    const { mapState } = await import("../../js/maps/map-data.js");

    mapState.dispatcherMap = mockLeaflet.map();
    mapState.busMarkers = {};

    updateMapMarkers();

    // Dva markera sa razlicitim ID kljucevima
    assert.ok(mapState.busMarkers["drv-alpha"], "Marker za drv-alpha mora postojati");
    assert.ok(mapState.busMarkers["drv-beta"], "Marker za drv-beta mora postojati");
    assert.notEqual(mapState.busMarkers["drv-alpha"], mapState.busMarkers["drv-beta"], "Markeri moraju biti odvojene instance");

    // XSS escaping provera
    const alphaMarker = mapState.busMarkers["drv-alpha"];
    assert.ok(!alphaMarker.opts.icon.opts.html.includes("<script>"), "Ikonica mora escape-ovati script tagove");
    assert.ok(alphaMarker.opts.icon.opts.html.includes("&lt;script&gt;"), "Ikonica mora imati escape-ovan script tag");
    assert.ok(!alphaMarker.popup.includes("<script>"), "Popup mora escape-ovati script tagove");

    const betaMarker = mapState.busMarkers["drv-beta"];
    assert.ok(!betaMarker.popup.includes('onmouseover="alert(2)'), "Popup mora escape-ovati navodnike i atribute");
    assert.ok(betaMarker.popup.includes('&quot;'), "Popup mora sadrzati escape-ovane navodnike");

    // Uklanjanje markera kada vozac vise nema koordinata
    window.state.drivers = [
        {
            id: "drv-alpha",
            name: "Jovan Jovanović",
            bus: "BG-101",
            active: true,
            lastLocation: { lat: 44.81, lng: 20.46, recordedAt: new Date().toISOString() }
        }
    ];

    updateMapMarkers();
    assert.ok(mapState.busMarkers["drv-alpha"], "drv-alpha ostaje na mapi");
    assert.equal(mapState.busMarkers["drv-beta"], undefined, "drv-beta je uklonjen sa mape");
});