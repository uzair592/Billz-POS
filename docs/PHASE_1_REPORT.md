# Phase 1 report — 2026-09-23

Phase 1 billing and entitlement foundation is implemented on `feature/phase-1-billing-foundation`. Existing application records and previous migrations were preserved; eight additive migrations were applied locally.

Delivered workflows:

- platform plan versions with editable active/inactive status, module snapshots, device/user/branch limits, grace days and unpriced 1/2/3-device development seed examples;
- organization provisioning with initial branch, timezone/currency settings, bounded subscription dates, expiring temporary credentials and owner recovery links;
- invoice issuance, calendar-month periods with end-of-month anchor handling, partial manual payments, manual credits, immutable evidence attachments, receipts, idempotency and overpayment protection;
- request-time entitlement checks for active sessions, owner-only restricted billing, staff restriction, audited suspension/reactivation, optional timed suspension and scheduled past-due/expiry reconciliation;
- runtime and platform database roles without table ownership or BYPASSRLS, narrow authentication lookup functions, tenant-scoped attachments and direct isolation tests;
- responsive platform account/plans/billing and owner billing screens, same-origin browser API proxy for mobile clients, private print view, search/status/plan/renewal/outstanding filters, billing collections metrics, CI workflow and isolated acceptance runner.

Evidence executed:

| Check | Result |
| --- | --- |
| `corepack pnpm prisma validate` | PASS |
| `corepack pnpm typecheck` | PASS |
| `corepack pnpm build` | PASS; 19 Next routes and API build |
| `corepack pnpm lint` | PASS (repository TypeScript lint command) |
| `node scripts/test-phase-1.cjs` | PASS: 2 e2e suites, 9 tests, isolated database and all migrations |
| `node scripts/capture-phase-1.cjs` | PASS: desktop/tablet/mobile account, plans and owner billing screenshots; no horizontal overflow |

The browser smoke fixture is intentionally labelled `TEST Browser Café` and remains in the local development database. No production deployment or payment-provider verification is claimed. The test suite does not physically verify printers, gateways, MFA, backups or performance targets.

Requirement status: ISO-01 and SUB-01 are verified for this phase’s delivered surfaces; AUTH/FILE/AUD/PLAT/BILL are implemented with the limitations above; DEV-01 and IAM-01 remain Phase 2 work; sales, inventory, accounting, reports and offline workflows remain future phases.

Run locally with `corepack pnpm dev`, then open `http://localhost:3000`. Platform administration is at `/platform`; the owner billing page is `/workspace/billing`. Use the development seed values from `.env` only locally. To reproduce integration evidence, run `node scripts/test-phase-1.cjs`; it creates a separate database and never resets the application database.
