# Pregled odluka vlasnika — logika + pravni okvir (predlog izmena)

Datum: **2026-08-02**  
Status: **predlog za potvrdu vlasnika** — nije pravno mišljenje.  
Konačnu pravnu potvrdu za AT/DE/RS daju kvalifikovani pravnik / DPO / (po potrebi) Betriebsrat.

Referentni izvori (provera 2026-08-02):

- GDPR: https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng (posebno čl. 5, 6, 25, 32)
- ArbVG §96 (AT): https://www.ris.bka.gv.at/eli/bgbl/1974/22/P96/NOR40123095
- AZG §26 (AT): ne tretirat i plan/prijavu kao zvaničnu evidenciju radnog vremena bez posebne odluke

---

## Ukupan verdikt

Poslovni model **CA = šef (povremeno online)** / **disponent = operativni vlasnik grupe** je **logički zdrav** i dobro se uklapa u BusCommand.  
Većina odluka može da ostane; potrebne su **precizacije** da Swiss-watch kvalitet ne pukne na rubovima (format uvoza, lock, značenje „kontrola“, lozinke).

---

## Po tačkama

### A) CA ne dira smene / dnevni / mesečni plan — samo uvid

| | |
|--|--|
| **Logika** | ✅ Tačno. Šef ne sme da bude drugi disponent. |
| **Pravo** | ✅ Uvid u raspored zaposlenih i dalje je obrada ličnih podataka (GDPR čl. 5/6). Dozvoljeno uz jasan poslovni osnov (radni odnos / legitimni interes poslodavca), ali uz **minimizaciju** i **audit pristupa**. „Samo uvid“ smanjuje rizik zloupotrebe pisanja. |
| **Predlog izmene** | U matricama zameniti „pregled / kontrola“ za planove sa **„samo uvid (read-only), bez write“**. Pristup CA planu = auditovan (`plan.view`). Bez dugmadi Edit/Dodeli/Zameni za CA. |

### B) Disponent — svako Edit dugme mora biti stvarna funkcija

| | |
|--|--|
| **Logika** | ✅ Obavezno za Swiss-watch. Placeholder dugme = kritičan defect. |
| **Pravo** | Neutralno; smanjuje operativne greške koje stvaraju pogrešan trag u auditu. |
| **Predlog izmene** | Pravilo kvaliteta: **nema UI akcije bez serverske dozvole + audita + i18n EN/DE/SR**. Ako funkcija nije gotova — dugme **disabled** + jasan razlog, ne lažni success. |

### C) Autobusi — disponent uvoz; CA ne operiše

| | |
|--|--|
| **Logika** | ✅ Tačno zbog čestih izmena. |
| **Pravo** | Brojevi vozila su uglavnom **niski privacy rizik** (obično nisu podaci o licu). Rizik je više **bezbednost fajla** (makroi u Office, path traversal, ogromni fajlovi) i tačnost operativnih podataka. ArbVG §96 se tipično ne aktivira samim spiskom brojeva autobusa (za razliku od GPS/nadzora). |
| **Predlog izmene** | CA za autobuse: **samo uvid** (brojači, lista read-only), ne „kontrola“ u smislu edit. Reč „kontrola“ ostaviti za šefovski nadzor (da vidi stanje), tehnički = **R**. |

### D) „Što više formata“ za uvoz autobusa

| | |
|--|--|
| **Logika** | ⚠️ Konflikt sa Swiss-watch ako znači „bilo šta što firma pošalje“. Nepoznat format → tiha pogrešna flota → kvar u planu. |
| **Pravo** | Više formata = veća površina napada (Excel makro, XXE u starim parserima, zip-bomb). GDPR čl. 32 traži odgovarajuće tehničke mere. |
| **Predlog izmene** | Umesto „svi formati“, zaključati **porodicu radnih formata + preview + odbijanje nesigurnog**: |

**v1 dozvoljeno (predlog):**

1. TXT / jedan broj po liniji  
2. CSV (`,` ili `;`) — kolona `number` / `bus` / `autobus` ili prva kolona  
3. XLSX — prvi sheet, ista pravila kao CSV  
4. Paste u textarea (copy iz Excela)

