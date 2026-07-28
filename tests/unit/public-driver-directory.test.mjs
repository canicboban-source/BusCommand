import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("public driver directory is disabled; production login uses EID identify", async () => {
  const [routes, selects, login] = await Promise.all([
    read("../../server/driver-routes.js"),
    read("../../js/auth/login-selects.js"),
    read("../../js/auth/login-driver.js")
  ]);

  assert.match(routes, /PUBLIC_DRIVER_DIRECTORY_DISABLED/);
  assert.match(routes, /status\(410\)/);
  assert.match(routes, /\/api\/public\/drivers\/identify/);
  assert.doesNotMatch(routes, /collection\("drivers"\)\.where\("active"/);

  assert.match(selects, /IS_DEMO_MODE/);
  assert.match(selects, /configureProductionDriverLoginFields/);
  assert.doesNotMatch(selects, /\/api\/public\/companies\/\$\{encodeURIComponent\(COMPANY_ID\)\}\/drivers/);

  assert.match(login, /login_eid_required_toast|Unesite EID/);
  assert.match(login, /\/api\/public\/drivers\/identify/);
});
