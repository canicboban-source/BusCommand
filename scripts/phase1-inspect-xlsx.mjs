import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const xlsx = path.join(root, "public/templates/BusCommand_Dienstplan_Import_v1.xlsx");
if (!fs.existsSync(xlsx)) {
  console.log("MISSING");
  process.exit(0);
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bcxlsx-"));
const zip = path.join(tmp, "t.zip");
const out = path.join(tmp, "out");
fs.copyFileSync(xlsx, zip);
execFileSync("powershell", [
  "-NoProfile",
  "-Command",
  `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${out.replace(/'/g, "''")}' -Force`
], { stdio: "inherit" });

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith(".xml")) acc.push(p);
  }
  return acc;
}

const strings = [];
for (const f of walk(out)) {
  const t = fs.readFileSync(f, "utf8");
  for (const m of t.matchAll(/<t[^>]*>([^<]+)<\/t>/g)) strings.push(m[1]);
}
console.log("string_count", strings.length);
console.log(strings.slice(0, 80).join(" | "));
const filled = strings.some((s) => /310|S01|Depot|FAHRT|ARBEIT|Marko|firma|line\s*\d/i.test(s));
console.log("LOOKS_FILLED", filled);
console.log("size", fs.statSync(xlsx).size);
