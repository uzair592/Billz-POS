Give the coding agent this entire document once. Tell it to start with Phase 0 only. For each subsequent phase, use the continuation prompt at the end. Keep this document in the repository as docs/MASTER_SPEC.md so it remains available across agent sessions. Each phase ends with a tested GitHub delivery that can be reviewed before proceeding.
This is a product specification, not a claim that any existing application has been inspected or that every feature can be built reliably in one generation. The first commercial pilot is after Phases 0–9 pass their gates. Later phases extend the product. Do not advertise unimplemented capabilities.
You are the lead engineer implementing a real, web-based, multi-tenant restaurant POS and management SaaS. Build working business workflows with persistent data, strict authorization, financial integrity, and professional usability. A collection of attractive disconnected screens is not an acceptable delivery.
I own and administer the SaaS platform. My customers are independent cafés, restaurants, bakeries, takeaway shops, and cloud kitchens.
There are TWO distinct administrative environments:
1. Platform administration: I create restaurant organizations, create their initial owner accounts, assign subscriptions and device limits, record subscription payments, and suspend/reactivate access.
2. Restaurant workspace: Each restaurant owner manages their own branches, staff, permissions, menu, orders, kitchen, inventory, finances, and reports.
A restaurant owner is never a platform administrator. Restaurant staff cannot change their own subscription, purchased feature limits, or platform permissions. A tenant is one restaurant business/organization and may contain multiple branches. Businesses must never see one another's information.
Initial acquisition is admin-provisioned. Do not enable public restaurant signup by default. A future self-service onboarding flow is outside the initial scope.
Defaults: PKR, Asia/Karachi, English, configurable local date/time presentation. Store timestamps in UTC and report according to the branch timezone and configurable business-day cutoff. Prepare translation keys and layout direction support; complete Urdu translation is a later feature. No subscription prices or tax rates should be hardcoded as business truth.
- Inspect the existing repository before changing it. Read applicable repository instructions. Identify the stack, migrations, tests, current behavior, security gaps, and reusable work.
- Preserve working code and existing customer data. Do not wipe the database, replace the entire application, or rewrite the stack just because starting fresh is easier.
- Implement only the selected phase and prerequisites necessary for it. Record dependencies rather than pretending unfinished future features work.
- For routine implementation choices, choose a sensible default and document it. Ask only about a genuinely blocking ambiguity, missing external access, or destructive operation.
- Begin with a concise implementation note: schema/migrations, API contracts, UI flows, permission checks, business invariants, failure cases, and acceptance tests.
- Complete a vertical workflow: UI → authenticated API → database → resulting reports/audit entries. Persisted behavior must survive reload and service restart.
- Use clearly marked demo seed data only in development/test environments. Never show fabricated live revenue, successful payments, stock balances, or report charts.
- No dead buttons, placeholder handlers, silent TODOs, or hardcoded success responses in delivered workflows. Keep future modules out of operational navigation; identify them in the roadmap.
- Run the relevant automated tests, type checks, lint, build, and migration checks. Report actual commands and results. Never say a test passed if it was not run.
- Maintain docs/REQUIREMENTS_MATRIX.md: requirement ID, description, phase, implemented files, test evidence, status, and limitations.
- Maintain docs/PHASE_REPORT.md, docs/ARCHITECTURE.md, docs/BUSINESS_RULES.md, docs/OPERATIONS.md, and CHANGELOG.md as applicable.
- At the end of each phase, commit and push to a descriptive feature branch on the configured GitHub remote. Provide the branch, commit SHA, changed files, screenshots, test results, known gaps, and review instructions. Open a PR if authenticated tooling permits. Do not merge to the default branch or deploy production automatically.
- If GitHub credentials or the remote are missing, retain local commits and report the exact blocker. Never invent a repository URL or claim a push succeeded.
- Stop after delivering the selected phase. Resume when I request the next phase or corrections.
If the repository already has a suitable stack, keep it and document gaps. For a new repository use React + TypeScript for the frontend, FastAPI with Pydantic and SQLAlchemy/Alembic for the backend, and PostgreSQL. Use a maintained component system and consistent design tokens. Pin compatible dependency versions and commit the lockfiles. Verify current official documentation when selecting version-sensitive APIs.
Prefer a modular monolith with explicit service boundaries over premature microservices. Provide repeatable local setup, environment examples without secrets, database migrations, development seeds, and CI. Introduce Redis/background workers when required by jobs or realtime scaling, not as a substitute for authoritative database records.
Use transactional database operations for orders, payments, stock, journal entries, and device seats. Use an outbox or equivalent reliable handoff for side effects such as kitchen events, print jobs, and notifications. A committed transaction must not disappear because a WebSocket notification failed.
- Put tenant_id on tenant-owned entities; put branch_id on branch-owned entities. Global platform tables are separate.
- Derive tenant and branch authority from authenticated membership, never blindly from a request header, URL parameter, or submitted object.
- Use PostgreSQL row-level security plus application authorization. The runtime role must not be a superuser, table owner bypassing protection, or have BYPASSRLS. Use transaction-scoped tenant context safely with pooled connections and reset it correctly.
- Use tenant-consistent foreign keys/constraints so records cannot reference another tenant's customer, order, role, or stock location.
- Enforce isolation on exports, attachments, background jobs, caches, search, reports, WebSocket subscriptions, and print queues as well as CRUD.
- Platform operations use separately authorized services with narrow privileges and audit trails; do not give normal requests a database bypass.
- Secure password hashing, rate-limited login/recovery, secure session cookies, CSRF protection where applicable, secure headers, and no committed secrets.
- Initial owner access uses an expiring, single-use activation link or one-time temporary password with mandatory change. Never show existing passwords or store readable passwords. If no email provider exists, allow the administrator to copy the activation link securely.
- Password reset and device revocation invalidate relevant sessions. Add MFA for platform administrators and owners before the commercial pilot.
- Attachments are private, tenant-scoped, size/type validated, and delivered through authorized access or short-lived signed URLs.
- Audit sensitive actions with actor, tenant/branch, action, target, safe before/after values, timestamp, device/session, and reason. Do not log passwords, tokens, complete card data, or unnecessary customer information.
- Audit records and posted financial documents cannot be edited/deleted through normal application access. Corrections use explicit reversing or adjustment records.
Build a separate platform navigation and authorization boundary, such as /platform.
- Create a restaurant: business name, contact details, initial branch, owner identity, timezone/currency, plan, start date, renewal date, grace period, and permitted overrides.
- Search/filter restaurants by status, plan, renewal date, and outstanding subscription amount.
- View subscription history, owner contact, branches, device usage, permitted modules, and platform support history.
- Reset owner access using the secure recovery flow, resend/regenerate activation, change plans, and manage manual exceptions with reasons and expiry dates.
- Archive tenants through a deliberate retention workflow. Suspending a subscription must never delete restaurant data.
- Platform metrics include active/suspended/trial customers, overdue invoices, subscription collections, and plan distribution. Define recurring revenue separately from cash collected.
- Editable plans: name, monthly price/currency, branch limit, named-user limit if applicable, concurrent device limit, included modules, active/inactive status.
- Configurable 1-, 2-, and 3-device examples in seed plans; production pricing is entered by the administrator.
- Preserve plan/subscription version history. Price changes must not silently alter already issued invoices.
- Subscription states: trial, active, past_due, suspended, cancelled. Store billing-period dates and grace-period end explicitly.
- Monthly billing uses calendar months with a documented end-of-month rule. Handle partial payments, credits, renewal, reactivation, and administrator adjustments.
- Create subscription invoices, payment records, outstanding balances, receipts, and manual payment references/attachments. Recording bank transfer, cash, JazzCash, or Easypaisa manually must be labelled manual; it is not payment-provider verification.
- Automated online billing is a later integration. Do not simulate provider success.
- Scheduled overdue checks must be idempotent. Authorization must also check entitlement expiry at request time so a failed scheduler cannot leave unpaid access open indefinitely.
- Plan downgrades must show conflicts with branch/user/device usage and require selecting which resources remain enabled; do not delete excess resources or silently pick users to remove.
- Admin can suspend and reactivate with a reason, effective time, and optional expiry.
- Suspension blocks operational reads/writes, staff login to operational screens, public ordering, realtime subscriptions, background business mutations, and new device leases.
- An owner can reach a restricted billing/reactivation screen showing amount due and contact details; staff see a clear contact-your-owner message.
- Existing sessions must lose operational authorization on their next request; notify connected clients promptly and close unauthorized channels. Do not rely only on token expiry or hidden navigation.
- Define in-flight behavior: a database transaction already committed remains committed; new requests after suspension fail. Payment-provider callbacks still record/reconcile real payment outcomes without granting general access or losing evidence.
- Reactivation restores access to the same records. Write tests for suspension with active clients and reactivation.
- Default offline sales are disabled; any later offline license must explicitly document its bounded suspension delay.
Interpret the limit as concurrent authenticated staff browser installations across the entire restaurant tenant, not simply the number of usernames. Branches share the tenant's pool unless the plan explicitly adds a branch-specific rule.
- Laptop browser, POS browser, waiter tablet, owner phone, and KDS browser each consume one device seat while holding an active lease.
- Multiple tabs in the same browser profile share a device identity and lease. Different browsers/profiles/private browsing count separately. Reopening the same installation resumes the existing lease where possible.
- A browser system cannot prove physical hardware identity. Do not use IP address as device identity or promise prevention of all deliberate cookie copying. Use a random installation identifier plus authenticated server-issued credentials; fingerprints are not authoritative.
- Public QR customers do not consume staff seats. Local print helpers do not independently consume a seat unless separately licensed. Platform admins in their own console do not consume tenant seats.
- Maintain device name, tenant, branch, device class, active user/session links, creation time, last heartbeat, lease expiry, revocation state, and appropriate limited metadata.
- A valid user login atomically obtains or resumes a seat. Lock/check allocation in the database so simultaneous logins cannot exceed the plan. Failed authentication never consumes a seat.
- Default lease: heartbeat every 30 seconds, expiry after 5 minutes without a heartbeat. Make these platform-configurable. An expired device must reacquire a seat before its next protected request, even when its login session remains valid.
- Logging out the last session on a device releases its seat. Closing a tab is not reliably observable; use lease expiry. Network interruption and browser backgrounding must have clear behavior.
- Every operational API and realtime channel requires a valid unrevoked lease. A heartbeat alone must not reactivate a revoked device.
- If full: show “Your plan allows N active devices. Ask the owner to disconnect a device or contact support to upgrade.” Never silently evict another device.
- Owner can inspect and revoke their tenant's devices; platform admin can do the same. Provide a rate-limited, reauthenticated device-management recovery route that works when seats are full but grants no POS access without a seat.
- Revoking a device stops new requests and notifies its connected clients. Record the action in the audit log.
- Permission switching on a shared till must retain individual actor attribution. A manager approval does not permanently turn the cashier into a manager.
Default role templates: Owner, Manager, Accountant, Cashier, Waiter, Kitchen Staff, Inventory/Purchase Staff, and read-only Auditor. Owners can create custom roles and edit delegated permissions.
Permission model: resource + action + scope, with branch restrictions and monetary thresholds where needed. Cover view/create/update, submit, approve, cancel, refund, discount, price override, export, stock adjustment, payment collection, journal posting, user administration, and device management.
- Owner controls how much access the manager/accountant receives.
- Staff cannot grant permissions they lack, assign Owner/platform privileges, or modify their own effective authority.
- Reserve ownership transfer and owner-account management for an explicit owner/platform workflow. Prevent removing the last active owner.
- Restrict sensitive sales/profit/cost reports separately. A waiter should not obtain costs through API responses even if the UI hides them.
- Default manager has operations access; accountant has authorized financial access; cashier handles sales; waiter handles assigned table orders; kitchen staff sees assigned stations with minimal customer data.
- Permission removal takes effect on subsequent protected requests, without waiting for a long-lived token to expire.
- Manager approvals require an identified authorized approver, secure reauthentication or a rate-limited PIN, action/amount binding, and an audit record.
Use a professional, restrained design: clear typography, consistent spacing, strong contrast, limited accent colors, accessible forms, and plain-language errors. Avoid decorative dashboard clutter. Use useful loading, empty, error, permission-denied, offline, and retry states.
Role-specific workspaces:
- Owner/manager: overview, operations, stock, staff, reporting, settings according to permissions.
- Cashier: product search/categories, product grid, cart, order type, totals, payment, held orders, and register controls.
- Waiter tablet: tables → open table → add items/modifiers/notes → send kitchen ticket → see preparation status → request bill.
- Kitchen display: large readable station tickets, elapsed times, notes, item status, and service alerts.
- Accountant: purchase/payables, customer receivables, expenses, cash reconciliation, journals, and financial reports.
Support desktop at 1366×768, landscape tablet around 1024×768, and mobile around 390px wide. POS touch controls should be at least 44px targets. Keep primary actions reachable without unnecessary dialogs. Use consistent order, kitchen, and payment status colors with text labels, not color alone.
Include onboarding: business/branch settings → menu → tables/stations → staff → taxes/payment methods → receipt → first shift. Allow menu/stock CSV import with a template, preview, validation errors, and safe duplicate handling.
Categories, products, variations, SKU/barcode, images, preparation station, availability, branch-specific prices, tax category, dine-in/takeaway availability, and optional preparation time. Modifiers support required/optional groups, min/max selections, price differences, and ingredient effects. Support combos/bundles without double-counting stock or discounts. Menu changes must not rewrite historical order snapshots.
Dine-in, takeaway, delivery, and quick sale. Item quantities, modifiers, notes/allergy flags, server assignment, guests, hold/resume, table transfer, split bills by item/quantity/equal amount, and combining compatible open checks. Never merge settled financial records as if they were unpaid orders.
Separate state machines for:
- Order lifecycle: draft, submitted, fulfilled, closed, cancelled.
- Kitchen progress: pending, preparing, ready, served/cancelled at ticket/item level.
- Payment: unpaid, partially_paid, paid, partially_refunded, refunded.
Define permitted transitions, actor permissions, and side effects in a table. An order can be served while unpaid; kitchen readiness must not imply payment.
Send additions to the kitchen as delta tickets. Later edits/voids to submitted items produce identifiable change/cancellation tickets. Multiple devices editing the same order require version checks and an explicit refresh/merge conflict flow; never silently overwrite another waiter's work.
- Server computes authoritative subtotal, item/order discounts, taxes, service/packaging/delivery charges, rounding, paid amount, outstanding amount, and change.
- Use Decimal or integer minor units for money, explicit rounding rules, and suitable precision for quantities/costs. Client may show a preview but cannot set trusted totals.
- Persist price, modifier, tax, discount, and cost snapshots required to explain historical results.
- Support inclusive/exclusive tax and documented discount allocation across items/rates. Model refund allocation from original invoice amounts rather than recomputing current prices.
- Cash, manually recorded card terminal payment, bank transfer, JazzCash, Easypaisa, customer credit, and configurable payment methods. Clearly distinguish manual entries from verified gateway transactions.
- Split tender, partial payment, customer credit permission/limit, cash received/change, and partial/full refunds tied to original lines/payments.
- No negative sale total, refund above eligible balance, double settlement, or reuse of a one-time approval.
- Use idempotency keys for payments, order submission, refunds, and other retry-sensitive writes. The same key with different payload is rejected.
- Use human-readable branch/business-day numbering with concurrent uniqueness and an immutable internal ID. Never recycle voided numbers.
- Returns/refunds do not automatically restock prepared food. Capture disposition: return to stock when valid, wastage, or no physical stock movement.
- Posted/paid invoices are immutable; subsequent changes create adjustments, credit notes, or replacement documents with links.
- Floors/zones, configurable table arrangement, capacity, availability, occupied, bill requested, and cleaning status. Derive occupancy safely from active service records.
- Reservations: customer/contact, time, duration, party size, assigned table(s), notes, confirmed/seated/completed/cancelled/no-show states.
- Prevent overlapping confirmed assignments transactionally, including concurrent requests; allow authorized overrides with reason and visible warning.
- Walk-ins, waitlist, reservation deposits, cancellation/refund policy settings, and converting a reservation to a dine-in order without losing the deposit.
- Advance takeaway/catering booking with promised collection/delivery time, line items, notes, deposit, outstanding amount, and kitchen scheduling.
- Deposits are tracked separately and applied exactly once at checkout. They are not immediately restaurant sales revenue.
- Kitchen stations such as bar, hot kitchen, and dessert; route items/modifiers to the correct station.
- Ticket elapsed timers, acknowledge/start/ready/served actions, optional sound with browser permission, overdue indicators, and change-ticket visibility.
- Realtime delivery with reconnect/catch-up and a polling fallback. Reconnect must not duplicate tickets or miss committed state.
- Delivery includes address, contact, delivery charge, promised time, assigned rider, dispatch/delivered status, and cash collection reconciliation. Third-party aggregator connections are separate integrations.
- Ingredients, sellable stocked goods, units and compatible conversions, supplier mappings, storage locations, reorder level, and optional batches/expiry dates.
- Recipes and modifier recipes use ingredient quantities/yields, packaging, and versioned cost calculations. Examples: burger consumes bun/patty/sauce; large latte consumes more milk than small latte.
- Immutable stock movement ledger: opening, receipt, consumption, return, wastage, count adjustment, transfer dispatch, and transfer receipt. No unexplained direct balance edits.
- Explicit initial policy: stocked goods consume inventory when fulfilled; prepared items consume ingredients when preparation begins. Reservation/allocation can occur earlier. Payment must not consume the same inventory a second time.
- Cancellation before consumption releases allocations. Cancellation after preparation records the actual waste/return policy; it does not magically restore ingredients.
- For quick sale, fulfilment and checkout may occur in one transaction. Test deferred-payment dine-in separately.
- Stock counts create approved adjustments with reasons. Configurable block/warn policy for insufficient stock; permission-gated overrides. Concurrency-safe stock checks.
- Choose and document perpetual weighted-average costing initially. Snapshot consumption cost for historical COGS; returns reverse original eligible cost. Explicitly handle or block negative-stock valuation and backdated postings rather than silently corrupting costs.
- Purchase flow: draft PO → approval if configured → partial/full goods receipt → supplier bill → partial/full payment. A purchase order alone does not add stock, and paying a bill must not add stock again.
- Purchase returns, supplier balances/statements, freight/landed-cost allocation policy, and duplicate bill safeguards.
- Branch transfers have dispatch/in-transit/receipt states and reconciliation. Dispatch and receiving must not create duplicate inventory across branches.
- Low-stock, expiry, wastage, recipe-cost, valuation, movement, and supplier payable reports.
Register/till sessions: opening float, assigned cashier, cash sales/refunds, paid-in/out with reasons, cash expenses, expected closing balance, actual count, variance, and approval. Separate noncash tender totals. Prevent two incompatible active sessions on the same till. Define who may reopen a closed session and how corrections are audited.
Customer profiles, contact opt-in, order history, receivable/khata ledger, credit limit, due date, statements, credit sales, later collection, and customer advances. Staff directory and role management are included; attendance/payroll is a later extension unless explicitly selected.
Expenses: category, amount/tax, date, branch, vendor/payee, payment account/method, attachments, approval, recurring expense scheduling, and void/reversal history. Distinguish cash expense from supplier liability and later payment to avoid double expense.
Implement a scoped double-entry ledger for the delivered operations: chart of accounts, balanced journal headers/lines, document links, posting/reversal rules, accounting periods, opening balances, and locked-period controls. Do not advertise a complete tax-compliant ERP.
Map sales, tax liability, service charges, cash/card clearing, receivables, supplier bills/payables, inventory, COGS, wastage, refunds, expenses, and customer deposits. Each posted business event has a unique source posting so retries cannot duplicate journals. Support bank/card clearing reconciliation and settlement fees without changing original sales.
Define reports precisely:
- Net sales: recognized sales minus sales discounts/returns, excluding collected taxes.
- Gross profit: net sales minus recognized COGS.
- Operating profit: gross profit minus posted operating expenses, with any other included/excluded categories disclosed.
- Inventory purchases are not all immediately COGS.
- Customer debt collection settles receivables and is not a second sale.
- Owner contribution and loans are not sales revenue.
- Tax collected is a liability, not profit.
- Cash flow is distinct from profit.
Display “operating profit” or “estimated profit” when complete net-income inputs are unavailable. Do not present misleading net profit. Tax configuration is supported; jurisdiction-specific invoicing integrations require separate verified requirements.
All reports use actual posted data, enforced tenant/branch permissions, consistent timezone/business-day filters, and drill-through to source documents.
- Sales by date/product/category/server/cashier/branch/channel/payment method; discounts, voids, refunds, tax and charges separately.
- Orders, average order value with documented denominator, table turnover, and kitchen preparation times.
- Cash shifts/variances and payment reconciliation.
- Inventory valuation/movements, wastage, expiring stock, recipe margin, low stock.
- Purchases, supplier balances/aging, customer receivable aging.
- P&L, trial balance, account ledger, balance sheet for supported postings, and cash movements with scope clearly disclosed.
- Owner dashboard: actionable daily metrics and alerts. Restricted roles do not receive prohibited metrics.
- CSV and Excel exports; readable PDF reports and printable statements. Export totals must match the corresponding screen with the same filters. Protect spreadsheet exports from formula injection.
- Large exports run in tenant-scoped jobs with progress and expiring authorized download links.
Initial supported client: responsive browser/PWA on desktop and tablets. Cloud synchronization happens through the same authenticated restaurant account and tenant, not ad hoc tablet pairing to another user's local database.
- Printable 58mm/80mm receipts, kitchen tickets, A4 invoices, and PDF with tenant identity, order number, lines, modifiers, taxes, tender, and totals.
- Browser print is the initial baseline and may open a print dialog. Do not claim silent USB/Bluetooth/network printing works on every browser/device.
- Add an optional authenticated local print bridge in the later hardware phase, with per-branch station/printer routing, job IDs, acknowledgements, retries, and clear failure status. Document tested OS/printer models.
- Printing failure does not undo a successful sale. A reprint is marked and audited. Handle uncertain print acknowledgements without claiming physical exactly-once delivery.
- USB barcode scanners acting as keyboards can be supported and tested. Cash drawers, scales, card terminals, Bluetooth printers, and customer displays need explicitly documented adapters/capability testing.
- No storage or processing of raw card credentials in the POS.
Offline is a separate, gated phase. Initial release clearly reports connection loss and prevents unsafe submissions while preserving the current draft where appropriate. “Installable PWA” does not mean “offline transactions supported.”
For later offline sales, require an approved threat/conflict model: encrypted/minimized local data where practical, IndexedDB queue, unique command IDs, maximum signed license duration, permitted operations, local receipts marked provisional when required, reconciliation, stock conflicts, revoked users/devices, clock tampering, and payment restrictions. Cached access cannot be revoked instantly without connectivity. Never promise instant suspension and unrestricted offline trading together.
Implement after the paid pilot foundation is stable, in separate selected increments:
- QR menus and table ordering with scoped opaque table tokens, abuse protection, availability validation, order acceptance rules, and optional real payment integration.
- Public ordering storefront with pickup/delivery times and tenant-isolated order status access.
- Kiosk mode, loyalty ledger, points redemption/reversal, coupons, happy-hour pricing, and scheduled promotions.
- WhatsApp receipt share link initially; actual automated messages require official provider setup, customer opt-in, configured templates, and delivery/error tracking. Never fake message delivery.
- Optional online subscription/payment gateways with signed webhook verification, event deduplication, reconciliation, refunds, and explicit sandbox/live separation.
- Delivery aggregator adapters only when official supported APIs and credentials are available. Do not assume any named provider grants access.
- Multi-branch consolidated views and stock transfers must respect plan and role scopes.
- Scoped API keys, rate limits, documented APIs, signed outbound webhooks, retry policy, and secret rotation.
- Attendance/payroll, production batches, central kitchen, franchise controls, and multi-language completion as separately scoped enhancements.
- Forecasting/menu suggestions only with adequate data and evaluation; deterministic costing first. AI/voice entry can draft an order but requires staff confirmation before submission or financial action.
Every phase must update the requirements matrix and deliver working code/tests to GitHub as specified above. Introduce audit logging, authorization, accessible UX, transaction safety, and relevant tests as features are built; do not postpone them all to a final hardening phase.
Deliver repository inventory, gaps against this spec, chosen architecture, logical data model, security/permission model, state-transition tables, migration approach, route map, and implementation backlog. Include realistic wireframes or local static prototypes for platform tenant details, restaurant dashboard, touch POS, waiter tablet, and KDS. Prototype-only elements must be clearly labelled in development artifacts.
Create the specification and requirement matrix in the repo. Do not implement the entire application in this phase. Gate: each requested capability has an assigned phase and measurable acceptance criterion; existing work is assessed without destructive changes.
Implement tenant/branch foundations, owner provisioning/activation, authentication/recovery, platform console, plans, subscription invoices/manual payments, renewal/grace/suspension/reactivation, audit framework, and initial role templates. Provide a real onboarding flow, not a dashboard shell alone.
Gate: create two restaurants; each owner signs in and sees only their own organization; manual payment/renewal is recorded; past-due grace expiry blocks operations; admin suspension affects an already logged-in owner; restricted billing screen remains reachable; reactivation restores access without data loss. Automated cross-tenant tests include guessed IDs and direct API calls.
Implement atomic device leases, heartbeat/expiry, owner device management/recovery, revocation, plan downgrade handling, custom roles, thresholds, branch access, and permission-change invalidation.
Gate: on a 2-device plan two devices work and a third is rejected; extra tabs share a seat; concurrent login attempts cannot exceed the limit; revocation prevents API and realtime access; owner can recover a full seat pool; accountant/waiter cannot elevate themselves or access unauthorized branches/reports.
Implement menu/categories/modifiers, a working touch POS, takeaway/quick sale, draft/hold/resume, register opening/closing basics, cash/manual noncash/split tender, server totals, receipt printing, order history, and controlled void/refund. Reserve proper transaction boundaries for future stock/accounting posting.
Gate: sell a product with modifiers, split the payment, refresh and reprint the exact receipt; duplicate request does not duplicate payment/order; tax/discount/rounding cases are verified; partial refund cannot exceed original quantities/payment; unauthorized discount/refund fails. Verify real 80mm print layout or PDF rendering and label physical hardware testing status.
Implement floors/tables, dine-in, bills/transfer/splitting, reservations/waitlist/deposits, advance bookings, delivery workflow, station routing, and real-time kitchen updates.
Gate: waiter on one client submits a table order; kitchen on a second sees it and marks ready; cashier on a third sees the status and takes payment. Additions create delta tickets; reconnect does not duplicate them; concurrent edits surface conflicts; overlapping reservation requests are safely resolved; a deposit applies exactly once.
Implement inventory ledgers, recipes/modifiers/packaging, consumption rules, cost snapshots, suppliers, PO/receipt/bill/payment separation, returns, counts, wastage, and branch transfer workflow where enabled.
Gate: receive 10 litres of milk, prepare a recipe using 200 ml, and show 9.8 litres with traceable movement; collecting payment does not deduct milk again. Prepared-item cancellation has explicit waste handling. Partial receipts and retrying a supplier payment do not duplicate stock. Concurrency and branch isolation pass.
Implement customer khata, advances, credit limits/collections, expenses/approvals, full register reconciliation, double-entry postings, opening balances, reversals, and period controls. Add safe historical backfill for previously recorded phase data with reconciliation evidence; never silently duplicate postings.
Gate: a credit sale creates receivable and revenue once; later collection reduces receivable without new revenue; purchase receipt/bill/payment have correct independent effects; customer deposit is applied once; every journal balances; closed-period edits fail; cash expected-versus-counted is explained by movements.
Implement dashboards, filters, drill-downs, P&L and supported accounting reports, stock/payables/receivables reports, CSV/Excel/PDF, and permission-filtered exports.
Gate: a controlled fixture reconciles sales, discounts, tax, refunds, COGS, expenses, customer credit, and cash across screen, ledger, and exports. Changing a menu price or ingredient purchase cost does not rewrite historical sale totals or consumed COGS.
Complete onboarding/imports, responsive screens, accessible workflows, optional print bridge, station routing, PWA installation, error recovery, and end-to-end restaurant walkthroughs. Include operating instructions for supported devices and printers.
Gate: complete a shift from login/opening float through waiter order, kitchen preparation, settlement, refund, and closing reconciliation. Check agreed desktop/tablet/mobile sizes. Printed totals and readable ticket content match saved data. Report which peripherals were physically tested and which remain unverified.
Complete security review, tenant isolation regression suite, MFA, authorization/suspension/realtime tests, backup/restore drill, migration rollout/rollback plan, logging/alerts, job retries, performance measurement, retention/export policies, and deployment/runbooks.
Record dataset size and test environment. Initial engineering targets under a documented representative load: common POS reads p95 under 500 ms server-side; committed order mutations p95 under 1 second excluding external providers; KDS visibility within 2 seconds on a healthy network. Measure; do not fabricate results or call these a contractual SLA.
Gate: no unresolved critical authorization, money, stock, or data-loss defects; backup restore has been demonstrated; all earlier gates pass in an integrated environment. Provide a pilot checklist and known limitations. Production deployment requires a separate explicit request.
Choose one bounded increment at a time from QR ordering, storefront, kiosk, loyalty, promotions, official messaging, and payment/aggregator integrations. Each needs its own permissions, billing gates, failure handling, and acceptance tests. No integrations are considered complete without credentials/environment verification or an explicit unverified status.
Design and implement offline functionality only after resolving licensing, synchronization, and operational conflicts documented above. Then separately scope forecasting, voice drafting, payroll, central kitchen, or other advanced modules.
Gate: network loss/reconnect, duplicate replay, clock changes, license expiration, suspension, device revocation, concurrent stock use, and rejected queued operations are tested. Unsyncable transactions are visible in a reconciliation queue; never silently discarded.
Give tests stable IDs and link them in the requirements matrix:
1. ISO-01: tenant A cannot read/write/export/download/subscribe to tenant B resources, including guessed IDs and malicious submitted tenant IDs.
2. SUB-01: subscription suspension blocks new operations in already authenticated clients; reactivation preserves data.
3. DEV-01: 1/2/3-device plans enforce concurrent seats atomically; tabs, expiry, logout, revocation, and recovery behave as documented.
4. IAM-01: owner can restrict manager; restrictions apply in API responses, actions, exports, and WebSockets.
5. PAY-01: simultaneous/retried checkout produces one valid settlement and no duplicate side effects.
6. TAX-01: inclusive/exclusive tax, line/order discounts, allocation rounding, split tender, and partial refunds reconcile to stored invoice totals.
7. ORD-01: two staff edits conflict safely; kitchen and payment states remain independent.
8. RES-01: concurrent reservation attempts cannot silently double-book a table; deposit is applied once.
9. INV-01: recipe consumption has correct unit conversion, posting time, cancellation treatment, and immutable cost history.
10. PUR-01: PO, partial receipt, bill, and payment affect stock/accounts only at the documented events.
11. FIN-01: credit collection is not new revenue; deposits are not premature sales; journals balance and reversals reconcile.
12. CASH-01: opening 1,000 + cash collections 3,000 − cash refunds 200 − cash expenses 300 = expected closing 3,500, assuming no other movements.
13. REP-01: dashboard, detailed reports, ledger, and exports agree under the same filters/timezone.
14. REC-01: service restart, reconnect, retry, and failed print delivery do not lose or duplicate committed business events.
15. OPS-01: backup restore produces a usable application with reconciled sample records.
Money fixture for a simple exclusive-tax case: goods 1,000; pre-tax order discount 100; taxable base 900; tax 10% = 90; total 990. Cash received 1,000 yields change 10. Use separate fixtures for inclusive tax, multiple tax rates, service charges, and partial refunds rather than assuming this example defines every jurisdiction's rules.
At completion, return:
- Phase and scope completed.
- Repository URL, branch, commit SHA, and PR URL if created.
- Requirement IDs completed and remaining.
- Concise change summary and relevant source paths.
- Database migrations and any backfill/data-compatibility implications.
- Exact local setup/run/test commands and safe demo account setup; no real passwords in a public report.
- Tests/build checks executed, results, and logs or artifact locations.
- Screenshots for changed desktop/tablet/mobile flows.
- Manual acceptance walkthrough with expected results.
- Known defects, untested hardware/providers, and blocked requirements.
- Recommended next phase, without starting it automatically.
Never mark a phase complete merely because the frontend compiles. If a gate fails, report partial completion and the concrete repair needed.
Start with Phase 0 only. Inspect the repository, save this specification, assess the existing application, and produce the architecture, wireframes, requirement matrix, and phased backlog. Commit and push those deliverables to the configured GitHub repository. If there is no repository yet, prepare the artifacts locally and report the missing remote/authentication requirement. Do not build every module in one pass.
Read docs/MASTER_SPEC.md, docs/REQUIREMENTS_MATRIX.md, docs/ARCHITECTURE.md, and the latest docs/PHASE_REPORT.md. Implement Phase [NUMBER] only. First address any review findings that block this phase. Preserve existing working behavior and data. Implement its complete UI/API/database workflow, permissions, audit records, failure handling, and acceptance tests. Run the relevant checks, update documentation, commit and push to a descriptive GitHub branch, and provide the required handoff with the commit SHA. Stop after this phase. Do not merge or deploy production.
Review findings are pasted below. Reproduce each issue, identify its cause, fix it without weakening requirements or deleting meaningful tests, and add focused regression coverage. Update the requirements matrix and phase report with evidence. Run affected checks and push fixes to the phase branch. Return the new commit SHA and explain how each finding was resolved. Keep unresolved findings explicitly open.
[PASTE REVIEW FINDINGS HERE]
Review this repository against the attached master specification through Phase [NUMBER]. Repository: [URL]. Branch: [BRANCH]. Commit: [SHA]. Agent phase report: [PATH OR PASTED TEXT]. Inspect implementation and tests, not just README claims. Classify findings as critical, high, medium, or low; cite source paths and explain impact. Mark each applicable requirement PASS, PARTIAL, FAIL, or NOT VERIFIED. Distinguish code inspection from executed tests and hardware/provider verification. Give me a precise repair prompt for the coding agent. Do not treat future phases as missing work in the current phase.
For a private repository, provide authorized repository access or upload a source archive without secrets. A repository link alone does not guarantee the reviewer can access it.
