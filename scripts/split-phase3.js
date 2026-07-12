#!/usr/bin/env node
/**
 * Faza 3: admin, confirm modal, fleet-data, auth/login
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function readLines(srcRel) {
  return fs.readFileSync(path.join(ROOT, srcRel), "utf8").split("\n");
}

function writeModule(outRel, body) {
  const dir = path.dirname(path.join(ROOT, outRel));
  fs.mkdirSync(dir, { recursive: true });
  const clean = body
    .split("\n")
    .filter(l => !l.startsWith("// Auto-extracted"))
    .join("\n")
    .trim();
  fs.writeFileSync(
    path.join(ROOT, outRel),
    `// ${path.basename(outRel)} — BusCommand v9.3\n\n${clean}\n`
  );
  console.log("OK", outRel);
}

function slice(srcRel, start, end) {
  return readLines(srcRel).slice(start - 1, end).join("\n");
}

function archive(srcRel) {
  const full = path.join(ROOT, srcRel);
  if (!fs.existsSync(full)) return;
  const dest = srcRel.replace(/\.js$/, ".legacy.js");
  fs.renameSync(full, path.join(ROOT, dest));
  console.log("ARCHIVE", dest);
}

// --- admin/index.js ---
const admin = "js/admin/index.js";
writeModule("js/core/access.js", slice(admin, 2, 10));
writeModule("js/ui/confirm-modal.js", slice(admin, 153, 186));
writeModule("js/admin/superadmin.js", slice(admin, 12, 151) + "\n\n" + slice(admin, 286, 437));
writeModule("js/admin/company-admin.js", slice(admin, 190, 285));
writeModule("js/admin/dispatcher-setup.js", slice(admin, 439, 595));
archive(admin);

// --- fleet-data ---
const fleet = "js/data/fleet-data.js";
writeModule("js/data/groups.js", slice(fleet, 2, 133));
writeModule("js/data/drivers.js", slice(fleet, 134, 306));
writeModule("js/data/buses-routes.js", slice(fleet, 307, 427));
archive(fleet);

// --- auth/login ---
const login = "js/auth/login.js";
writeModule("js/auth/login-ui.js", slice(login, 2, 64));
writeModule("js/auth/login-driver.js", slice(login, 65, 152));
writeModule("js/auth/login-dispatcher.js", slice(login, 153, 345));
archive(login);

console.log("\nFaza 3 završena.");
