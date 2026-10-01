# Phase 4 vertical workflow report

Branch: `feature/phase-4-dine-in-vertical`  
Base: Phase 3 repair `8e9b374`

## Implemented slice

The additive migration `20260924000600_phase_4_dine_in_vertical` adds tenant/branch-scoped floor tables, kitchen stations, kitchen tickets, and a durable kitchen outbox. The API now supports:

- authorized table and station setup;
- waiter opening a dine-in order with server-quoted variants/modifiers;
- delta item additions with optimistic order versions;
- station ticket polling/catch-up and ready transitions;
- cashier settlement through register/payment/receipt logic, with idempotency and table release.

Every command checks organization and assigned branch, permissions are explicit, and database row locks protect table opening, order edits, and settlement. Repeated commands require a stable idempotency key and conflicting payloads are rejected.

## Verification

- `corepack pnpm prisma migrate deploy` — passed; migration applied without resetting data.
- `corepack pnpm prisma format` / `corepack pnpm prisma generate` — passed.
- `corepack pnpm typecheck` — passed.
- `corepack pnpm build` — passed.
- Existing e2e suites are present but require `RUN_DATABASE_TESTS=true` and an isolated test database; they were not counted as Phase 4 acceptance evidence in this environment.

## Open gates

The three-client Playwright walkthrough (waiter → kitchen → cashier), dedicated database-backed Phase 4 concurrency tests, and UI screens for the new workflow remain open. Physical kitchen display/printer hardware is unverified. Phase 4 is therefore not complete and Phase 4 backlog items after this vertical slice have not been started.

## Latest repair verification

- `corepack pnpm prisma migrate deploy` — passed; additive RLS repair migration `20260924000700_phase_4_rls_policies` applied.
- `corepack pnpm typecheck` — passed.
- `git diff --check` — passed.
- `corepack pnpm --filter @cafe-pos/api exec jest --config test/jest-e2e.json --runInBand test/phase-3.e2e-spec.ts --detectOpenHandles` — did not emit a completion result in this environment; no pass is claimed.
- `node scripts/test-phase-1.cjs` — created an isolated database and applied all 16 migrations; the Jest child did not emit a completion result before the runner ended.

Commit `6b698af` shares Phase 3 tender validation and register locking with dine-in settlement, adds order-state checks, role branch-scope checks, and selector-backed waiter data loading. The waiter, kitchen, and cashier pages are still an early visible workflow and have not passed a three-session browser walkthrough.

The latest changes also route Phase 3 create/resume checkout through the same `validateTender` helper used by dine-in settlement. Kitchen and cashier screens now load selectable records and display ticket/order state and saved totals. No three-session browser result is claimed yet.

Latest increment: migration `20260924000800_phase_4_station_read_permission` adds the narrowly scoped `kitchen.stations.view` permission for waiter station selection; ticket endpoints still require kitchen-ticket permissions. Dine-in additions and settlement now require `DINE_IN` and eligible open state. Waiter checkout retains one frozen body/key across an uncertain retry. Prisma migrate deploy, Prisma validate, typecheck, and diff check passed. Dedicated database concurrency tests and the three-session browser walkthrough remain open; Phase 5 has not started.

Additional verification from `cb51f22` onward:

- Migration `20260924000900_phase_4_station_role_rollout` grants station-read only to existing system manager, waiter, and kitchen_staff roles; customized roles are untouched. `prisma migrate deploy` applied it successfully.
- `corepack pnpm prisma validate` — passed.
- `corepack pnpm typecheck` — passed.
- Bounded Phase 3 Jest command (`RUN_DATABASE_TESTS=true`, 10-second bound) — timed out before test output; the child process was then force-stopped. No pass is claimed.
- Bounded production build (`corepack pnpm build`, 10-second bound) — timed out after Next.js reported “Creating an optimized production build”; no final exit code was produced. No build pass is claimed.

CI repair from `2bb616c`: all three Phase 4 pages were formatted and the cashier `Input` now supplies its required `label` prop. `corepack pnpm build` was rerun without the short timeout and completed with exit code 0; Next.js compiled, type-checked, generated 24 static pages, and the API build completed. `corepack pnpm --filter @cafe-pos/web exec tsc --noEmit` also exited 0. GitHub Actions follow-up inspection remains required after push.

