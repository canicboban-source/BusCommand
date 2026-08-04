# Preview go-live — 2026-08-05

## Deploy chain

| Korak | Rezultat |
| --- | --- |
| Push `work/ca-group-monthly-import` | OK → `origin/work/ca-group-monthly-import` |
| PR | [#24](https://github.com/canicboban-source/BusCommand/pull/24) |
| Merge u `main` | OK · merge commit `539f380` |
| Firebase (`buscommand-preview`) | Rules + indexes deployed |
| Render | Auto-deploy from `main` → live na `https://buscommand.com` |

## Live probes

| Check | Result |
| --- | --- |
| `GET https://buscommand.com/api/health` | 200 · `mode=production`, `firebase=true`, `version=1.0.10` |
| `GET https://buscommand.com/api/config` | 200 · Firebase on |
| `GET https://buscommand.com/` | 200 · brand present |
| `staff.html` | 200 · Lucide **0.469.0** · no eager XLSX CDN (Ch17) |
| `driver.html` | 200 · Lucide **0.469.0** |
| `buscommand-preview.onrender.com` | 404 (custom domain `buscommand.com` is the public URL) |
| Browser staff login (demo) | PREVIEW badge + SR i18n login card OK |
| Browser driver login (demo) | Driver form OK (company ID / EID / code) |

## Limits

- This is the **preview** Firebase project (`buscommand-preview`), not a separate prod project.
- Demo login through the automated browser was only partially exercised (form fill); full role E2E remains local Playwright / manual.
- O1–O5 still open; `liveGps` remains default OFF.
- Chapters 18–21 (integration cleanup, jurisdiction gate, staging acceptance notes, controlled release) still open in the master table.

## Rollback

1. Revert merge `539f380` on `main` (or redeploy previous Render deploy).
2. Redeploy previous `firestore.rules` / indexes to `buscommand-preview` if rules regress.
