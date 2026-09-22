# Cafe POS

Multi-tenant cafe and restaurant point-of-sale platform. Phase 1 contains the platform foundation, secure authentication, organization provisioning, onboarding, roles and permissions, branches, settings, and append-only audit logging.

## Local setup

1. Copy `.env.example` to `.env` and replace all development secrets.
2. Run `docker compose up -d postgres redis minio mailpit`.
3. Run `corepack enable` and `pnpm install`.
4. Run `pnpm db:generate`, `pnpm db:migrate`, and `pnpm db:seed`.
5. Run `pnpm dev`.

Web: http://localhost:3000  
API docs: http://localhost:4000/docs  
Mailpit: http://localhost:8025  
MinIO console: http://localhost:9001

Development seed credentials come from `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`.

Business owners and employees sign in at http://localhost:3000/login with only their username or email and password. Organization URLs are internal and are never required from users. The seeded Starter, Growth, and Pro plans allow 3, 5, and 10 registered devices respectively; owners can review or remove devices from Workspace > Settings & devices.

## Verification

Run:

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
$env:RUN_DATABASE_TESTS='true'
corepack pnpm --filter @cafe-pos/api test:e2e
```

Use `corepack pnpm prisma migrate status` to confirm the local database is current.

## Local services

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- Mailpit inbox: http://localhost:8025
- MinIO API: http://localhost:9000
- MinIO console: http://localhost:9001

Stop local services with `docker compose stop`. This preserves their named-volume data. Use `docker compose down` only when you intend to remove the containers and network.

Management reporting, POS sales, inventory, kitchen, purchases, customers, expenses, and cash-register workflows are intentionally reserved for later phases.
