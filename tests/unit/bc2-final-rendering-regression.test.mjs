
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

const SENTINEL_QUICKVIEW_ROUTE = "<img/src=x/onerror=window.__XSS__='route'>";
const SENTINEL_QUICKVIEW_BUS = "<img/src=x/onerror=window.__XSS__='bus'>";
const SENTINEL_QUICKVIEW_SHIFT = "<img/src=x/onerror=window.__XSS__='shift'>";
const SENTINEL_ROUTE_STOPS = "<img/src=x/onerror=window.__XSS__='stops'>";
const SENTINEL_SPEAK = "<img/src=x/onerror=window.__XSS__='speak'>";

function createMockDOM(recordedSets = []) {
    return {
        listeners: {},
        addEventListener: function(evt, cb) { this.listeners[evt] = cb; },
        elements: {},
        getElementById(id) {
            if (!this.elements[id]) {
                const el = {
                    id,
                    value: "test_driver",
                    classList: { add: ()=>{}, remove: ()=>{} },
                    children: [],
                    appendChild(child) { this.children.push(child); },
                    querySelector() { return null; },
                    _html: "",
                };
                Object.defineProperty(el, "innerHTML", {
                    get() { return this._html || this.children.map(c => c.outerHTML ? c.outerHTML() : "").join(""); },
                    set(val) { this._html = val; }
                });
                this.elements[id] = el;
            }
            return this.elements[id];
        },
        createElement(tag) {
            const el = { tag, children: [], classList: { add: ()=>{}, remove: ()=>{} }, _html: "" };
            el.style = { cssText: "" };
            Object.defineProperty(el, "innerHTML", {
                get() { return this._html || ""; },
                set(val) { this._html = val; recordedSets.push(val); }
            });
            Object.defineProperty(el, "textContent", {
                get() { return this._textContent || ""; },
                set(val) { this._textContent = val; }
            });
            Object.defineProperty(el, "innerText", {
                get() { return this._innerText || ""; },
                set(val) { this._innerText = val; }
            });
            el.appendChild = function(child) { this.children.push(child); };
            el.outerHTML = function() { return "<" + this.tag + ">" + (this._html || "") + "</" + this.tag + ">"; };
            return el;
        }
    };
}

function stripImportsAndExports(code) {
    return code
        .replace(/^import\s+.*?;\s*$/gm, "")
        .replace(/export \{[^}]+\};/g, "");
}

test("BC-2 FINAL: quick-view renders domain-controlled values without escaping", async () => {
    global.window = {
        state: {
            language: "en",
            drivers: [{ name: "test_driver", active: true, groupId: "g1", id: "d1" }],
            shifts: [{
                date: "2024-01-01",
                driverName: "test_driver",
                driverId: "d1",
                name: SENTINEL_QUICKVIEW_SHIFT,
                routeCode: SENTINEL_QUICKVIEW_ROUTE,
                bus: SENTINEL_QUICKVIEW_BUS,
                start: "08:00",
                end: "16:00"
            }],
            routes: [{
                id: "rt1",
                number: SENTINEL_QUICKVIEW_ROUTE,
                name: SENTINEL_QUICKVIEW_ROUTE + " - test",
                groupId: "g1"
            }],
            shiftCatalog: { entries: {} },
            monthlyPlans: {}
        }
    };
    global.document = createMockDOM();
    global.t = (k) => k;
    global.lucide = { createIcons: () => {} };

    // Fake date to match shifts
    const todayStr = "2024-01-01";
    global.todayDateStr = () => todayStr;

    // Load shift plan and quick-view
    const shiftPlanSrc = fs.readFileSync(path.join(process.cwd(), "js/core/shift-plan.js"), "utf8");
    const utilsSrc = fs.readFileSync(path.join(process.cwd(), "js/core/utils.js"), "utf8");
    const qvSrc = fs.readFileSync(path.join(process.cwd(), "js/dispatcher/quick-view.js"), "utf8");
    
    const executeQuickView = new Function(`
        ${stripImportsAndExports(utilsSrc)}
        function todayDateStr() { return "2024-01-01"; }
        function localizedShiftTypeLabel(t) { return t; }
        
        let dailyPlanCount = 0;
        function getDailyPlanForDate() { return { slots: [] }; }
        function parseRouteCodeFromText() { return null; }
        function getBereitschaftCode() { return "B"; }
        function driverIdForName() { return "d1"; }
        function ensureShiftsArray() {}
        function driverBelongsToLine() { return true; }
        function renderRouteSchematicSVG() { return ""; }
        function getActiveLineId() { return "g1"; }
        function getScheduleByKey() { return null; }
        
        ${stripImportsAndExports(shiftPlanSrc)}
        ${stripImportsAndExports(qvSrc)}
        
        return { renderDispatcherQuickView };
    `);
    
    const { renderDispatcherQuickView } = executeQuickView();
    renderDispatcherQuickView();
    
    const detailsHtml = global.document.getElementById("disp-quick-view-details").innerHTML;
    
    assert.ok(detailsHtml, "innerHTML should be populated");
    assert.equal(detailsHtml.includes(SENTINEL_QUICKVIEW_ROUTE), false, "Route should be escaped");
    assert.equal(detailsHtml.includes(SENTINEL_QUICKVIEW_BUS), false, "Bus should be escaped");
    assert.equal(detailsHtml.includes(SENTINEL_QUICKVIEW_SHIFT), false, "Shift should be escaped");
});

