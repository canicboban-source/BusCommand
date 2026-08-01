# BusCommand agent instructions

The authoritative product, engineering, security, privacy, UX and QA instructions are in:

- `docs/BusCommand-MASTER-PROMPT.md` (v3.1 or newer)

Before changing code, read that document in full. Work on one approved chapter at a time, preserve the last known-good state, use an isolated branch/worktree, run the required verification after every change, and do not deploy without an explicit release decision.

If repository documentation conflicts, the master prompt and the owner's latest explicit decision take precedence. Never add secrets, production credentials, shared activation codes, demo tenants or foreign-project data to the repository.
