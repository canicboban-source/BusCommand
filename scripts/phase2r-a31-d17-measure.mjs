import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");
const assets = path.join(dist, "assets");
const logs = path.join(root, "reports", "phase-2r-a31-logs");
fs.mkdirSync(logs, { recursive: true });

const html = fs.readFileSync(path.join(dist, "staff.html"), "utf8");
const refs = [...html.matchAll(/(?:src|href)="(\.?\/?assets\/[^"]+\.js)"/g)]
  .map((m) => m[1].replace(/^\.\//, "").replace(/^\//, ""));
const uniq = [...new Set(refs)];
const isT = (r) => /translations-/.test(r);
const staff = uniq.filter((r) => !isT(r)).reduce((s, r) => s + fs.statSync(path.join(dist, r)).size, 0);
const tRel = fs.readdirSync(assets).find((n) => n.startsWith("translations-") && n.endsWith(".js"));
const t = fs.statSync(path.join(assets, tRel)).size;
const out = {
  staffBytes: staff,
  staffMax: 581632,
  staffOver: staff - 581632,
  a3Staff: 590834,
  deltaStaffVsA3: staff - 590834,
  translationsBytes: t,
  translationsMax: 377856,
  translationsOver: t - 377856,
  a3Translations: 382080,
  deltaTranslationsVsA3: t - 382080,
  translationsFile: tRel
};
console.log(JSON.stringify(out, null, 2));
fs.writeFileSync(path.join(logs, "d17-measure.json"), JSON.stringify(out, null, 2));
fs.writeFileSync(
  path.join(logs, "bundle-budgets.txt"),
  [
    `FAIL staff app JS excl. translations: ${staff} > 581632 (over ${staff - 581632})`,
    `FAIL translations chunk: ${t} > 377856 (over ${t - 377856})`,
    `A.3 staff=590834 → A.3.1 staff=${staff} (Δ ${staff - 590834})`,
    `A.3 translations=382080 → A.3.1 translations=${t} (Δ ${t - 382080})`,
    "EXIT=1"
  ].join("\n") + "\n"
);