test("BC-2 FINAL: route-stops renders domain-controlled stop names without escaping", async () => {
    global.window = {
        state: {
            routes: [{
                id: "rt1",
                stops: ["Stop A", SENTINEL_ROUTE_STOPS, "Stop C"]
            }],
            drivers: [{ name: "test_driver" }]
        },
        currentUser: {
            routeId: "rt1",
            currentStopIndex: 1,
            name: "test_driver"
        }
    };
    global.document = createMockDOM();
    global.t = (k) => k;
    
    const utilsSrc = fs.readFileSync(path.join(process.cwd(), "js/core/utils.js"), "utf8");
    const routeStopsSrc = fs.readFileSync(path.join(process.cwd(), "js/maps/route-stops.js"), "utf8");
    const executeRouteStops = new Function(`
        ${stripImportsAndExports(utilsSrc)}
        ${stripImportsAndExports(routeStopsSrc)}
        return { renderRouteStops };
    `);
    
    const { renderRouteStops } = executeRouteStops();
    renderRouteStops();
    
    const containerHtml = global.document.getElementById("route-stops-container").innerHTML;
    assert.ok(containerHtml, "innerHTML should be populated");
    assert.equal(containerHtml.includes(SENTINEL_ROUTE_STOPS), false, "Route stops should be escaped");
});

test("BC-2 FINAL: speak message unsafe HTML parsing", async () => {
    global.window = {
        speechSynthesis: {
            cancel: () => {},
            getVoices: () => []
        }
    };
    const recordedSets = [];
    global.document = createMockDOM(recordedSets);
    
    let constructedUtteranceText = "";
    global.SpeechSynthesisUtterance = class { 
        constructor(text) { constructedUtteranceText = text; } 
    };
    
    const speakSrc = fs.readFileSync(path.join(process.cwd(), "js/ui/speak.js"), "utf8");
    const executeSpeak = new Function(`
        ${stripImportsAndExports(speakSrc)}
        return { speakMessage };
    `);
    
    const { speakMessage } = executeSpeak();
    speakMessage(SENTINEL_SPEAK, "en");
    
    const didAssignInnerHtml = recordedSets.some(html => html.includes(SENTINEL_SPEAK));
    assert.equal(didAssignInnerHtml, false, "Message text should not be interpreted as HTML via innerHTML");
    
    speakMessage("Speed < 20 km/h and delay > 5 min", "en");
    assert.equal(constructedUtteranceText, "Speed < 20 km/h and delay > 5 min", "speakMessage must preserve legitimate angle brackets");
});

test("BC-2 FINAL: speak message legacy duplicate unsafe HTML parsing", async () => {
    global.window = {
        speechSynthesis: {
            cancel: () => {},
            getVoices: () => []
        },
        location: { hostname: "localhost" },
        addEventListener: () => {}
    };
    const recordedSets = [];
    global.document = createMockDOM(recordedSets);
    
    let constructedUtteranceText = "";
    global.SpeechSynthesisUtterance = class { 
        constructor(text) { constructedUtteranceText = text; } 
    };
    
    global.lucide = { createIcons: () => {} };
    global.COMPANY_ID = "test";
    global.getStateStorageKey = () => "test_key";
    global.getBaseState = () => ({});
    global.state = {};
    
    const content = fs.readFileSync(path.join(process.cwd(), "js/maps/live-map.legacy.js"), "utf8");
    const executeLegacy = new Function(`
        ${content}
        return {
            speakMessage: typeof speakMessage !== "undefined" ? speakMessage : null
        };
    `);
    
    const { speakMessage } = executeLegacy();
    speakMessage(SENTINEL_SPEAK, "en");
    
    const didAssignInnerHtml = recordedSets.some(html => html.includes(SENTINEL_SPEAK));
    assert.equal(didAssignInnerHtml, false, "Legacy Message text should not be interpreted as HTML via innerHTML");
    
    speakMessage("Speed < 20 km/h and delay > 5 min", "en");
    assert.equal(constructedUtteranceText, "Speed < 20 km/h and delay > 5 min", "Legacy speakMessage must preserve legitimate angle brackets");
});


test("BC-2 FINAL: route-stops SVG render interprets unescaped HTML", async () => {
    const SENTINEL_SVG = "</text><script data-xss='proof'></script><text>";
    global.window = {
        state: {
            routes: [{
                id: "rt1",
                stops: ["Stop A", SENTINEL_SVG, "Stop C"]
            }],
            drivers: [{ name: "test_driver", currentStopIndex: 0 }]
        },
        currentUser: {
            role: "driver",
            routeId: "rt1",
            currentStopIndex: 1,
            name: "test_driver"
        }
    };
    global.document = createMockDOM();
    global.t = (k) => k;
    
    const utilsSrc = fs.readFileSync(path.join(process.cwd(), "js/core/utils.js"), "utf8");
    const routeStopsSrc = fs.readFileSync(path.join(process.cwd(), "js/maps/route-stops.js"), "utf8");
    const executeRouteStops = new Function(
        stripImportsAndExports(utilsSrc) + "\n" +
        "function dayseed() { return 0; }\n" +
        stripImportsAndExports(routeStopsSrc) + "\n" +
        "return { renderRouteSchematicSVG };"
    );
    
    const { renderRouteSchematicSVG } = executeRouteStops();
    renderRouteSchematicSVG();
    
    const containerHtml = global.document.getElementById("route-schematic-container").innerHTML;
    assert.ok(containerHtml, "innerHTML should be populated");
    assert.equal(containerHtml.includes("<script data-xss='proof'></script>"), false, "SVG rendering should not inject executable script tags");
});
