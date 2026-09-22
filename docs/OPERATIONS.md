# Operations — Phase 0

## Local environment
Windows PowerShell; workspace C:\Users\HP\Desktop\CAFE POS SYSTEM. Existing pnpm/Node monorepo and Docker services are retained. Never use the ancestor home-directory Git repository to stage this project. The project now has its own Git repository.

Existing setup (for a new development environment only):
1. Copy .env.example to .env if no .env exists; supply private development credentials.
2. docker compose up -d postgres redis minio mailpit
3. corepack pnpm install --frozen-lockfile
4. corepack pnpm db:generate
5. corepack pnpm db:deploy
6. corepack pnpm db:seed (development only; inspect plan upserts first)
7. corepack pnpm --filter @cafe-pos/contracts build
8. corepack pnpm dev

Web http://localhost:3000; API http://localhost:4000/api/v1; docs http://localhost:4000/docs; local email http://localhost:8025.
Seed admin credentials are private .env values; do not put credentials in reports. Create a clearly named development tenant through platform administration. Public signup is unavailable. Phone access is not proven by responsive CSS: localhost on a phone points to that phone; reachable host/CORS configuration or a same-origin proxy is needed.

## Checks
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm prisma validate
corepack pnpm prisma migrate status
corepack pnpm build

For database tests use a disposable database with migrations applied, set DATABASE_URL and RUN_DATABASE_TESTS=true, then corepack pnpm --filter @cafe-pos/api test:e2e. Tests create temporary tenants. Avoid presenting skipped tests as passing.

Stop Next dev before production build: both use apps/web/.next. Windows may lock Prisma engine files while the API runs; stop the specific project API process before db:generate. Restart after verification.

## Data safety and future deployment
Phase 0 does not apply a migration, reseed, reset or modify customer data. Existing migrations remain unchanged. A privileged local Docker account is not an acceptable production runtime identity; implement H-01 before delivery under the new Phase 1 gate.

Before a future migration: backup database/private objects, restore into isolated environment, rehearse additive migrations/backfills, reconcile counts and accounting fixtures, verify backward application compatibility, then explicitly request production deployment. No backup restore or production rollout has been performed in Phase 0.

Logs must redact password/token/card data. Planned request IDs, health checks, lease/job lag and failed-outbox metrics must be implemented in their owning phases. Redis is not a recoverable source of financial truth.

## Git handoff
Branch feature/phase-0-specification is local. There is no configured remote. Do not infer a GitHub URL from the configured Git identity. After user supplies an authorized repository URL: configure origin, push this branch, and create a PR if authenticated tooling allows. Never merge or deploy automatically. Secrets, generated artifacts and dependency directories are excluded from commits.

## Wireframe review
Open docs/wireframes/index.html directly in a browser. Review the five static concepts at desktop 1366x768, tablet 1024x768, mobile 390px. They are labelled prototype-only, contain illustrative values, have no API or operational mutations and are not in the app navigation. Check tenant billing actions, owner dashboard hierarchy, POS cart/tender placement, waiter send/status and KDS station readability. Screenshots or rendering evidence, if unavailable, remain explicitly NOT VERIFIED in the phase report.

