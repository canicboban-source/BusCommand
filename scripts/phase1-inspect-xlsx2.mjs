import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const xlsx = path.join(root, "public/templates/BusCommand_Dienstplan_Import_v1.xlsx");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bcxlsx2-"));
const zip = path.join(tmp, "t.zip");
const out = path.join(tmp, "out");
fs.copyFileSync(xlsx, zip);
execFileSync("powershell", [
  "-NoProfile",
  "-Command",
  `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${out.replace(/'/g, "''")}' -Force`
]);

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

const files = walk(out);
console.log("files", files.map((f) => path.relative(out, f)).join(", "));
for (const f of files.filter((x) => x.endsWith(".xml") || x.endsWith(".rels"))) {
  const t = fs.readFileSync(f, "utf8");
  const hits = [...t.matchAll(/310|S01|Depot|FAHRT|ARBEIT|valid_from|plan_code|SMENE/gi)].map((m) => m[0]);
  if (hits.length || t.includes("<v>")) {
    console.log("---", path.relative(out, f), "len", t.length, "hits", [...new Set(hits)].slice(0, 20).join(","));
    console.log(t.slice(0, 500).replace(/\s+/g, " "));
  }
}
