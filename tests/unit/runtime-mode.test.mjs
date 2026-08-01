import test from "node:test";
import assert from "node:assert/strict";
import { resolveRuntimeMode } from "../../js/core/runtime-mode.js";

for (const search of ["?mode=demo", "?demo=driver", "?demo=dispatcher"]) {
  test(`public Preview host ignores ${search}`, () => {
    const mode = resolveRuntimeMode({ hostname: "buscommand-preview.onrender.com", search });
    assert.equal(mode.isDemoMode, false);
    assert.equal(mode.quickDemoRole, null);
  });
}

test("localhost allows explicit demo and quick role", () => {
  const mode = resolveRuntimeMode({ hostname: "localhost", search: "?demo=driver" });
  assert.equal(mode.isDemoMode, true);
  assert.equal(mode.quickDemoRole, "driver");
});

test("127.0.0.1 defaults to local demo but honors production override", () => {
  assert.equal(resolveRuntimeMode({ hostname: "127.0.0.1", search: "" }).isDemoMode, true);
  assert.equal(resolveRuntimeMode({ hostname: "127.0.0.1", search: "?mode=production" }).isDemoMode, false);
});
