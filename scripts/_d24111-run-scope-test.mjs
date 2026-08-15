/**
 * Temporary harness: run only DRIVER_SCOPE_CHANGED closeout test via firebase emulators:exec.
 */
import { spawnSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const inner = 'node --test --test-concurrency=1 --test-name-pattern="DRIVER_SCOPE_CHANGED" tests/rules/phase3-d2411-closeout.test.js';
const r = spawnSync(
  "npx",
  ["firebase", "emulators:exec", "--only", "firestore,auth", "--project", "buscommand-preview", inner],
  { cwd: root, encoding: "utf8", shell: true, stdio: "inherit" }
);
process.exit(r.status == null ? 1 : r.status);
