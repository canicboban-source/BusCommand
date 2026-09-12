const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "../..");
const INDEX = path.join(ROOT, "index.html");
const LANDING_SRC = path.join(ROOT, "scripts/landing/official-landing.html");

test("official landing source is the rich presentation, not a two-button card", () => {
  assert.ok(fs.existsSync(LANDING_SRC), "scripts/landing/official-landing.html missing");
  const src = fs.readFileSync(LANDING_SRC, "utf8");
  for (const needle of [
    'id="top"',
    'id="compare"',
    'id="downloads"',
    'id="pricing"',
    'data-lang="de"',
    'data-lang="sr"',
    'data-lang="en"',
    "/downloads/BusCommand_Technical_Security_Audit.html",
    "/downloads/BusCommand_Monthly_Shift_Plan_Template.csv",
    "/downloads/BusCommand_Fleet_Vehicles_Template.csv",
    "/downloads/BusCommand_DPA_GDPR_Article_28.html",
    'href="/staff"',
    'href="/driver"',
    "Excel",
    "Cenovnik",
    "Preise",
    "Pricing"
  ]) {
    assert.match(src, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(src, /<main class="card">/);
});

test("generated index.html serves the official landing presentation", () => {
  assert.ok(fs.existsSync(INDEX), "index.html missing");
  const html = fs.readFileSync(INDEX, "utf8");
  assert.match(html, /id="compare"/);
  assert.match(html, /id="downloads"/);
  assert.match(html, /id="pricing"/);
  assert.match(html, /lang-switch/);
  assert.match(html, /data-lang="de"/);
  assert.match(html, /data-lang="sr"/);
  assert.match(html, /data-lang="en"/);
  assert.match(html, /\/downloads\/BusCommand_Technical_Security_Audit.html/);
  assert.doesNotMatch(html, /<main class="card">[\s\S]*Staff login[\s\S]*Driver app[\s\S]*<\/main>/);
});

test("build-surface-html reads official landing source instead of inline minimal card", () => {
  const build = fs.readFileSync(path.join(ROOT, "scripts/build-surface-html.js"), "utf8");
  assert.match(build, /official-landing\.html/);
  assert.doesNotMatch(build, /Fleet operations for bus companies — dispatch, monthly plans/);
});

test("landing pricing section includes Micro package in all languages", () => {
  const src = fs.readFileSync(LANDING_SRC, "utf8");
  // HTML card
  assert.match(src, /id="cta-micro"/);
  assert.match(src, /id="p-sub-micro"/);
  assert.match(src, /id="feat-micro"/);
  assert.match(src, /id="price-per-micro"/);
  // SR pack
  assert.match(src, /pSubMicro: "Do 5 vozila i 8 vozača\."/);
  assert.match(src, /ctaMicro: "Izaberi Micro"/);
  // DE pack
  assert.match(src, /pSubMicro: "Bis 5 Fahrzeuge und 8 Fahrer\."/);
  assert.match(src, /ctaMicro: "Micro wählen"/);
  // EN pack
  assert.match(src, /pSubMicro: "Up to 5 vehicles and 8 drivers\."/);
  assert.match(src, /ctaMicro: "Choose Micro"/);
  // setLang wires it
  assert.match(src, /getElementById\('cta-micro'\)/);
  assert.match(src, /getElementById\('p-sub-micro'\)/);
  assert.match(src, /getElementById\('feat-micro'\)/);
});

test("official landing has complete declarative i18n hooks, fixed sys-title, and clean hero structure", () => {
  const src = fs.readFileSync(LANDING_SRC, "utf8");
  assert.match(src, /hero-stage-inner/);
  assert.match(src, /id="sys-title"/);
  assert.doesNotMatch(src, /Nema potrvrde smene/);
  assert.match(src, /Nema potvrde smene/);
  // Check comparison items
  for (let i = 1; i <= 5; i++) {
    assert.match(src, new RegExp(`data-i18n="cmpC1B${i}"`));
    assert.match(src, new RegExp(`data-i18n="cmpC3B${i}"`));
  }
  for (let i = 1; i <= 4; i++) {
    assert.match(src, new RegExp(`data-i18n="cmpC2B${i}"`));
  }
  // Check pilot form hooks
  assert.match(src, /data-i18n-placeholder="pCompPlaceholder"/);
  assert.match(src, /data-i18n-placeholder="pNamePlaceholder"/);
  assert.match(src, /data-i18n-placeholder="pEmailPlaceholder"/);
  assert.match(src, /data-i18n-placeholder="pMsgPlaceholder"/);
  assert.match(src, /data-i18n="pilotSubmit"/);
});

test("all data-i18n keys exist across SR, EN, and DE dictionaries", () => {
  const src = fs.readFileSync(LANDING_SRC, "utf8");
  const m = src.match(/const translations = ({[\s\S]*?});\s*function setLanguage/);
  assert.ok(m, "translations object missing in source");
  const translations = (new Function(`return ${m[1]}`))();
  assert.ok(translations.sr && translations.en && translations.de);

  const attrRegex = /data-i18n(?:-placeholder|-title|-aria-label)?="([^"]+)"/g;
  let match;
  const keys = new Set();
  while ((match = attrRegex.exec(src)) !== null) {
    keys.add(match[1]);
  }

  assert.ok(keys.size >= 50, `Expected at least 50 i18n keys, found ${keys.size}`);
  for (const key of keys) {
    assert.ok(translations.sr[key] !== undefined, `Key "${key}" missing in SR translations`);
    assert.ok(translations.en[key] !== undefined, `Key "${key}" missing in EN translations`);
    assert.ok(translations.de[key] !== undefined, `Key "${key}" missing in DE translations`);
  }
});

