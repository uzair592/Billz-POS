# Architecture — Phase 0 design baseline

## Authority and scope
The supplied MASTER_SPEC.md governs this delivery. SUPPLEMENTARY_BRIEF.md preserves the older brief. The master explicitly selects Phase 0 and retains a suitable existing stack. No operational features or migrations are implemented by this phase. Existing “Phase 1” documents describe the earlier scope, not satisfaction of the new Phase 1 gate.

Conflicts resolved: admin provisioning only; no public signup; online-only transactions until Phase 11; no future modules in operational navigation; 1/2/3-device examples are planned without overwriting existing 3/5/10 entitlements. The master phase numbering below supersedes the supplementary numbering.

## Implementation note
Schema: inventory and logical proposals only; preserve all three applied migrations and all customer records.
API: retain existing contracts; design separate platform, tenant, recovery, and public boundaries.
UI: static review wireframes outside the application; no operational buttons or fake live metrics.
Permissions: assess present guards; specify tenant, branch, entitlement, lease, action and threshold checks.
Invariants: no cross-tenant links; atomic financial/stock/seat changes; immutable posted evidence.
Failure cases: expiry during active sessions, seat races, revoked devices, role escalation, duplicate commands and disconnected clients.
Acceptance: every source capability maps to a phase/gate; documents and five labelled wireframes exist; baseline commands have recorded results; Git delivery status is truthful.

## Existing inventory and reuse
- Next.js 15 / React 19 / TypeScript client in apps/web; React Query, React Hook Form, Zod, Lucide and custom CSS/components.
- NestJS 11 modular API in apps/api; Prisma 6/PostgreSQL 16; Argon2, opaque cookies, CSRF, Redis throttling.
- Shared contracts in packages/contracts; pnpm lockfile and three Prisma migrations.
- Modules: auth, platform, workspace, audit, health. MinIO and Mailpit are local infrastructure; a worker/outbox is not implemented.
- 30 Prisma models: global admin/session/plan/module/permission; tenant organization/subscription/module/branch/user/membership/roles/session/device/settings/payment-method/file/support/idempotency/audit records.
- Existing UI: platform login/list/create, business login/recovery/password change, four-step onboarding, overview, branches, employees, role display, audit and settings/devices.
- No operational sales, purchasing, inventory, accounting, billing invoices, realtime channels or print workflows.
- Existing tests: guard/security unit tests and branch/device database isolation tests. No browser suite or CI workflow found.
- Retain current stack and lockfile. No dependency upgrade or new version-sensitive API selected in Phase 0.

## Target module boundaries
Browser -> authenticated API -> authorization -> transactional service -> PostgreSQL.
Transaction also writes audit and outbox records. Worker reads committed outbox -> KDS notification / print job / email. Consumers deduplicate event IDs. Redis assists rate limits and fanout, never authoritative balances.

Modules: Identity; Platform/Billing; Tenant/Branches; Entitlements; DeviceLeases; Staff/Approvals; Menu; Orders; Payments/Receipts; Service/Tables/Reservations; Kitchen/Delivery; Inventory/Recipes; Procurement; Customers/Expenses/Registers; Ledger; Reports/Exports; Files; Audit/Outbox; Integrations.

## Logical data model (proposed, not migrated)
Every tenant entity uses existing organization_id as tenant_id equivalent. Branch records carry branch_id. Composite foreign keys include organization_id, and branch consistency where applicable. UUID identities; UTC timestamps; explicit versions on concurrent aggregates.

