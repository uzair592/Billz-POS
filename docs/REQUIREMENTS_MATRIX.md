# Requirements matrix — Phase 0

## Phase 3 evidence update — 2026-09-24

Phase 3 implementation and executed checks are recorded in [PHASE_3_REPORT.md](PHASE_3_REPORT.md).

| Requirement group | Phase 3 status | Evidence |
| --- | --- | --- |
| MENU-095 | PARTIAL vertical slice implemented | `prisma/schema.prisma`, `modules/pos`, `/workspace/pos`; variants, branch prices, combos and modifier metadata are persisted |
| PAY-103 | PARTIAL vertical slice implemented | server order total/payment equality in `pos.service.ts`; refund/split-history extensions remain |
| TAX-108 | PARTIAL | tax basis points are calculated server-side and snapshotted per order line |
| REC-114 | PARTIAL | tenant-scoped receipt numbers and immutable order snapshots; 80mm/PDF adapter remains |

## Phase 2 evidence update — 2026-09-24

Phase 2 implementation and executed checks are recorded in [PHASE_2_REPORT.md](PHASE_2_REPORT.md).

| Requirement group | Phase 2 status | Evidence |
| --- | --- | --- |
| DEV-01 | IMPLEMENTED for lease allocation/recovery | `auth.service.ts`, `auth.guards.ts`, `workspace.service.ts`, migration `20260924000100_device_leases_iam` |
| IAM-01 | IMPLEMENTED for custom roles, owner protection and one-use approvals | `workspace.service.ts`, `workspace.controller.ts`, `ApprovalChallenge`; permission checks remain request-time |
| DOWN-055 | IMPLEMENTED as conflict preview | `platform/billing.service.ts`, `billing.controller.ts` |

## Phase 1 evidence update — 2026-09-23

The Phase 0 baseline below is retained for traceability. Phase 1 implementation files and executed gates are recorded in [PHASE_1_REPORT.md](PHASE_1_REPORT.md).

| Requirement group | Phase 1 status | Evidence |
| --- | --- | --- |
| ISO-01 | PASS for platform, billing, runtime DB and private attachments | `apps/api/test/phase-1.e2e-spec.ts`; `prisma/migrations/20260923000200_runtime_boundaries` and `20260923000400_billing_attachments` |
| SUB-01 | PASS for invoice payment, grace expiry, live-session restriction/reactivation and timed suspension | `apps/api/test/phase-1.e2e-spec.ts`; `apps/api/src/modules/auth/entitlement.ts`; `billing.scheduler.ts` |
| AUTH/FILE/AUD/PLAT/BILL | IMPLEMENTED with documented limitations | `apps/api/src/modules/platform/billing*`; `apps/web/src/components/billing*`; migrations `20260923000100`–`20260923000600` |
| DEV-01/IAM-01 | PLANNED Phase 2 | Atomic leases, heartbeat, custom delegation and approval thresholds remain outside this phase |

MASTER_SPEC.md is governing. Source references below use its preserved line numbers. Each source clause has an individual stable ID; grouped acceptance criteria must be expanded into executable cases during its owning phase. DESIGNED means documented only; PARTIAL means reusable code with unmet gate; PLANNED is future scope, not a current defect. No operational gate is marked PASS based on compilation.

## Phase 0 deliverables

| ID | Requirement | Files | Evidence/status | Limitation |
| --- | --- | --- | --- | --- |
| P0-01 | Inventory, architecture, schema, security and backlog | ARCHITECTURE.md, BUSINESS_RULES.md, PHASED_BACKLOG.md | Delivered by code inspection/document review | Operational gaps explicitly open |
| P0-02 | Five workflow wireframes | wireframes/index.html; wireframes/screenshots/ | 15 headless Chrome renders at three viewport sizes; see phase report | Static prototype review only, no operational or physical-device verification |
| P0-03 | Requirement coverage and gates | this matrix; MASTER_SPEC.md; SUPPLEMENTARY_BRIEF.md | Every core clause below has phase and measurable gate | Tests listed are acceptance targets, not passed tests |
| P0-04 | Local setup and evidence | OPERATIONS.md, PHASE_REPORT.md | See actual execution report | No production/hardware verification |
| P0-05 | Git branch/commit/push/PR | local project Git repository | Local delivery; remote BLOCKED | No configured GitHub remote |

## Core capability groups

