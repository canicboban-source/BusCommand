# Kako snimiti promo reel (Windows) — 2026-07-26

## Šta snimaš

HTML promo: `public/promo/index.html`  
Lokalno: `http://localhost:8766/promo/` (posle `npm start` / build)  
Ili otvori fajl direktno u Chrome/Edge.

---

## Korak po korak (najlakše — Xbox Game Bar)

### 1. Priprema (2 min)

1. Zatvori sve što ti skače (Teams, mail, Discord notifikacije).
2. Staviti Windows u **Ne uznemiravaj** (Focus assist).
3. Skala ekrana 100% ili 125% (Settings → Display → Scale) — ne mešaj usred snimanja.
4. Rezolucija idealno **1920×1080**.

### 2. Pokreni reel

1. U folderu projekta:
   ```bash
   npm run build
   npm start
   ```
2. Otvori Chrome/Edge: **http://localhost:8766/promo/**
3. Pritisni **F11** (ceo ekran browsera).
4. Pritisni **R** na tastaturi — sakrije dugmad (recording mode).
5. Pustí da krene od prvog slajda (auto-play).

### 3. Snimanje

1. **Win + G** → otvara Xbox Game Bar.
2. Ako pita „da li je ovo igra?“ → potvrdi da želiš snimanje ovog prozora / desktopa.
3. **Win + Alt + R** → **START** snimanja (crveni indikator).
4. Sačekaj ceo krug slajdova (~40 s) + 2 s na kraju.
5. **Win + Alt + R** ponovo → **STOP**.

### 4. Gde je fajl

Obično:

`C:\Users\cane\Videos\Captures\`

Ime tipa: `localhost - … .mp4`

### 5. Pregled i čuvanje „za kasnije“

1. Otvori MP4 u Films & TV / VLC — proveri da se vidi logo i CTA.
2. Kopiraj u npr.:
   `C:\Users\cane\Desktop\BusCommand-Promo\`
3. Preimenuj: `BusCommand-promo-reel-2026-07-26.mp4`
4. (Opciono) Ubaci u CapCut: skini tišinu, dodaj voiceover iz `reports/buscommand-promo-video-2026-07-26.md`

---

## Prečice (zapamti)

| Akcija | Tastatura |
|--------|-----------|
| Game Bar | `Win + G` |
| Start/Stop snimanje | `Win + Alt + R` |
| Screenshot | `Win + Alt + PrtSc` |
| Browser fullscreen | `F11` |
| Sakrij kontrole reela | `R` |
| Pauza reela | `Space` |

---

## Ako Game Bar ne radi

1. Settings → Gaming → Xbox Game Bar → **On**
2. Settings → Gaming → Captures → dozvoli snimanje u pozadini
3. Alternativa: **Win + Shift + S** nije video — samo screenshot  
4. Bolji kvalitet: besplatni **OBS Studio** → Display Capture → Start Recording

---

## Tipovi za lepši rezultat

- Snimi **2 puta** — drugi krug je obično čistiji.
- Ne pomeraj miš tokom snimanja.
- Ne prikazuj Desktop pack sa lozinkama u pozadini.
- Za LinkedIn: izreži na **30 s** (logo → Admin → Dispo → Vozač → CTA).
