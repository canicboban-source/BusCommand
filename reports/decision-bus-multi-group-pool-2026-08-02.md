# Odluka — isti autobus u više grupa (company fleet pool)

Datum: **2026-08-02**  
Status: **zaključano** (vlasnik: „da, molim. zaključajmo ovo pravilo.“)

## Operativni kontekst

Firma radi npr. linije/grupe **310** i **320** sa **istim** parkom. Autobusi se po potrebi menjaju između grupa. Dupli zapis istog broja nije željeno ponašanje.

## Zaključano pravilo

1. Disponent u aktivnoj grupi unosi **čist broj** (npr. `91504`) — TXT/CSV/XLSX/paste ili ručno polje.
2. Broj je **jedinstven u firmi** (jedan kanonski bus zapis).
3. Isti bus **mora moći biti dostupan više grupama** firme (npr. 310 i 320), ne samo jednoj „domaćoj“ grupi.
4. Uvoz / dodavanje u grupi B, ako broj već postoji u firmi → **poveži na grupu B** (membership), ne kreiraj drugi zapis i ne blokiraj sa „već postoji“ kao greškom bez opcije deljenja.
5. Dodeljivanje u smeni koristi **isti** bus ID; vozač vidi broj u svojoj smeni.
6. CA i dalje **samo uvid**; write ostaje disponent.
7. Konflikt „isti bus već u aktivnoj smeni na drugoj grupi“ = **operativno upozorenje** (kasniji slice), ne zabrana postojanja u pool-u.

## Trenutni kod vs pravilo

| Stavka | Status |
|--------|--------|
| Model `groupIds` + legacy `groupId` | ✅ |
| API create → attach ako postoji | ✅ (`bus_group_attached` audit) |
| Uvoz classify `toAttach` | ✅ |
| Demo / hub lista po membership | ✅ |
| Konflikt aktivne smene na drugoj grupi | ⏳ kasniji slice (upozorenje) |

## Ne menja

- CA read-only na autobusima  
- Kurirani formati uvoza  
- First-writer lock na planu (nije bus pool)
