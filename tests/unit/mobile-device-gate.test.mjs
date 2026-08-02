import test from "node:test";
import assert from "node:assert/strict";
import { isMobileUserAgent } from "../../js/core/mobile-device.js";

test("isMobileUserAgent blocks phones and tablets by UA", () => {
  assert.equal(isMobileUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), true);
  assert.equal(isMobileUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8)"), true);
  assert.equal(isMobileUserAgent("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"), true);
});

test("isMobileUserAgent allows desktop Chromium even when panel is narrow", () => {
  const desktopChrome =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  assert.equal(isMobileUserAgent(desktopChrome), false);
  assert.equal(isMobileUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15"), false);
});

test("isMobileUserAgent does not treat empty or tool UAs as mobile", () => {
  assert.equal(isMobileUserAgent(""), false);
  assert.equal(isMobileUserAgent("curl/8.0"), false);
});
