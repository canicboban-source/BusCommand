#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

// dist/ is generated output only. Recreate it so obsolete hashed bundles can
// never survive a build and be uploaded beside the current application.
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
console.log("Cleaned generated dist/");
