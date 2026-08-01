# BusCommand v1.0.1 — izveštaj uvoza i QA provere

Datum: 29.07.2026.

## Rezultat poglavlja

Ocena napretka: **8,8/10**

Kod, build, API i stvarni ulazni podaci prolaze sve izvršene provere. Ocena nije 10/10 jer kompletnih 33 UI testova nije moguće pokrenuti bez Chromium izvršnog fajla, a Firebase Rules emulator u ovom okruženju zahteva Javu 21 dok je dostupna Java 17.

## Implementirano

- Uvoz vozača više ne zahteva zajednički ili trajni `company_code`.
- Obavezna polja vozača su ime i prezime, EID, telefon i email.
- Sistem generiše jednokratni šestocifreni SMS aktivacioni kod; vozač zatim bira lični kod.
- Podržan je stvarni pojedinačni `Dienstplan` XLSX raspored sa kolonama `Tag`, `Bus`, `Linie/Dienst` i `Deo dana`.
- Podržan je provereni mesečni CSV u dugom formatu.
- Više pojedinačnih XLSX planova može se uvesti kao jedan paket.
- Pregledna matrica nije prihvaćena kao plan za upis.
- Paket se ne može sačuvati ako sadrži grešku.
- Blokirani su različiti meseci u istom paketu, dupli vozač/datum i vozač koji ne postoji u firmi.
- Disponentu je ponuđen samo uvoz plana. Uvoz naloga vozača ostaje isključivo Company Admin funkcija.
- Ulazni format je ograničen na proverene `.csv` i `.xlsx`; stari `.xls` nije dozvoljen.
- Tekstovi uvoza usklađeni su na engleskom, nemačkom i srpskom.

## Provera dostavljenih podataka

### Vozači

- `00_vozaci_10_test.csv`: **PASS**, 10 vozača.
- 10 jedinstvenih EID vrednosti: **PASS**.
- Obavezni kontakt i identifikacioni podaci: **PASS**.
- Nema trajnog početnog koda u ulazu: **PASS**.
- Provera je izvršena dva puta.

`00_vozaci_10_test.xlsx` nije dozvoljen kao unos vozača. Jedini dozvoljeni format za vozačke naloge je UTF-8 CSV, kako bi ugovor uvoza bio jednoznačan i bez tihog pogrešnog mapiranja.

### Mesečni planovi

- Marko Petrović: 24 dana — **PASS**
- Nikola Jovanović: 23 dana — **PASS**
- Stefan Ilić: 24 dana — **PASS**
- Aleksandar Nikolić: 24 dana — **PASS**
- Milan Stojanović: 23 dana — **PASS**
- Ukupno iz pet XLSX planova: 118 dodela.
- Ukupno iz `07_plan_import_lista.csv`: 118 dodela.
- Mesec: 2026-09.
- Broj vozača: 5.
- Zbir XLSX i kontrolnog CSV izvora je identičan: **PASS**.
- `06_pregled_svih_5_vozaca_2026-09.xlsx` je pravilno odbijen kao kontrolni pregled, ne kao import fajl.
- Cela provera je izvršena dva puta.

Dozvoljen način uvoza plana je:

1. pet pojedinačnih Dienstplan XLSX fajlova; ili
2. jedan mesečni CSV u dugom formatu.

Ne treba istovremeno učitati obe varijante jer predstavljaju iste dodele i sistem će ih pravilno označiti kao duplikate.

## Automatske provere

- Unit testovi: **382/382 PASS**, završni kompletan prolaz.
- Prethodni kompletan prolaz: **381/381 PASS** pre poslednjeg testa razdvajanja uloga.
- ESLint: **PASS**, ponovljen.
- Production build: **PASS**, ponovljen.
- Firebase izolacija izvornog i build koda: **PASS**, ponovljena kroz build.
- Favicon: **PASS** za landing, staff i driver ekran; koristi BusCommand logo.
- API smoke: **8/8 PASS**.
- Production build ne sadrži TransitFlow brending.

## Otvorene infrastrukturne provere

### Browser UI

Svih 33 UI scenarija su pronađena, ali nisu izvršena jer Playwright Chromium nije instaliran. Pokušaj instalacije je ponovljen u radnom folderu, ali je CDN vratio neispravan/prazan ZIP i HTTP 502 zbog sertifikata ili sata okruženja. Ovo nije aplikacioni test neuspeh; testovi nisu pokrenuti.

### Firebase Rules

Rules test nije izvršen u ovom okruženju jer Firebase CLI više ne podržava Javu 17 i zahteva Javu 21 ili noviju. Ovo nije prolaz niti pad pravila, već blokirana provera.

## Bezbednosna i korisnička dijagnoza

- Identitet i prijava vozača odvojeni su od rasporeda.
- Disponent ne dobija EID, lične kodove niti aktivacione tajne.
- Neispravan ili delimičan paket ne može biti upisan.
- Sistem ne prihvata nepoznatog vozača niti duplu dodelu bez upozorenja.
- Uloge sada prikazuju samo radnje koje smeju da izvrše, čime je uklonjen prethodni prazni tok.

## Zaključak

Lokalni kod i provereni import tok spremni su za završni browser i Firebase emulator prolaz čim okruženje dobije Chromium i Javu 21. GitHub/Render/Firebase objava nije izvršena u ovom poglavlju.
