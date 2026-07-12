import { test } from "node:test";
import assert from "node:assert/strict";
import { actionAttr, changeAttr, clickElementById } from "../../js/core/action-delegate.js";

test("actionAttr encodes handler name and args", () => {
  const attrs = actionAttr("switchSection", ["dispatcher-shifts"]);
  assert.match(attrs, /data-action="switchSection"/);
  assert.match(attrs, /data-action-args='\["dispatcher-shifts"\]'/);
});

test("actionAttr supports self-only backdrop clicks", () => {
  const attrs = actionAttr("closeModal", ["x"], { self: true });
  assert.match(attrs, /data-action-self="true"/);
});

test("actionAttr supports stopPropagation", () => {
  const attrs = actionAttr("removeShift", ["A", "2026-07-12"], { stopPropagation: true });
  assert.match(attrs, /data-action-stop-propagation="true"/);
});

test("changeAttr encodes change handler with args-value pass", () => {
  const attrs = changeAttr("updateDriverBusInline", ["Nikola"], "args-value");
  assert.match(attrs, /data-change-action="updateDriverBusInline"/);
  assert.match(attrs, /data-change-pass="args-value"/);
  assert.match(attrs, /data-change-action-args='\["Nikola"\]'/);
});

test("clickElementById calls click on element", () => {
  let clicked = false;
  const orig = globalThis.document;
  globalThis.document = {
    getElementById(id) {
      assert.equal(id, "file-input");
      return { click() { clicked = true; } };
    }
  };
  try {
    clickElementById("file-input");
    assert.equal(clicked, true);
  } finally {
    globalThis.document = orig;
  }
});
