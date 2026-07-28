# Autonomous agent contract — BusCommand Preview

Last updated: 2026-07-26  
Owner approval: continue without per-step confirmation until blocked by owner-only gates.  
**P9 soft pilot:** owner said „pilot“ (2026-07-26) — soft Preview pilot in progress.

## Mission

Finish BusCommand Preview according to `docs/BusCommand-MASTER-PROMPT.md`, in chapter order, without waiting for confirmation after each page/slice.

## Hard stops (need owner)

1. `CONFIRMATION_JOB_SECRET` on Render (web + cron) — only if enabling scheduler
2. Real SMS/push provider + DPA choice
3. Live GPS until legal L1 closed
4. ~~Poglavlje 9 controlled pilot start~~ → **soft pilot unlocked**; hard/customer go-live still owner
5. Force-push / destructive prod data / secret rotation in third-party consoles
6. Owner browser sign-off on role checklist (remaining soft-pilot gate)

## Working rules

- Follow master-prompt chapter order; do not skip dependencies.
- Prefer existing architecture; no parallel design system.
- Ship focused slices: implement → unit tests → report → push → PR → merge to `main`.
- Do not invent legal/business rules; document open legal items.
- Canonical brand mark is the concept PNG (`public/brand/logo-mark.png` / `logo-hero.png`); do not commit secrets.
- Do not commit Desktop credential packs from `pilot:bootstrap`.
- Soft pilot: SMS none, live GPS OFF, scheduler OFF, supportSession OFF unless explicit L7 flag.
- Serbian casual updates only at slice boundaries / blockers.

## Current position

| Chapter | Status |
|---------|--------|
| P1–P5 | Largely done in prior work |
| P6 | Scheduler/outbox/ops/observability done; SMS stub; GPS blocked |
| P7 | Done (slices 1–4) |
| P8 | Done (8.1–8.3); Rules emulator optional (Java) |
| P9 | **Soft pilot started** — runbook + bootstrap; live role checklist = owner |

## Active backlog (ordered)

1. ~~P8.3 E2E~~ ✅
2. ~~P9.1 soft pilot prep + bootstrap soft defaults~~ ✅
3. **Owner:** role-by-role checklist on live Preview
4. Agent: fix FAIL items from checklist
5. Hard pilot / customer — blocked until remaining hard stops

## Build warning

Always edit `index.legacy-monolith.html` for shared HTML — `npm run build` regenerates surface HTML from it.

## Definition of done for a slice

- Code on `work/master-prompt-ch1`
- Relevant unit tests green
- Short report under `reports/`
- Merged to `main` when possible
- Next slice named in the report
