/**
 * Simulacija uvoza mesečnog plana — pokreni:
 * node scripts/simulate-plan-import.js "path/to/file.xlsx"
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const filePath = process.argv[2];
if (!filePath || !fs.existsSync(filePath)) {
  console.error("Usage: node scripts/simulate-plan-import.js <xlsx-path>");
  process.exit(1);
}

function parseExtractedScheduleText(text) {
  const lines = (text || "").split(/[\r\n]+/);
  const parsedShifts = {};

  lines.forEach(line => {
    const dateMatch = line.match(/^\s*([0-3]?\d)[\.\/\s\-]/) || line.match(/\b([0-3]?\d)\.(?:0?[1-9]|1[0-2])\b/);
    if (!dateMatch) return;

    const day = parseInt(dateMatch[1], 10);
    if (day < 1 || day > 31) return;

    const lowerLine = line.toLowerCase();
    let shiftType = "";
    let shiftName = "";

    const codeMatch = line.match(/\b(\d{3}\.[S\d]?\d{2,3})\b/) || line.match(/\b(\d{3}\.\d{3})\b/);
    const busMatch = line.match(/Bus\s*(\d+)/i) || line.match(/\b(91\d{3})\b/);
    const busStr = busMatch ? `(Bus ${busMatch[1]})` : "";

    if (codeMatch) {
      shiftName = `${codeMatch[1]} ${busStr}`.trim();
      if (/früh|morning|prva|s0[1-6]\b/i.test(lowerLine)) shiftType = "morning";
      else shiftType = "afternoon";
    } else if (/frei|off|slobodan|abwesenheit/i.test(lowerLine)) {
      shiftType = "off";
      shiftName = "Frei";
    } else if (/urlaub|vacation|odmor/i.test(lowerLine)) {
      shiftType = "vacation";
      shiftName = "Urlaub";
    } else if (/krank|sick|bolovanje/i.test(lowerLine)) {
      shiftType = "sick";
      shiftName = "Krank";
    } else if (/früh|morning|prva/i.test(lowerLine)) {
      shiftType = "morning";
      shiftName = `Frühschicht ${busStr}`.trim();
    } else if (/spät|afternoon|druga|nachmittag/i.test(lowerLine)) {
      shiftType = "afternoon";
      shiftName = `Spätschicht ${busStr}`.trim();
    } else if (/nacht|night|noć/i.test(lowerLine)) {
      shiftType = "night";
      shiftName = `Nachtdienst ${busStr}`.trim();
    }

    if (shiftType) {
      parsedShifts[day] = { type: shiftType, name: shiftName, bus: busMatch ? busMatch[1] : null };
    }
  });

  const dayCount = Object.keys(parsedShifts).length;
  return {
    shifts: parsedShifts,
    dayCount,
    quality: dayCount >= 5 ? "ok" : (dayCount > 0 ? "partial" : "empty")
  };
}

function detectMonthFromFilename(fileName) {
  const lower = fileName.toLowerCase();
  const iso = lower.match(/(20\d{2})[-_\.](0[1-9]|1[0-2])/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const months = {
    januar: "01", februar: "02", mart: "03", april: "04", maj: "05", jun: "06",
    juli: "07", jul: "07", avgust: "08", august: "08", septembar: "09",
    oktobar: "10", novembar: "11", decembar: "12"
  };
  for (const [name, num] of Object.entries(months)) {
    if (lower.includes(name)) {
      const yearMatch = lower.match(/20\d{2}/);
      return `${yearMatch ? yearMatch[0] : "2026"}-${num}`;
    }
  }
  return null;
}

const wb = XLSX.readFile(filePath);
const baseName = path.basename(filePath);

console.log("\n=== FLEETPULSE IMPORT SIMULACIJA ===\n");
console.log("Fajl:", baseName);
console.log("Detektovan mesec:", detectMonthFromFilename(baseName) || "(nije iz imena)");
console.log("Sheet-ovi:", wb.SheetNames.join(", "));
console.log("");

const allDrivers = new Set();
const perSheet = [];

for (const sheetName of wb.SheetNames) {
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const extractedText = rows
    .filter(row => row && row.length > 0)
    .map(row => row.map(c => String(c).trim()).join(" | "))
    .join("\n");

  const result = parseExtractedScheduleText(extractedText);

  // Pokušaj detektovati vozača iz sheet imena ili prvog reda
  let driverGuess = sheetName;
  const firstRows = rows.slice(0, 5).flat().join(" ");

  perSheet.push({
    sheet: sheetName,
    rows: rows.length,
    cols: Math.max(...rows.map(r => r.length), 0),
    parsedDays: result.dayCount,
    quality: result.quality,
    sampleRows: rows.slice(0, 8),
    parsedSample: Object.entries(result.shifts).slice(0, 5)
  });

  if (!/sheet\d/i.test(sheetName)) allDrivers.add(sheetName);

  console.log(`--- Sheet: "${sheetName}" ---`);
  console.log(`  Dimenzije: ${rows.length} redova x ${Math.max(...rows.map(r => r.length), 0)} kolona`);
  console.log(`  Parser: ${result.dayCount} dana | kvalitet: ${result.quality}`);
  if (result.parsedSample || result.dayCount > 0) {
    const sample = Object.entries(result.shifts).slice(0, 3);
    sample.forEach(([d, s]) => console.log(`    Dan ${d}: ${s.type} — ${s.name}`));
  }
  console.log("  Prvih 5 redova (raw):");
  rows.slice(0, 5).forEach((r, i) => {
    console.log(`    [${i}]`, JSON.stringify(r.slice(0, 12)));
  });
  console.log("");
}

// Ako je jedan sheet sa vozačima u kolonama
const mainSheet = wb.Sheets[wb.SheetNames[0]];
const mainRows = XLSX.utils.sheet_to_json(mainSheet, { header: 1, defval: "" });

// Heuristika: matrica vozači x dani
const headerRow = mainRows.find(r => r.filter(c => c !== "").length > 20) || mainRows[0];
if (headerRow) {
  const dayCols = [];
  headerRow.forEach((cell, idx) => {
    const n = parseInt(String(cell).replace(/\D/g, ""), 10);
    if (n >= 1 && n <= 31) dayCols.push({ idx, day: n });
  });
  if (dayCols.length >= 10) {
    console.log("=== MATRICA DETEKTOVANA ===");
    console.log(`Kolone dana u headeru: ${dayCols.length} (dan ${dayCols[0].day} - ${dayCols[dayCols.length-1].day})`);
    const driverRows = mainRows.filter((r, i) => {
      if (i === 0) return false;
      const name = String(r[0] || r[1] || "").trim();
      return name.length > 3 && /[a-zA-ZčćžšđČĆŽŠĐäöüÄÖÜ]/.test(name);
    });
    console.log(`Mogući vozači (redovi): ${driverRows.length}`);
    driverRows.slice(0, 12).forEach(r => {
      const name = String(r[0] || r[1] || "").trim();
      const shifts = dayCols.slice(0, 5).map(({ idx, day }) => `${day}:${String(r[idx]||"").slice(0,15)}`);
      console.log(`  ${name} → ${shifts.join(" | ")}`);
    });
  }
}

console.log("\n=== ZAKLJUČAK SIMULACIJE ===");
const totalParsed = perSheet.reduce((s, p) => s + p.parsedDays, 0);
const avgDays = perSheet.length ? Math.round(totalParsed / perSheet.length) : 0;
console.log(`Sheet-ova: ${perSheet.length}`);
console.log(`Ukupno parsiranih dana (zbir): ${totalParsed}`);
if (avgDays < 20 && perSheet.length <= 2) {
  console.log("⚠️  Trenutni generički parser NE pokriva ovaj Excel layout — potreban dedicirani parser za matricu vozači×dani.");
} else if (avgDays >= 20) {
  console.log("✅ Parser delimično ili potpuno radi — proveri uzorke iznad.");
} else {
  console.log("⚠️  Delimičan rezultat — potrebna prilagodba parsera.");
}
console.log("");
