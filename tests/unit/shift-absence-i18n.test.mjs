import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { URL } from "node:url";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const context = { window: {} };
vm.runInNewContext(read("../../translations.js"), context);
const dictionaries = context.window.TRANSLATIONS;

test("absence short codes differ by language for vacation and sick", () => {
  assert.equal(dictionaries.sr.shift_code_vacation, "O");
  assert.equal(dictionaries.sr.shift_code_sick, "B");
  assert.equal(dictionaries.en.shift_code_vacation, "V");
  assert.equal(dictionaries.en.shift_code_sick, "S");
  assert.equal(dictionaries.de.shift_code_vacation, "U");
  assert.equal(dictionaries.de.shift_code_sick, "K");

  // Must not share one letter across all three languages.
  const vacationCodes = new Set([
    dictionaries.sr.shift_code_vacation,
    dictionaries.en.shift_code_vacation,
    dictionaries.de.shift_code_vacation
  ]);
  const sickCodes = new Set([
    dictionaries.sr.shift_code_sick,
    dictionaries.en.shift_code_sick,
    dictionaries.de.shift_code_sick
  ]);
  assert.equal(vacationCodes.size, 3);
  assert.equal(sickCodes.size, 3);
});

test("absence full labels are localized for monthly plan display", () => {
  assert.match(dictionaries.sr.shift_type_vacation, /Odmor/i);
  assert.match(dictionaries.sr.shift_type_sick, /Bolovanje/i);
  assert.match(dictionaries.en.shift_type_vacation, /Vacation/i);
  assert.match(dictionaries.en.shift_type_sick, /Sick/i);
  assert.match(dictionaries.de.shift_type_vacation, /Urlaub/i);
  assert.match(dictionaries.de.shift_type_sick, /Krank/i);
});
