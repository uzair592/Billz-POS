# Phased backlog

Phase numbering follows MASTER_SPEC.md in the order its phase paragraphs appear. Each phase requires its own selected request, implementation note, vertical workflows, matrix update, tests, commit and GitHub handoff. Phase 0 does not authorize starting Phase 1.

| Phase | Deliverables | Measurable gate / test IDs | Dependencies |
| --- | --- | --- | --- |
| 0 | inventory, assessment, authority decisions, logical model, security model, state tables, route map, source-traceable matrix, five wireframes, operations and handoff | documentation coverage and prototype review; baseline checks reported | current repository |
| 1 | close runtime DB privilege gap; activation/recovery; admin tenant details/search; editable versioned plans; invoices/manual payment/credits/receipts; periods/grace; audited suspension/reactivation; restricted billing; initial roles/onboarding; private billing attachments; CI | ISO-01 direct HTTP/DB tests for two tenants; SUB-01 active-client expiry/suspension/reactivation; partial payments/renewal persist through restart | Phase 0 review |
| 2 | atomic concurrent leases, expiry/heartbeat/logout, full-seat recovery, platform/owner revocation; plan downgrade preview; custom roles, scope/thresholds, ownership protection, one-time approvals | DEV-01 1/2/3 seats including simultaneous login; IAM-01 role escalation denied, permissions update on next request | Phase 1 entitlement guard |
| 3 | menu/variants/modifiers/combos/prices/tax; cashier POS quick sale/takeaway, barcode/search/shortcuts, hold/resume; register basics; server totals/split tender; receipts/history/refunds | PAY-01, TAX-01, REC-01; retry produces one settlement; original receipt survives price edit/restart; render 80mm/PDF; identify physical test status | 1–2 |
| 4 | floor/table service, reservations/waitlist/deposits/advance orders; dine-in split/transfer; delivery; stations/delta tickets; outbox/realtime/catch-up | ORD-01 safe two-client conflict; RES-01 overlap/deposit-once; waiter/KDS/cashier three-client walkthrough, polling fallback | 3 |
| 5 | units/batches/locations, recipes/modifiers/packaging, allocations/movements/weighted costs; suppliers and separate PO/receipt/bill/payment; return/count/waste/transfer | INV-01 10 L minus 200 ml = 9.8 L; PAY does not consume again; PUR-01 partial receipt/retries/transfer reconciliation | 3–4 |
| 6 | khata/limits/advances/collections, expense approval/recurrence/attachments, full shift reconciliation, chart/journals/periods/reversals/source posting and reconciled historic backfill | FIN-01 balanced sources, no double revenue; CASH-01 expected closing 3,500; closed-period writes fail | 5 |
| 7 | precise dashboard, branch/business-day filters, drilldowns, sales/stock/purchase/customer/supplier/accounting reports; CSV/Excel/PDF and isolated export jobs | REP-01 all screens/ledger/exports reconcile same fixture; malicious spreadsheet cells neutralized; waiter cannot export costs | 6 |
| 8 | complete onboarding/import preview/duplicates; responsive/accessibility/offline-error UX; browser printing, optional bridge/station routes; installable PWA; documented peripherals | complete open-shift -> waiter -> kitchen -> pay -> refund -> close; 1366x768, 1024x768, 390px; saved and printed totals agree; REC-01 | 7 |
| 9 | MFA, full isolation/suspension/lease/realtime regression; restore drill; rollout/rollback; alerts/jobs/retention; measured performance and pilot checklist | OPS-01 usable restored DB; all earlier gates; no unresolved critical auth/money/stock/data-loss defects; documented dataset/p95 measurements | 0–8 |
| 10 | individually selected QR ordering, storefront, kiosk, loyalty/promotions, official messages, gateways/aggregators, API/webhooks | each increment has tenant/role/license/retry/abuse tests; provider sandbox evidence or NOT VERIFIED; no simulated success | stable pilot |
| 11 | separately approved offline threat/license model, command queue/reconciliation, then optional AI/voice, payroll/central kitchen/franchise/localization completion | replay, clock manipulation, suspension/license expiry, stock conflicts, rejected queue visibility; evaluated AI drafts need confirmation | 9 and bounded scopes |

## Priority findings to carry into implementation
H-01 Phase 1: database base connection remains broadly privileged; SET LOCAL ROLE wrappers do not protect direct reads or shared platform bypass.
H-02 Phase 1: active-session guard checks organization ACTIVE but does not evaluate subscription expiry/grace; no restricted owner billing route.
H-03 Phase 2 (must precede delegated staff use): role permission replacement and user role assignment lack grant-subset/self-escalation/last-owner checks.
H-04 Phase 2: registration count/create is not serialized; no live lease/heartbeat/logout release; revoked registrations can reactivate through login.
M-01 Phase 1: provisioning/contact/settings reusable, but invoices/manual payments/versioned pricing/renewals and complete platform detail UI are absent.
M-02 Phase 2/8: navigation not permission-specific; browser/mobile assertions have not been demonstrated.
M-03 Phase 1: CI absent; current lint is TypeScript checking, not a separate style/security linter.
M-04 Phase 8/9: browser API defaults to localhost; direct LAN phone use needs configured reachable API/origin or same-origin proxy and testing.

