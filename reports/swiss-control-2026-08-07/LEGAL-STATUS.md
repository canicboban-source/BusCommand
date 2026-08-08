# Legal / privacy status — technical gaps only (2026-08-07)

**This is not a legal compliance certificate.**  
BusCommand Master Prompt forbids claiming the product is legally cleared. Final confirmation for a market requires a qualified lawyer / DPO / employer-as-controller (and Betriebsrat where applicable).

## What this overnight pack did (technical)

- Kept Dispo credential firewall (no EID/PIN in Dispo monthly import UX).
- Strengthened CA vs Dispo boundary messaging (read-only ops banner).
- Removed dead CA monthly-assignment client module (D21 already forbids CA monthly assignment import via API `403`).
- Did **not** implement MFA, retention finalization, GPS legal basis, or staging privacy review.

## Technical privacy / security gaps (still open)

| Gap | Severity for hard prod | Owner action |
|-----|------------------------|--------------|
| MFA for privileged staff (SA/CA) | High | Product + identity provider decision |
| Staging Firebase project (O1) | High for prod claims | Provide staging credentials |
| Tenant export / anonymize before purge | Medium–High (GDPR-style) | Spec + implement |
| Retention schedule final | Medium | Legal profile per market |
| GPS / shift clock legal basis | Medium | Lawyer/DPO + worker representation where required |
| Demo passwords in demo mode | Low (demo only) | Keep out of production path |

## Product boundary reminder

Fuel, workshop, parts, payroll, invoices, and trip orders remain **out of scope**. Do not treat their absence as a legal defect of this cycle.

## Safe statement you can use tomorrow

> Soft-pilot technical controls for multi-tenant ops, D21 import roles, and Dispo credential isolation were re-verified (3× build/unit/e2e + walkthrough). **Legal clearance for production launch is not claimed** and remains pending staging + counsel.
