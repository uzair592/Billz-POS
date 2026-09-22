# Business rules and state transitions — proposed

These rules govern future implementation. They do not claim the current foundation enforces all of them.

## Licensing and billing
Tenant owns the shared branch device pool. Default heartbeat 30 seconds and expiry 5 minutes, platform configurable. Installation identity is random authenticated credentials; no hardware/IP guarantee. Tabs share a lease. Login locks the tenant entitlement/allocation row, counts unexpired nonrevoked leases, and allocates at most the purchased limit. Last-session logout releases a seat. Expired devices reacquire before protected requests; revoked devices cannot recover via heartbeat. No silent eviction. Full-seat owner recovery uses separate rate-limited reauthentication with device-management-only authority.

Calendar renewal preserves original anchor day, clamping to the final day for short months (January 31 -> February 28/29 -> March 31). Invoice money/currency and period snapshots are immutable. Partial manual payments reduce outstanding; credits are explicit allocation records. Manual entries never imply provider verification. No production prices/taxes inferred from seeds.

| Aggregate | Transition | Actor/check | Durable effect and failure rule |
| --- | --- | --- | --- |
| Subscription | trial -> active | platform payment/activation policy | period/entitlement history; no fabricated payment |
| Subscription | active -> past_due | due-date check | invoice balance retained; bounded grace |
| Subscription | past_due -> suspended | grace expired or authorized admin | deny next operation including active sessions; preserve data |
| Subscription | suspended -> active | platform renewal/reactivation with reason | new entitlement evidence; same business records |
| Subscription | active/past_due -> cancelled | authorized platform action | effective end recorded; retention separate |
| Device | absent/expired -> active | valid login, subscription, locked seat capacity | allocate/resume or reject; no effect on failed login |
| Device | active -> expired/released | heartbeat timeout / last-session logout | seat available; protected request must reacquire |
| Device | active -> revoked | owner/platform device permission | revoke linked sessions, audit, notify; no heartbeat revival |
| Order | draft -> submitted | orders.submit, valid version, menu availability | immutable submitted snapshots, delta ticket/outbox, unique command |
| Order | submitted -> fulfilled | service permission and fulfillment policy | stocked-goods consumption once |
| Order | fulfilled -> closed | settlement complete or approved credit policy | receipt/source posting; kitchen status alone insufficient |
| Order | draft/submitted -> cancelled | permission/reason/approval if needed | void/change ticket; release allocation or explicit waste |
| Kitchen item | pending -> preparing -> ready -> served | authorized station staff/server | prepared ingredients consumed once on preparing |
| Kitchen item | pending/preparing -> cancelled | authorized change ticket | allocation release or waste disposition; original ticket retained |
| Payment | unpaid -> partially_paid -> paid | collect permission, locked eligible balance | immutable tenders/allocations; cash change computed server-side |
| Payment | paid/partially_paid -> partially_refunded -> refunded | refund permission/approval, eligible original allocation | refund/credit note, original tax/cost/disposition; cap enforced |
| Reservation | confirmed -> seated -> completed | permitted service staff | interval protected, order linked, deposit applied once |
| Reservation | confirmed -> cancelled/no-show | authorized policy/reason | release interval, explicit deposit refund/forfeit treatment |
| Procurement | PO draft -> approved -> partially/fully received | purchase/receipt permissions | PO has no stock effect; each receipt adds quantity once |
| Supplier bill | draft -> posted -> partially_paid -> paid | authorized accounting | liability on bill; payment settles payable without stock addition |
| Transfer | draft -> dispatched -> received | scoped sending/receiving authority | reduce sending, in-transit, receiving; unique movements |
| Register | closed -> open -> counted -> closed | till permissions; compatible session exclusivity | opening and movements, count/variance, auditable correction |
| Journal | draft -> posted -> reversed | posting permission, open period | balanced immutable lines; unique source; linked reversal |

## Financial and stock policy
Use integer minor units for money and Decimal(18,6) for quantities/cost rates, never binary floating-point trusted amounts. Reject mixed-currency allocation. Initial rounding: half-up to currency minor unit on invoice line tax; allocate order discounts proportionally with deterministic largest-remainder distribution and stable line-ID tie breaks. Snapshot rates, allocation and rounding residuals. Inclusive tax extracts tax from discounted gross; exclusive tax adds tax to discounted net. Refund reverses original allocations with cumulative caps.

Fixture TAX-01: goods 1,000, pre-tax discount 100, net 900, exclusive tax 90, total 990; received 1,000, change 10. Add inclusive/mixed-rate/partial-refund cases in Phase 3.

COGS: perpetual weighted average at receipt; snapshot consumption cost. Prepared food consumes at preparation start, stocked goods at fulfillment. Payment never repeats consumption. Initial policy blocks negative-stock valuation and backdated postings into closed costing periods; later exceptions require explicit reconciled adjustments. Cancellation after preparation records wastage unless an authorized real return is recorded. Returns use eligible original cost. Freight allocation initially by receipt line net value, with deterministic residual allocation; document exceptions for zero-value receipts.

Customer credit sale recognizes revenue/receivable once; later collection reduces receivable. Deposits/advances are liabilities until applied. Purchases are not automatically COGS. Tax is liability; owner contributions/loans are not sales. Gross profit = net sales less recognized COGS; operating profit deducts posted operating expenses with disclosed scope.

Reports use branch timezone and configured business-day cutoff. AOV denominator: noncancelled recognized sale invoices in selected business days, with refunds reported separately and net AOV labelled. Consolidation cannot add incompatible currencies without an explicit conversion policy.

## Permissions and failure behavior
Platform identities never become restaurant owners implicitly. Staff cannot assign Owner, modify their own effective authority, grant absent permissions, or remove the last active owner. Branch and monetary scopes are evaluated server-side. Approvals bind approver, action, payload hash, amount and expiry, and are consumed once.

Suspension never rolls back an already committed transaction. New operational requests fail; restricted owner billing and authentic provider reconciliation remain available. Outbox delivery can retry after commit. Concurrent order edits return conflict; duplicate command with different payload fails. Print failure does not undo sale. Offline sales disabled until Phase 11 licensing/conflict design is accepted.

