import test from "node:test";
import assert from "node:assert/strict";
import { resolveRuntimeMode } from "../../js/core/runtime-mode.js";

for (const search of ["?mode=demo", "?demo=driver", "?demo=dispatcher", "", "?mode=production"]) {
  test(`never activates local state from URL on Preview (${search || "empty"})`, () => {
    const mode = resolveRuntimeMode({ hostname: "buscommand-preview.onrender.com", search });
    assert.equal(mode.useLocalState, false);
    assert.equal(mode.quickDemoRole, null);
  });
}

for (const search of ["?mode=demo", "?demo=driver", "", "?mode=production"]) {
  test(`localhost ignores URL demo activation (${search || "empty"})`, () => {
    const mode = resolveRuntimeMode({ hostname: "localhost", search });
    assert.equal(mode.useLocalState, false);
    assert.equal(mode.quickDemoRole, null);
  });
}

test("127.0.0.1 never defaults to packaged demo state", () => {
  assert.equal(resolveRuntimeMode({ hostname: "127.0.0.1", search: "" }).useLocalState, false);
  assert.equal(resolveRuntimeMode({ hostname: "127.0.0.1", search: "?mode=demo" }).useLocalState, false);
});
