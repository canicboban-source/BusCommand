const fs = require("fs");
const path = require("path");

const pdfPath = process.argv[2];
if (!pdfPath) {
  console.error("Usage: node scripts/analyze-dienstplan-pdf.js <pdf>");
  process.exit(1);
}

async function main() {
  const pdfParse = require("pdf-parse");
  const buf = fs.readFileSync(pdfPath);
  const data = await pdfParse(buf);

  console.log("\n=== PDF DIENSTPLAN ANALIZA ===\n");
  console.log("Fajl:", path.basename(pdfPath));
  console.log("Stranica:", data.numpages);
  console.log("Veličina teksta:", data.text.length, "znakova");
  console.log("");

  const text = data.text;
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // Shift code patterns from user's Excel
  const fShifts = [...text.matchAll(/\b310\.F\d{2}\b/g)].map(m => m[0]);
  const satShifts = [...text.matchAll(/\b310\.6\d{2}\b/g)].map(m => m[0]);
  const sunShifts = [...text.matchAll(/\b310\.7\d{2}\b/g)].map(m => m[0]);
  const all310 = [...text.matchAll(/\b310\.\w+\b/g)].map(m => m[0]);

  const uniqueF = [...new Set(fShifts)].sort();
  const uniqueSat = [...new Set(satShifts)].sort();
  const uniqueSun = [...new Set(sunShifts)].sort();

  console.log("--- Šifre smena u PDF-u ---");
  console.log("310.F** (radni):", uniqueF.length, uniqueF.slice(0, 15).join(", "), uniqueF.length > 15 ? "..." : "");
  console.log("310.6** (subota):", uniqueSat.join(", ") || "(nema)");
  console.log("310.7** (nedelja):", uniqueSun.join(", ") || "(nema)");
  console.log("Ukupno jedinstvenih 310.*:", [...new Set(all310)].length);

  // Driver names from CSV
  const drivers = [
    "Marko Petrović", "Nikola Jovanović", "Stefan Ilić", "Aleksandar Nikolić",
    "Milan Stojanović", "Dušan Pavlović", "Ivan Đorđević", "Luka Kovačević",
    "Nemanja Savić", "Petar Popović"
  ];
  console.log("\n--- Vozači u PDF-u ---");
  drivers.forEach(d => {
    const parts = d.split(" ");
    const last = parts[parts.length - 1];
    const found = text.includes(last) || text.includes(d);
    console.log(`  ${found ? "✓" : "✗"} ${d}`);
  });

  // Time patterns
  const times = [...text.matchAll(/\b\d{1,2}:\d{2}\b/g)].map(m => m[0]);
  console.log("\nVremena (uzorak):", [...new Set(times)].slice(0, 12).join(", "), `... ukupno ${times.length}`);

  // Page markers
  const pageRefs = [...text.matchAll(/PDF str\.?\s*(\d+)/gi)];
  console.log("Reference na PDF stranice u Excel bazi:", pageRefs.length > 0 ? "da (u Excel šifarniku)" : "u samom PDF tekstu:", [...new Set(pageRefs.map(m => m[0]))].slice(0, 5));

  // Sample lines with shift codes
  console.log("\n--- Uzorak redova sa smenama (prvih 15) ---");
  lines.filter(l => /310\.(F|6|7)\d{2}/.test(l)).slice(0, 15).forEach(l => {
    console.log(" ", l.slice(0, 120));
  });

  // Generic parser test
  function parseGeneric(text) {
    const parsed = {};
    text.split(/\r?\n/).forEach(line => {
      const dateMatch = line.match(/^\s*([0-3]?\d)[\.\/\s\-]/) || line.match(/\b([0-3]?\d)\.(?:0?[1-9]|1[0-2])\b/);
      if (!dateMatch) return;
      const day = parseInt(dateMatch[1], 10);
      const codeMatch = line.match(/\b(\d{3}\.[FS\d]?\d{2,3})\b/);
      if (codeMatch && day >= 1 && day <= 31) parsed[day] = codeMatch[1];
    });
    return Object.keys(parsed).length;
  }

  const genericDays = parseGeneric(text);
  console.log("\n--- Trenutni generički parser ---");
  console.log("Parsiranih dana:", genericDays, genericDays >= 5 ? "(delimično)" : "(ne radi za ovaj PDF)");

  // Structure hints
  const hasTable = /Mo-Fr|Ferien|Dienst|Lenker|Fahrer/i.test(text);
  console.log("\n--- Struktura ---");
  console.log("Izgleda kao zvanični Dienstplan:", hasTable ? "DA" : "nejasno");
  console.log("Verzija iz imena: V66, datum 2026-02-09");
  console.log("Linija: 310");

  console.log("\n=== ZAKLJUČAK ===");
  console.log("PDF je IZVORNI šifarnik smena (310.F01-F20, 601-606, 701-704).");
  console.log("Excel 'Baza smena PDF' već referencira ovaj dokument (str. 67-73...).");
  console.log("Za dnevne smene PO VOZAČU koristi sheet 'Detaljno' ili 'Plan Avgust', ne raw PDF.");
  console.log("PDF uvoz treba za: lookup šifre → vreme, linije, kursevi (Baza smena).");
  console.log("");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
