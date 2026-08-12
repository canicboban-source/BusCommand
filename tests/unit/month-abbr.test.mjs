/**
 * B2C-02 — localized month abbreviations (sr/en/de), uniqueness, month+year format.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  MONTH_ABBR,
  SUPPORTED_LANGS,
  listMonthAbbr,
  formatYearMonthDisplay,
  monthAbbrFor,
  normalizeMonthLang,
  buildYearMonthSelectOptions
} from "../../js/ui/month-abbr.js";

const EXPECTED = {
  sr: ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "avg", "sep", "okt", "nov", "dec"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  de: ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]
};

test("supported langs are exactly sr/en/de", () => {
  assert.deepEqual([...SUPPORTED_LANGS].sort(), ["de", "en", "sr"]);
  assert.deepEqual(Object.keys(MONTH_ABBR).sort(), ["de", "en", "sr"]);
});

for (const lang of ["sr", "en", "de"]) {
  test(`${lang}: 12 unique month abbreviations match contract`, () => {
    const labels = listMonthAbbr(lang);
    assert.equal(labels.length, 12);
    assert.deepEqual(labels, EXPECTED[lang]);
    assert.equal(new Set(labels).size, 12, `${lang} labels must be unique`);
    for (let i = 1; i <= 12; i += 1) {
      assert.equal(monthAbbrFor(lang, i), EXPECTED[lang][i - 1]);
    }
  });

  test(`${lang}: formatYearMonthDisplay is "abbr year" and keeps canonical YYYY-MM separate`, () => {
    assert.equal(formatYearMonthDisplay("2026-08", lang), `${EXPECTED[lang][7]} 2026`);
    assert.equal(formatYearMonthDisplay("2026-01", lang), `${EXPECTED[lang][0]} 2026`);
    assert.equal(formatYearMonthDisplay("2026-12", lang), `${EXPECTED[lang][11]} 2026`);
    const opts = buildYearMonthSelectOptions("2026-08", lang);
    const hit = opts.find((o) => o.value === "2026-08");
    assert.ok(hit);
    assert.equal(hit.value, "2026-08");
    assert.equal(hit.label, `${EXPECTED[lang][7]} 2026`);
    assert.match(hit.label, /^\S+ \d{4}$/);
  });
}

test("no silent English fallback for unsupported language", () => {
  assert.throws(() => normalizeMonthLang("hr"), /Unsupported UI language/);
  assert.throws(() => listMonthAbbr("fr"), /Unsupported UI language/);
  assert.throws(() => formatYearMonthDisplay("2026-08", "it"), /Unsupported UI language/);
  assert.notEqual(formatYearMonthDisplay("2026-08", "sr"), formatYearMonthDisplay("2026-08", "en"));
});

test("sr August uses avg (not Aug)", () => {
  assert.equal(formatYearMonthDisplay("2026-08", "sr"), "avg 2026");
  assert.notEqual(formatYearMonthDisplay("2026-08", "sr"), "Aug 2026");
});
