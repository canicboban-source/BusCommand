#!/usr/bin/env node
/**
 * Stavka 12 — uklanja duplirane :root blokove i spaja style-v9 u style.css
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const STYLE = path.join(ROOT, "style.css");
const V9 = path.join(ROOT, "style-v9.css");

let style = fs.readFileSync(STYLE, "utf8");
const v9 = fs.readFileSync(V9, "utf8");

if (style.includes("BusCommand theme layer")) {
    console.log("SKIP — style.css već konsolidovan");
    process.exit(0);
}

// Ukloni :root blok
style = style.replace(/:root\s*\{[\s\S]*?\}\r?\n\r?\n/, "");

// Ukloni light-theme var override (do color-scheme)
style = style.replace(
    /\/\* ── LIGHT MODE TEMA[\s\S]*?color-scheme:\s*light;\r?\n}\r?\n\r?\n/,
    "/* Tokeni: css/design-tokens.css */\n\n"
);

// v9 komponente — preskoči :root i light var blok
const v9Start = v9.indexOf("/* ── 2. BASE");
const v9Components = v9Start >= 0
    ? "/* ── BusCommand theme layer (bivši style-v9.css) ── */\n\n" + v9.slice(v9Start).trim()
    : "";

style = style.trimEnd() + "\n\n" + v9Components + "\n";
fs.writeFileSync(STYLE, style);
console.log("OK style.css — spojeno", v9Components.split("\n").length, "linija iz style-v9.css");
