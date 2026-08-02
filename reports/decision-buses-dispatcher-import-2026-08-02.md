# Odluka — uvoz autobusa (disponent)

Datum: **2026-08-02**  
Status: **zaključano** (usvojeno uz review tačku 2)

## Pravilo

| Uloga | Autobusi |
|-------|----------|
| **Disponent** | Uvoz + operativno održavanje flote. |
| **Company Admin** | **Samo uvid** — bez write / bez operativnog uvoza. |
| **Vozač** | Vidi samo dodeljeni autobus u svojoj smeni. |
| **Super Admin** | Ne upravlja dnevnom flotom tenanta. |

## Kurirani formati (v1)

1. TXT — jedan broj po liniji  
2. CSV — `,` ili `;` (kolona `number` / `bus` / `autobus` ili prva kolona)  
3. XLSX — prvi sheet, ista pravila  
4. Paste u textarea (copy iz Excela)

Obavezno: **preview** (novo / postojeće / nevažeće) → potvrda → upsert po broju u aktivnoj grupi → audit.  
Zabranjeno tiho: proizvoljni PDF/Word/sken. Novi format = primer fajla firme + adapter.

## Napomena

Ne mešati sa CA uvozom vozača/plana. Autobus-uvoz je dispečerski operativni alat.

## Dopuna 2026-08-02 — multi-group pool

**Zaključano:** isti broj autobusa može pripadati / biti dostupan **više grupama** firme (npr. 310 + 320). Jedan kanonski zapis po broju u firmi; uvoz u drugu grupu = attach, ne duplikat.  
Detalj: `reports/decision-bus-multi-group-pool-2026-08-02.md`.
