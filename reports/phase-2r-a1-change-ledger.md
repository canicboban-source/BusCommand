# FAZA 2R-A.1 — Change Ledger

| | |
| -- | -- |
| **Base SHA** | `a6fbcb508c67287c33479f38c3678cd44684ee60` |
| **Status** | Closed for reliability closeout; STOP before 2R-B |
| **Bundle** | D17 red only (no bump): staff 589132 (over 7500); translations 381581 (over 3725) |

## Work items

| ID | Status |
| -- | ------ |
| A actorGroups + lock-then-revalidate + effective bus | DONE |
| B durable recovery lock | DONE |
| C schedule mirror cleanup | DONE |
| D real resume test | DONE |
| E client transport truth | DONE |
| F HTTP/E2E | DONE |
| G visual (no simulation) | DONE |
| H gates/report/review ZIP | DONE |

## Corrected overclaims
- visual 08 simulated → real API recovery shot
- visual 05 weak → phase=committing asserted
- completed retry ≠ crash resume → dedicated resume test
- HTTP missing unauth → 401 test added
