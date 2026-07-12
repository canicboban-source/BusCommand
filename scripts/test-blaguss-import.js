/**
 * CLI test Blaguss parsers — node scripts/test-blaguss-import.js
 */
const fs = require("fs");
const path = require("path");

async function main() {
  const xlsx = require("xlsx");

  const csvPath = process.argv[2];
  const xlsxPath = process.argv[3];
  if (!csvPath || !xlsxPath) {
    console.log("Usage: node scripts/test-blaguss-import.js <drivers.csv> <plan.xlsx>");
    process.exit(1);
  }

  // Inline minimal CSV parse
  const csvText = fs.readFileSync(csvPath, "utf8");
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  const drivers = lines.slice(1).map(l => {
    const c = l.split(";").map(x => x.trim());
    return { name: c[0], pin: c[3], group: c[5], firma: c[2] };
  });
  console.log("CSV vozača:", drivers.length);
  drivers.forEach(d => console.log(" ", d.name, d.pin, d.group, d.firma));

  const wb = xlsx.readFile(xlsxPath);
  const detName = wb.SheetNames.find(n => n.toLowerCase().includes("detaljno"));
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[detName], { header: 1, defval: "" });
  const headerIdx = rows.findIndex(r => r.join("|").toLowerCase().includes("vozač"));
  const headers = rows[headerIdx].map(h => String(h).toLowerCase());
  const iV = headers.findIndex(h => h.includes("vozač"));
  const iS = headers.findIndex(h => h.includes("smena"));
  const driversInPlan = new Set();
  let rowCount = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const name = String(rows[i][iV] || "").trim();
    if (name) { driversInPlan.add(name); rowCount++; }
  }
  console.log("\nExcel Detaljno:");
  console.log("  Redova:", rowCount);
  console.log("  Vozača:", driversInPlan.size);
  console.log("  Imena:", [...driversInPlan].join(", "));

  const match = drivers.every(d => [...driversInPlan].some(p => p.toLowerCase() === d.name.toLowerCase()));
  console.log("\nCSV ↔ Plan match:", match ? "✅ svi" : "⚠️ proveri imena");
}

main().catch(console.error);
