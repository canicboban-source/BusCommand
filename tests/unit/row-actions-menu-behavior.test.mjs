/**
 * Gate 3.0 — row-actions contracts (no new deps).
 * Runtime proof: tests/e2e/row-actions-menu.spec.js
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const src = readFileSync(join(root, "js/ui/row-actions-menu.js"), "utf8");

test("150ms grace is set on open and only guards scroll/resize", () => {
  assert.match(src, /_ignoreOutsideUntil\s*=\s*Date\.now\(\)\s*\+\s*150/);
  const clickStart = src.indexOf('document.addEventListener("click"');
  const keyStart = src.indexOf('document.addEventListener("keydown"');
  const resizeStart = src.indexOf('window.addEventListener("resize"');
  assert.ok(clickStart > -1 && keyStart > clickStart && resizeStart > keyStart);
  const clickHandler = src.slice(clickStart, keyStart);
  const keyHandler = src.slice(keyStart, resizeStart);
  const scrollBlock = src.slice(resizeStart);
  assert.doesNotMatch(clickHandler, /_ignoreOutsideUntil/, "outside click must close immediately");
  assert.doesNotMatch(keyHandler, /_ignoreOutsideUntil/, "Escape must always close");
  assert.match(keyHandler, /Escape/);
  assert.match(scrollBlock, /_ignoreOutsideUntil/);
  assert.match(scrollBlock, /"scroll"/);
});

test("open portals to body and closeAll restores host (no orphan contract)", () => {
  assert.match(src, /document\.body\.appendChild\(liveMenu\)/);
  assert.match(src, /function restorePortedMenu/);
  assert.match(src, /_portedHost\.appendChild\(_portedMenu\)/);
  assert.match(src, /function closeAllRowActionsMenus/);
  // Item buttons keep data-action so clicks work while portaled
  assert.match(src, /role="menuitem"/);
  assert.match(src, /row-actions-item/);
});
