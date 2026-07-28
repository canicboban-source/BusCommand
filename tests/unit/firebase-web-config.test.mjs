import test from "node:test";
import assert from "node:assert/strict";
import {
  EXPECTED_FIREBASE_PROJECT_ID,
  readFirebaseWebConfig,
  validateFirebaseWebConfig
} from "../../js/core/firebase-web-config.js";

const previewEnv = {
  VITE_FIREBASE_API_KEY: "public-browser-key",
  VITE_FIREBASE_AUTH_DOMAIN: "buscommand-preview.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "buscommand-preview",
  VITE_FIREBASE_STORAGE_BUCKET: "buscommand-preview.firebasestorage.app",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "475316242257",
  VITE_FIREBASE_APP_ID: "preview-browser-app-id"
};

test("reads the Firebase browser configuration from Vite variables", () => {
  const config = readFirebaseWebConfig(previewEnv);
  assert.equal(config.projectId, EXPECTED_FIREBASE_PROJECT_ID);
  assert.equal(config.apiKey, "public-browser-key");
});

test("fails closed when Firebase browser configuration is missing", () => {
  const result = validateFirebaseWebConfig(readFirebaseWebConfig({}));
  assert.equal(result.valid, false);
  assert.match(result.error, /VITE_FIREBASE_API_KEY/);
});

test("rejects any Firebase project other than Preview", () => {
  const config = readFirebaseWebConfig({ ...previewEnv, VITE_FIREBASE_PROJECT_ID: "unexpected-project" });
  const result = validateFirebaseWebConfig(config);
  assert.equal(result.valid, false);
  assert.match(result.error, /buscommand-preview/);
});

test("rejects auth domains and buckets outside Preview", () => {
  const wrongDomain = validateFirebaseWebConfig({
    ...readFirebaseWebConfig(previewEnv),
    authDomain: "unexpected-project.firebaseapp.com"
  });
  const wrongBucket = validateFirebaseWebConfig({
    ...readFirebaseWebConfig(previewEnv),
    storageBucket: "unexpected-project.firebasestorage.app"
  });
  assert.equal(wrongDomain.valid, false);
  assert.equal(wrongBucket.valid, false);
});