test("every landing title tooltip is translated, not hardcoded Serbian", () => {
  const src = fs.readFileSync(LANDING_SRC, "utf8");
  const tagsWithTitle = [...src.matchAll(/<[a-zA-Z][^>]*\stitle="([^"]*)"[^>]*>/g)];
  assert.ok(tagsWithTitle.length >= 3, `Expected at least 3 title tooltips, found ${tagsWithTitle.length}`);
  for (const [tag, value] of tagsWithTitle) {
    assert.match(
      tag,
      /data-i18n-title="[^"]+"/,
      `Tooltip title="${value}" has no data-i18n-title key, so it stays Serbian in EN and DE`
    );
  }

  const m = src.match(/const translations = ({[\s\S]*?});\s*function setLanguage/);
  assert.ok(m, "translations object missing in source");
  const translations = (new Function(`return ${m[1]}`))();
  for (const key of ["pinAlertTitle", "pinStandbyTitle", "pinEnRouteTitle"]) {
    for (const lang of ["sr", "de", "en"]) {
      assert.ok(translations[lang][key], `translations.${lang}.${key} is missing`);
    }
  }
  // Serbian-only status wording must not survive in EN or DE. Driver names are proper
  // nouns and stay identical in every locale, as does "Standby" in SR and EN.
  for (const lang of ["en", "de"]) {
    assert.doesNotMatch(translations[lang].pinAlertTitle, /Nedostupan/, `${lang} pin alert tooltip still says Nedostupan`);
    assert.doesNotMatch(translations[lang].pinEnRouteTitle, /vožnji/, `${lang} en-route tooltip still says "U vožnji"`);
    assert.notEqual(translations[lang].pinAlertTitle, translations.sr.pinAlertTitle, `${lang} pin alert tooltip is untranslated`);
    assert.notEqual(translations[lang].pinEnRouteTitle, translations.sr.pinEnRouteTitle, `${lang} en-route tooltip is untranslated`);
  }
});

test("compare claims use accurate, verified wording without absolute marketing claims or Truck ERP", () => {
  const src = fs.readFileSync(LANDING_SRC, "utf8");
  assert.doesNotMatch(src, /Generic Truck ERP/);
  assert.doesNotMatch(src, /No legally compliant audit trail/);
  assert.doesNotMatch(src, /1-tap driver replacement in under 30s/);
  assert.doesNotMatch(src, /Nema zakonskog revizionog traga/);
  assert.doesNotMatch(src, /Kein gesetzlicher Revisionsnachweis/);

  assert.match(src, /No consistent, searchable audit history/);
  assert.match(src, /Fast guided driver replacement workflow/);
  assert.match(src, /Nema jedinstvene i pretražive istorije izmena/);
  assert.match(src, /Brz i vođen postupak zamene vozača/);
  assert.match(src, /Keine einheitliche, durchsuchbare Änderungshistorie/);
  assert.match(src, /Schneller, geführter Fahrerersatz/);
});