**Obavezno:** preview (N novih / N postojećih / N nevažećih) → eksplicitna potvrda → upsert po broju u aktivnoj grupi → audit.  
**Zabranjeno tiho:** proizvoljni PDF, sken, Word, „pogodi kolonu“.  
**Proširenje:** novi format tek kad firma da **primer fajla** + adapter (ista disciplina kao kod Dienstplan ugovora).

### E) Prvi koji promeni zaključava ostale; on može dalje da menja

| | |
|--|--|
| **Logika** | ✅ Bolje od „poslednji upis pobjeđuje“. Odgovara tvojoj pretpostavci (telefon/mail pa dogovor). |
| **Pravo** | Dobro za integritet podataka (čl. 5 tačnost). Rizik: **zaključani plan + disponent offline** = operativni incident; ako lock nema izlaz, firma gubi sposobnost rada — to može biti i bezbednosni/organizacioni problem. |
| **Predlog izmene** | „First writer lock“ + **obavezni izlazi**: |

1. **Obim lock-a:** jedna **grupa + dan** (dnevni) ili **grupa + mesec** (mesečni) — ne cela firma.  
2. **TTL** npr. 15–30 min bez aktivnosti, ili dok traje sesija + heartbeat.  
3. **Release:** isti disponent može „Otključaj“ / „Završi izmenu“.  
4. **Break-glass:** samo **CA ili SA** sa razlogom + audit (ne tiha krađa edita) — CA ovde ne menja plan, samo **skida lock** da drugi disponent može da nastavi posle dogovora.  
5. UI drugom disponentu: „Izmene zaključao: Ime · od HH:MM · kontaktirajte ga“.

Telefon/mail ostaju **proces**, ne softverska pretpostavka.

### F) „Zamrzni grupu“ (tačka 5)

| | |
|--|--|
| **Logika** | ✅ Kasnije — slažem se. |
| **Pravo** | Neutralno ako je admin mera sa auditom. |
| **Predlog** | Ostaje backlog; ne radi sada. |

### G) Lozinke min 6 (ranija odluka)

| | |
|--|--|
| **Logika** | Prihvatljivo za ovaj ciklus ako je svesno. |
| **Pravo** | ⚠️ Slabije od uobičajene prakse uz GDPR čl. 32. Nije automatski „nezakonito“, ali je **poznat residual risk**. |
| **Predlog izmene** | Ostaje min 6 **sada**; na listi pre hard-pilota: min 8 + blokada najčešćih lozinki (ili MFA za CA/SA). Ne blokira 1.0.10. |

### H) Jezici EN baza + kompletan EN/DE/SR

| | |
|--|--|
| **Logika / pravo** | ✅ Dobro za kontrolu značenja i jednak tretman. SR u selektoru za tvoju kontrolu prevoda je OK. |
| **Predlog** | Bez izmene. Hardkod = defect. |

---

## Predložena usklađena matrica (posle tvoje potvrde)

| Resurs | CA | Disponent |
|--------|----|-----------|
| Firma, grupe, tim, brending | Piše | Ne |
| Kreiranje vozača / aktivacija | Piše | Ne |
| Zvanični katalog smena | Uvoz + potvrda | Koristi |
| Dnevni / mesečni plan (dodele) | **Samo uvid** | **Piše** (+ first-lock) |
| Autobusi | **Samo uvid** | **Piše + multi-format uvoz (kurirani set)** |
| Poruke / SOS / incidenti | Uvid gde treba | Operiše |
| Plan lock break-glass | Skida lock + razlog + audit | Drži / release lock |

---

## Šta predlažem da sada potvrdiš (da / ne / izmena)

1. CA na planovima i autobusima = **samo uvid**, reč „kontrola“ ≠ write.  
2. Bus uvoz = **kurirani formati** (TXT/CSV/XLSX/paste) + preview, ne „bilo šta“.  
3. First-lock + **TTL + release + CA/SA break-glass** (bez CA edit plana).  
4. Zamrzni grupu = kasnije.  
5. Lozinke min 6 ostaju do posebne odluke pre hard-pilota.

Kad potvrdiš (ili koriguješ), upisujem u `continuation-state` i tek onda nastavljam implementaciju.
