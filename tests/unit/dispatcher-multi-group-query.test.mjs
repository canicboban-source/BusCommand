import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("Firestore dispatcher driver load uses home groupId only (no knownGroupIds directory)", () => {
  const src = readFileSync(join(root, "js/core/firebase-service.js"), "utf8");
  assert.match(src, /where\("groupId", "==", groupId\)/);
  assert.doesNotMatch(src, /knownGroupIds["'],\s*["']array-contains["']/);
  assert.match(src, /knownGroupIds must not open a company directory/);
});

test("server loads Dispo drivers via home groupId only; knownGroupIds remains CA write metadata", () => {
  const src = readFileSync(join(root, "server/driver-routes.js"), "utf8");
  assert.match(src, /function loadDriverDocsForGroups/);
  assert.match(src, /knownGroupIds:\s*home\s*\?\s*\[home\]/);
  assert.match(src, /loadDriverDocsForGroups\(companyRef,\s*groupIds\)/);
  const helperStart = src.indexOf("async function loadDriverDocsForGroups");
  const helper = src.slice(helperStart, helperStart + 600);
  assert.match(helper, /where\("groupId", "==", groupId\)/);
  assert.doesNotMatch(helper, /knownGroupIds/);
});
