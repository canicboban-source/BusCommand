
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

const DRIVER_PAYLOAD = "<img/src=x/onerror=window.__BC_XSS_SENTINEL__='driver'>";

test("BC-2 MAP XSS: auto-detect driver name", async () => {
    global.window = {
        location: { hostname: "localhost" },
        state: { drivers: [{ name: DRIVER_PAYLOAD }], language: "en" },
        TRANSLATIONS: { en: {} },
        t: () => "detect"
    };
    let feedbackAdded = null;
    global.document = {
        _listeners: {},
        addEventListener: function(evt, cb) { this._listeners[evt] = cb; },
        getElementById: (id) => {
            if (id === "upload-schedule-driver") return { value: "" };
            return null;
        },
        createElement: () => {
            const el = { style: {} };
            const strongEl = {};
            el.querySelector = (sel) => {
                if (sel === "strong") return strongEl;
                return null;
            };
            Object.defineProperty(el, "innerHTML", {
                get() { 
                    if (strongEl.textContent) return "<strong>" + strongEl.textContent.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</strong>";
                    return this._html || "";
                },
                set(val) { this._html = val; }
            });
            return el;
        }
    };
    global.lucide = { createIcons: () => {} };
    
    await import("../../js/maps/schedule-auto-detect.js?1");
    
    global.document._listeners["change"]({
        target: {
            id: "upload-schedule-file",
            files: [{ name: DRIVER_PAYLOAD.toLowerCase() }],
            parentNode: { appendChild: (el) => { feedbackAdded = el; } }
        }
    });
    
    assert.ok(feedbackAdded, "Feedback element should be created");
    assert.equal(feedbackAdded.innerHTML.includes(DRIVER_PAYLOAD), false, "Driver name in feedback must be escaped");
});

const TEXT_PAYLOAD_CONTENT = "<img/src=x/onerror=window.__BC_XSS_SENTINEL__='text'>";
const TEXT_PAYLOAD_B64 = Buffer.from(TEXT_PAYLOAD_CONTENT).toString("base64");

const IMAGE_PAYLOAD = `x" onerror="window.__BC_XSS_SENTINEL__='image'`;
const DAMAGE_PAYLOAD = `x" onerror="window.__BC_XSS_SENTINEL__='damage'`;

