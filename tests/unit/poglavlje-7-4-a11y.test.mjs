import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("P7.4 staff and driver expose skip link and main landmark", async () => {
  const staff = await read("../../staff.html");
  const driver = await read("../../driver.html");
  const tokens = await read("../../css/design-tokens.css");
  assert.match(staff, /class="bc-skip-link"[^>]*href="#main-content"/);
  assert.match(driver, /class="bc-skip-link"[^>]*href="#main-content"/);
  assert.match(staff, /<main id="main-content"/);
  assert.match(driver, /<main id="main-content"/);
  assert.match(tokens, /\.bc-skip-link/);
  assert.match(tokens, /--text-muted-dark:\s*#8B9CB3/);
});

test("build source of truth keeps skip-link a11y markers", async () => {
  const legacy = await read("../../index.legacy-monolith.html");
  assert.match(legacy, /class="bc-skip-link"[^>]*href="#main-content"/);
  assert.match(legacy, /<main id="main-content"/);
  assert.match(legacy, /data-i18n-aria-label="theme_toggle_aria"/);
  assert.match(legacy, /id="global-confirm-modal"[^>]*role="dialog"/);
});
