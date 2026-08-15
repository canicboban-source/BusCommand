# B2C-01-D1 call-flow

`SOURCE-LEVEL DIAGNOSTIC — NO LIVE MUTATION`  
Applies equally to **LIVE DEPLOYED** `80bd34b` and **CURRENT** `b1d057a` (no relevant diff).

| KORAK | UI FUNKCIJA | CLIENT API | SERVER HANDLER | STATE CHANGE | RESET/CLOSE |
|-------|-------------|------------|----------------|--------------|-------------|
| Open modal | `superadminOpenCreateModal` (`js/admin/superadmin.js:243`) via `#sa-open-create-modal` / `data-action` | — | — | Modal shown; demo PIN toggled | **No** form clear |
| Submit | `superadminSubmitCreateModal` (`:259`) via `#sa-create-company-form` `data-submit-action` | — | — | Orchestrator starts | — |
| Read company + CA fields | `superadminCreateCompany` (`:960–975`) | — | — | Client derives `companyId`; writes `#sa-ca-company-id` (`:978–979`) | Fields unchanged |
| Company create (prod) | `runSingleSubmission(#sa-create-company-btn)` (`:982`) | `ApiClient.createCompany` (`js/core/api-client.js:89`) → `POST /api/admin/create-company` | `requireSuperAdmin` + `createCompanyAtomic` (`api-server.js:426`, `server/provisioning.js:21`) | Firestore company/profile/branding/settings/sos + audit `company_created` | On fail: modal stays; stop |
| Company success UI | toast `company_created` + `renderSuperAdminDashboard` (`:994–996`) | — | — | Dashboard refresh | Company fields **not** cleared |
| CA gate | `superadminSubmitCreateModal` (`:263–267`) | — | — | If any of name/email/password non-empty → call CA helper | — |
| CA create (prod) **BUG** | `superadminCreateCompanyAdmin` (`:1030`) looks up `#sa-create-admin-btn` (`:1035`) — **ID absent in `staff.html`** | `runSingleSubmission(null)` → `{started:false}` (`js/core/submit-lock.js:4`) → **`ApiClient.createUser` never called** | Would be `POST /api/admin/create-user` + `provisionUser` (`api-server.js:637`, `provisioning.js:202`) | **No Auth/Firestore CA write** | CA fields **not** cleared (success path never runs) |
| Close | `superadminCloseCreateModal` (`:269`) **always after company success** | — | — | Modal hidden only | **No** form clear; return value of CA ignored |
| Cancel / X | `superadminCloseCreateModal` (`:252`) | — | — | Hide | Fields retained |
| Demo/local only | same submit | local `window.state` push (`:1006–1027`, `:1069–1091`) | — | Demo company + CA in memory | CA fields cleared on local CA success |

## Alternate recovery path (smoke-test reality)

| KORAK | UI FUNKCIJA | CLIENT API | SERVER HANDLER | STATE CHANGE | RESET/CLOSE |
|-------|-------------|------------|----------------|--------------|-------------|
| Manual CA after orphan company | Outside this modal (direct product API / other SA surface) | `ApiClient.createUser` | `POST /api/admin/create-user` | Auth user + `companies/{id}/users` + audit `user_created` | N/A |

## Wiring

- Handlers registered: `js/register-onclick-staff.js:453–457`
- Markup: `staff.html:507–595`
- No `#sa-create-admin-btn` anywhere in `staff.html` (80bd and b1d)