Acceptance branch `feature/phase-4-acceptance` adds `apps/api/test/phase-4.e2e-spec.ts`. With `RUN_DATABASE_TESTS=true`, `corepack pnpm --filter @cafe-pos/api exec jest --config test/jest-e2e.json --runInBand test/phase-4.e2e-spec.ts` exited 0: 1 suite and 2 tests passed. The tests use the application runtime database path and assert persisted order, ticket, outbox, payment, receipt, and table state, including competing table opens and repeated settlement. Broader concurrency/runtime-role coverage and the three-session browser walkthrough remain open.

## Phase 4 completion branch

Branch `feature/phase-4-complete` is based on merged default commit `2e45004`. The first increment adds a visible table/station setup route, navigation to the three service workspaces, five-second KDS polling, retry-stable kitchen ready commands, retry-stable cashier settlement, and a historical receipt link. `corepack pnpm prisma validate`, `corepack pnpm typecheck`, and `corepack pnpm build` all exited 0; the build generated 25 application routes. The dedicated Phase 4 suite exited 0 with 2 tests passing in 45.11 seconds. Reservations, deposits, delivery, split/transfer, broader race/RLS coverage, and the three-session Playwright gate remain incomplete, so Phase 4 is not complete.

The next increment adds additive migration `20260924001000_phase_4_order_item_notes`, snapshotting kitchen notes without rewriting historical items. The waiter screen now selects variants and modifiers, supports quantity/notes, and sends versioned delta tickets. Table capacity is configurable, KDS renders readable item/modifier/note lines, and cashier offers the Phase 3 manual tender methods. Prisma generation/migration and typecheck exited 0; production build exited 0 with 25 routes; the Phase 4 suite exited 0 with 2 tests passing in 43.748 seconds.

The cashier money boundary now labels and accepts PKR, displays the server total divided by 100, and freezes a settlement body containing the value converted to minor units exactly once. Waiters can reload and select their server-backed open orders before sending a delta. Receipt assertions now verify the persisted priced modifier and kitchen note. Typecheck exited 0 and the Phase 4 suite exited 0 with 2 tests passing in 24.696 seconds. A real browser checkout for the PKR boundary and the complete three-session Playwright gate remain unverified.

Cross-waiter access is now explicit: ordinary waiters may view and add only to orders assigned to them; owners, cashiers with settlement access, and managers with the new `orders.dinein.transfer` permission have narrowly defined access. Migration `20260924001100_phase_4_order_transfer_permission` grants transfer only to system manager roles while preserving customized roles. The transfer command locks the order and target table, validates branch/user membership, changes waiter/table assignment atomically, releases the old table, records an audit entry, and is idempotent. The setup screen exposes table transfer without UUID entry. Typecheck exited 0; the Phase 4 suite exited 0 with 2 tests passing in 23.219 seconds and persisted table-state assertions.

Transfer hardening now requires an eligible open dine-in state and verifies that the target user is active, assigned to the branch, and has `orders.dinein.create`. The management UI freezes the transfer target, body, and idempotency key across uncertain retries. Database-backed HTTP coverage now creates two distinct waiter accounts and a manager, proves guessed-ID reads/additions are denied, performs an authorized reassignment, and verifies both waiters' access after transfer. The Phase 4 suite exited 0 with 3 tests passing in 16.706 seconds.

Service booking migration `20260924001200_phase_4_service_bookings` adds tenant-scoped reservation, waitlist, advance-takeaway, and delivery records with RLS, tenant-consistent foreign keys, and a PostgreSQL exclusion constraint preventing concurrent overlapping confirmed table bookings. Deposits remain separate booking amounts until an idempotent, locked application creates one `DEPOSIT` payment on an eligible dine-in order; settlement charges only the remaining balance. A visible Reservations & delivery screen creates and lists these booking types in PKR. The Phase 4 suite exited 0 with 4 tests passing in 24.822 seconds, including overlap rejection and deposit-once persisted-row assertions. Full delivery dispatch fields, bill splitting, cancellation tickets, and browser acceptance remain open.

## Collected deposits are separate from requested deposits

