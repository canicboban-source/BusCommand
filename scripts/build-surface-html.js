#!/usr/bin/env node
/**
 * Canonical surface HTML check / maintainer write.
 * Default: --check (does not modify tracked files).
 * Maintainer: --write
 * Tests / ignored output: --out-dir <path>
 *
 * Landing source: scripts/landing/official-landing.html
 */
const { runSurfaceCli } = require("./lib/surface-html");

try {
  runSurfaceCli(process.argv.slice(2));
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
