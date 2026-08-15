import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");
const assets = path.join(dist, "assets");
const logs = path.join(root, "reports", "phase-2r-a3-logs");
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
  a2Staff: 590695,
  deltaStaffVsA2: staff - 590695,
  translationsBytes: t,
  translationsMax: 377856,
  translationsOver: t - 377856,
  a2Translations: 381918,
  deltaTranslationsVsA2: t - 381918,
  translationsFile: tRel
};
console.log(JSON.stringify(out, null, 2));
fs.writeFileSync(path.join(logs, "d17-measure.json"), JSON.stringify(out, null, 2));
fs.writeFileSync(
  path.join(logs, "bundle-budgets.txt"),
  [
    `OK  driver app JS excl. translations: 172642 <= 225280`,
    `FAIL staff app JS excl. translations: ${staff} > 581632 (over ${staff - 581632})`,
    `FAIL translations chunk: ${t} > 377856 (over ${t - 377856})`,
    `A.2 staff=590695 → A.3 staff=${staff} (Δ ${staff - 590695})`,
    `A.2 translations=381918 → A.3 translations=${t} (Δ ${t - 381918})`,
    `EXIT=1`
  ].join("\n") + "\n"
);
