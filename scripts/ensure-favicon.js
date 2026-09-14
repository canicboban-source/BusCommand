#!/usr/bin/env node
/**
 * Favicon check / maintainer write using the same canonical transform as
 * scripts/lib/surface-html.js. Default: --check (no tracked writes).
 */
const { runFaviconCli } = require("./lib/surface-html");

try {
  runFaviconCli(process.argv.slice(2));
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