function setupLiveMapGlobals() {
    global.window = {
        location: { hostname: "localhost" },
        addEventListener: () => {}
    };
    global.document = {
        addEventListener: () => {},
        getElementById: () => null,
        createElement: (tag) => {
            const el = { style: {} };
            if (tag === "img") {
                Object.defineProperty(el, "src", {
                    set(val) { this._src = val; },
                    get() { return this._src || ""; }
                });
                el.outerHTML = function() {
                    return `<img src="` + this.src.replace(/"/g, "&quot;") + `">`;
                };
            }
            return el;
        }
    };
    global.lucide = { createIcons: () => {} };
    global.COMPANY_ID = "test";
    global.getStateStorageKey = () => "test_key";
    global.getBaseState = () => ({});
    global.state = {};
}

const content = fs.readFileSync(path.join(process.cwd(), "js/maps/live-map.legacy.js"), "utf8");
const executeLegacy = new Function(`
    ${content}
    return {
        viewUploadedSchedule: typeof viewUploadedSchedule !== "undefined" ? viewUploadedSchedule : null,
        viewDamagePhoto: typeof viewDamagePhoto !== "undefined" ? viewDamagePhoto : null
    };
`);

test("BC-2 MAP XSS: text schedule injects unescaped HTML", async () => {
    let appendedEl = null;
    setupLiveMapGlobals();
    
    global.currentUser = { name: "test_user" };
    global.currentCalendarMonth = "2024-01";
    global.getScheduleByKey = () => ({
        fileName: "test.txt",
        fileType: "text/plain",
        fileData: `data:text/plain;base64,${TEXT_PAYLOAD_B64}`
    });
    
    const bodyEl = {
        appendChild: (el) => { appendedEl = el; },
        querySelector: (sel) => {
            if (sel === "pre") {
                const preEl = {};
                Object.defineProperty(preEl, "textContent", {
                    set(val) { this._tc = val; },
                    get() { return this._tc; }
                });
                bodyEl._pre = preEl;
                return preEl;
            }
        }
    };
    Object.defineProperty(bodyEl, "innerHTML", {
        set(val) { this._html = val; },
        get() {
            if (this._pre && this._pre.textContent) {
                return this._html.replace("</pre>", this._pre.textContent.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</pre>");
            }
            if (appendedEl && appendedEl.outerHTML) {
                return appendedEl.outerHTML();
            }
            return this._html || "";
        }
    });

    global.document.getElementById = (id) => {
        if (id === "schedule-viewer-modal") return { classList: { remove: ()=>{} } };
        if (id === "schedule-viewer-title") return {};
        if (id === "schedule-viewer-body") return bodyEl;
        if (id === "schedule-download-link") return {};
        return null;
    };
    
    const { viewUploadedSchedule } = executeLegacy();
    viewUploadedSchedule();
    
    const finalHtml = global.document.getElementById("schedule-viewer-body").innerHTML;
    assert.ok(finalHtml, "innerHTML should be set");
    assert.equal(finalHtml.includes(TEXT_PAYLOAD_CONTENT), false, "Text schedule data must be escaped");
});

test("BC-2 MAP XSS: damage photo attribute breakout", async () => {
    let appendedEl = null;
    setupLiveMapGlobals();
    
    global.state = {
        language: "en",
        drivers: [{ name: "test", damagePhoto: DAMAGE_PAYLOAD }]
    };
    global.window.state = global.state;
    
    const bodyEl = {
        appendChild: (el) => { appendedEl = el; }
    };
    Object.defineProperty(bodyEl, "innerHTML", {
        set(val) { this._html = val; },
        get() {
            if (appendedEl && appendedEl.outerHTML) return appendedEl.outerHTML();
            return this._html || "";
        }
    });

    global.document.getElementById = (id) => {
        if (id === "schedule-viewer-modal") return { classList: { remove: ()=>{} } };
        if (id === "schedule-viewer-title") return {};
        if (id === "schedule-viewer-body") return bodyEl;
        if (id === "schedule-download-link") return {};
        return null;
    };
    
    const { viewDamagePhoto } = executeLegacy();
    viewDamagePhoto("test");
    
    const finalHtml = bodyEl.innerHTML;
    assert.ok(finalHtml, "innerHTML should be set");
    assert.equal(finalHtml.includes(DAMAGE_PAYLOAD), false, "Damage photo URL must be escaped to prevent attribute breakout");
});

test("BC-2 MAP XSS: image schedule attribute breakout", async () => {
    let appendedEl = null;
    setupLiveMapGlobals();
    
    global.currentUser = { name: "test_user" };
    global.currentCalendarMonth = "2024-01";
    global.getScheduleByKey = () => ({
        fileName: "test.png",
        fileType: "image/png",
        fileData: IMAGE_PAYLOAD
    });
    
    const bodyEl = {
        appendChild: (el) => { appendedEl = el; }
    };
    Object.defineProperty(bodyEl, "innerHTML", {
        set(val) { this._html = val; },
        get() {
            if (appendedEl && appendedEl.outerHTML) return appendedEl.outerHTML();
            return this._html || "";
        }
    });

    global.document.getElementById = (id) => {
        if (id === "schedule-viewer-modal") return { classList: { remove: ()=>{} } };
        if (id === "schedule-viewer-title") return {};
        if (id === "schedule-viewer-body") return bodyEl;
        if (id === "schedule-download-link") return {};
        return null;
    };
    
    const { viewUploadedSchedule } = executeLegacy();
    viewUploadedSchedule();
    
    const finalHtml = bodyEl.innerHTML;
    assert.ok(finalHtml, "innerHTML should be set");
    assert.equal(finalHtml.includes(IMAGE_PAYLOAD), false, "Image schedule URL must be escaped to prevent attribute breakout");
});

