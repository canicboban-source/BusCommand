/**
 * Remove obsolete "V66" demo branding from user-facing strings.
 * Keeps CA duty-catalog feature; only renames labels.
 */
import fs from "node:fs";

const replacements = [
  [
    'Objavite katalog smena (plan vožnje / V66) po grupi.',
    'Objavite katalog smena po grupi.'
  ],
  [
    'Publish the duty catalog (V66 / service plan) per group.',
    'Publish the duty catalog per group.'
  ],
  [
    'Veröffentlichen Sie den Dienstkatalog (V66 / Fahrplan) pro Gruppe.',
    'Veröffentlichen Sie den Dienstkatalog pro Gruppe.'
  ],
  ['Shift catalog V66', 'Shift catalog'],
  ['Schichtkatalog V66', 'Schichtkatalog'],
  ['Plan rada V66', 'Katalog smena'],
  ['Smena V66', 'Katalog smena'],
  ['Šifra smene / plan (V66)', 'Šifra smene'],
  ['Shift code / plan (V66)', 'Shift code'],
  ['Dienstcode / Plan (V66)', 'Dienstcode'],
  ['vozači + plan + V66', 'vozači + mesečni plan'],
  ['drivers + plan + V66', 'drivers + monthly plan'],
  ['Fahrer + Plan + V66', 'Fahrer + Monatsplan'],
  [
    'Company Admin objavljuje samo katalog smena (V66).',
    'Company Admin objavljuje samo katalog smena.'
  ],
  ['CA keeps V66/catalog', 'CA keeps duty catalog'],
  ['// D21 (2026-08-07): monthly driver assignments belong to Dispo. CA keeps V66/catalog only.',
   '// D21 (2026-08-07): monthly driver assignments belong to Dispo. CA keeps duty catalog only.']
];

const files = [
  'translations.js',
  'index.legacy-monolith.html',
  'api-server.js',
  'staff.html',
  'driver.html',
  'tests/e2e/ca-monthly-import.spec.js'
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let text = fs.readFileSync(file, 'utf8');
  let n = 0;
  for (const [from, to] of replacements) {
    while (text.includes(from)) {
      text = text.replace(from, to);
      n += 1;
    }
  }
  if (n) {
    fs.writeFileSync(file, text);
    console.log('updated', file, 'replacements=', n);
  } else {
    console.log('unchanged', file);
  }
}

const checkFiles = ['translations.js', 'index.legacy-monolith.html', 'staff.html', 'driver.html', 'api-server.js'];
for (const file of checkFiles) {
  const text = fs.readFileSync(file, 'utf8');
  console.log(file, 'V66 count=', [...text.matchAll(/\bV66\b/g)].length);
}
