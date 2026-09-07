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
    0
  );
  assert.equal(
    (lostItemsSource.match(remainingMutedInlinePattern) || []).length,
    0
  );
  assert.equal(
    (packageImportSource.match(
      /class="bc-text-muted bc-package-import-hint"/g
    ) || []).length,
    1
  );
  assert.equal(
    (packageImportSource.match(
      /class="bc-text-muted bc-package-import-driver-names"/g
    ) || []).length,
    1
  );
  assert.equal(
    (lostItemsSource.match(
      /class="bc-text-muted bc-lost-items-empty-state"/g
    ) || []).length,
    1
  );
  assert.equal(
    (lostItemsSource.match(
      /class="bc-text-muted bc-lost-item-vehicle-meta"/g
    ) || []).length,
    1
  );

  assert.match(
    styleSource,
    /#package-import-preview\s+\.bc-package-import-hint\s*\{[^}]*font-size\s*:\s*13px\s*;[^}]*margin-top\s*:\s*12px\s*;?[^}]*\}/
  );
  assert.match(
    styleSource,
    /#package-import-preview\s+\.bc-package-import-driver-names\s*\{[^}]*font-size\s*:\s*0\.78rem\s*;[^}]*margin-top\s*:\s*10px\s*;?[^}]*\}/
  );
  assert.match(
    styleSource,
    /#dispatcher-lost-items-table\s+\.bc-lost-items-empty-state\s*\{[^}]*text-align\s*:\s*center\s*;[^}]*padding\s*:\s*30px\s*;?[^}]*\}/
  );
  assert.match(
    styleSource,
    /#dispatcher-lost-items-table\s+\.bc-lost-item-vehicle-meta\s*\{[^}]*font-size\s*:\s*12px\s*;?[^}]*\}/
  );
});
test("BC-3 quick-view muted labels use the shared CSP-safe class", () => {
  const quickViewSource = fs.readFileSync(
    new URL("../../js/dispatcher/quick-view.js", import.meta.url),
    "utf8"
  );

  assert.equal(
    (quickViewSource.match(/class="bc-text-muted"/g) || []).length,
    7
  );
  assert.equal(
    (quickViewSource.match(
      /style\s*=\s*["']\s*color\s*:\s*var\(--text-muted\)\s*;?\s*["']/g
    ) || []).length,
    0
  );
});
