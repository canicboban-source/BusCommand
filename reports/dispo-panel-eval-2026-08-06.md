# Dispo panel — incident + capacity eval (2026-08-06)

## Šta je testirano

Izmišljeni incidenti (linija 101) kroz ceo tok **prijava → opcije → Primeni**:

1. Kašnjenje (delay) → restored + note  
2. Smena bez autobusa → dodela iz pool-a  
3. Pogrešan duty code → ispravka iz CA kataloga  
4. Kvar vozila (breakdown) → replaced + note  
5. Nedostupan vozač (coverage) → zamena vozača + bus  

Plus: a11y smoke (dialog role/aria, focus, close), Daily plan-health → solutions panel.

## Capacity ladder (demo, jedna grupa)

| Vozači | Autobusi | Otvaranje panela | Kartice | Greške stranice |
|--------|----------|------------------|---------|-----------------|
| 12     | 10       | 426 ms           | 5       | 0               |
| 24     | 22       | 326 ms           | 5       | 0               |
| 40     | 38       | 446 ms           | 5       | 0               |
| 60     | 58       | 315 ms           | 5       | 0               |

**Soft maksimum u ovom prolazu:** **60 vozača / 58 autobusa** bez JS grešaka, panel < 0.5 s.  
(Licence servera ide do `maxDrivers` do 5000 na tenant nivou; ovo je UI/ops smoke za **jednu grupu** u lokalnom demo režimu — nije produkcioni load test.)

## Rezultati komandi

- `npx playwright test tests/e2e/dispo-incident-stress.spec.js --workers=1` → **3/3 passed**  
- Ranije u istom ciklusu: `dispatcher-cockpit.spec.js` → **9/9 passed**  
- Artefakt: `reports/dispo-stress-run4.txt`

## Ocene (1–10)

| Oblast | Ocena | Komentar |
|--------|-------|----------|
| Vizuelna pristupačnost | **7.5** | Dobar kontrast, jasan “Solution” blok, veliki CTA. Escape ne zatvara sheet; tokom `_pendingApply` Close je blokiran (korisnik može da se oseti zarobljenim). |
| Logička rešenja | **8.5** | Jedan panel: problem + opcije + apply. Poolovi (ista grupa → firma → druge) i katalog smena rade. Praznine plana sada imaju sintetičke kartice sa akcijama. |
| Lakoća / brzina rešavanja | **8.0** | Lanac 5 tipova incidenta ~6 s u E2E. Dispečer ne skače po panelima. Usko grlo: duga lista kartica + native `<select>` na Windows light popup-u. |
| **Ukupno** | **8.0** | Spreman za operativni rad na grupi do ~60; fina dorada ispod za “max nivo”. |

## Preporučene dorade (prioritet)

1. **High — Escape + Always-available Close**  
   `Escape` zatvara Needs attention; Close ne sme da bude no-op tokom pending (disable Apply, ne Close).

2. **High — Pending / double-apply feedback**  
   Jasna “Rešavanje…” traka; sprečiti drugi Apply; posle greške vratiti fokus na polje.

3. **Medium — Skrol / fokusorka u sheet-u**  
   Sticky header + “Naredni problem” / filter po severity; virtualizacija ako kartica > ~15.

4. **Medium — Select UX**  
   Veći touch target / searchable driver+bus picker za grupe > 40 (native select postaje spor za oči).

5. **Medium — Plan-gap kartice**  
   Grupisati “N nepokrivenih” umesto 1:1 kartica kad je gap masovan; zadržati 1-klik do dnevnog plana / Assign.

6. **Low — Live alerts ↔ Attention sync**  
   Posle apply, live alert broj i health banner odmah isti (bez osećaja “duplog” problema).

7. **Low — Capacity gate u UI**  
   Soft upozorenje kad grupa pređe npr. 50 aktivnih vozača na dan (“lista rešenja će biti duža”).

## Ograničenja ovog testa

- Lokalni **demo** state, ne Firebase produkcija.  
- Jedna linija/grupa; nema konkurentnih dispečera.  
- Ladder stao na 60 (još uvek < 0.5 s — verovatno ide više, nije dokazano ovde).  
- Vizuelna ocena iz E2E screenshot + a11y smoke, ne WCAG audit alat.
