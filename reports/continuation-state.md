# BusCommand — trajna tačka nastavka

Poslednje osvežavanje: 2026-07-22 (Europe/Vienna)

## Aktivni cilj

Završiti kompletnu analizu, redizajn, funkcionalnu doradu, bezbednosnu proveru, testiranje i dokumentovanje aplikacije prema `AGENTS.md`, bez prekidanja između stranica i bez gubitka poslovnih odluka.

## Nepromenljive poslovne odluke

- Company Admin upravlja firmom, brendingom, grupama/linijama, dispečerima, vozačkim nalozima i važećim voznim planovima.
- Dispečer nema Settings panel i ne menja matične postavke firme. Radi operativni dnevni i mesečni raspored samo za dodeljene grupe.
- Company Admin ima uvid u dispečerske planove, ali ih ne menja.
- Vozač dobija zahteve za potvrdu smene samo tokom sopstvenog radnog vremena prema vremenskoj zoni sedišta firme.
- Posle završetka rada i odjave nema push poruka ni GPS praćenja. Automatska odjava nastupa najkasnije 30 minuta posle završetka smene.
- Petkom se paketiraju potrebne potvrde za radni vikend i ponedeljak; ako je vozač petkom slobodan, paket stiže prethodnog radnog dana.
- Službeni vozni plan se uvozi odvojeno po grupi, kroz verzionisani BusCommand ugovor `BUSCOMMAND-DIENSTPLAN-1` (**XLSX kanonski + CSV twin + strukturirani BusCommand PDF**). Proizvoljni firmi PDF/XLS/TXT nije produkcioni import format. **Zaključano 2026-07-24 (opcija 1).**

## Završene i verifikovane celine

- Privatnost radne sesije vozača i potvrde smena.
- Company Admin: vozački nalozi, važeći vozni plan, istorija verzija i evidencija aktivnosti.
- Company Admin: Firma & pregled, Brending firme, Grupe / linije i Tim dispečera, uključujući tenant-scoped serversko čuvanje, validaciju, audit, licencni limit, deaktivaciju, opoziv API/realtime sesija i uklanjanje plaintext/hardkodovanih lozinki iz produkcijskog state-a.
- Dispečerska dodela smene, godišnji odmori i vozački kalendar.
- Dispečerski Settings uklonjen iz navigacije i dozvola; podešavanja pripadaju Company Admin ulozi.
- ESLint i build upozorenja očišćena; Firebase SOS status premešten u ispravan modul.

## Poslednja zelena kontrola

- `npm run lint`: 0 grešaka, 0 upozorenja.
- `npm run test:unit`: 195/195 prošlo.
- `npm run check:firebase-isolation`: prošlo za source i poslednji build output.
- `node --check`: prošao za sve JS fajlove promenjene u toku Tima dispečera.
- Poslednji potpuno izvršen Playwright paket ostaje 28/28 i poslednji build 121 modul, oba pre Tima dispečera. Novi E2E je dodat, ali Playwright/esbuild procesi su trenutno blokirani sa `spawn EPERM`; izvan-sandbox zahtev je odbijen zbog usage limita. Ovo je obavezna završna regresija čim izvršno okruženje dozvoli.

## Trenutni redosled rada

1. Company Admin — Firma & pregled. **Završeno 2026-07-22.**
2. Company Admin — Brending firme. **Završeno 2026-07-22.**
3. Company Admin — Grupe / linije. **Završeno 2026-07-22.**
4. Company Admin — Tim dispečera. **Implementacija i unit/security verifikacija završene 2026-07-22; Playwright/build/emulator čekaju dostupno izvršno okruženje.**
5. Company Admin — Podešavanja firme i završna regresija svih Company Admin stranica. **Trenutno.**
6. Dispečerski Operativni centar prema odobrenom mockupu.
7. Preostale dispečerske, vozačke i sistemske stranice.
8. Kompletna završna kontrola, regulatorni pregled i zaključak audita.

## Sledeća konkretna akcija

Mapirati `company-admin-settings`: odvojiti stvarne postavke firme od demo/reset funkcija, potvrditi serversko čuvanje, tenant/role zaštitu, vremensku zonu sedišta, podrazumevani jezik, privatnost/notifikacije, izvoz podataka, opasne akcije, audit, validaciju, responsive i testove. Po završetku svih Company Admin stranica ponovo pokušati odloženi Tim Playwright/build/emulator paket pre prelaska na dispečerski Operativni centar.

## Autoritativno osveženje posle Company Admin Podešavanja (2026-07-22)

- Company Admin stranice su funkcionalno obrađene redom: Firma i pregled, Brending, Grupe/linije, Tim dispečera, službeni planovi, vozački nalozi, audit i Podešavanja.
- Podešavanja sada imaju server-only profil sedišta (`AT`/`RS`), serverski izvedenu vremensku zonu, podrazumevani jezik i poslovni email; licenca je strogo read-only.
- Fiksna politika privatnosti jasno navodi: bez GPS-a i push poruka van radnog prozora, automatska odjava najkasnije 30 minuta posle smene.
- Produkcijski CSV izvoz je tenant-scoped, auditovan, ograničen na 10.000 redova, uklanja pristupne tajne i neutrališe spreadsheet formule.
- `profile`, `branding` i `settings` više se ne mogu pisati direktno iz Firestore klijenta niti kroz globalni state sync.
- Poslednja zelena kontrola: `npm run lint` 0/0, `npm run test:unit` **208/208**, `npm run check:firebase-isolation` prošao, `node --check` prošao za nove serverske module.
- Firestore emulator test nije pokrenut jer Java nije instalirana. Novi Settings i Team Playwright tokovi i novi production build ostaju odloženi jer okruženje ne dozvoljava pokretanje browser/esbuild procesa (`spawn EPERM`), a in-app browser odbija lokalni host.
- Sledeća stranica: Dispečerski Operativni centar. Prvo mapirati postojeći `dispatcher-dashboard`, upozorenja koja se provlače ceo dan i sva povezana stanja/API tokove; zatim implementirati ponašanje odobrenog mockupa bez Settings panela.

## Autoritativno osveženje — RBAC matrica (2026-07-24)

- Artefakt: `reports/rbac-matrix-2026-07-24.md` (uloga × resurs × akcija × polja × tenant × audit).
- OTP aktivacija već u `5cf03c3`.
- Najveće RBAC rupe za kod: mesečni plan/client schedules (G2), concurrency (G7), staff poruke bez API (G1), drivers CRUD via saveState (G3).
- Sledeće Poglavlje 2: kanonski roster + optimistic concurrency (G2/G7).

- Grana: `work/master-prompt-ch1`, checkpoint `bb6c4aa`.
- Uvoz plana zaključan: BusCommand XLSX + CSV + strukturirani PDF (opcija 1).
- Artefakti: `reports/poglavlje-1-{forensic,gap-matrix,dataflow,legal-open}-2026-07-24.md`.
- Najveći Critical gapovi: shared temp code `123456`, dual roster model bez concurrency, demo tragovi u produkcionom path-u.
- Sledeće: **Poglavlje 2** (OTP/RBAC/kanonski model) — ne live GPS dok legal L1 nije rešen.
