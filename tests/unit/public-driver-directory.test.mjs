import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("no unauthenticated endpoint answers questions about who works here", async () => {
  const [routes, selects, login, authClient] = await Promise.all([
    read("../../server/driver-routes.js"),
    read("../../js/auth/login-selects.js"),
    read("../../js/auth/login-driver.js"),
    read("../../js/core/auth-client.js")
  ]);

  // The roster dump and the EID lookup are both retired; each answers 410.
  assert.match(routes, /PUBLIC_DRIVER_DIRECTORY_DISABLED/);
  assert.match(routes, /DRIVER_IDENTIFY_DISABLED/);
  assert.doesNotMatch(routes, /collection\("drivers"\)\.where\("active"/);

  // Nothing in the login path may resolve a driver before authentication.
  assert.doesNotMatch(login, /\/api\/public\/drivers\/identify/);
  assert.doesNotMatch(authClient, /\/api\/public\/drivers\/identify/);
  assert.match(authClient, /body: JSON\.stringify\(\{ companyId, eid, loginCode \}\)/);

  assert.match(selects, /USE_LOCAL_STATE/);
  assert.match(selects, /configureProductionDriverLoginFields/);
  assert.doesNotMatch(selects, /\/api\/public\/companies\/\$\{encodeURIComponent\(COMPANY_ID\)\}\/drivers/);

  assert.match(login, /login_eid_required_toast/);
});
