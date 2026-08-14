# Poglavlje 1 — Legal / privacy open decisions

Datum: 2026-07-24  
Status: **tehnička pre-procena**, nije pravno mišljenje.  
Pilot tržište (master prompt): Austrija — ne pretpostavljati automatski RS/DE.

## Pravni izvori za ponovnu proveru (datum pristupa: 2026-07-24)

| Izvor | URL | Odnosi se na |
|-------|-----|--------------|
| GDPR (EU) 2016/679 | https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng | Osnova obrade, minimizacija, prava lica, DPIA, podobrađivači |
| ArbVG §96 (AT) | https://www.ris.bka.gv.at/eli/bgbl/1974/22/P96/NOR40123095 | Mere kontrole zaposlenih / moguće Betriebsrat odobrenje |
| AZG §26 (AT) | https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Bundesnormen&Dokumentnummer=NOR40206209 | Ako bi sistem bio predstavljen kao evidencija radnog vremena |
| DSB — DPIA/DSFA | https://dsb.gv.at/rechte-pflichten/uestakk-v | Kada je DPIA obavezna |
| DSFA-V | https://www.ris.bka.gv.at/geltendefassung/bundesnormen/20010375/dsfa-v%2C%20fassung%20vom%2020.06.2021.pdf | Austrijski DPIA podzakonski okvir |
| WP29 Op. 2/2017 | https://ec.europa.eu/newsroom/document.cfm?doc_id=45631 | Obrada podataka na radu |

## Tehnički već delimično usklađeno sa privacy-by-design

- Credential odvojen od profila; client ne čita hasheve.
- Policy copy: bez GPS/push van radnog prozora; auto-logout ≤30 min posle smene.
- Work-policy potvrde samo u aktivnom/grace prozoru.
- CA export uklanja tajne; audit za deo CA akcija.

## Otvorene odluke (Legal validation / Business decision)

| ID | Pitanje | Prioritet | Blokira |
|----|---------|-----------|---------|
| L1 | Da li je GPS uopšte u pilotu AT? Ako da — pravni osnov (ne consent-by-default), DPIA, Betriebsrat? | Critical | Produkcijski live GPS |
| L2 | Da li je check-in/out **samo operativni**, i da li UI/docs to jasno kažu (ne AZG evidencija)? | High | Labeling + retention |
| L3 | Retention: lokacije, poruke, audit, lost-item foto — tačni rokovi? | High | Retention/deletion matrica |
| L4 | Controller vs processor: firma kupac vs BusCommand; Firebase/Render/SMS subprocessor ugovori? | High | DPA / SCC |
| L5 | SMS aktivacioni kod — koji provajder, DPA, log redaction? | High | Aktivacija §4 |
| L6 | Public lista vozača (`/api/public/.../drivers`) — da li je dozvoljena za login UX? | Medium | **Tehnički zatvoreno** (410 + EID); pravna potvrda da je EID-only UX OK i dalje Business/Legal |
| L7 | Support pristup Super Admin tenant-u — vremenski TTL, razlog, audit (ne impersonate lozinkom)? | High | SA §16 |
| L8 | Jurisdiction pack po prodaji (AT ≠ RS ≠ DE) — tenant config? | Medium | Multi-country |

## Artefakti koji još nedostaju (§22 / §29)

- [ ] Data-flow mapa ličnih podataka (proširiti tehničku skicu)
- [ ] Controller/processor/subprocessor matrica
- [ ] Svrha × kategorija × lice × pravni osnov
- [ ] ROPA osnova
- [ ] Privacy notice (zaposleni/vozač)
- [ ] Retention/deletion matrica
- [ ] DPIA pre-procena (GPS + monitoring + audit)
- [ ] Incident response + 72h GDPR procena
- [ ] Lista stavki za pravnika / DPO / Betriebsrat pre pilota

## Pravilo za razvoj do odluke

- Ne uključivati produkcijski live GPS feed dok L1 nije rešen.
- Ne predstavljati check-in kao zakonsku evidenciju radnog vremena.
- Ne koristiti employee consent kao jedini/automatski pravni osnov.
- Ne tvrditi „100% usklađeno“.
