// BusCommand — ESLint flat config (ES2022+)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import globals from "globals";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function onclickHandlerGlobals() {
  const file = path.join(__dirname, "js/register-onclick.js");
  const text = fs.readFileSync(file, "utf8");
  const block = text.match(/const __ONCLICK_HANDLERS = \{([\s\S]*?)\};/);
  if (!block) return {};
  const names = [...block[1].matchAll(/^\s+([A-Za-z_][\w]*),?\s*$/gm)].map((m) => m[1]);
  return Object.fromEntries(names.map((n) => [n, "readonly"]));
}

const browserAppGlobals = {
  ...onclickHandlerGlobals(),
  USE_LOCAL_STATE: "readonly",
  COMPANY_ID: "readonly",
  BusCommandConfig: "readonly",
  Auth: "readonly",
  ApiClient: "readonly",
  TRANSLATIONS: "readonly",
  lucide: "readonly",
  firebase: "readonly",
  XLSX: "readonly",
  pdfjsLib: "readonly",
  state: "writable",
  currentUser: "writable",
  currentCalendarMonth: "writable",
  currentShiftWeekOffset: "writable",
  _licenseInfo: "writable",
  t: "readonly",
  showToast: "readonly",
  saveState: "readonly",
  showAppLayout: "readonly",
  loadDriverScheduleForToday: "readonly",
  _saClickCount: "writable",
  _saClickTimer: "writable",
  showLoginScreen: "readonly",
  L: "readonly"
};

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "**/*.legacy.js",
      "translations.js",
      "dist/translations.js",
      "scripts/build-buscommand-bundle.js",
      "eslint.config.js"
    ]
  },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2021
      }
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-constant-condition": "warn",
      "no-constant-binary-expression": "warn",
      "no-useless-escape": "warn"
    }
  },
  {
    files: ["js/**/*.js"],
    languageOptions: {
      globals: browserAppGlobals
    },
    rules: {
      "no-undef": "error"
    }
  },
  {
    files: [
      "api-server.js",
      "server/**/*.js",
      "scripts/**/*.js",
      "tests/**/*.js",
      "playwright.config.js"
    ],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: ["api-server.js", "server/**/*.js"],
    languageOptions: {
      sourceType: "commonjs"
    }
  },
  {
    files: ["tests/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        window: "writable",
        document: "writable"
      }
    }
  },
  {
    files: ["tests/e2e/**/*.js"],
    rules: {
      "no-undef": "off"
    }
  }
];