| Domain | Existing base | Planned entities and constraints |
| --- | --- | --- |
| Identity | PlatformAdmin, User, Session, PasswordResetToken | ActivationCredential(expiry/usedAt); MFA factors/recovery hashes; narrow identity lookup; no readable secrets |
| Tenant | Organization, Branch, BusinessSetting, BranchSetting | business-day cutoff, locale/direction; retention state; ownership transfer; explicit branch scope |
| Billing | SubscriptionPlan, OrganizationSubscription, Module | PlanVersion, SubscriptionPeriod, Invoice, InvoiceLine, ManualPayment, PaymentAllocation, Credit, EntitlementOverride, SuspensionEvent; immutable invoice price/currency snapshots; unique allocation/event |
| Devices | OrganizationDevice, Session.deviceId | DeviceLease(heartbeat, expiry, branch, class, revokedAt); tenant allocation lock; unique live lease per installation; session references lease |
| Staff | Role, Permission, UserRole, BranchMembership | scope/threshold grants, one-use Approval(action/payload/amount/expiry), explicit ownership |
| Menu | None | Category, Product, Variant, ModifierGroup/Option, BranchPrice, TaxCategory, ComboComponent, private image reference; historical snapshots |
| Sales | IdempotencyKey only | Order(version/state/businessDay/sequence), OrderLine snapshots, ModifierSnapshot, ChargeAllocation, DiscountApproval, HeldDraft; unique branch/day/sequence |
| Settlement | PaymentMethod | Payment, TenderAllocation, Refund, RefundLine, CreditNote, ReceiptSnapshot; immutable posted facts; unique command payload hash |
| Service | None | Floor, Table, TableService, Reservation, ReservationTableInterval, Waitlist, AdvanceBooking, Deposit/Application; transactional overlap protection and unique deposit allocation |
| Kitchen/delivery | None | Station, KitchenTicket/Item, ChangeTicket, Delivery/RiderAssignment, OutboxEvent; independent progress and payment states |
| Stock | None | Unit/Conversion, StockItem/Location, Batch, RecipeVersion/Component, Allocation, StockMovement, CostSnapshot, Count/Adjustment, Transfer/Dispatch/Receipt; no direct unexplained balance writes |
| Procurement | None | Supplier, PurchaseOrder/Line, GoodsReceipt/Line, SupplierBill/Line, BillPayment/Allocation, PurchaseReturn; independent document effects |
| Finance | None | Customer, ReceivableEntry, CustomerAdvance, Collection, Expense/Approval/Recurrence, Till, RegisterSession/CashMovement; partial unique open-till constraint |
| Ledger | None | Account, Period, Journal/Line, SourcePosting, Reversal; balanced postings; unique source/version/type; closed-period lock |
| Delivery infrastructure | FileAsset, AuditLog | Private attachment grants, export jobs, print jobs/attempts, outbox/inbox deduplication; tenant and branch required for worker context |
| Extensions | None | Public ordering tokens, LoyaltyEntry, Promotion, ProviderEvent, API credential, WebhookDelivery, OfflineCommand/Reconciliation; separately gated phases |

## Security model and repairs
Runtime database login must lack SUPERUSER/BYPASSRLS and ownership. Separate migration identity. Tenant operations set transaction-local context and never take authority from posted organization IDs. Platform DB privileges must be narrow, not a general session variable bypass. Authentication gets only narrow credential/session lookup capability before tenant resolution.

Protected request order: session -> identity/membership -> subscription and suspension -> lease -> permission + branch + threshold -> schema/domain validation -> transaction/audit/outbox. Recovery/billing routes have explicit restricted authority without operational access. Fields such as costs are projected only for authorized roles.

Phase 1 must replace direct broad Prisma reads and platform RLS bypass with narrowly authorized access. Phase 2 must close delegation/owner-assignment gaps and add lease checks. Tests must exercise HTTP, guessed IDs, malicious scopes and indirect surfaces as each module appears.

## API and route map
Existing /api/v1/auth/* and /platform/* remain separate; business login stays username/email plus password. Existing /organization, /branches, /users, /roles, /permissions, /devices and /audit-logs are retained.

| Phase | Proposed REST contracts | UI flows |
| --- | --- | --- |
| 1 | platform/plans, organizations/:id/billing, invoices/:id/payments, subscriptions/:id/renewals, activation, billing/status | /platform/organizations/:id, /platform/plans, /workspace/billing; create -> activate -> invoice -> manual payment -> renew/suspend/reactivate |
| 2 | devices/heartbeat, devices/recovery, roles CRUD, role grants, approval challenges, downgrade preview/confirm | device recovery, plan conflict selection, custom roles/scopes |
| 3 | menu/*, orders/*, orders/:id/submit, payments, refunds, receipts, registers | touch POS -> hold/submit -> tender -> receipt/history |
| 4 | tables, reservations, deposits, kitchen/tickets, deliveries, events/catch-up | waiter -> KDS -> cashier; reservation -> seating -> deposit application |
| 5 | stock/*, recipes, suppliers, purchase-orders, receipts, supplier-bills, transfers | receive -> prepare -> trace stock/cost -> pay supplier |
| 6 | customers/receivables, collections, expenses, registers/reconcile, ledger/* | credit/collection -> journal; close shift -> variance |
| 7–9 | reports/*, exports, print-jobs, imports, MFA | source drilldown, safe import preview, hardware/PWA, pilot hardening |
| 10–11 | scoped public ordering/integration and offline commands | independent selected increments only |

Writes require CSRF for cookies; command-id and payload hash for retry-sensitive operations; If-Match/version for order edits. Errors return code/message/field errors/request ID; 409 conflicts present refreshed state and require explicit reapplication. Cursor pagination and UTC boundaries are server-validated.

## Migration approach
Expand -> backfill -> reconcile -> enforce -> contract. Preserve existing organization IDs, usernames/emails, passwords, active plans and history. Backfill plan versions from current values, flag unknown historical billing rather than invent invoices. Introduce activation expiry for newly issued access; plan explicit existing-owner transition. Device registrations require a coordinated lease rollout, not silent seat deletion. Ledger backfill uses unique source postings and reconciles historic phase data before enabling reports.

Run migration rehearsal on a restored isolated database; verify constraints, row counts and sample balances. Back up before deployment. Roll back application only while additive schema stays compatible; use forward repair for posted data. Never reset production or rewrite applied migrations.