| ID | Master lines | Phase | Implemented files/evidence anchor | Status | Test IDs | Measurable acceptance |
| --- | --- | --- | --- | --- | --- | --- |
| GOV | 1–27 | 0; every phase | docs/ARCHITECTURE.md; docs/PHASE_REPORT.md | DESIGNED; inspection only | P0-01 | Review saved briefs, preserved stack/data, scoped delivery and actual command evidence. |
| ISO | 28–33 | 1; extend 2–10 | apps/api/src/database/prisma.service.ts; prisma/migrations | PARTIAL; inspection only | ISO-01 | Two tenants: guessed IDs and submitted scope cannot cross HTTP/DB, then exports/files/jobs/events as delivered; runtime role has no bypass. |
| AUTH | 34–36 | 1; MFA 9 | apps/api/src/modules/auth; apps/api/src/common/security.ts | PARTIAL; inspection only | IAM-01; OPS-01 | Activate once before expiry, reset revokes sessions; CSRF/rate limits reject attacks; require owner/platform MFA before pilot. |
| FILE | 37–37 | 1 billing; 6 expenses; 7 exports | prisma/schema.prisma (metadata only) | PLANNED; inspection only | ISO-01 | Tenant B cannot retrieve A attachment, even guessed ID; size/type rejected; signed access expires. |
| AUD | 38–39 | 1; finance 3–6 | apps/api/src/modules/audit; prisma/migrations | PARTIAL; inspection only | ISO-01; FIN-01 | Sensitive mutations append redacted actor/context/reason; runtime audit edit/delete rejected; posted corrections reverse. |
| PLAT | 40–46 | 1; archive hardening 9 | apps/api/src/modules/platform; apps/web/src/app/platform | PARTIAL; inspection only | SUB-01 | Provision two restaurants and review/search details; secure recovery; audited status; collections derive from invoices/payments and differ from recurring revenue. |
| BILL | 47–54 | 1; gateways 10 | prisma/schema.prisma; prisma/seed.ts (limits only) | PARTIAL; inspection only | SUB-01 | Versioned admin prices and 1/2/3 examples; partial payment/credit/month-end renewal reconcile; scheduler retries and request-time grace expiry agree. |
| DOWN | 55–55 | 2 | none | PLANNED; inspection only | DEV-01 | Downgrade shows all usage conflicts, persists explicitly selected enabled resources, deletes no records. |
| SUB | 56–62 | 1; realtime 4; offline 11 | apps/api/src/modules/platform; apps/api/src/modules/auth/auth.guards.ts | PARTIAL; inspection only | SUB-01 | Suspend active client: next operational request denied; restricted owner billing reachable; reactivation preserves data; committed transaction retained. |
| DEV | 63–76 | 2; realtime extension 4 | apps/api/src/modules/auth/auth.service.ts; apps/api/src/modules/workspace/workspace.service.ts | PARTIAL; inspection only | DEV-01 | Concurrent 1/2/3-seat tests, tabs, last logout, 30s heartbeat/5m expiry, revoke, full-seat recovery; random installation identity. |
| IAM | 77–85 | 1 templates; 2 enforcement; extend 3–7 | apps/api/src/modules/auth/auth.guards.ts; apps/api/src/modules/workspace/workspace.service.ts | PARTIAL; inspection only | IAM-01 | Restricted manager/accountant cannot self-elevate, assign owner, cross branch or expose costs; permission removal applies next request; one-use approval. |
| UX | 86–94 | 0 wireframes; incremental 1–7; completion 8 | apps/web/src; docs/wireframes/index.html | PARTIAL; inspection only | P0-02; REC-01 | Role-specific review at 1366x768, 1024x768, 390px; keyboard/error/retry states; >=44px touch controls; import preview rejects invalid/duplicate rows. |
| MENU | 95–95 | 3; recipe effects 5 | none | PLANNED; inspection only | PAY-01; INV-01 | Create branch-priced variant/required modifiers/combo; invalid min/max blocked; price edits preserve historical snapshots and stock is not double counted. |
| ORD | 96–102 | 3 baseline; 4 service/kitchen | none | PLANNED; inspection only | ORD-01; REC-01 | Hold/resume, independent order/kitchen/payment states; concurrent version conflict; append delta/change ticket; split/merge only compatible unpaid checks. |
| PAY | 103–113 | 3; credit 6; stock disposition 5 | prisma/schema.prisma (PaymentMethod/IdempotencyKey only) | PLANNED; inspection only | PAY-01; TAX-01 | Authoritative decimal totals match fixture; split/partial tender, original-allocation refund caps, unique numbering and idempotency payload conflict tested. |
| RES | 114–119 | 4; ledger 6 | none | PLANNED; inspection only | RES-01; FIN-01 | Concurrent table overlap rejected unless explicit audited override; waitlist/advance booking persists; deposit applies once, stays liability until earned. |
| KDS | 120–123 | 4 | none | PLANNED; inspection only | ORD-01; REC-01 | Three clients show correct station delta and delivery states; catch-up/polling preserves committed tickets without duplication. |
| INV | 124–131 | 5 | none | PLANNED; inspection only | INV-01 | 10L milk minus 200ml preparation = 9.8L once; compatible conversions, modifier/packaging/yield and cancellation waste; immutable weighted cost; concurrency rejects insufficient stock. |
| PUR | 132–135 | 5; reports 7 | none | PLANNED; inspection only | PUR-01 | PO alone adds no stock; partial receipts add once, bill/payment don't repeat stock; returns/landed costs/in-transit transfer reconcile. |
| CASH | 136–136 | 3 basics; 6 reconciliation | none | PLANNED; inspection only | CASH-01 | One compatible active till session; cash fixture closes at 3500 with explained count variance; correction audited, noncash separate. |
| FIN | 137–150 | 6; presentation 7 | none | PLANNED; inspection only | FIN-01 | Credit collection is not revenue twice; customer opt-in/limits/advances and expense approval/recurrence persist; journals balance, closed periods reject edits; unique source backfill reconciles. |
| REP | 151–160 | 7 | none | PLANNED; inspection only | REP-01; ISO-01 | Same timezone/day filters reconcile every dashboard/drilldown/export to posted sources; unauthorized fields absent; spreadsheet injection blocked; large export link expires. |
| PRINT | 161–167 | 3 baseline receipts; 4 KDS; 8 hardware/PWA | none | PLANNED; inspection only | REC-01 | 58/80mm/A4/PDF totals match stored receipt; retry/reprint audited, printer failure preserves sale; exact physical OS/model evidence, no raw card data. |
| OFF | 168–169 | 3 online failure; 11 offline | none | PLANNED; inspection only | REC-01 | Connection loss prevents unsafe submission; later approved offline model tests replay, expiry, clock tampering, revocation and visible conflict queue. |
| EXT | 170–176 | 10 separately selected | none | PLANNED; inspection only | ISO-01; REC-01 | Public scoped tokens reject abuse/cross-tenant requests; loyalty reversals and promotions reconcile; official providers require real sandbox evidence, signed deduplicated webhooks and consent. |
| MULTI | 177–177 | 5 transfers; 7 consolidation | none | PLANNED; inspection only | ISO-01; REP-01 | Consolidation and transfers include only authorized licensed branches; currency handling explicit. |
| API | 178–178 | 10 | none | PLANNED; inspection only | ISO-01; REC-01 | Scoped keys, secret rotation, rate limits and signed retried webhooks pass integration tests without duplicate mutations. |
| ADV | 179–180 | 11 separately scoped after offline | none | PLANNED; inspection only | REC-01 | Payroll/central kitchen/franchise/language acceptance specified per selected increment; AI evaluated on sufficient data and cannot commit financial action without confirmation. |

## Individual source clauses

These are traceability entries, not separate implementation claims. Each inherits files, current status, limitations and measurable acceptance from its group above. The full clause remains authoritative even when several subfeatures share one gate.