Migration `20260924001300_phase_4_collected_deposits` adds `collected_deposit_minor`, `refunded_deposit_minor`, and `applied_deposit_minor` to `service_bookings`, plus an audited `booking_deposit_transactions` ledger with RLS and tenant-consistent foreign keys.

`depositMinor` is now informational only. An order balance is never reduced because a booking requests a deposit. Money moves only through `POST /phase4/bookings/:id/deposit-transactions`, which requires `reservations.manage`, rejects any claim of external verification, reuses the shared `validateManualPayment` tender rules so an inactive method cannot be recorded, writes one immutable ledger row, and emits an audit entry. Applying a deposit requires `collected - refunded > 0`, an eligible booking status, and a same-branch `DINE_IN` order on the booking's table that is still `UNPAID`/`OPEN`. The applied amount is capped at the order's outstanding balance, so partial, excess, and fully prepaid deposits are all handled; settlement then charges only what remains and accepts an empty payment list when the balance is already zero.

Booking lifecycle, delivery dispatch, and bill splitting arrive in `20260924001400_phase_4_delivery_and_shares`, which adds delivery address/phone/fee/courier fields with a dispatch-ordering check constraint, the `pos_order_shares` table with RLS, and an optional `share_id` on payments.

- `POST /phase4/bookings/:id/transition` enforces an explicit status transition table. Cancelling or marking a no-show is refused while an unapplied collected deposit or an unsettled linked order remains, so money cannot be stranded.
- `POST /phase4/bookings/:id/delivery` requires a settled linked order before dispatch and before completion, and records courier and timestamps.
- `POST /phase4/dine-in/orders/:id/split` requires shares to total the exact remaining balance and rejects re-splitting; `POST /phase4/shares/:id/settle` locks order before share to match the split lock order, settles each share once with its own receipt number, and closes the order, issues the receipt, and releases the table only when every share is settled.

New permissions are granted both by migration and in `DEFAULT_ROLES` in `platform.service.ts`. The migration alone was not sufficient: organization provisioning builds roles from that in-code default map, so without the code change new tenants would never receive `orders.split.manage` or `delivery.dispatch`. This was found by the browser run returning 403.

## Verification for this increment

- `corepack pnpm prisma validate` and `corepack pnpm prisma generate` — passed.
- `corepack pnpm typecheck` — passed across `packages/contracts`, `apps/api`, and `apps/web`.
- `node scripts/test-phase-1.cjs` (isolated acceptance database, 23 migrations) — 4 suites and 22 tests passed, including `apps/api/test/phase-4.e2e-spec.ts` with 8 tests. New coverage: requested versus collected versus refunded versus applied deposits, idempotent replay of a collection, concurrent deposit application producing exactly one `DEPOSIT` payment, partial net deposit settlement of only the remainder, the cancellation deposit guard, delivery dispatch gating, and split-share settlement with a concurrent second settle producing exactly one winner.
- `node scripts/phase-4-browser.cjs` — passed with separate authenticated waiter (390x844), kitchen (1024x768), and cashier (1366x768) sessions covering modifiers, kitchen notes, a delta ticket, the PKR minor-unit boundary, receipt reprint, persisted rows, table release, requested-versus-collected deposit recording, deposit application to an order, the blocked cancellation alert, and split-bill share settlement. Database assertions run after the walkthrough and verify payment method, amount, receipt, share status, and table state.

Two defects were fixed to make that run pass: the POS register `<label>` had no `htmlFor`/`id` association so it was not programmatically labelled, and the browser script used a substring label matcher that resolved two selects.

Three screenshots (`desktop-cashier-after-deposit`, `desktop-cashier-split`, `desktop-cashier-split-settled`) were not captured: Chrome's screenshot call times out on the cashier route after a repeat navigation in this environment, while the same page's assertions and persisted-state checks all passed. The other eight screenshots, including the requested/collected/applied deposit sequence, were written to `docs/phase-4/screenshots/`.

## Remaining Phase 4 gates

Physical kitchen display and printer hardware remain unverified. Per-share receipt rendering and printing of split bills are not implemented; shares carry a receipt number but the printable document is still the single order receipt. Realtime delivery for outbox events is polling-only. Phase 4 is still not complete, and this PR stays draft.
