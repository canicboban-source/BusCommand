#!/usr/bin/env node
// ============================================================
// BusCommand — Hash PIN (bcrypt) za vozače u produkciji
// Upotreba: node scripts/hash-pin.js 1234
//           npm run hash-pin -- 1234
// ============================================================

const bcrypt = require("bcrypt");

const pin = process.argv[2];

if (!pin) {
  console.error("Upotreba: node scripts/hash-pin.js <PIN>");
  console.error("Primjer:  node scripts/hash-pin.js 1234");
  process.exit(1);
}

if (!/^\d{4,6}$/.test(pin)) {
  console.error("PIN mora imati 4–6 cifara.");
  process.exit(1);
}

bcrypt.hash(String(pin), 12).then(hash => {
  console.log("");
  console.log("PIN:  ", pin);
  console.log("Hash: ", hash);
  console.log("");
  console.log("Kopiraj hash u Firestore: companies/{id}/drivers/{driverId}.pin");
  console.log("");
});
