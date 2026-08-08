import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("Firestore dispatcher driver load queries knownGroupIds array-contains", () => {
  const src = readFileSync(join(root, "js/core/firebase-service.js"), "utf8");
  assert.match(src, /knownGroupIds["'],\s*["']array-contains["']/);
  assert.match(src, /array-contains/);
});

test("server import stores knownGroupIds and loads Dispo drivers via multi-group helper", () => {
  const src = readFileSync(join(root, "server/driver-routes.js"), "utf8");
  assert.match(src, /function loadDriverDocsForGroups/);
  assert.match(src, /knownGroupIds:\s*home\s*\?\s*\[home\]/);
  assert.match(src, /loadDriverDocsForGroups\(companyRef,\s*groupIds\)/);
  assert.match(src, /where\("knownGroupIds",\s*"array-contains"/);
});
