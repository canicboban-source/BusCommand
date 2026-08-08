/**
 * Build hierarchical interactive-element inventory + matrix skeleton for BusCommand.
 * Output: reports/full-function-inventory-YYYY-MM-DD.md|.json
 *         reports/full-function-matrix-YYYY-MM-DD.csv|.md
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function extractFromHtml(html, surface) {
  const items = [];
  const sectionRe = /id="([^"]+)"[^>]*class="[^"]*content-section/g;
  const sections = [];
  let m;
  while ((m = sectionRe.exec(html))) sections.push(m[1]);

  // Also catch sections with content-section in different attribute order
  const sectionRe2 = /class="[^"]*content-section[^"]*"[^>]*id="([^"]+)"/g;
  while ((m = sectionRe2.exec(html))) sections.push(m[1]);

  const actionRe = /data-action="([^"]+)"/g;
  const actions = [];
  while ((m = actionRe.exec(html))) actions.push(m[1]);

  const idRe = /\bid="(sa-[^"]+|ca-[^"]+|login-[^"]+|dispatcher-[^"]+|company-admin-[^"]+|ops-[^"]+|driver-[^"]+|group-hub-[^"]+|settings-[^"]+|bus-[^"]+|plan-[^"]+)"/g;
  const ids = [];
  while ((m = idRe.exec(html))) ids.push(m[1]);

  const inputRe = /<(input|select|textarea)\b([^>]*)>/gi;
  while ((m = inputRe.exec(html))) {
    const attrs = m[2];
    const id = (attrs.match(/\bid="([^"]+)"/) || [])[1] || "";
    const name = (attrs.match(/\bname="([^"]+)"/) || [])[1] || "";
    const type = (attrs.match(/\btype="([^"]+)"/) || [])[1] || m[1];
    const di = (attrs.match(/\bdata-i18n(?:-placeholder)?="([^"]+)"/) || [])[1] || "";
    items.push({
      kind: "field",
      surface,
      tag: m[1].toLowerCase(),
      type,
      id,
      name,
      i18n: di,
      action: null
    });
  }

  const btnRe = /<button\b([^>]*)>/gi;
  while ((m = btnRe.exec(html))) {
    const attrs = m[1];
    const id = (attrs.match(/\bid="([^"]+)"/) || [])[1] || "";
    const action = (attrs.match(/\bdata-action="([^"]+)"/) || [])[1] || "";
    const di = (attrs.match(/\bdata-i18n="([^"]+)"/) || [])[1] || "";
    items.push({
      kind: "button",
      surface,
      tag: "button",
      type: "button",
      id,
      name: di,
      i18n: di,
      action
    });
  }

  const aRe = /<a\b([^>]*)>/gi;
  while ((m = aRe.exec(html))) {
    const attrs = m[1];
    const href = (attrs.match(/\bhref="([^"]+)"/) || [])[1] || "";
    const action = (attrs.match(/\bdata-action="([^"]+)"/) || [])[1] || "";
    const id = (attrs.match(/\bid="([^"]+)"/) || [])[1] || "";
    if (action || (href && href !== "#" && !href.startsWith("javascript:"))) {
      items.push({
        kind: "link",
        surface,
        tag: "a",
        type: "link",
        id,
        name: href,
        i18n: "",
        action
      });
    }
  }

  return {
    sections: uniq(sections),
    actions: uniq(actions),
    ids: uniq(ids),
    items
  };
}

function extractRegistryActions(src) {
  const block = src.match(/const\s+\w*[Hh]andlers\s*=\s*\{([\s\S]*?)\n\};/);
  if (!block) {
    // register-onclick-staff style: object literal at end
    const m = src.match(/\{\s*\n([\s\S]*?)\n\s*\};?\s*$/);
    if (!m) return [];
    return uniq([...m[1].matchAll(/^\s*([A-Za-z_][\w]*)\s*,?\s*$/gm)].map((x) => x[1]));
  }
  return uniq([...block[1].matchAll(/^\s*([A-Za-z_][\w]*)\s*,?\s*$/gm)].map((x) => x[1]));
}

function roleForAction(action, sectionHint = "") {
  const a = action || "";
  const s = sectionHint || "";
  if (/^superadmin|sa_/i.test(a) || /superadmin/i.test(s)) return "superadmin";
  if (/^companyAdmin|^ca[A-Z]|company-admin|saveCompany|clearCompany/i.test(a) || /company-admin/i.test(s)) {
    return "company-admin";
  }
  if (/^driver|preTrip|quickReport|archiveDriver|confirmShift/i.test(a) || /driver/i.test(s)) return "driver";
  if (/login|logout|forgot|activation|changeLanguage|toggleTheme/i.test(a)) return "auth";
  return "dispatcher";
}

function screenForId(id, sections) {
  if (!id) return sections[0] || "unknown";
  const hit = sections.find((s) => id.includes(s) || s.includes(id.replace(/-/g, "")));
  if (hit) return hit;
  if (id.startsWith("sa-") || id.includes("superadmin")) return "superadmin-dashboard";
  if (id.startsWith("ca-") || id.includes("company-admin")) return "company-admin";
  if (id.startsWith("login-")) return "login-screen";
  if (id.includes("ops-") || id.includes("dispatcher-dashboard")) return "dispatcher-dashboard";
  if (id.includes("group-hub")) return "dispatcher-group-hub";
  return "misc";
}

const staffHtml = read("staff.html");
const driverHtml = read("driver.html");
const legacyHtml = fs.existsSync(path.join(root, "index.legacy-monolith.html"))
  ? read("index.legacy-monolith.html")
  : "";

const staff = extractFromHtml(staffHtml, "staff");
const driver = extractFromHtml(driverHtml, "driver");
const legacy = legacyHtml ? extractFromHtml(legacyHtml, "legacy") : { sections: [], actions: [], ids: [], items: [] };

const staffReg = extractRegistryActions(read("js/register-onclick-staff.js"));
let driverReg = [];
try {
  driverReg = extractRegistryActions(read("js/register-onclick.js"));
} catch {
  /* optional */
}

