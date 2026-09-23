# Phase 1 implementation note

Selected by the owner on 2026-09-23. Preserve existing tenants, credentials and migrations.

- Add immutable plan versions, subscription invoices and manual settlement records with integer minor-unit amounts, calendar periods and explicit grace deadlines. Existing subscriptions retain their dates; no historical invoices or payments are invented.
- Platform APIs manage versions, issue renewal invoices, record partial payments/credits and expose tenant details. Owner billing derives organization authority from the session, including when operations are restricted.
- Re-evaluate status and expiry on every operational request. Keep identity, logout, password change and owner billing available without granting operational access. Suspension and reactivation retain sessions and data.
- Transactions serialize invoice allocation and renewal, reject overpayment and conflicting retries, and append audit records. Prices on issued invoices remain unchanged after plan edits.
- Implement responsive platform detail/plans and owner billing screens with explicit manual-payment labels and errors.
- Repair runtime database authority using non-owner credentials and narrowly scoped authentication lookup, keeping migration credentials separate.
- Verify two-tenant API/database isolation, live-session restriction/reactivation, partial payment, idempotency, calendar month-end, recovery, persistence and responsive layouts. Add CI; record actual results and remaining limitations in the phase report.
