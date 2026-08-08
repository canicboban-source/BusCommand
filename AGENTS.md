# BusCommand agent instructions

## Primary authority (read first)

- `docs/BusCommand-ULTIMATE-OPERATING-CONTRACT.md` (**v2.1**) — daily operating law for every AI agent.
- `.cursor/rules/*.mdc` — condensed always-on + scoped Cursor rules derived from that contract (D21, build, imports, Dispo, i18n, git/proof).

Before changing code: follow that contract (Pre-flight → smallest correct change → proof). Do not deploy, push, or release without an explicit owner decision.

## Reference / depth (does not override the Operating Contract)

- `docs/BusCommand-MASTER-PROMPT.md` (v3.2 or newer) — product history, chapter detail, privacy/QA depth.
- Owner Task Contract for the current iteration (when provided) overrides implementation preference, not security or this Operating Contract.

## Conflict rule

If instructions conflict, use the hierarchy in the Ultimate Operating Contract §0. Security, privacy, tenant isolation, and credential boundaries always win.

Never add secrets, production credentials, shared activation codes, demo tenants, or foreign-project data to the repository.
