import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("copy-static-to-dist includes shared style.css and design tokens", () => {
  const script = readFileSync(join(root, "scripts/copy-static-to-dist.js"), "utf8");
  assert.match(script, /"style\.css"/);
  assert.match(script, /"css\/design-tokens\.css"/);
});

test("confirm modal CSS hides closed overlay from pointer events", () => {
  const css = readFileSync(join(root, "style.css"), "utf8");
  assert.match(css, /#global-confirm-modal\.hidden\s*\{[^}]*pointer-events:\s*none\s*!important/s);
  assert.match(css, /#global-confirm-modal\.hidden\s*\{[^}]*display:\s*none\s*!important/s);
});