| Requirement ID | Source line | Phase | Group / gate | Description |
| --- | --- | --- | --- | --- |
| GOV-001 | 1 | 0; every phase | GOV / P0-01 | Give the coding agent this entire document once. Tell it to start with Phase 0 only. For each subsequent phase, use the continuation prompt at the end. Keep this document in the repository as docs/MASTER_SPEC.md so it remains available across agent sessions. Each phase ends with a tested GitHub delivery that can be reviewed before proceeding. |
| GOV-002 | 2 | 0; every phase | GOV / P0-01 | This is a product specification, not a claim that any existing application has been inspected or that every feature can be built reliably in one generation. The first commercial pilot is after Phases 0–9 pass their gates. Later phases extend the product. Do not advertise unimplemented capabilities. |
| GOV-003 | 3 | 0; every phase | GOV / P0-01 | You are the lead engineer implementing a real, web-based, multi-tenant restaurant POS and management SaaS. Build working business workflows with persistent data, strict authorization, financial integrity, and professional usability. A collection of attractive disconnected screens is not an acceptable delivery. |
| GOV-004 | 4 | 0; every phase | GOV / P0-01 | I own and administer the SaaS platform. My customers are independent cafés, restaurants, bakeries, takeaway shops, and cloud kitchens. |
| GOV-005 | 5 | 0; every phase | GOV / P0-01 | There are TWO distinct administrative environments: |
| GOV-006 | 6 | 0; every phase | GOV / P0-01 | 1. Platform administration: I create restaurant organizations, create their initial owner accounts, assign subscriptions and device limits, record subscription payments, and suspend/reactivate access. |
| GOV-007 | 7 | 0; every phase | GOV / P0-01 | 2. Restaurant workspace: Each restaurant owner manages their own branches, staff, permissions, menu, orders, kitchen, inventory, finances, and reports. |
| GOV-008 | 8 | 0; every phase | GOV / P0-01 | A restaurant owner is never a platform administrator. Restaurant staff cannot change their own subscription, purchased feature limits, or platform permissions. A tenant is one restaurant business/organization and may contain multiple branches. Businesses must never see one another's information. |
| GOV-009 | 9 | 0; every phase | GOV / P0-01 | Initial acquisition is admin-provisioned. Do not enable public restaurant signup by default. A future self-service onboarding flow is outside the initial scope. |
| GOV-010 | 10 | 0; every phase | GOV / P0-01 | Defaults: PKR, Asia/Karachi, English, configurable local date/time presentation. Store timestamps in UTC and report according to the branch timezone and configurable business-day cutoff. Prepare translation keys and layout direction support; complete Urdu translation is a later feature. No subscription prices or tax rates should be hardcoded as business truth. |
| GOV-011 | 11 | 0; every phase | GOV / P0-01 | - Inspect the existing repository before changing it. Read applicable repository instructions. Identify the stack, migrations, tests, current behavior, security gaps, and reusable work. |
| GOV-012 | 12 | 0; every phase | GOV / P0-01 | - Preserve working code and existing customer data. Do not wipe the database, replace the entire application, or rewrite the stack just because starting fresh is easier. |
| GOV-013 | 13 | 0; every phase | GOV / P0-01 | - Implement only the selected phase and prerequisites necessary for it. Record dependencies rather than pretending unfinished future features work. |
| GOV-014 | 14 | 0; every phase | GOV / P0-01 | - For routine implementation choices, choose a sensible default and document it. Ask only about a genuinely blocking ambiguity, missing external access, or destructive operation. |
| GOV-015 | 15 | 0; every phase | GOV / P0-01 | - Begin with a concise implementation note: schema/migrations, API contracts, UI flows, permission checks, business invariants, failure cases, and acceptance tests. |
| GOV-016 | 16 | 0; every phase | GOV / P0-01 | - Complete a vertical workflow: UI → authenticated API → database → resulting reports/audit entries. Persisted behavior must survive reload and service restart. |
| GOV-017 | 17 | 0; every phase | GOV / P0-01 | - Use clearly marked demo seed data only in development/test environments. Never show fabricated live revenue, successful payments, stock balances, or report charts. |
| GOV-018 | 18 | 0; every phase | GOV / P0-01 | - No dead buttons, placeholder handlers, silent TODOs, or hardcoded success responses in delivered workflows. Keep future modules out of operational navigation; identify them in the roadmap. |
| GOV-019 | 19 | 0; every phase | GOV / P0-01 | - Run the relevant automated tests, type checks, lint, build, and migration checks. Report actual commands and results. Never say a test passed if it was not run. |
| GOV-020 | 20 | 0; every phase | GOV / P0-01 | - Maintain docs/REQUIREMENTS_MATRIX.md: requirement ID, description, phase, implemented files, test evidence, status, and limitations. |
| GOV-021 | 21 | 0; every phase | GOV / P0-01 | - Maintain docs/PHASE_REPORT.md, docs/ARCHITECTURE.md, docs/BUSINESS_RULES.md, docs/OPERATIONS.md, and CHANGELOG.md as applicable. |
| GOV-022 | 22 | 0; every phase | GOV / P0-01 | - At the end of each phase, commit and push to a descriptive feature branch on the configured GitHub remote. Provide the branch, commit SHA, changed files, screenshots, test results, known gaps, and review instructions. Open a PR if authenticated tooling permits. Do not merge to the default branch or deploy production automatically. |
| GOV-023 | 23 | 0; every phase | GOV / P0-01 | - If GitHub credentials or the remote are missing, retain local commits and report the exact blocker. Never invent a repository URL or claim a push succeeded. |
| GOV-024 | 24 | 0; every phase | GOV / P0-01 | - Stop after delivering the selected phase. Resume when I request the next phase or corrections. |
| GOV-025 | 25 | 0; every phase | GOV / P0-01 | If the repository already has a suitable stack, keep it and document gaps. For a new repository use React + TypeScript for the frontend, FastAPI with Pydantic and SQLAlchemy/Alembic for the backend, and PostgreSQL. Use a maintained component system and consistent design tokens. Pin compatible dependency versions and commit the lockfiles. Verify current official documentation when selecting version-sensitive APIs. |
| GOV-026 | 26 | 0; every phase | GOV / P0-01 | Prefer a modular monolith with explicit service boundaries over premature microservices. Provide repeatable local setup, environment examples without secrets, database migrations, development seeds, and CI. Introduce Redis/background workers when required by jobs or realtime scaling, not as a substitute for authoritative database records. |
| GOV-027 | 27 | 0; every phase | GOV / P0-01 | Use transactional database operations for orders, payments, stock, journal entries, and device seats. Use an outbox or equivalent reliable handoff for side effects such as kitchen events, print jobs, and notifications. A committed transaction must not disappear because a WebSocket notification failed. |
| ISO-028 | 28 | 1; extend 2–10 | ISO / ISO-01 | - Put tenant_id on tenant-owned entities; put branch_id on branch-owned entities. Global platform tables are separate. |
| ISO-029 | 29 | 1; extend 2–10 | ISO / ISO-01 | - Derive tenant and branch authority from authenticated membership, never blindly from a request header, URL parameter, or submitted object. |
| ISO-030 | 30 | 1; extend 2–10 | ISO / ISO-01 | - Use PostgreSQL row-level security plus application authorization. The runtime role must not be a superuser, table owner bypassing protection, or have BYPASSRLS. Use transaction-scoped tenant context safely with pooled connections and reset it correctly. |
| ISO-031 | 31 | 1; extend 2–10 | ISO / ISO-01 | - Use tenant-consistent foreign keys/constraints so records cannot reference another tenant's customer, order, role, or stock location. |
| ISO-032 | 32 | 1; extend 2–10 | ISO / ISO-01 | - Enforce isolation on exports, attachments, background jobs, caches, search, reports, WebSocket subscriptions, and print queues as well as CRUD. |
| ISO-033 | 33 | 1; extend 2–10 | ISO / ISO-01 | - Platform operations use separately authorized services with narrow privileges and audit trails; do not give normal requests a database bypass. |
| AUTH-034 | 34 | 1; MFA 9 | AUTH / IAM-01; OPS-01 | - Secure password hashing, rate-limited login/recovery, secure session cookies, CSRF protection where applicable, secure headers, and no committed secrets. |
| AUTH-035 | 35 | 1; MFA 9 | AUTH / IAM-01; OPS-01 | - Initial owner access uses an expiring, single-use activation link or one-time temporary password with mandatory change. Never show existing passwords or store readable passwords. If no email provider exists, allow the administrator to copy the activation link securely. |
| AUTH-036 | 36 | 1; MFA 9 | AUTH / IAM-01; OPS-01 | - Password reset and device revocation invalidate relevant sessions. Add MFA for platform administrators and owners before the commercial pilot. |
| FILE-037 | 37 | 1 billing; 6 expenses; 7 exports | FILE / ISO-01 | - Attachments are private, tenant-scoped, size/type validated, and delivered through authorized access or short-lived signed URLs. |
| AUD-038 | 38 | 1; finance 3–6 | AUD / ISO-01; FIN-01 | - Audit sensitive actions with actor, tenant/branch, action, target, safe before/after values, timestamp, device/session, and reason. Do not log passwords, tokens, complete card data, or unnecessary customer information. |
| AUD-039 | 39 | 1; finance 3–6 | AUD / ISO-01; FIN-01 | - Audit records and posted financial documents cannot be edited/deleted through normal application access. Corrections use explicit reversing or adjustment records. |
| PLAT-040 | 40 | 1; archive hardening 9 | PLAT / SUB-01 | Build a separate platform navigation and authorization boundary, such as /platform. |
| PLAT-041 | 41 | 1; archive hardening 9 | PLAT / SUB-01 | - Create a restaurant: business name, contact details, initial branch, owner identity, timezone/currency, plan, start date, renewal date, grace period, and permitted overrides. |
| PLAT-042 | 42 | 1; archive hardening 9 | PLAT / SUB-01 | - Search/filter restaurants by status, plan, renewal date, and outstanding subscription amount. |
| PLAT-043 | 43 | 1; archive hardening 9 | PLAT / SUB-01 | - View subscription history, owner contact, branches, device usage, permitted modules, and platform support history. |
| PLAT-044 | 44 | 1; archive hardening 9 | PLAT / SUB-01 | - Reset owner access using the secure recovery flow, resend/regenerate activation, change plans, and manage manual exceptions with reasons and expiry dates. |
| PLAT-045 | 45 | 1; archive hardening 9 | PLAT / SUB-01 | - Archive tenants through a deliberate retention workflow. Suspending a subscription must never delete restaurant data. |
| PLAT-046 | 46 | 1; archive hardening 9 | PLAT / SUB-01 | - Platform metrics include active/suspended/trial customers, overdue invoices, subscription collections, and plan distribution. Define recurring revenue separately from cash collected. |
| BILL-047 | 47 | 1; gateways 10 | BILL / SUB-01 | - Editable plans: name, monthly price/currency, branch limit, named-user limit if applicable, concurrent device limit, included modules, active/inactive status. |
| BILL-048 | 48 | 1; gateways 10 | BILL / SUB-01 | - Configurable 1-, 2-, and 3-device examples in seed plans; production pricing is entered by the administrator. |
| BILL-049 | 49 | 1; gateways 10 | BILL / SUB-01 | - Preserve plan/subscription version history. Price changes must not silently alter already issued invoices. |
| BILL-050 | 50 | 1; gateways 10 | BILL / SUB-01 | - Subscription states: trial, active, past_due, suspended, cancelled. Store billing-period dates and grace-period end explicitly. |
| BILL-051 | 51 | 1; gateways 10 | BILL / SUB-01 | - Monthly billing uses calendar months with a documented end-of-month rule. Handle partial payments, credits, renewal, reactivation, and administrator adjustments. |
| BILL-052 | 52 | 1; gateways 10 | BILL / SUB-01 | - Create subscription invoices, payment records, outstanding balances, receipts, and manual payment references/attachments. Recording bank transfer, cash, JazzCash, or Easypaisa manually must be labelled manual; it is not payment-provider verification. |
| BILL-053 | 53 | 1; gateways 10 | BILL / SUB-01 | - Automated online billing is a later integration. Do not simulate provider success. |
| BILL-054 | 54 | 1; gateways 10 | BILL / SUB-01 | - Scheduled overdue checks must be idempotent. Authorization must also check entitlement expiry at request time so a failed scheduler cannot leave unpaid access open indefinitely. |
| DOWN-055 | 55 | 2 | DOWN / DEV-01 | - Plan downgrades must show conflicts with branch/user/device usage and require selecting which resources remain enabled; do not delete excess resources or silently pick users to remove. |
| SUB-056 | 56 | 1; realtime 4; offline 11 | SUB / SUB-01 | - Admin can suspend and reactivate with a reason, effective time, and optional expiry. |
| SUB-057 | 57 | 1; realtime 4; offline 11 | SUB / SUB-01 | - Suspension blocks operational reads/writes, staff login to operational screens, public ordering, realtime subscriptions, background business mutations, and new device leases. |
| SUB-058 | 58 | 1; realtime 4; offline 11 | SUB / SUB-01 | - An owner can reach a restricted billing/reactivation screen showing amount due and contact details; staff see a clear contact-your-owner message. |
| SUB-059 | 59 | 1; realtime 4; offline 11 | SUB / SUB-01 | - Existing sessions must lose operational authorization on their next request; notify connected clients promptly and close unauthorized channels. Do not rely only on token expiry or hidden navigation. |
| SUB-060 | 60 | 1; realtime 4; offline 11 | SUB / SUB-01 | - Define in-flight behavior: a database transaction already committed remains committed; new requests after suspension fail. Payment-provider callbacks still record/reconcile real payment outcomes without granting general access or losing evidence. |
| SUB-061 | 61 | 1; realtime 4; offline 11 | SUB / SUB-01 | - Reactivation restores access to the same records. Write tests for suspension with active clients and reactivation. |
| SUB-062 | 62 | 1; realtime 4; offline 11 | SUB / SUB-01 | - Default offline sales are disabled; any later offline license must explicitly document its bounded suspension delay. |
| DEV-063 | 63 | 2; realtime extension 4 | DEV / DEV-01 | Interpret the limit as concurrent authenticated staff browser installations across the entire restaurant tenant, not simply the number of usernames. Branches share the tenant's pool unless the plan explicitly adds a branch-specific rule. |
| DEV-064 | 64 | 2; realtime extension 4 | DEV / DEV-01 | - Laptop browser, POS browser, waiter tablet, owner phone, and KDS browser each consume one device seat while holding an active lease. |
| DEV-065 | 65 | 2; realtime extension 4 | DEV / DEV-01 | - Multiple tabs in the same browser profile share a device identity and lease. Different browsers/profiles/private browsing count separately. Reopening the same installation resumes the existing lease where possible. |
| DEV-066 | 66 | 2; realtime extension 4 | DEV / DEV-01 | - A browser system cannot prove physical hardware identity. Do not use IP address as device identity or promise prevention of all deliberate cookie copying. Use a random installation identifier plus authenticated server-issued credentials; fingerprints are not authoritative. |
| DEV-067 | 67 | 2; realtime extension 4 | DEV / DEV-01 | - Public QR customers do not consume staff seats. Local print helpers do not independently consume a seat unless separately licensed. Platform admins in their own console do not consume tenant seats. |
| DEV-068 | 68 | 2; realtime extension 4 | DEV / DEV-01 | - Maintain device name, tenant, branch, device class, active user/session links, creation time, last heartbeat, lease expiry, revocation state, and appropriate limited metadata. |
| DEV-069 | 69 | 2; realtime extension 4 | DEV / DEV-01 | - A valid user login atomically obtains or resumes a seat. Lock/check allocation in the database so simultaneous logins cannot exceed the plan. Failed authentication never consumes a seat. |
| DEV-070 | 70 | 2; realtime extension 4 | DEV / DEV-01 | - Default lease: heartbeat every 30 seconds, expiry after 5 minutes without a heartbeat. Make these platform-configurable. An expired device must reacquire a seat before its next protected request, even when its login session remains valid. |
| DEV-071 | 71 | 2; realtime extension 4 | DEV / DEV-01 | - Logging out the last session on a device releases its seat. Closing a tab is not reliably observable; use lease expiry. Network interruption and browser backgrounding must have clear behavior. |
| DEV-072 | 72 | 2; realtime extension 4 | DEV / DEV-01 | - Every operational API and realtime channel requires a valid unrevoked lease. A heartbeat alone must not reactivate a revoked device. |
| DEV-073 | 73 | 2; realtime extension 4 | DEV / DEV-01 | - If full: show “Your plan allows N active devices. Ask the owner to disconnect a device or contact support to upgrade.” Never silently evict another device. |
| DEV-074 | 74 | 2; realtime extension 4 | DEV / DEV-01 | - Owner can inspect and revoke their tenant's devices; platform admin can do the same. Provide a rate-limited, reauthenticated device-management recovery route that works when seats are full but grants no POS access without a seat. |
| DEV-075 | 75 | 2; realtime extension 4 | DEV / DEV-01 | - Revoking a device stops new requests and notifies its connected clients. Record the action in the audit log. |
| DEV-076 | 76 | 2; realtime extension 4 | DEV / DEV-01 | - Permission switching on a shared till must retain individual actor attribution. A manager approval does not permanently turn the cashier into a manager. |
| IAM-077 | 77 | 1 templates; 2 enforcement; extend 3–7 | IAM / IAM-01 | Default role templates: Owner, Manager, Accountant, Cashier, Waiter, Kitchen Staff, Inventory/Purchase Staff, and read-only Auditor. Owners can create custom roles and edit delegated permissions. |
| IAM-078 | 78 | 1 templates; 2 enforcement; extend 3–7 | IAM / IAM-01 | Permission model: resource + action + scope, with branch restrictions and monetary thresholds where needed. Cover view/create/update, submit, approve, cancel, refund, discount, price override, export, stock adjustment, payment collection, journal posting, user administration, and device management. |
| IAM-079 | 79 | 1 templates; 2 enforcement; extend 3–7 | IAM / IAM-01 | - Owner controls how much access the manager/accountant receives. |
| IAM-080 | 80 | 1 templates; 2 enforcement; extend 3–7 | IAM / IAM-01 | - Staff cannot grant permissions they lack, assign Owner/platform privileges, or modify their own effective authority. |
| IAM-081 | 81 | 1 templates; 2 enforcement; extend 3–7 | IAM / IAM-01 | - Reserve ownership transfer and owner-account management for an explicit owner/platform workflow. Prevent removing the last active owner. |
| IAM-082 | 82 | 1 templates; 2 enforcement; extend 3–7 | IAM / IAM-01 | - Restrict sensitive sales/profit/cost reports separately. A waiter should not obtain costs through API responses even if the UI hides them. |
| IAM-083 | 83 | 1 templates; 2 enforcement; extend 3–7 | IAM / IAM-01 | - Default manager has operations access; accountant has authorized financial access; cashier handles sales; waiter handles assigned table orders; kitchen staff sees assigned stations with minimal customer data. |
| IAM-084 | 84 | 1 templates; 2 enforcement; extend 3–7 | IAM / IAM-01 | - Permission removal takes effect on subsequent protected requests, without waiting for a long-lived token to expire. |
| IAM-085 | 85 | 1 templates; 2 enforcement; extend 3–7 | IAM / IAM-01 | - Manager approvals require an identified authorized approver, secure reauthentication or a rate-limited PIN, action/amount binding, and an audit record. |
| UX-086 | 86 | 0 wireframes; incremental 1–7; completion 8 | UX / P0-02; REC-01 | Use a professional, restrained design: clear typography, consistent spacing, strong contrast, limited accent colors, accessible forms, and plain-language errors. Avoid decorative dashboard clutter. Use useful loading, empty, error, permission-denied, offline, and retry states. |
| UX-087 | 87 | 0 wireframes; incremental 1–7; completion 8 | UX / P0-02; REC-01 | Role-specific workspaces: |
| UX-088 | 88 | 0 wireframes; incremental 1–7; completion 8 | UX / P0-02; REC-01 | - Owner/manager: overview, operations, stock, staff, reporting, settings according to permissions. |
| UX-089 | 89 | 0 wireframes; incremental 1–7; completion 8 | UX / P0-02; REC-01 | - Cashier: product search/categories, product grid, cart, order type, totals, payment, held orders, and register controls. |
| UX-090 | 90 | 0 wireframes; incremental 1–7; completion 8 | UX / P0-02; REC-01 | - Waiter tablet: tables → open table → add items/modifiers/notes → send kitchen ticket → see preparation status → request bill. |
| UX-091 | 91 | 0 wireframes; incremental 1–7; completion 8 | UX / P0-02; REC-01 | - Kitchen display: large readable station tickets, elapsed times, notes, item status, and service alerts. |
| UX-092 | 92 | 0 wireframes; incremental 1–7; completion 8 | UX / P0-02; REC-01 | - Accountant: purchase/payables, customer receivables, expenses, cash reconciliation, journals, and financial reports. |
| UX-093 | 93 | 0 wireframes; incremental 1–7; completion 8 | UX / P0-02; REC-01 | Support desktop at 1366×768, landscape tablet around 1024×768, and mobile around 390px wide. POS touch controls should be at least 44px targets. Keep primary actions reachable without unnecessary dialogs. Use consistent order, kitchen, and payment status colors with text labels, not color alone. |
| UX-094 | 94 | 0 wireframes; incremental 1–7; completion 8 | UX / P0-02; REC-01 | Include onboarding: business/branch settings → menu → tables/stations → staff → taxes/payment methods → receipt → first shift. Allow menu/stock CSV import with a template, preview, validation errors, and safe duplicate handling. |
| MENU-095 | 95 | 3; recipe effects 5 | MENU / PAY-01; INV-01 | Categories, products, variations, SKU/barcode, images, preparation station, availability, branch-specific prices, tax category, dine-in/takeaway availability, and optional preparation time. Modifiers support required/optional groups, min/max selections, price differences, and ingredient effects. Support combos/bundles without double-counting stock or discounts. Menu changes must not rewrite historical order snapshots. |
| ORD-096 | 96 | 3 baseline; 4 service/kitchen | ORD / ORD-01; REC-01 | Dine-in, takeaway, delivery, and quick sale. Item quantities, modifiers, notes/allergy flags, server assignment, guests, hold/resume, table transfer, split bills by item/quantity/equal amount, and combining compatible open checks. Never merge settled financial records as if they were unpaid orders. |
| ORD-097 | 97 | 3 baseline; 4 service/kitchen | ORD / ORD-01; REC-01 | Separate state machines for: |
| ORD-098 | 98 | 3 baseline; 4 service/kitchen | ORD / ORD-01; REC-01 | - Order lifecycle: draft, submitted, fulfilled, closed, cancelled. |
| ORD-099 | 99 | 3 baseline; 4 service/kitchen | ORD / ORD-01; REC-01 | - Kitchen progress: pending, preparing, ready, served/cancelled at ticket/item level. |
| ORD-100 | 100 | 3 baseline; 4 service/kitchen | ORD / ORD-01; REC-01 | - Payment: unpaid, partially_paid, paid, partially_refunded, refunded. |
| ORD-101 | 101 | 3 baseline; 4 service/kitchen | ORD / ORD-01; REC-01 | Define permitted transitions, actor permissions, and side effects in a table. An order can be served while unpaid; kitchen readiness must not imply payment. |
| ORD-102 | 102 | 3 baseline; 4 service/kitchen | ORD / ORD-01; REC-01 | Send additions to the kitchen as delta tickets. Later edits/voids to submitted items produce identifiable change/cancellation tickets. Multiple devices editing the same order require version checks and an explicit refresh/merge conflict flow; never silently overwrite another waiter's work. |
| PAY-103 | 103 | 3; credit 6; stock disposition 5 | PAY / PAY-01; TAX-01 | - Server computes authoritative subtotal, item/order discounts, taxes, service/packaging/delivery charges, rounding, paid amount, outstanding amount, and change. |
| PAY-104 | 104 | 3; credit 6; stock disposition 5 | PAY / PAY-01; TAX-01 | - Use Decimal or integer minor units for money, explicit rounding rules, and suitable precision for quantities/costs. Client may show a preview but cannot set trusted totals. |
| PAY-105 | 105 | 3; credit 6; stock disposition 5 | PAY / PAY-01; TAX-01 | - Persist price, modifier, tax, discount, and cost snapshots required to explain historical results. |
| PAY-106 | 106 | 3; credit 6; stock disposition 5 | PAY / PAY-01; TAX-01 | - Support inclusive/exclusive tax and documented discount allocation across items/rates. Model refund allocation from original invoice amounts rather than recomputing current prices. |
| PAY-107 | 107 | 3; credit 6; stock disposition 5 | PAY / PAY-01; TAX-01 | - Cash, manually recorded card terminal payment, bank transfer, JazzCash, Easypaisa, customer credit, and configurable payment methods. Clearly distinguish manual entries from verified gateway transactions. |
| PAY-108 | 108 | 3; credit 6; stock disposition 5 | PAY / PAY-01; TAX-01 | - Split tender, partial payment, customer credit permission/limit, cash received/change, and partial/full refunds tied to original lines/payments. |
| PAY-109 | 109 | 3; credit 6; stock disposition 5 | PAY / PAY-01; TAX-01 | - No negative sale total, refund above eligible balance, double settlement, or reuse of a one-time approval. |
| PAY-110 | 110 | 3; credit 6; stock disposition 5 | PAY / PAY-01; TAX-01 | - Use idempotency keys for payments, order submission, refunds, and other retry-sensitive writes. The same key with different payload is rejected. |
| PAY-111 | 111 | 3; credit 6; stock disposition 5 | PAY / PAY-01; TAX-01 | - Use human-readable branch/business-day numbering with concurrent uniqueness and an immutable internal ID. Never recycle voided numbers. |
| PAY-112 | 112 | 3; credit 6; stock disposition 5 | PAY / PAY-01; TAX-01 | - Returns/refunds do not automatically restock prepared food. Capture disposition: return to stock when valid, wastage, or no physical stock movement. |
| PAY-113 | 113 | 3; credit 6; stock disposition 5 | PAY / PAY-01; TAX-01 | - Posted/paid invoices are immutable; subsequent changes create adjustments, credit notes, or replacement documents with links. |
| RES-114 | 114 | 4; ledger 6 | RES / RES-01; FIN-01 | - Floors/zones, configurable table arrangement, capacity, availability, occupied, bill requested, and cleaning status. Derive occupancy safely from active service records. |
| RES-115 | 115 | 4; ledger 6 | RES / RES-01; FIN-01 | - Reservations: customer/contact, time, duration, party size, assigned table(s), notes, confirmed/seated/completed/cancelled/no-show states. |
| RES-116 | 116 | 4; ledger 6 | RES / RES-01; FIN-01 | - Prevent overlapping confirmed assignments transactionally, including concurrent requests; allow authorized overrides with reason and visible warning. |
| RES-117 | 117 | 4; ledger 6 | RES / RES-01; FIN-01 | - Walk-ins, waitlist, reservation deposits, cancellation/refund policy settings, and converting a reservation to a dine-in order without losing the deposit. |
| RES-118 | 118 | 4; ledger 6 | RES / RES-01; FIN-01 | - Advance takeaway/catering booking with promised collection/delivery time, line items, notes, deposit, outstanding amount, and kitchen scheduling. |
| RES-119 | 119 | 4; ledger 6 | RES / RES-01; FIN-01 | - Deposits are tracked separately and applied exactly once at checkout. They are not immediately restaurant sales revenue. |
| KDS-120 | 120 | 4 | KDS / ORD-01; REC-01 | - Kitchen stations such as bar, hot kitchen, and dessert; route items/modifiers to the correct station. |
| KDS-121 | 121 | 4 | KDS / ORD-01; REC-01 | - Ticket elapsed timers, acknowledge/start/ready/served actions, optional sound with browser permission, overdue indicators, and change-ticket visibility. |
| KDS-122 | 122 | 4 | KDS / ORD-01; REC-01 | - Realtime delivery with reconnect/catch-up and a polling fallback. Reconnect must not duplicate tickets or miss committed state. |
| KDS-123 | 123 | 4 | KDS / ORD-01; REC-01 | - Delivery includes address, contact, delivery charge, promised time, assigned rider, dispatch/delivered status, and cash collection reconciliation. Third-party aggregator connections are separate integrations. |
| INV-124 | 124 | 5 | INV / INV-01 | - Ingredients, sellable stocked goods, units and compatible conversions, supplier mappings, storage locations, reorder level, and optional batches/expiry dates. |
| INV-125 | 125 | 5 | INV / INV-01 | - Recipes and modifier recipes use ingredient quantities/yields, packaging, and versioned cost calculations. Examples: burger consumes bun/patty/sauce; large latte consumes more milk than small latte. |
| INV-126 | 126 | 5 | INV / INV-01 | - Immutable stock movement ledger: opening, receipt, consumption, return, wastage, count adjustment, transfer dispatch, and transfer receipt. No unexplained direct balance edits. |
| INV-127 | 127 | 5 | INV / INV-01 | - Explicit initial policy: stocked goods consume inventory when fulfilled; prepared items consume ingredients when preparation begins. Reservation/allocation can occur earlier. Payment must not consume the same inventory a second time. |
| INV-128 | 128 | 5 | INV / INV-01 | - Cancellation before consumption releases allocations. Cancellation after preparation records the actual waste/return policy; it does not magically restore ingredients. |
| INV-129 | 129 | 5 | INV / INV-01 | - For quick sale, fulfilment and checkout may occur in one transaction. Test deferred-payment dine-in separately. |
| INV-130 | 130 | 5 | INV / INV-01 | - Stock counts create approved adjustments with reasons. Configurable block/warn policy for insufficient stock; permission-gated overrides. Concurrency-safe stock checks. |
| INV-131 | 131 | 5 | INV / INV-01 | - Choose and document perpetual weighted-average costing initially. Snapshot consumption cost for historical COGS; returns reverse original eligible cost. Explicitly handle or block negative-stock valuation and backdated postings rather than silently corrupting costs. |
| PUR-132 | 132 | 5; reports 7 | PUR / PUR-01 | - Purchase flow: draft PO → approval if configured → partial/full goods receipt → supplier bill → partial/full payment. A purchase order alone does not add stock, and paying a bill must not add stock again. |
| PUR-133 | 133 | 5; reports 7 | PUR / PUR-01 | - Purchase returns, supplier balances/statements, freight/landed-cost allocation policy, and duplicate bill safeguards. |
| PUR-134 | 134 | 5; reports 7 | PUR / PUR-01 | - Branch transfers have dispatch/in-transit/receipt states and reconciliation. Dispatch and receiving must not create duplicate inventory across branches. |
| PUR-135 | 135 | 5; reports 7 | PUR / PUR-01 | - Low-stock, expiry, wastage, recipe-cost, valuation, movement, and supplier payable reports. |
| CASH-136 | 136 | 3 basics; 6 reconciliation | CASH / CASH-01 | Register/till sessions: opening float, assigned cashier, cash sales/refunds, paid-in/out with reasons, cash expenses, expected closing balance, actual count, variance, and approval. Separate noncash tender totals. Prevent two incompatible active sessions on the same till. Define who may reopen a closed session and how corrections are audited. |
| FIN-137 | 137 | 6; presentation 7 | FIN / FIN-01 | Customer profiles, contact opt-in, order history, receivable/khata ledger, credit limit, due date, statements, credit sales, later collection, and customer advances. Staff directory and role management are included; attendance/payroll is a later extension unless explicitly selected. |
| FIN-138 | 138 | 6; presentation 7 | FIN / FIN-01 | Expenses: category, amount/tax, date, branch, vendor/payee, payment account/method, attachments, approval, recurring expense scheduling, and void/reversal history. Distinguish cash expense from supplier liability and later payment to avoid double expense. |
| FIN-139 | 139 | 6; presentation 7 | FIN / FIN-01 | Implement a scoped double-entry ledger for the delivered operations: chart of accounts, balanced journal headers/lines, document links, posting/reversal rules, accounting periods, opening balances, and locked-period controls. Do not advertise a complete tax-compliant ERP. |
| FIN-140 | 140 | 6; presentation 7 | FIN / FIN-01 | Map sales, tax liability, service charges, cash/card clearing, receivables, supplier bills/payables, inventory, COGS, wastage, refunds, expenses, and customer deposits. Each posted business event has a unique source posting so retries cannot duplicate journals. Support bank/card clearing reconciliation and settlement fees without changing original sales. |
| FIN-141 | 141 | 6; presentation 7 | FIN / FIN-01 | Define reports precisely: |
| FIN-142 | 142 | 6; presentation 7 | FIN / FIN-01 | - Net sales: recognized sales minus sales discounts/returns, excluding collected taxes. |
| FIN-143 | 143 | 6; presentation 7 | FIN / FIN-01 | - Gross profit: net sales minus recognized COGS. |
| FIN-144 | 144 | 6; presentation 7 | FIN / FIN-01 | - Operating profit: gross profit minus posted operating expenses, with any other included/excluded categories disclosed. |
| FIN-145 | 145 | 6; presentation 7 | FIN / FIN-01 | - Inventory purchases are not all immediately COGS. |
| FIN-146 | 146 | 6; presentation 7 | FIN / FIN-01 | - Customer debt collection settles receivables and is not a second sale. |
| FIN-147 | 147 | 6; presentation 7 | FIN / FIN-01 | - Owner contribution and loans are not sales revenue. |
| FIN-148 | 148 | 6; presentation 7 | FIN / FIN-01 | - Tax collected is a liability, not profit. |
| FIN-149 | 149 | 6; presentation 7 | FIN / FIN-01 | - Cash flow is distinct from profit. |
| FIN-150 | 150 | 6; presentation 7 | FIN / FIN-01 | Display “operating profit” or “estimated profit” when complete net-income inputs are unavailable. Do not present misleading net profit. Tax configuration is supported; jurisdiction-specific invoicing integrations require separate verified requirements. |
| REP-151 | 151 | 7 | REP / REP-01; ISO-01 | All reports use actual posted data, enforced tenant/branch permissions, consistent timezone/business-day filters, and drill-through to source documents. |
| REP-152 | 152 | 7 | REP / REP-01; ISO-01 | - Sales by date/product/category/server/cashier/branch/channel/payment method; discounts, voids, refunds, tax and charges separately. |
| REP-153 | 153 | 7 | REP / REP-01; ISO-01 | - Orders, average order value with documented denominator, table turnover, and kitchen preparation times. |
| REP-154 | 154 | 7 | REP / REP-01; ISO-01 | - Cash shifts/variances and payment reconciliation. |
| REP-155 | 155 | 7 | REP / REP-01; ISO-01 | - Inventory valuation/movements, wastage, expiring stock, recipe margin, low stock. |
| REP-156 | 156 | 7 | REP / REP-01; ISO-01 | - Purchases, supplier balances/aging, customer receivable aging. |
| REP-157 | 157 | 7 | REP / REP-01; ISO-01 | - P&L, trial balance, account ledger, balance sheet for supported postings, and cash movements with scope clearly disclosed. |
| REP-158 | 158 | 7 | REP / REP-01; ISO-01 | - Owner dashboard: actionable daily metrics and alerts. Restricted roles do not receive prohibited metrics. |
| REP-159 | 159 | 7 | REP / REP-01; ISO-01 | - CSV and Excel exports; readable PDF reports and printable statements. Export totals must match the corresponding screen with the same filters. Protect spreadsheet exports from formula injection. |
| REP-160 | 160 | 7 | REP / REP-01; ISO-01 | - Large exports run in tenant-scoped jobs with progress and expiring authorized download links. |
| PRINT-161 | 161 | 3 baseline receipts; 4 KDS; 8 hardware/PWA | PRINT / REC-01 | Initial supported client: responsive browser/PWA on desktop and tablets. Cloud synchronization happens through the same authenticated restaurant account and tenant, not ad hoc tablet pairing to another user's local database. |
| PRINT-162 | 162 | 3 baseline receipts; 4 KDS; 8 hardware/PWA | PRINT / REC-01 | - Printable 58mm/80mm receipts, kitchen tickets, A4 invoices, and PDF with tenant identity, order number, lines, modifiers, taxes, tender, and totals. |
| PRINT-163 | 163 | 3 baseline receipts; 4 KDS; 8 hardware/PWA | PRINT / REC-01 | - Browser print is the initial baseline and may open a print dialog. Do not claim silent USB/Bluetooth/network printing works on every browser/device. |
| PRINT-164 | 164 | 3 baseline receipts; 4 KDS; 8 hardware/PWA | PRINT / REC-01 | - Add an optional authenticated local print bridge in the later hardware phase, with per-branch station/printer routing, job IDs, acknowledgements, retries, and clear failure status. Document tested OS/printer models. |
| PRINT-165 | 165 | 3 baseline receipts; 4 KDS; 8 hardware/PWA | PRINT / REC-01 | - Printing failure does not undo a successful sale. A reprint is marked and audited. Handle uncertain print acknowledgements without claiming physical exactly-once delivery. |
| PRINT-166 | 166 | 3 baseline receipts; 4 KDS; 8 hardware/PWA | PRINT / REC-01 | - USB barcode scanners acting as keyboards can be supported and tested. Cash drawers, scales, card terminals, Bluetooth printers, and customer displays need explicitly documented adapters/capability testing. |
| PRINT-167 | 167 | 3 baseline receipts; 4 KDS; 8 hardware/PWA | PRINT / REC-01 | - No storage or processing of raw card credentials in the POS. |
| OFF-168 | 168 | 3 online failure; 11 offline | OFF / REC-01 | Offline is a separate, gated phase. Initial release clearly reports connection loss and prevents unsafe submissions while preserving the current draft where appropriate. “Installable PWA” does not mean “offline transactions supported.” |
| OFF-169 | 169 | 3 online failure; 11 offline | OFF / REC-01 | For later offline sales, require an approved threat/conflict model: encrypted/minimized local data where practical, IndexedDB queue, unique command IDs, maximum signed license duration, permitted operations, local receipts marked provisional when required, reconciliation, stock conflicts, revoked users/devices, clock tampering, and payment restrictions. Cached access cannot be revoked instantly without connectivity. Never promise instant suspension and unrestricted offline trading together. |
| EXT-170 | 170 | 10 separately selected | EXT / ISO-01; REC-01 | Implement after the paid pilot foundation is stable, in separate selected increments: |
| EXT-171 | 171 | 10 separately selected | EXT / ISO-01; REC-01 | - QR menus and table ordering with scoped opaque table tokens, abuse protection, availability validation, order acceptance rules, and optional real payment integration. |
| EXT-172 | 172 | 10 separately selected | EXT / ISO-01; REC-01 | - Public ordering storefront with pickup/delivery times and tenant-isolated order status access. |
| EXT-173 | 173 | 10 separately selected | EXT / ISO-01; REC-01 | - Kiosk mode, loyalty ledger, points redemption/reversal, coupons, happy-hour pricing, and scheduled promotions. |
| EXT-174 | 174 | 10 separately selected | EXT / ISO-01; REC-01 | - WhatsApp receipt share link initially; actual automated messages require official provider setup, customer opt-in, configured templates, and delivery/error tracking. Never fake message delivery. |
| EXT-175 | 175 | 10 separately selected | EXT / ISO-01; REC-01 | - Optional online subscription/payment gateways with signed webhook verification, event deduplication, reconciliation, refunds, and explicit sandbox/live separation. |
| EXT-176 | 176 | 10 separately selected | EXT / ISO-01; REC-01 | - Delivery aggregator adapters only when official supported APIs and credentials are available. Do not assume any named provider grants access. |
| MULTI-177 | 177 | 5 transfers; 7 consolidation | MULTI / ISO-01; REP-01 | - Multi-branch consolidated views and stock transfers must respect plan and role scopes. |
| API-178 | 178 | 10 | API / ISO-01; REC-01 | - Scoped API keys, rate limits, documented APIs, signed outbound webhooks, retry policy, and secret rotation. |
| ADV-179 | 179 | 11 separately scoped after offline | ADV / REC-01 | - Attendance/payroll, production batches, central kitchen, franchise controls, and multi-language completion as separately scoped enhancements. |
| ADV-180 | 180 | 11 separately scoped after offline | ADV / REC-01 | - Forecasting/menu suggestions only with adequate data and evaluation; deterministic costing first. AI/voice entry can draft an order but requires staff confirmation before submission or financial action. |