test("pilot program terminology and German role micro-polish in official landing", () => {
  const src = fs.readFileSync(LANDING_SRC, "utf8");
  // Pilot badge
  assert.match(src, /pilotBadge:\s*"BESPLATAN PILOT OD 30 DANA"/);
  assert.match(src, /pilotBadge:\s*"30-DAY FREE PILOT"/);
  assert.match(src, /pilotBadge:\s*"KOSTENLOSER 30-TAGE-PILOT"/);

  // Pilot title
  assert.match(src, /pilotTitle:\s*"Prijavite se za 30-dnevni pilot"/);
  assert.match(src, /pilotTitle:\s*"Apply for your 30-day pilot"/);
  assert.match(src, /pilotTitle:\s*"30-Tage-Pilot anfragen"/);

  // Pilot submit
  assert.match(src, /pilotSubmit:\s*"Pošaljite prijavu za pilot"/);
  assert.match(src, /pilotSubmit:\s*"Submit pilot request"/);
  assert.match(src, /pilotSubmit:\s*"Pilot-Anfrage senden"/);

  // German micro-polish
  assert.match(src, /dispoCockpitHead:\s*"DISPO-LEITSTAND"/);
  assert.match(src, /badgePlanLock:\s*"Plan-Lock-Konfliktschutz"/);
  assert.doesNotMatch(src, /Plan-Lock Konfliktschutz/);
});

