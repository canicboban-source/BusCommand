#!/usr/bin/env node
/**
 * Generates a minimal structured BusCommand Dienstplan PDF template.
 * Run: node scripts/generate-dienstplan-pdf-template.js
 */
const fs = require("fs");
const path = require("path");

const TEMPLATE_VERSION = "BUSCOMMAND-DIENSTPLAN-1";
const START = `BUSCOMMAND-DIENSTPLAN-START ${TEMPLATE_VERSION}`;
const END = `BUSCOMMAND-DIENSTPLAN-END ${TEMPLATE_VERSION}`;

function enc(value) {
  const text = String(value ?? "").trim();
  return text ? text.replace(/\s+/g, "~") : "";
}

const payload = [
  START,
  `META:template_version=${enc(TEMPLATE_VERSION)}`,
  "META:plan_code=310",
  "META:plan_version=66",
  "META:valid_from=2026-02-09",
  "META:timezone=Europe/Vienna",
  `DUTY:${["310.S01", "SCHOOL_WEEKDAY", "04:02", "04:33", "14:00", "14:35", "Depot", "Depot"].map(enc).join("|")}`,
  `ACT:${["310.S01", "1", "ARBEIT", "04:02", "04:17", "", "", "", ""].map(enc).join("|")}`,
  `ACT:${["310.S01", "2", "DEPOT", "04:17", "04:33", "", "", "", ""].map(enc).join("|")}`,
  `ACT:${["310.S01", "3", "FAHRT", "04:33", "14:00", "310", "101", "", ""].map(enc).join("|")}`,
  `ACT:${["310.S01", "4", "DEPOT", "14:00", "14:25", "", "", "", ""].map(enc).join("|")}`,
  `ACT:${["310.S01", "5", "ARBEIT", "14:25", "14:35", "", "", "", ""].map(enc).join("|")}`,
  END
].join(" ");

/** Split long payload into PDF text lines (<= 80 chars) for Helvetica Tj. */
function chunkText(text, size = 72) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

function escapePdfString(text) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

const lines = chunkText(payload);
let y = 780;
const contentOps = ["BT", "/F1 9 Tf", "50 780 Td", "12 TL"];
lines.forEach((line, index) => {
  if (index === 0) contentOps.push(`(${escapePdfString(line)}) Tj`);
  else contentOps.push(`T* (${escapePdfString(line)}) Tj`);
  y -= 12;
});
contentOps.push("ET");
const stream = contentOps.join("\n");

const objects = [];
objects.push("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n");
objects.push("2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n");
objects.push("3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n");
objects.push(`4 0 obj<< /Length ${Buffer.byteLength(stream, "utf8")} >>stream\n${stream}\nendstream\nendobj\n`);
objects.push("5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n");

let pdf = "%PDF-1.4\n";
const offsets = [0];
objects.forEach(obj => {
  offsets.push(Buffer.byteLength(pdf, "utf8"));
  pdf += obj;
});
const xrefStart = Buffer.byteLength(pdf, "utf8");
pdf += `xref\n0 ${objects.length + 1}\n`;
pdf += "0000000000 65535 f \n";
for (let i = 1; i <= objects.length; i += 1) {
  pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

const out = path.join(__dirname, "..", "public", "templates", "BusCommand_Dienstplan_Import_v1.pdf");
fs.writeFileSync(out, pdf, "utf8");
console.log("Wrote", out, `(${Buffer.byteLength(pdf, "utf8")} bytes)`);
console.log("Payload preview:", payload.slice(0, 120) + "...");
