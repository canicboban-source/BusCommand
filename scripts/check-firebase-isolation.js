const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const ignoredDirectories = new Set([
  ".git", "node_modules", ".cache", "test-results", "playwright-report"
]);
const textExtensions = new Set([
  ".css", ".env", ".example", ".html", ".js", ".json", ".md", ".mjs",
  ".map", ".rules", ".txt", ".yaml", ".yml"
]);
const forbidden = [
  [["transit", "flow"].join(""), "prod"].join("-"),
  ["AIzaSyBHW2NyhdXhg48", "tuzOhUsDJns4m2a6obQE"].join(""),
  ["902", "580", "554", "748"].join(""),
  ["f122ad5654e0c3", "ff16c079"].join(""),
  ["G-XZ7W", "37K4SM"].join("")
];
const forbiddenProductionFixtures = [
  ["demo", "@buscommand.com"].join(""),
  ["admin@", "demo.com"].join(""),
  ["demo", "123"].join(""),
  ["admin", "123"].join(""),
  ["Alex", " Driver"].join(""),
  ["Sam", " Driver"].join(""),
  ["drv", "-1"].join(""),
  ["demo-audit", "-1"].join("")
];

function collectFiles(directory, includeDist) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    if (!includeDist && entry.isDirectory() && entry.name === "dist") continue;
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(filePath, includeDist));
    else if (textExtensions.has(path.extname(entry.name).toLowerCase())) files.push(filePath);
  }
  return files;
}

function scan(files, label) {
  const findings = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    if (forbidden.some((identifier) => content.includes(identifier))) {
      findings.push(path.relative(root, file));
    }
  }
  if (findings.length) {
    throw new Error(`${label} contains legacy Firebase identifiers: ${findings.join(", ")}`);
  }
}

scan(collectFiles(root, false), "Source");
const dist = path.join(root, "dist");

const forbiddenPublishedPaths = [
  path.join(dist, "promo"),
  path.join(dist, "dispatcher"),
];

for (const forbiddenPath of forbiddenPublishedPaths) {
  if (fs.existsSync(forbiddenPath)) {
    throw new Error(`Build output contains internal-only path: ${path.relative(root, forbiddenPath)}`);
  }
}

const publishedSourceMaps = fs.existsSync(dist)
  ? collectFiles(dist, true).filter((file) => file.endsWith(".map"))
  : [];
if (publishedSourceMaps.length) {
  throw new Error(
    `Build output contains source maps: ${publishedSourceMaps.map((file) => path.relative(root, file)).join(", ")}`
  );
}
if (fs.existsSync(dist)) scan(collectFiles(dist, true), "Build output");
if (fs.existsSync(dist)) {
  const legacyBrand = ["Transit", "Flow"].join("");
  const legacyBrandFiles = collectFiles(dist, true).filter((file) => fs.readFileSync(file, "utf8").includes(legacyBrand));
  if (legacyBrandFiles.length) {
    throw new Error(`Build output contains forbidden legacy branding: ${legacyBrandFiles.map((file) => path.relative(root, file)).join(", ")}`);
  }
}
if (fs.existsSync(dist)) {
  const legacyDriverMarkers = ['id="new-driver-pin"', 'id="add-driver-form"', 'id="bulk-drivers-input"'];
  const legacyDriverFiles = collectFiles(dist, true).filter((file) => {
    const content = fs.readFileSync(file, "utf8");
    return legacyDriverMarkers.some((marker) => content.includes(marker));
  });
  if (legacyDriverFiles.length) {
    throw new Error(`Build output contains legacy manual-driver form markers: ${legacyDriverFiles.map((file) => path.relative(root, file)).join(", ")}`);
  }
}
if (fs.existsSync(dist)) {
  const forbiddenCredentialUi = [
    "Unesite svoj company code za aktivaciju naloga",
    "window.prompt",
    'data-action="resetApp"',
    "Reset App",
    'name="pt5"',
    'name="pt6"',
    "pretrip_check_5",
    "pretrip_check_6"
  ];
  const credentialUiFiles = collectFiles(dist, true).filter((file) => {
    if (file.endsWith(".map")) return false;
    const content = fs.readFileSync(file, "utf8");
    return forbiddenCredentialUi.some((marker) => content.includes(marker));
  });
  if (credentialUiFiles.length) {
    throw new Error(`Build output contains legacy credential UI: ${credentialUiFiles.map((file) => path.relative(root, file)).join(", ")}`);
  }
}
if (fs.existsSync(dist)) {
  const fixtureFiles = collectFiles(dist, true).filter((file) => {
    if (file.endsWith(".map")) return false;
    const content = fs.readFileSync(file, "utf8");
    return forbiddenProductionFixtures.some((marker) => content.includes(marker));
  });
  if (fixtureFiles.length) {
    throw new Error(`Build output contains test/demo fixture data: ${fixtureFiles.map((file) => path.relative(root, file)).join(", ")}`);
  }
}
if (fs.existsSync(dist)) {
  const forbiddenPublishedTemplates = [
    "BusCommand_Dienstplan_Import_v1.xlsx",
    "BusCommand_Dienstplan_Import_v1.csv",
    "BusCommand_Dienstplan_Import_v1.pdf",
    "BusCommand_Drivers_Import_pilot_sr.csv"
  ].filter((name) => fs.existsSync(path.join(dist, "templates", name)));
  if (forbiddenPublishedTemplates.length) {
    throw new Error(`Build output contains populated example templates: ${forbiddenPublishedTemplates.join(", ")}`);
  }
}
console.log("Firebase isolation check passed for source and build output.");