## Remaining source coverage

Master lines 181–205 define delivery phases and gates, mapped in PHASED_BACKLOG.md to Phases 0–11. Lines 206–222 define ISO-01, SUB-01, DEV-01, IAM-01, PAY-01, TAX-01, ORD-01, RES-01, INV-01, PUR-01, FIN-01, CASH-01, REP-01, REC-01 and OPS-01; the backlog assigns every ID. Lines 223–241 define handoff and future continuation/review templates, handled by PHASE_REPORT.md and OPERATIONS.md; placeholder future requests are not executed.

## Supplementary brief reconciliation

Its tenancy/branding/configuration map to GOV/ISO/UX; dashboard/reporting to REP; POS/modifiers/checkout/receipt to MENU/ORD/PAY/PRINT; tables/KDS/delivery to RES/KDS; recipes/purchasing to INV/PUR; customer/expense/register/accounting to FIN/CASH; staff/approval to IAM; notifications to AUD/KDS/EXT; latest features/API/PWA/AI to EXT/API/PRINT/ADV. Search and configurable keyboard shortcuts are Phase 3 (MENU/PAY), customer loyalty and scheduled pricing Phase 10 (EXT). All supplementary modules are assigned, not enabled. Public signup is superseded by master admin provisioning; unrestricted offline-first by gated Phase 11; 'coming soon' operational navigation by keeping future modules out; older eight-phase numbering by master 0–11. No production prices or tax assumptions are adopted.

