# Legal L1 — GPS / employee location (pre-production brief)

Datum: 2026-07-25  
Repo: BusCommand-Preview-Local  
Status: **otvoreno — nije odobrenje za live GPS**

## Zašto L1 mora pre live mape

Master prompt §12 / Poglavlje 6: GPS lifecycle tek posle pravne procene neophodnosti i proporcionalnosti. Employee consent **nije** automatska ili jedina osnova.

## Šta aplikacija tehnički već radi (bez live produkcionog GPS-a)

- GPS start samo dok je vozač u **aktivnoj** radnoj sesiji (`driver_sessions` / work policy).
- Stop posle kraja smene; grace max 30 min pa auto-odjava.
- Van radnog prozora: bez praćenja (usklađeno sa CA Settings tekstom privatnosti).

## Otvorena pravna pitanja (L1)

| ID | Pitanje | Prioritet | Napomena |
|----|---------|-----------|----------|
| L1a | Pravni osnov za praćenje lokacije zaposlenih vozača (AT / RS / EU) | Critical | Ne oslanjati se samo na „consent“ |
| L1b | DPIA / procena uticaja na privatnost | Critical | Pre produkcionog pilot GPS-a |
| L1c | Betriebsrat / radničko učešće (Austrija, gde važi) | High | Proveriti sa kupcem/firmom |
| L1d | Rok čuvanja lokacijskih tačaka; ko briše; export | High | Tehnički limitirati retention |
| L1e | Obaveštenje zaposlenih (transparentnost) | High | UI + ugovor / politika firme |

## Zvanični izvori za proveru (početna lista)

- EU GDPR (EU 2016/679) — obrada posebnih konteksta zaposlenih; načela minimizacije  
  https://eur-lex.europa.eu/eli/reg/2016/679/oj  
  Pristup: 2026-07-25
- Austrian Datenschutzgesetz / DSB smernice za zaposlene (proveriti aktuelne stranice DSB)  
  https://www.dsb.gv.at/  
  Pristup: 2026-07-25 — **zahteva stručno tumačenje**
- RS: Zakon o zaštiti podataka o ličnosti + Poverenik  
  https://www.poverenik.rs/  
  Pristup: 2026-07-25 — **zahteva stručno tumačenje**

> Ovo nije pravni savet. Pre uključivanja live GPS-a treba odluka vlasnika proizvoda + (preporučeno) advokat / DPO kupca.

## Tehnički gate (kad legal OK)

1. Feature flag npr. `features.liveGps` default **false**
2. Server enforcement: lokacija se prihvata samo u `active` prozoru
3. Retention job / TTL na track tačkama
4. Audit: start/stop tracking, bez sirovih koordinata u logu
5. CA Settings: jasna izjava o GPS-u u radnom prozoru

## Preporuka

**Ne implementirati live mapu / continuous tracking dok L1a–L1c nisu zatvoreni.**  
Sledeći kod posle ovog brifa: zadržati postojeće GPS *gate*-ove; eventualno samo dokumentacija + flag skelet bez slanja koordinata.
