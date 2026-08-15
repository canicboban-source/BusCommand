const { spawnSync } = require("node:child_process");
const path = require("node:path");
const r = spawnSync(
  process.execPath,
  [
    "--test",
    "--test-concurrency=1",
    "--test-name-pattern=DRIVER_SCOPE_CHANGED",
    "tests/rules/phase3-d2411-closeout.test.js"
  ],
  { stdio: "inherit", cwd: path.join(__dirname, "..") }
);
process.exit(r.status == null ? 1 : r.status);
