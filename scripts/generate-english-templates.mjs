/**
 * Generate English BusCommand templates for enterprise download hub.
 * Usage: node scripts/generate-english-templates.mjs
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { writeAllDriverImportTemplates } from "./generate-driver-import-templates.mjs";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "public", "downloads");

function ensureXlsx() {
  try {
    return require("xlsx");
  } catch {
    console.error("xlsx package not available");
    return null;
  }
}

function writeMonthlyShiftXlsx() {
  const XLSX = ensureXlsx();
  if (!XLSX) {
    console.log("Skipping XLSX generation (xlsx package not available)");
    return;
  }

  const wb = XLSX.utils.book_new();

  // Main sheet with headers and example
  const data = [
    ["Date", "Line_Group", "Shift_Code", "Driver_Name", "Notes"],
    ["01.09.2026", "310", "F05", "Max Mustermann", "Morning Shift"],
    ["01.09.2026", "320", "S01", "Anna Schmidt", "Afternoon Shift"],
    ["02.09.2026", "310", "M02", "Karl Weber", "Late Shift"]
  ];

  const sheet = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, sheet, "Monthly Shift Plan");

  // Instructions sheet
  const instructions = [
    ["INSTRUCTIONS FOR BUSCOMMAND MONTHLY SHIFT PLAN IMPORT"],
    [""],
    ["HOW TO USE THIS TEMPLATE:"],
    ["1. Fill in the required columns with your shift schedule data"],
    ["2. Date format must be DD.MM.YYYY (e.g., 01.09.2026 for September 1st, 2026)"],
    ["3. Line_Group: The route group or line number (e.g., 310, 320)"],
    ["4. Shift_Code: The duty code or shift identifier (e.g., F05, S01, M02)"],
    ["5. Driver_Name: Full name of the assigned driver"],
    ["6. Notes: Optional notes about the shift (e.g., Morning Shift, Late Shift, Training)"],
    ["7. Remove the example rows before importing your actual data"],
    ["8. Import via BusCommand Dispo Cockpit: Staff → Import Monthly Plan"],
    [""],
    ["COLUMN DESCRIPTIONS:"],
    ["Date - Required. The date of the shift in DD.MM.YYYY format"],
    ["Line_Group - Required. Route group or line number"],
    ["Shift_Code - Required. Duty code from your catalog (e.g., F05, S01, M02)"],
    ["Driver_Name - Required. Full name of the assigned driver"],
    ["Notes - Optional. Any additional notes about the shift"]
  ];

  const instructionSheet = XLSX.utils.aoa_to_sheet(instructions);
  XLSX.utils.book_append_sheet(wb, instructionSheet, "Instructions");

  const dest = path.join(outDir, "BusCommand_Monthly_Shift_Plan_Template.xlsx");
  XLSX.writeFile(wb, dest);
  console.log("Wrote", dest);
}

function writeFleetCsv() {
  const csv = `# BusCommand Fleet Template
# Instructions:
# 1. Fill in the required columns below with your fleet data
# 2. Bus_Number: Unique identifier for the bus (e.g., 91501)
# 3. License_Plate: Official license plate number (e.g., W-1234AB)
# 4. Group_ID: Route group assignment (e.g., 310, 320)
# 5. Status: Current operational status (Active, Maintenance, Retired)
# 6. Remove this header section (lines starting with #) before importing
# 7. Import via BusCommand Dispo Cockpit: Fleet → Import Vehicles
# Example row: 91501,W-1234AB,310,Active
Bus_Number,License_Plate,Group_ID,Status`;

  // Write canonical name (contract)
  const dest = path.join(outDir, "BusCommand_Fleet_Template.csv");
  fs.writeFileSync(dest, csv, "utf8");
  console.log("Wrote", dest);

  // Keep legacy name for backward compatibility
  const legacy = path.join(outDir, "BusCommand_Fleet_Vehicles_Template.csv");
  fs.writeFileSync(legacy, csv, "utf8");
  console.log("Wrote", legacy);
}

function writeFleetXlsx() {
  const XLSX = ensureXlsx();
  if (!XLSX) {
    console.log("Skipping Fleet XLSX generation (xlsx package not available)");
    return;
  }

  const wb = XLSX.utils.book_new();

  // Main sheet with headers and example
  const data = [
    ["Bus_Number", "License_Plate", "Group_ID", "Status"],
    ["91501", "W-1234AB", "310", "Active"],
    ["91502", "W-5678CD", "320", "Active"],
    ["91503", "W-9012EF", "310", "Maintenance"]
  ];

  const sheet = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, sheet, "Fleet Vehicles");

  // Instructions sheet
  const instructions = [
    ["INSTRUCTIONS FOR BUSCOMMAND FLEET VEHICLES IMPORT"],
    [""],
    ["HOW TO USE THIS TEMPLATE:"],
    ["1. Fill in the required columns with your fleet data"],
    ["2. Bus_Number: Unique identifier for the bus (e.g., 91501)"],
    ["3. License_Plate: Official license plate number (e.g., W-1234AB)"],
    ["4. Group_ID: Route group assignment (e.g., 310, 320)"],
    ["5. Status: Current operational status (Active, Maintenance, Retired)"],
    ["6. Remove the example rows before importing your actual data"],
    ["7. Import via BusCommand Dispo Cockpit: Fleet → Import Vehicles"],
    [""],
    ["COLUMN DESCRIPTIONS:"],
    ["Bus_Number - Required. Unique identifier for the bus"],
    ["License_Plate - Required. Official license plate number"],
    ["Group_ID - Required. Route group assignment"],
    ["Status - Required. Current operational status"]
  ];

  const instructionSheet = XLSX.utils.aoa_to_sheet(instructions);
  XLSX.utils.book_append_sheet(wb, instructionSheet, "Instructions");

  // Write canonical name (contract)
  const dest = path.join(outDir, "BusCommand_Fleet_Template.xlsx");
  XLSX.writeFile(wb, dest);
  console.log("Wrote", dest);

  // Keep legacy name for backward compatibility
  const legacy = path.join(outDir, "BusCommand_Fleet_Vehicles_Template.xlsx");
  XLSX.writeFile(wb, legacy);
  console.log("Wrote", legacy);
}

function writeDriverRosterCsv() {
  writeAllDriverImportTemplates(root);
}

function writeDriverRosterXlsx() {
  // CSV+XLSX for landing and in-app templates are written together.
}

function writeMonthlyScheduleCsv() {
  const csv = `# BusCommand Monthly Schedule Template (for Dispatcher)
# Instructions:
# 1. Fill in the required columns below with monthly schedule data
# 2. Date: Shift date in DD.MM.YYYY format (e.g., 01.09.2026)
# 3. Driver_Full_Name: Full name of the driver (First Last or Last First)
# 4. Shift_Name_Free_Text: Shift name or free text description (100% flexible)
# 5. Notes: Optional notes about the shift (training, vacation, sick, etc.)
# 6. Remove this header section (lines starting with #) before importing
# 7. Import via BusCommand Dispo Cockpit: Monthly Plans → Import Schedule
# Example row: 01.09.2026,Max Mustermann,Morning Shift F05,Regular duty
Date (DD.MM.YYYY),Driver_Full_Name,Shift_Name_Free_Text,Notes`;

  const dest = path.join(outDir, "BusCommand_Monthly_Schedule_Template.csv");
  fs.writeFileSync(dest, csv, "utf8");
  console.log("Wrote", dest);
}

function writeMonthlyScheduleXlsx() {
  const XLSX = ensureXlsx();
  if (!XLSX) {
    console.log("Skipping Monthly Schedule XLSX generation (xlsx package not available)");
    return;
  }

  const wb = XLSX.utils.book_new();

  // Main sheet with headers and example
  const data = [
    ["Date (DD.MM.YYYY)", "Driver_Full_Name", "Shift_Name_Free_Text", "Notes"],
    ["01.09.2026", "Max Mustermann", "Morning Shift F05", "Regular duty"],
    ["01.09.2026", "Anna Schmidt", "Afternoon Shift S01", "Late shift"],
    ["02.09.2026", "Karl Weber", "Night Shift N02", "Night duty"],
    ["02.09.2026", "Max Mustermann", "Training", "New route training"]
  ];

  const sheet = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, sheet, "Monthly Schedule");

  // Instructions sheet
  const instructions = [
    ["INSTRUCTIONS FOR BUSCOMMAND MONTHLY SCHEDULE IMPORT"],
    [""],
    ["HOW TO USE THIS TEMPLATE:"],
    ["1. Fill in the required columns with monthly schedule data"],
    ["2. Date: Shift date in DD.MM.YYYY format (e.g., 01.09.2026)"],
    ["3. Driver_Full_Name: Full name of the driver (First Last or Last First)"],
    ["4. Shift_Name_Free_Text: Shift name or free text description (100% flexible)"],
    ["5. Notes: Optional notes about the shift (training, vacation, sick, etc.)"],
    ["6. Remove the example rows before importing your actual data"],
    ["7. Import via BusCommand Dispo Cockpit: Monthly Plans → Import Schedule"],
    [""],
    ["COLUMN DESCRIPTIONS:"],
    ["Date - Required. Shift date in DD.MM.YYYY format"],
    ["Driver_Full_Name - Required. Full name of the driver"],
    ["Shift_Name_Free_Text - Required. Shift name or free text description"],
    ["Notes - Optional. Additional notes about the shift"]
  ];

  const instructionSheet = XLSX.utils.aoa_to_sheet(instructions);
  XLSX.utils.book_append_sheet(wb, instructionSheet, "Instructions");

  const dest = path.join(outDir, "BusCommand_Monthly_Schedule_Template.xlsx");
  XLSX.writeFile(wb, dest);
  console.log("Wrote", dest);
}

fs.mkdirSync(outDir, { recursive: true });
writeMonthlyShiftXlsx();
writeFleetCsv();
writeFleetXlsx();
writeDriverRosterCsv();
writeDriverRosterXlsx();
writeMonthlyScheduleCsv();
writeMonthlyScheduleXlsx();
console.log("English templates generated successfully");