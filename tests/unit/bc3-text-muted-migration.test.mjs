import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const styleSource = fs.readFileSync(
  new URL("../../style.css", import.meta.url),
  "utf8"
);
const packageImportSource = fs.readFileSync(
  new URL("../../js/imports/package-import.js", import.meta.url),
  "utf8"
);
const lostItemsSource = fs.readFileSync(
  new URL("../../js/dispatcher/lost-items.js", import.meta.url),
  "utf8"
);

const pureMutedInlinePattern =
  /style="color\s*:\s*var\(\s*--text-muted\s*\)\s*;?"/g;
const remainingMutedInlinePattern =
  /style="[^"]*color\s*:\s*var\(\s*--text-muted\s*\)[^"]*"/g;

test("BC-3 pure muted text uses the shared CSP-safe class", () => {
  assert.match(
    styleSource,
    /\.bc-text-muted\s*\{[^}]*color\s*:\s*var\(\s*--text-muted\s*\)\s*;?[^}]*\}/
  );

  assert.equal(
    (packageImportSource.match(/class="bc-text-muted"/g) || []).length,
    5
  );
  assert.equal(
    (lostItemsSource.match(/class="bc-text-muted"/g) || []).length,
    1
  );

  assert.equal(
    (packageImportSource.match(pureMutedInlinePattern) || []).length,
    0
  );
  assert.equal(
    (lostItemsSource.match(pureMutedInlinePattern) || []).length,
    0
  );

  assert.equal(
    (packageImportSource.match(remainingMutedInlinePattern) || []).length,
    2
  );
  assert.equal(
    (lostItemsSource.match(remainingMutedInlinePattern) || []).length,
    2
  );
});
