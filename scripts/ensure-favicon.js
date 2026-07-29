#!/usr/bin/env node
/**
 * Ensures every generated BusCommand surface declares the permanent platform mark.
 * This runs after build-surface-html.js so staff.html, driver.html and the landing
 * page stay correct after every clean build.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const FILES = ["index.html", "staff.html", "driver.html"];
const FAVICON = '  <link rel="icon" type="image/svg+xml" href="/brand/logo-mark.svg">';

for (const name of FILES) {
  const file = path.join(ROOT, name);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing generated surface: ${name}`);
  }

  let html = fs.readFileSync(file, "utf8");
  if (!html.includes('rel="icon"')) {
    const titleEnd = html.indexOf("</title>");
    if (titleEnd < 0) throw new Error(`Missing <title> in ${name}`);
    const insertAt = titleEnd + "</title>".length;
    html = `${html.slice(0, insertAt)}\n${FAVICON}${html.slice(insertAt)}`;
    fs.writeFileSync(file, html);
  }

  if (!html.includes('href="/brand/logo-mark.svg"')) {
    throw new Error(`BusCommand favicon was not linked in ${name}`);
  }

  console.log(`FAVICON OK ${name}`);
}