// Dynamic SA actions from source strings
const saSrc = read("js/admin/superadmin.js");
const saDynamic = uniq([
  ...[...saSrc.matchAll(/actionAttr\("([^"]+)"/g)].map((x) => x[1]),
  ...[...saSrc.matchAll(/data-action="([^"]+)"/g)].map((x) => x[1])
]);

const caFiles = [
  "js/admin/company-admin.js",
  "js/admin/company-admin-groups.js",
  "js/admin/company-admin-drivers.js",
  "js/admin/company-admin-team.js",
  "js/admin/company-admin-settings.js",
  "js/admin/company-admin-service-plan.js",
  "js/admin/company-admin-audit.js"
];
const caDynamic = [];
for (const f of caFiles) {
  if (!fs.existsSync(path.join(root, f))) continue;
  const src = read(f);
  caDynamic.push(...[...src.matchAll(/actionAttr\("([^"]+)"/g)].map((x) => x[1]));
  caDynamic.push(...[...src.matchAll(/data-action="([^"]+)"/g)].map((x) => x[1]));
}

const rows = [];
let seq = 1;
function addRow({
  role,
  screen,
  element,
  precondition,
  action,
  expected,
  test = "pending",
  result = "NOT VERIFIED",
  proof = ""
}) {
  const id = `F-${String(seq).padStart(4, "0")}`;
  seq += 1;
  rows.push({
    ID: id,
    Uloga: role,
    Ekran: screen,
    "Element/funkcija": element,
    Preduslov: precondition,
    Akcija: action,
    "Očekivani rezultat": expected,
    Test: test,
    Rezultat: result,
    Dokaz: proof
  });
}

// --- AUTH ---
const authFields = staff.items.filter((i) => i.kind === "field" && (i.id.startsWith("login-") || /password|email|pin|otp|activation/i.test(i.id)));
for (const f of authFields) {
  addRow({
    role: "auth",
    screen: "login-screen",
    element: `FIELD ${f.tag}/${f.type} #${f.id || f.name || "(anon)"}`,
    precondition: "staff.html + QA harness",
    action: "focus + valid/invalid input + submit path",
    expected: "Polje prihvata dozvoljen unos; invalid daje grešku; vrednost se ne šalje bez potvrde"
  });
}
const authBtns = staff.items.filter(
  (i) =>
    i.kind === "button" &&
    (/login|logout|forgot|tab-|theme|lang/i.test(i.id + i.action + i.i18n) ||
      ["logout", "changeLanguage", "toggleTheme"].includes(i.action))
);
for (const b of uniq(authBtns.map((x) => x.id || x.action || x.i18n))) {
  const item = authBtns.find((x) => (x.id || x.action || x.i18n) === b);
  addRow({
    role: "auth",
    screen: "login-screen / shell",
    element: `BUTTON #${item.id || ""} action=${item.action || item.i18n}`,
    precondition: "QA harness staff/driver surface",
    action: "click",
    expected: "Jedna očekivana akcija; nema duplikata; jasna povratna informacija"
  });
}

// Language select
addRow({
  role: "auth",
  screen: "login-screen",
  element: "SELECT #language-select / changeLanguage",
  precondition: "login vidljiv",
  action: "promena EN/DE/SR",
  expected: "UI labeli se menjaju; izbor ostaje u storage"
});

// --- SUPER ADMIN ---
const saSections = uniq([
  ...staff.sections.filter((s) => /superadmin|sa-/i.test(s)),
  "superadmin-dashboard",
  "sa-company-detail-modal",
  "sa-support-modal",
  "sa-delete-company-modal"
]);
for (const s of saSections) {
  addRow({
    role: "superadmin",
    screen: s,
    element: `SECTION ${s}`,
    precondition: "SA login sa@qa.local",
    action: "navigate / open",
    expected: "Sekcija vidljiva samo SA; podaci QA harness tenanta"
  });
}

const saActions = uniq([...staff.actions.filter((a) => /superadmin|sa/i.test(a)), ...saDynamic, ...staffReg.filter((a) => /superadmin/i.test(a))]);
for (const a of saActions.sort()) {
  addRow({
    role: "superadmin",
    screen: "superadmin-dashboard / modals",
    element: `ACTION ${a}`,
    precondition: "SA sesija; QA harness",
    action: "invoke via UI",
    expected: "Akcija radi u QA harness ili daje jasan toast; bez production login taba; RBAC poštovan"
  });
}

const saFields = staff.items.filter((i) => i.kind === "field" && (/^sa-|superadmin/i.test(i.id) || /sa-/i.test(i.id)));
for (const f of saFields) {
  addRow({
    role: "superadmin",
    screen: screenForId(f.id, staff.sections),
    element: `FIELD #${f.id} (${f.type})`,
    precondition: "SA modal/forma otvorena",
    action: "valid + invalid + unicode + save/cancel",
    expected: "Validacija + persistence u QA local state / API gde važi"
  });
}

// Explicit critical Open/Inspect/Close
for (const [el, act, exp] of [
  ["FOOTER Open/Inspect #sa-detail-open-app-btn", "click Open", "QA: Inspect read-only; NE otvara production login tab"],
  ["FOOTER Close company detail", "click Close / Escape", "Modal zatvoren; bez side-effect save"],
  ["CARD Details → company detail", "click Details", "Modal za izabranu firmu; tačan companyId"],
  ["Inspect dispatcher", "click Inspect", "Read-only Dispo; SA modal zatvoren"],
  ["Reset password / PIN", "click Reset", "QA password reset; login i dalje radi"],
  ["Save demo profile email/country", "edit + Save", "Vrednosti sačuvane u state; refresh zadržava"],
  ["Save company settings", "edit + Save", "QA toast ili auditovani patch"],
  ["Start/End support", "click", "Support sesija state / toast"],
  ["Suspend/Activate company", "click + confirm", "Status badge ažuriran"],
  ["Delete company", "confirm ID", "Firma uklonjena iz liste"],
  ["Create company", "fill + Register", "Nova firma u listi"],
  ["Create company admin", "fill + Add", "CA u listi; firma active"],
  ["Copy company ID", "click copy", "Clipboard / toast"]
]) {
  addRow({
    role: "superadmin",
    screen: "superadmin-dashboard",
    element: el,
    precondition: "SA login",
    action: act,
    expected: exp
  });
}

// --- COMPANY ADMIN ---
const caSections = uniq(staff.sections.filter((s) => /company-admin/i.test(s)));
for (const s of caSections) {
  addRow({
    role: "company-admin",
    screen: s,
    element: `SECTION ${s}`,
    precondition: "CA login ca@qa.local",
    action: "switchSection",
    expected: "Sekcija vidljiva CA; bez Dispo credential polja"
  });
}
const caActions = uniq([
  ...staff.actions.filter((a) => /companyAdmin|Company|ca[A-Z]|branding|servicePlan|group/i.test(a)),
  ...caDynamic,
  ...staffReg.filter((a) => /companyAdmin|Company|branding|Group|Driver|Dispatcher|servicePlan|Audit|Export/i.test(a))
]);
for (const a of caActions.sort()) {
  addRow({
    role: "company-admin",
    screen: "company-admin-*",
    element: `ACTION ${a}`,
    precondition: "CA sesija",
    action: "invoke via UI",
    expected: "Tenant-scoped uspeh ili jasna greška; Dispo-only monthly import odbijen (403)"
  });
}
const caFields = staff.items.filter((i) => i.kind === "field" && (/^ca-|settings-|company-admin/i.test(i.id)));
for (const f of caFields) {
  addRow({
    role: "company-admin",
    screen: screenForId(f.id, staff.sections),
    element: `FIELD #${f.id} (${f.type})`,
    precondition: "CA odgovarajuća sekcija",
    action: "valid/invalid/unicode/save/cancel/refresh",
    expected: "Kompletan field tok; server/QA persistence"
  });
}

// --- DISPATCHER ---
const dispoSections = uniq(
  staff.sections.filter(
    (s) =>
      /dispatcher|ops-|group-hub|daily|monthly|vehicle|message|vacation|lost|report|shift|line/i.test(s) &&
      !/company-admin|superadmin/i.test(s)
  )
);
for (const s of dispoSections) {
  addRow({
    role: "dispatcher",
    screen: s,
    element: `SECTION ${s}`,
    precondition: "Dispo login dispo@qa.local",
    action: "navigate",
    expected: "Samo dodeljene grupe; ops podaci tačni"
  });
}
const dispoActions = uniq(
  staffReg.filter((a) => {
    const role = roleForAction(a);
    return role === "dispatcher";
  })
);
for (const a of dispoActions.sort()) {
  addRow({
    role: "dispatcher",
    screen: "dispatcher ops",
    element: `ACTION ${a}`,
    precondition: "Dispo sesija + dodeljena grupa",
    action: "invoke",
    expected: "Mutacija u okviru grupe; cross-group/tenant zabranjen"
  });
}
const dispoFields = staff.items.filter(
  (i) =>
    i.kind === "field" &&
    !/^sa-|^ca-|^login-|^settings-brand|^settings-primary/i.test(i.id) &&
    (/dispatcher|ops|bus|plan|msg|vacation|daily|monthly|hub|shift|report|lost/i.test(i.id) || !i.id)
);
// Cap anonymous fields noise — only named
for (const f of dispoFields.filter((x) => x.id)) {
  addRow({
    role: "dispatcher",
    screen: screenForId(f.id, staff.sections),
    element: `FIELD #${f.id} (${f.type})`,
    precondition: "Dispo odgovarajući ekran",
    action: "field full checklist",
    expected: "Validacija + save persistence gde važi"
  });
}

// --- DRIVER ---
const driverSections = uniq(driver.sections);
for (const s of driverSections) {
  addRow({
    role: "driver",
    screen: s,
    element: `SECTION ${s}`,
    precondition: "driver.html + QA harness + login",
    action: "navigate",
    expected: "Samo sopstveni podaci"
  });
}
for (const a of uniq([...driver.actions, ...driverReg]).sort()) {
  addRow({
    role: "driver",
    screen: "driver portal",
    element: `ACTION ${a}`,
    precondition: "Driver sesija",
    action: "invoke",
    expected: "Samo sopstveni resursi; tuđi ID → forbid"
  });
}
for (const f of driver.items.filter((i) => i.kind === "field" && i.id)) {
  addRow({
    role: "driver",
    screen: screenForId(f.id, driver.sections),
    element: `FIELD #${f.id} (${f.type})`,
    precondition: "Driver forma/modal",
    action: "field checklist",
    expected: "PIN/OTP/report polja validirana; persistence gde treba"
  });
}
for (const b of driver.items.filter((i) => i.kind === "button" && (i.id || i.action || i.i18n))) {
  addRow({
    role: "driver",
    screen: "driver portal",
    element: `BUTTON #${b.id || ""} action=${b.action || b.i18n || ""}`,
    precondition: "Driver UI",
    action: "click",
    expected: "Jedna akcija; loading/error/success stanja"
  });
}
// Form submit / hold controls without data-action still need matrix rows (must work or be removed)
for (const el of [
  "BUTTON #driver-activation-submit type=submit",
  "BUTTON .btn-delay-submit type=submit",
  "BUTTON .btn-breakdown-submit type=submit",
  "BUTTON .btn-lost-submit type=submit",
  "BUTTON #mobnav-sos data-sos-hold"
]) {
  addRow({
    role: "driver",
    screen: "driver portal",
    element: el,
    precondition: "Driver UI",
    action: "click / hold / submit",
    expected: "Forma šalje ili SOS hold radi; bez mrtvog dugmeta"
  });
}

// PWA
for (const el of [
  "manifest-driver.webmanifest",
  "sw-driver.js scope",
  "offline snapshot freshness",
  "install prompt (desktop may BLOCKED)",
  "update existing PWA (device BLOCKED if no device)"
]) {
  addRow({
    role: "driver",
    screen: "PWA",
    element: el,
    precondition: "driver surface",
    action: "inspect / offline toggle",
    expected: "SW/manifest prisutni; offline ne prikazuje zastarelo kao aktuelno"
  });
}

// FLOW rows
const flows = [
  ["FLOW-AUTH-SA", "auth", "SA login → dashboard → logout", "sa@qa.local"],
  ["FLOW-AUTH-CA", "auth", "CA login → overview → logout", "ca@qa.local"],
  ["FLOW-AUTH-DISPO", "auth", "Dispo login → ops → logout", "dispo@qa.local"],
  ["FLOW-AUTH-DRIVER", "auth", "Driver select+PIN → pretrip → app", "QA driver"],
  ["FLOW-V66-LIVE-IMPORT", "dispatcher", "V66 live import mesečnog plana", "V66 — čeka fajl vlasnika"],
  ["FLOW-SA-OPEN", "superadmin", "Details → Open/Inspect → Exit inspect", "SA"],
  ["FLOW-CA-GROUP", "company-admin", "create group → edit → filter → delete empty", "CA"],
  ["FLOW-CA-DRIVER-IMPORT", "company-admin", "import CSV → list → filter", "CA"],
  ["FLOW-CA-BRANDING", "company-admin", "edit brand → validate → save → refresh", "CA"],
  ["FLOW-DISPO-ATTN-BUS", "dispatcher", "missing bus → assign → card gone", "Dispo"],
  ["FLOW-DISPO-VACATION", "dispatcher", "pending vacation → approve/reject", "Dispo"],
  ["FLOW-DISPO-MSG", "dispatcher", "compose message → send → archive visible", "Dispo"],
  ["FLOW-DISPO-MONTHLY", "dispatcher", "monthly import preview → apply", "Dispo"],
  ["FLOW-DRIVER-REPORT", "driver", "quick report → appears for dispo", "Driver+Dispo"],
  ["FLOW-ISOLATION-TENANT", "security", "foreign companyId not visible/API forbid", "multi fixture"],
  ["FLOW-ISOLATION-GROUP", "security", "unassigned group inaccessible", "dispo scope"]
];
for (const [idHint, role, element, pre] of flows) {
  addRow({
    role,
    screen: idHint,
    element: `FLOW ${element}`,
    precondition: pre,
    action: "end-to-end business path",
    expected: "Početak → obrada → kraj; greška/mreža kontrolisana; refresh potvrđuje"
  });
}

// Deduplicate near-identical rows by element+role+screen
const seen = new Set();
const deduped = [];
for (const r of rows) {
  const key = `${r.Uloga}|${r.Ekran}|${r["Element/funkcija"]}|${r.Akcija}`;
  if (seen.has(key)) continue;
  seen.add(key);
  deduped.push(r);
}
// Re-number
deduped.forEach((r, i) => {
  r.ID = `F-${String(i + 1).padStart(4, "0")}`;
});

const outDir = path.join(root, "reports");
fs.mkdirSync(outDir, { recursive: true });

const invPath = path.join(outDir, `full-function-inventory-${today}.md`);
const jsonPath = path.join(outDir, `full-function-inventory-${today}.json`);
const csvPath = path.join(outDir, `full-function-matrix-${today}.csv`);
const mdMatrix = path.join(outDir, `full-function-matrix-${today}.md`);

const inventory = {
  generatedAt: new Date().toISOString(),
  surfaces: {
    staff: { sections: staff.sections, actionCount: staff.actions.length, fieldApprox: staff.items.filter((i) => i.kind === "field").length },
    driver: { sections: driver.sections, actionCount: driver.actions.length },
    registryStaff: staffReg.length,
    saDynamic: saDynamic.length,
    caDynamic: uniq(caDynamic).length
  },
  sectionsStaff: staff.sections,
  sectionsDriver: driver.sections,
  rowCount: deduped.length
};

fs.writeFileSync(jsonPath, JSON.stringify({ inventory, rows: deduped }, null, 2));

const invMd = [
  `# Inventar funkcija BusCommand — ${today}`,
  "",
  "## Sažetak",
  `- Staff sekcije: ${staff.sections.length}`,
  `- Driver sekcije: ${driver.sections.length}`,
  `- Staff registry akcija: ${staffReg.length}`,
  `- SA dinamičke akcije: ${saDynamic.length}`,
  `- CA dinamičke akcije: ${uniq(caDynamic).length}`,
  `- Redova u matrici (dedup): ${deduped.length}`,
  "",
  "## Staff sekcije",
  ...staff.sections.map((s) => `- \`${s}\``),
  "",
  "## Driver sekcije",
  ...driver.sections.map((s) => `- \`${s}\``),
  "",
  "## SA akcije",
  ...saActions.map((a) => `- \`${a}\``),
  "",
  `Mašinski JSON: \`${path.basename(jsonPath)}\``,
  `Matrica CSV: \`${path.basename(csvPath)}\``
].join("\n");
fs.writeFileSync(invPath, invMd);

const headers = ["ID", "Uloga", "Ekran", "Element/funkcija", "Preduslov", "Akcija", "Očekivani rezultat", "Test", "Rezultat", "Dokaz"];
const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const csv = [headers.join(","), ...deduped.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
fs.writeFileSync(csvPath, csv);

const byRole = {};
for (const r of deduped) {
  byRole[r.Uloga] = (byRole[r.Uloga] || 0) + 1;
}
const md = [
  `# Matrica sljedivosti funkcija — ${today}`,
  "",
  "## Brojevi (pre izvršenja testova)",
  `- Ukupno redova: **${deduped.length}**`,
  `- NOT VERIFIED (početno): **${deduped.length}**`,
  `- Po ulozi: ${Object.entries(byRole).map(([k, v]) => `${k}=${v}`).join(", ")}`,
  "",
  "> Rezultati se ažuriraju skriptom `scripts/run-function-matrix.mjs` i ručnim prolazima.",
  "",
  "## Kolone",
  "",
  "| " + headers.join(" | ") + " |",
  "| " + headers.map(() => "---").join(" | ") + " |",
  ...deduped.slice(0, 80).map((r) => "| " + headers.map((h) => String(r[h]).replace(/\|/g, "/")).join(" | ") + " |"),
  "",
  deduped.length > 80 ? `_… još ${deduped.length - 80} redova u CSV/JSON._` : "",
  "",
  `Pun CSV: \`${path.basename(csvPath)}\``
].join("\n");
fs.writeFileSync(mdMatrix, md);

// Also write stable names expected by plan
fs.writeFileSync(path.join(outDir, "full-function-matrix.md"), md);
fs.copyFileSync(csvPath, path.join(outDir, "full-function-matrix.csv"));
fs.copyFileSync(jsonPath, path.join(outDir, "full-function-inventory.json"));

console.log(JSON.stringify({ invPath, csvPath, rows: deduped.length, byRole }, null, 2));
