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