test("mobile bus visual asset and typography smoothing in official landing", () => {
  const src = fs.readFileSync(LANDING_SRC, "utf8");
  const css = fs.readFileSync(path.join(ROOT, "css/landing.css"), "utf8");

  // Mobile bus element in HTML
  assert.match(src, /id="hero-mobile-visual"/);
  assert.match(src, /id="hero-mobile-bus"/);
  assert.match(src, /src="\/brand\/hero-clean-1920x1080\.jpg"/);
  assert.match(src, /id="brand-logo"/);
  assert.match(src, /src="\/brand\/buscommand-logo-reference\.png"/);

  // CSS desktop hide & mobile activation
  assert.match(css, /\.hero-mobile-visual\s*\{\s*display:\s*none;\s*\}/);
  assert.match(css, /\.hero-mobile-visual\s*\{[\s\S]*display:\s*block;[\s\S]*height:\s*170px;/);
  assert.match(css, /-webkit-font-smoothing:\s*antialiased;/);
  assert.match(css, /-moz-osx-font-smoothing:\s*grayscale;/);
});

test("no forbidden C0 control characters in landing source or generated index", () => {
  // Allowed: TAB (0x09), LF (0x0A), CR (0x0D). All other U+0000-U+001F are forbidden.
  // Scanned by code point rather than by regex: a literal control-character class
  // trips eslint no-control-regex, and offsets make a failure actionable.
  for (const [label, filePath] of [
    ["scripts/landing/official-landing.html", LANDING_SRC],
    ["index.html", INDEX],
    ["css/landing.css", path.join(ROOT, "css/landing.css")],
  ]) {
    const text = fs.readFileSync(filePath, "utf8");
    const offenders = [];
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code <= 0x1f && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
        offenders.push(`offset ${i}: U+${code.toString(16).toUpperCase().padStart(4, "0")}`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `${label} contains forbidden C0 control characters (U+0000-U+001F excluding TAB/LF/CR): ${offenders.join(", ")}`
    );
    // U+0018 (CANCEL) previously leaked into the closeCtaTop CTA label.
    assert.ok(!text.includes("\u0018"), `${label} still contains U+0018 CANCEL`);
    // A C0 character must not survive HTML-entity encoded either.
    assert.doesNotMatch(text, /&#0*(?:[0-9]|1[0-9]|2[0-9]|3[01]);/, `${label} has a decimal C0 entity`);
    assert.doesNotMatch(text, /&#[xX]0*1[89aAbBcCdDeEfF];/, `${label} has a hex C0 entity`);
  }
});

test("every translated landing string is free of C0 control characters", () => {
  const src = fs.readFileSync(LANDING_SRC, "utf8");
  const m = src.match(/const translations = ({[\s\S]*?});\s*function setLanguage/);
  assert.ok(m, "translations object missing in source");
  const translations = (new Function(`return ${m[1]}`))();

  let scanned = 0;
  for (const [lang, pack] of Object.entries(translations)) {
    for (const [key, value] of Object.entries(pack)) {
      if (typeof value !== "string") continue;
      scanned++;
      for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        const allowed = code === 0x09 || code === 0x0a || code === 0x0d;
        assert.ok(
          code > 0x1f || allowed,
          `translations.${lang}.${key} contains U+${code.toString(16).toUpperCase().padStart(4, "0")} at index ${i}`
        );
      }
      assert.ok(!value.includes("\u0018"), `translations.${lang}.${key} contains U+0018 CANCEL`);
    }
  }
  assert.ok(scanned >= 150, `Expected to scan at least 150 translated strings, scanned ${scanned}`);
});

test("closeCtaTop ends with valid Unicode upward arrow U+2191 in all dictionaries", () => {
  const src = fs.readFileSync(LANDING_SRC, "utf8");
  const matches = [...src.matchAll(/closeCtaTop:\s*"([^"]+)"/g)];
  assert.ok(matches.length >= 3, "Expected at least 3 closeCtaTop dictionary entries (SR, DE, EN)");
  for (const m of matches) {
    const val = m[1];
    assert.ok(
      val.endsWith("\u2191"),
      `closeCtaTop dictionary value "${val}" does not end with up-arrow U+2191`
    );
  }
  assert.match(src, /closeCtaTop">[^<]*\u2191<\/a>/, "Static HTML closeCtaTop CTA should end with U+2191 arrow");
});

test("public landing demo identities are generic role numbers, not personal or operational customer data", () => {
  const src = fs.readFileSync(LANDING_SRC, "utf8");
  const html = fs.readFileSync(INDEX, "utf8");
  const css = fs.readFileSync(path.join(ROOT, "css/landing.css"), "utf8");

  const FORBIDDEN = [
    "Marko Petrović", "Marko P.", "Luka Kovačević", "Luka K.",
    "Petrović", "Kovačević",
    "320.s01", "320.S01", "Duty 320", "VOR 320", "VOR 321",
    "BC 5676-BC", "BC 9012",
    "Lasta", "RegioBus", "City Transit"
  ];
  for (const [label, text] of [
    ["scripts/landing/official-landing.html", src],
    ["index.html", html],
  ]) {
    for (const token of FORBIDDEN) {
      assert.ok(
        !text.includes(token),
        `${label} still contains public identifier ${JSON.stringify(token)}`
      );
    }
  }

  const m = src.match(/const translations = ({[\s\S]*?});\s*function setLanguage/);
  assert.ok(m, "translations object missing in source");
  const translations = (new Function(`return ${m[1]}`))();

  const IDENTITY = {
    sr: {
      mockDriverName: "Vozač 01",
      pwaDriverAssigned: "Vozač 01",
      pinAlertTitle: "Smena 001 - Vozač 01 (Nedostupan)",
      pinStandbyTitle: "Zamenski vozač 02 (Standby)",
      pinEnRouteTitle: "Vozilo 002 (U vožnji)",
      radarActHead: "Dodeliti: Zamenski vozač 02",
      valLineDeparture: "Linija 001 · 05:25",
      valBusNumber: "Vozilo 001",
      valTodayDuty: "Smena 001 · 05:25",
      valGroupOverview: "Grupa 01, Grupa 02, Noćne linije",
      pCompPlaceholder: "npr. Kompanija 01"
    },
    en: {
      mockDriverName: "Driver 01",
      pwaDriverAssigned: "Driver 01",
      pinAlertTitle: "Duty 001 - Driver 01 (Unavailable)",
      pinStandbyTitle: "Replacement Driver 02 (Standby)",
      pinEnRouteTitle: "Vehicle 002 (En route)",
      radarActHead: "Assign: Replacement Driver 02",
      valLineDeparture: "Route 001 · 05:25",
      valBusNumber: "Vehicle 001",
      valTodayDuty: "Duty 001 · 05:25",
      valGroupOverview: "Group 01, Group 02, Night lines",
      pCompPlaceholder: "e.g. Company 01"
    },
    de: {
      mockDriverName: "Fahrer 01",
      pwaDriverAssigned: "Fahrer 01",
      pinAlertTitle: "Dienst 001 - Fahrer 01 (Nicht verfügbar)",
      pinStandbyTitle: "Ersatzfahrer 02 (Bereitschaft)",
      pinEnRouteTitle: "Fahrzeug 002 (Unterwegs)",
      radarActHead: "Zuweisen: Ersatzfahrer 02",
      valLineDeparture: "Linie 001 · 05:25",
      valBusNumber: "Fahrzeug 001",
      valTodayDuty: "Dienst 001 · 05:25",
      valGroupOverview: "Gruppe 01, Gruppe 02, Nachtlinien",
      pCompPlaceholder: "z.B. Unternehmen 01"
    }
  };

  const APPROVED = {
    sr: /^(Vozač 01|Zamenski vozač 02|Dispečer 01|Smena 001|Linija 001|Vozilo 00[12]|Grupa 0[12]|Depo A|Stanica 01|Kompanija 01)$/,
    en: /^(Driver 01|Replacement Driver 02|Dispatcher 01|Duty 001|Route 001|Vehicle 00[12]|Group 0[12]|Depot A|Stop 01|Company 01)$/,
    de: /^(Fahrer 01|Ersatzfahrer 02|Disponent 01|Dienst 001|Linie 001|Fahrzeug 00[12]|Gruppe 0[12]|Betriebshof A|Haltestelle 01|Unternehmen 01)$/
  };

  for (const lang of ["sr", "en", "de"]) {
    for (const [key, expected] of Object.entries(IDENTITY[lang])) {
      assert.equal(
        translations[lang][key],
        expected,
        `translations.${lang}.${key} must be the approved generic identity`
      );
    }
  }

  // Core identity values themselves (not surrounding status words) must stay in the approved format.
  for (const lang of ["sr", "en", "de"]) {
    for (const key of ["mockDriverName", "valBusNumber"]) {
      assert.match(translations[lang][key], APPROVED[lang], `${lang}.${key} is not an approved generic identifier`);
    }
  }

  // EN/DE dictionaries must not carry Serbian demo identities, and DE must not carry English ones.
  for (const key of Object.keys(IDENTITY.en)) {
    assert.notEqual(translations.en[key], translations.sr[key], `EN ${key} still equals the Serbian value`);
    assert.notEqual(translations.de[key], translations.sr[key], `DE ${key} still equals the Serbian value`);
    assert.notEqual(translations.de[key], translations.en[key], `DE ${key} still equals the English value`);
  }

  // storyData / systemData are JS-generated public demo content and must be scanned too.
  const story = src.match(/const storyData = ({[\s\S]*?});\s*function setStoryStep/);
  assert.ok(story, "storyData missing");
  const storyData = (new Function(`return ${story[1]}`))();
  const dump = JSON.stringify({ storyData, translations });
  for (const token of FORBIDDEN) {
    assert.ok(!dump.includes(token), `JS demo state still contains ${JSON.stringify(token)}`);
  }
  for (const lang of ["sr", "en", "de"]) {
    assert.ok(Array.isArray(storyData[lang]) && storyData[lang].length >= 5, `storyData.${lang} incomplete`);
    for (const step of storyData[lang]) {
      for (const token of FORBIDDEN) {
        const hay = `${step.driverName || ""} ${step.pwaDriver || ""} ${step.pwaDuty || ""} ${step.desc || ""} ${step.title || ""} ${step.lockStatus || ""}`;
        assert.ok(!hay.includes(token), `storyData.${lang} still contains ${JSON.stringify(token)}`);
      }
    }
  }

  // Shared heading antialiasing rule must exist so hero, pricing and footer stay consistent.
  // The measured LCD fringe was mobile-only — keep the compositor promotion inside 768px.
  assert.match(
    css,
    /@media\s*\(max-width:\s*768px\)[\s\S]*\.hero-h1,\s*\.section-head h2,\s*\.quiet-close h2\s*\{[\s\S]*transform:\s*translateZ\(0\)/,
    "shared landing-heading compositing rule missing from the 768px media query"
  );
  const cssBeforeFirstMedia = css.split(/@media/)[0];
  assert.doesNotMatch(
    cssBeforeFirstMedia,
    /\.hero-h1,\s*\.section-head h2,\s*\.quiet-close h2\s*\{[\s\S]*transform:\s*translateZ\(0\)/,
    "heading compositing must not apply at every viewport width"
  );
});

test("quiet-close h2 CSS has solid color, no gradient text, no text-shadow, no chromatic filter", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/landing.css"), "utf8");
  // Anchored at line start so this reads the dedicated `.quiet-close h2 { … }` rule
  // and not the shared `h1, h2, …, .quiet-close h2 { … }` typography rule.
  const dedicated = [...css.matchAll(/^\.quiet-close h2\s*\{([^}]*)\}/gm)];
  assert.equal(dedicated.length, 1, "expected exactly one dedicated .quiet-close h2 rule at line start");
  const h2Block = dedicated[0][1];
  assert.ok(h2Block.length > 0, ".quiet-close h2 CSS block is empty");
  assert.match(h2Block, /-webkit-text-fill-color:\s*#[0-9a-fA-F]{3,8}/, ".quiet-close h2 must have solid -webkit-text-fill-color");
  assert.match(h2Block, /text-shadow:\s*none/, ".quiet-close h2 must have text-shadow: none");
  assert.match(h2Block, /filter:\s*none/, ".quiet-close h2 must have filter: none");
  assert.doesNotMatch(h2Block, /-webkit-background-clip:\s*text/, ".quiet-close h2 must not use gradient text clip");
  assert.match(h2Block, /background:\s*none/, ".quiet-close h2 must have background: none");
  // Compositing is shared with hero and section headings inside the mobile media query.
  assert.match(
    css,
    /@media\s*\(max-width:\s*768px\)[\s\S]*\.hero-h1,\s*\.section-head h2,\s*\.quiet-close h2\s*\{[\s\S]*transform:\s*translateZ\(0\)/,
    "shared heading compositing rule must include .quiet-close h2 inside the 768px media query"
  );
});

test("public CTA and incident labels have an explicit SR/EN/DE contract", () => {
  const src = fs.readFileSync(LANDING_SRC, "utf8");
  const m = src.match(/const translations = ({[\s\S]*?});\s*function setLanguage/);
  assert.ok(m, "translations object missing in source");
  const translations = (new Function(`return ${m[1]}`))();

  const contract = {
    navDriverBtn: {
      en: "Driver App",
      de: "Fahrer-App",
      sr: "Aplikacija za vozača"
    },
    navStaffBtn: {
      en: "Staff Login",
      de: "Mitarbeiter-Login",
      sr: "Prijava osoblja"
    },
    navDriverBtnShort: {
      en: "Driver",
      de: "Fahrer",
      sr: "Vozač"
    },
    navStaffBtnShort: {
      en: "Staff",
      de: "Team",
      sr: "Osoblje"
    },
    pwaAppName: {
      en: "BusCommand Driver",
      de: "BusCommand Fahrer",
      sr: "BusCommand Vozač"
    },
    lblPlanLockStatus: {
      en: "Plan Lock status:",
      de: "Plan-Lock-Status:",
      sr: "Status Plan Lock-a:"
    }
  };

  for (const [key, expected] of Object.entries(contract)) {
    for (const lang of ["en", "de", "sr"]) {
      assert.equal(
        translations[lang][key],
        expected[lang],
        `${lang}.${key} must be ${JSON.stringify(expected[lang])}`
      );
    }
  }

  assert.match(src, /data-i18n="navDriverBtn"/);
  assert.match(src, /data-i18n="navStaffBtn"/);
  assert.match(src, /data-i18n="navDriverBtnShort"/);
  assert.match(src, /data-i18n="navStaffBtnShort"/);
  assert.match(src, /data-i18n="pwaAppName"/);
  assert.match(src, /data-i18n-aria-label="navDriverBtn"/);
  assert.match(src, /data-i18n-aria-label="navStaffBtn"/);
  assert.match(src, /data-i18n-title="navDriverBtn"/);
  assert.match(src, /data-i18n-title="navStaffBtn"/);
  assert.match(src, /id="nav-driver-btn"[^>]*href="\/driver"|href="\/driver"[^>]*id="nav-driver-btn"/);
  assert.match(src, /id="nav-staff-btn"[^>]*href="\/staff"|href="\/staff"[^>]*id="nav-staff-btn"/);
});
