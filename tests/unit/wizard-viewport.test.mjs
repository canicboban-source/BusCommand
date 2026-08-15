import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("setup wizards use scrollable card + sticky footer structure", () => {
    const html = readFileSync(join(root, "index.legacy-monolith.html"), "utf8");
    for (const id of ["onboarding-wizard", "ca-onboarding-wizard"]) {
        const start = html.indexOf(`id="${id}"`);
        assert.ok(start > -1, `${id} missing`);
        const endMarker = id === "onboarding-wizard"
            ? 'id="ca-onboarding-wizard"'
            : 'id="monthly-day-edit-modal"';
        const end = html.indexOf(endMarker, start + 1);
        const chunk = html.slice(start, end > start ? end : start + 40000);
        assert.match(chunk, /class="bc-wizard-card"/);
        assert.match(chunk, /class="bc-wizard-header"/);
        assert.match(chunk, /class="bc-wizard-body"/);
        assert.match(chunk, /class="bc-wizard-footer"/);
        const bodyIdx = chunk.indexOf("bc-wizard-body");
        const footerIdx = chunk.indexOf("bc-wizard-footer");
        assert.ok(footerIdx > bodyIdx, `${id}: footer should follow body`);
    }
});

test("overlay and wizard CSS keep tall dialogs reachable on short viewports", () => {
    const css = readFileSync(join(root, "style.css"), "utf8");
    assert.match(css, /\.bc-overlay-modal[\s\S]*?align-items:\s*flex-start/);
    assert.match(css, /\.bc-overlay-modal[\s\S]*?overflow-y:\s*auto/);
    assert.match(css, /\.bc-wizard-card[\s\S]*?max-height:\s*min\(92dvh,\s*92vh\)/);
    assert.match(css, /\.bc-wizard-body[\s\S]*?overflow-y:\s*auto/);
    assert.match(css, /\.bc-wizard-footer[\s\S]*?flex-shrink:\s*0/);
});
