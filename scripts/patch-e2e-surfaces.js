const fs = require("fs");
const path = require("path");

function patchFile(rel, replacer) {
  const p = path.join(__dirname, "..", rel);
  const before = fs.readFileSync(p, "utf8");
  const after = replacer(before);
  fs.writeFileSync(p, after);
  console.log("patched", rel, before === after ? "(no change)" : "OK");
}

patchFile("tests/e2e/ui-smoke.spec.js", (s) => {
  s = s.replaceAll('await page.goto("/?mode=demo");', 'await page.goto("/staff.html?mode=demo");');
  s = s.replaceAll(
    'await page.goto("/?mode=demo", { waitUntil: "networkidle" });',
    'await page.goto("/staff.html?mode=demo", { waitUntil: "networkidle" });'
  );
  s = s.replaceAll('await page.goto("/?mode=production");', 'await page.goto("/staff.html?mode=production");');
  s = s.replaceAll(
    'await page.goto("/?mode=production", { waitUntil: "networkidle" });',
    'await page.goto("/staff.html?mode=production", { waitUntil: "networkidle" });'
  );
  // First production closed test asserts driver login code label → driver surface
  s = s.replace(
    'test("production mode fails closed without Preview Firebase variables", async ({ page }) => {\n    await page.addInitScript(() => localStorage.setItem("buscommand_lang", "en"));\n    await page.goto("/staff.html?mode=production");',
    'test("production mode fails closed without Preview Firebase variables", async ({ page }) => {\n    await page.addInitScript(() => localStorage.setItem("buscommand_lang", "en"));\n    await page.goto("/driver.html?mode=production");'
  );
  return s;
});

patchFile("tests/e2e/line-310.spec.js", (s) =>
  s.replaceAll('await page.goto("/?mode=demo");', 'await page.goto("/staff.html?mode=demo");')
);
