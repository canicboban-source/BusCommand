/* global window */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    registerSectionRenderer,
    refreshObservedSections,
    getActiveSectionId
} from "../../js/core/state-observer.js";

test("getActiveSectionId returns visible section id", () => {
    const orig = globalThis.document;
    globalThis.document = {
        querySelector(sel) {
            if (sel === ".content-section:not(.hidden)") {
                return { id: "dispatcher-shifts" };
            }
            return null;
        },
        getElementById(id) {
            if (id === "dispatcher-shifts") {
                return { classList: { contains: () => false } };
            }
            return null;
        }
    };
    try {
        assert.equal(getActiveSectionId(), "dispatcher-shifts");
    } finally {
        globalThis.document = orig;
    }
});

test("refreshObservedSections calls registered renderer for visible section", () => {
    let called = 0;
    const orig = globalThis.document;
    globalThis.window = globalThis.window || {};
    window.currentUser = { role: "dispatcher" };
    globalThis.document = {
        querySelector() {
            return { id: "dispatcher-dashboard" };
        },
        getElementById(id) {
            if (id === "dispatcher-dashboard") {
                return { classList: { contains: () => false } };
            }
            return null;
        }
    };
    registerSectionRenderer("dispatcher-dashboard", () => { called += 1; });
    try {
        refreshObservedSections({ topics: ["all"] });
        assert.equal(called, 1);
    } finally {
        globalThis.document = orig;
        window.currentUser = null;
    }
});
