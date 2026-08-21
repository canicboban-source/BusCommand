// @ts-check
import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PORT || 8766;
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;
const EMULATOR_PROJECT_ID = "demo-buscommand-scale";
const EMULATOR_FIRESTORE_HOST = "127.0.0.1";
const EMULATOR_FIRESTORE_PORT = 8080;
const EMULATOR_AUTH_HOST = "127.0.0.1";
const EMULATOR_AUTH_PORT = 9099;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: {
    command: `npx firebase emulators:exec --project ${EMULATOR_PROJECT_ID} --only auth,firestore "node api-server.js"`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ...process.env,
      PORT: String(PORT),
      BUSCOMMAND_QA_HARNESS: "1",
      BUSCOMMAND_FORCE_SMS_STUB: "1",
      FIREBASE_SERVICE_ACCOUNT_JSON: "",
      FIRESTORE_EMULATOR_HOST: `${EMULATOR_FIRESTORE_HOST}:${EMULATOR_FIRESTORE_PORT}`,
      FIREBASE_AUTH_EMULATOR_HOST: `${EMULATOR_AUTH_HOST}:${EMULATOR_AUTH_PORT}`,
      VITE_USE_FIREBASE_EMULATOR: "1",
      VITE_FIREBASE_EMULATOR_PROJECT_ID: EMULATOR_PROJECT_ID,
      VITE_FIREBASE_EMULATOR_FIRESTORE_HOST: EMULATOR_FIRESTORE_HOST,
      VITE_FIREBASE_EMULATOR_FIRESTORE_PORT: String(EMULATOR_FIRESTORE_PORT),
      VITE_FIREBASE_EMULATOR_AUTH_HOST: EMULATOR_AUTH_HOST,
      VITE_FIREBASE_EMULATOR_AUTH_PORT: String(EMULATOR_AUTH_PORT)
    }
  }
});
