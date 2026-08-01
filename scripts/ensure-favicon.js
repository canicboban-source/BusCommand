#!/usr/bin/env node
/**
 * Ensures every generated BusCommand surface uses the accepted in-app logo.
 * This runs after build-surface-html.js so staff.html, driver.html and the landing
 * page stay correct after every clean build.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const FILES = ["index.html", "staff.html", "driver.html"];
const APP_LOGO = "/brand/logo-hero.png";
const FAVICON = `  <link rel="icon" type="image/png" href="${APP_LOGO}">\n  <link rel="apple-touch-icon" href="${APP_LOGO}">`;

for (const name of FILES) {
  const file = path.join(ROOT, name);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing generated surface: ${name}`);
  }

  let html = fs.readFileSync(file, "utf8");

  // Remove an older or generic favicon declaration before inserting the
  // accepted logo that is already used by the BusCommand login/application UI.
  html = html
    .replace(/\s*<link\b[^>]*\brel=["'](?:shortcut\s+)?icon["'][^>]*>/gi, "")
    .replace(/\s*<link\b[^>]*\brel=["']apple-touch-icon["'][^>]*>/gi, "");

  const titleEnd = html.indexOf("</title>");
  if (titleEnd < 0) throw new Error(`Missing <title> in ${name}`);
  const insertAt = titleEnd + "</title>".length;
  html = `${html.slice(0, insertAt)}\n${FAVICON}${html.slice(insertAt)}`;
  fs.writeFileSync(file, html);

  const written = fs.readFileSync(file, "utf8");
  const logoLinks = written.match(/href=["']\/brand\/logo-hero\.png["']/g) || [];
  if (logoLinks.length !== 2 || written.includes("logo-mark.svg")) {
    throw new Error(`Accepted BusCommand app logo was not linked correctly in ${name}`);
  }

  console.log(`FAVICON OK ${name} -> ${APP_LOGO}`);
}
