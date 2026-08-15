/**
 * One-shot Phase 2R-B: strip non-product languages from translations.js.
 * Keeps only en / de / sr dictionaries and EN fallback for those two.
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import vm from "vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = join(root, "translations.js");
let src = readFileSync(path, "utf8");
const nl = src.includes("\r\n") ? "\r\n" : "\n";

function findLineStart(haystack, needle) {
  const idx = haystack.indexOf(needle);
  if (idx < 0) return -1;
  const lineStart = haystack.lastIndexOf("\n", idx);
  return lineStart < 0 ? idx : lineStart + 1;
}

// 1) Remove partial language blocks (hr/fr/it/pl/cs) before DYNAMIC section.
const blockStart = findLineStart(src, "TRANSLATIONS.hr = {");
// Prefer the decorative comment above the hr assignment when present.
const commentStart = findLineStart(src, "HRVATSKI");
const cutStart = commentStart >= 0 && commentStart < blockStart ? commentStart : blockStart;
const dynMarker = "// DYNAMIC TRANSLATION ENHANCEMENT FOR NEW KEYS & FALLBACKS";
const blockEnd = findLineStart(src, dynMarker);
if (cutStart < 0 || blockEnd < 0 || blockEnd <= cutStart) {
  throw new Error(`Could not locate hr…cs language blocks (start=${cutStart}, end=${blockEnd})`);
}
src = src.slice(0, cutStart) + src.slice(blockEnd);

// 2) Remove HR smart-fallback block.
src = src.replace(
  /\r?\n\/\/ 2\. HR \(Hrvatski\) pametni fallback[\s\S]*?(?=\r?\n\/\/ 3\. Opšti EN)/,
  nl
);

// 3) Restrict general EN fallback to product languages only.
src = src.replace(
  /for \(const lang of \["sr", "hr", "de", "es", "fr", "it", "tr", "pl", "pt", "nl", "ro", "hu", "cs", "sk", "bg"\]\)/,
  'for (const lang of ["sr", "de"])'
);

// 4) Strip non-product language keys from NEW_TRANSLATIONS value objects.
src = src.replace(
  /(\r?\n\s{4,})(hr|es|fr|it|tr|pl|pt|nl|ro|hu|cs|sk|bg):\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*,?/g,
  ""
);
src = src.replace(/,(\s*,)+/g, ",");
src = src.replace(/,(\s*\})/g, "$1");

// 5) Ensure final product-only purge before window export.
const purgeSnippet = [
  "",
  "// D23 — product UI languages only (en/de/sr). Unsupported keys are dropped.",
  "for (const lang of Object.keys(TRANSLATIONS)) {",
  '    if (lang !== "en" && lang !== "de" && lang !== "sr") {',
  "        delete TRANSLATIONS[lang];",
  "    }",
  "}",
  "// EN fallback for any missing DE/SR key (never invent other dictionaries).",
  'for (const lang of ["de", "sr"]) {',
  "    if (!TRANSLATIONS[lang]) TRANSLATIONS[lang] = {};",
  "    for (const key in TRANSLATIONS.en) {",
  "        if (!TRANSLATIONS[lang][key]) TRANSLATIONS[lang][key] = TRANSLATIONS.en[key];",
  "    }",
  "}",
  ""
].join(nl);

if (!src.includes("D23 — product UI languages only")) {
  if (!src.includes("window.TRANSLATIONS = TRANSLATIONS;")) {
    throw new Error("Missing window.TRANSLATIONS export");
  }
  src = src.replace(
    "window.TRANSLATIONS = TRANSLATIONS;",
    `${purgeSnippet}window.TRANSLATIONS = TRANSLATIONS;`
  );
}

src = src.replace(
  /\/\/ Phase 0 closeout: staff UI languages only \(en\/sr\/de\)\. Keep out of the\r?\n\/\/ 16-lang propagate loop so the translations chunk stays under budget\./,
  "// D23 closeout: staff UI languages only (en/sr/de)."
);

writeFileSync(path, src, "utf8");

const sandbox = { window: {}, console };
vm.runInNewContext(src, sandbox, { filename: "translations.js", timeout: 15000 });
const keys = Object.keys(sandbox.window.TRANSLATIONS || {}).sort();
if (keys.join(",") !== "de,en,sr") {
  throw new Error(`Expected de,en,sr after purge, got: ${keys.join(",")}`);
}
console.log("purge OK — TRANSLATIONS keys:", keys.join(","));
console.log("bytes:", Buffer.byteLength(src, "utf8"));
