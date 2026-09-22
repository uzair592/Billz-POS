# Phase 1 completion record

## Features completed

- TypeScript pnpm monorepo with Next.js, NestJS, shared Zod contracts, Prisma, PostgreSQL, Redis, Mailpit, and MinIO.
- Separate Platform Admin and business-user authentication surfaces.
- Argon2id password hashes, opaque hashed sessions, HTTP-only cookies, CSRF checks, session revocation, temporary-password enforcement, failed-login lockout, and Redis-backed login/reset throttling.
- Non-enumerating forgot-password flow with single-use expiring tokens and SMTP delivery.
- Global username/email business login without an organization URL, backed by case-insensitive uniqueness constraints.
- Atomic business provisioning with subscription, modules, default settings, payment methods, roles, owner account, and audit record.
- Business activation, suspension, deactivation, owner credential reset, module assignment, subscription replacement, activity queries, and plan-limit enforcement.
- Organization onboarding, primary branch creation, regional defaults, employees, multi-branch membership, normalized roles, normalized permissions, and settings.
- Append-only audit log with IP address and user-agent metadata.
- Responsive light/dark UI with mobile navigation for authentication, platform administration, onboarding, branches, employees, roles, editable business settings, device management, and audit activity.
- Plan-based registered-device enforcement and owner-managed device revocation (Starter 3, Growth 5, Pro 10 by default).
- OpenAPI UI at `/docs` and JSON document at `/docs/openapi.json`.

## Database migrations

1. `20260922000100_phase_1_foundation`
   - Phase 1 tables, foreign keys, composite constraints, indexes, tenant RLS policies, primary/default-branch invariants, and append-only audit trigger.
2. `20260922000200_runtime_rls_role`
   - Non-login, non-bypass PostgreSQL application role used by API transactions and isolation tests.
3. `20260922000300_global_login_and_device_limits`
   - Global case-insensitive business login identities, per-plan device limits, registered devices, session/device links, and tenant RLS policies.

## Principal API groups

- `/api/v1/auth/*`: login, logout, session, password change, forgot password, reset password.
- `/api/v1/platform/*`: platform session, dashboard, catalog, organizations, status, subscription, modules, owner reset, and activity.
- `/api/v1/organization`, `/branches`, `/users`, `/roles`, `/permissions`, `/devices`: tenant workspace and registered-device administration.
- `/api/v1/onboarding/*`: resumable business, settings, branch, and completion workflow.
- `/api/v1/audit-logs`: tenant-scoped audit history.
- `/api/v1/health`: service health.

## Tests and checks completed

- Prisma schema validation and client generation.
- Both migrations applied to PostgreSQL 16.
- Seed executed and Platform Admin login verified.
- Four security unit tests passing.
- PostgreSQL branch and registered-device cross-tenant RLS tests passing under the non-bypass runtime role.
- Live API health, platform login, atomic business creation, URL-free owner/employee login, forced password change, resumable onboarding, profile persistence, employee creation, device-limit rejection, device revocation, and replacement-device login verified.
- Mailpit reset-email delivery, reset completion, login with recovered password, and token-reuse rejection verified.
- API and web TypeScript checks pass.
- API and Next.js production builds pass.

## Security checks completed

- Tenant context comes from authenticated sessions, never request organization IDs.
- Business repositories execute with both transaction-local tenant context and a non-bypass database role.
- Tenant-aware composite relations prevent branch/user/role cross-linking.
- Backend permission guards independently enforce protected actions.
- Business and Platform Admin mutation routes require CSRF tokens.
- Sessions and reset tokens are stored only as hashes.
- Sensitive actions create immutable audit records.
- Suspended organizations cannot establish business sessions.

## Known Phase 1 limitations

- Support-access grant/session tables exist, but direct tenant impersonation is intentionally disabled until the approval UI and re-authentication ceremony are implemented and security-reviewed.
- Logo/file metadata is modeled, but signed MinIO upload endpoints are not exposed yet.
- Two-factor authentication is reserved for a later security phase.
- Email is dispatched directly in Phase 1; moving delivery to a BullMQ worker is recommended before high-volume production use.
- The Platform UI currently exposes business creation and overview. Status, plan, module, activity, and owner-reset operations are implemented in the API but still need dedicated detail screens.
- Operational POS, orders, products, inventory, kitchen, customers, expenses, registers, and reports remain intentionally unimplemented until their approved phases.

## Exact local commands

```powershell
Copy-Item .env.example .env
docker compose up -d postgres redis minio mailpit
corepack pnpm install
corepack pnpm db:generate
corepack pnpm db:deploy
corepack pnpm db:seed
corepack pnpm dev
```

Open the web app at http://localhost:3000 and API documentation at http://localhost:4000/docs.

## Recommended next phase

Proceed to Phase 2 only after the remaining Phase 1 UI limitations above are accepted or completed. Phase 2 should add categories, products, variants, modifiers, server-calculated carts, orders, transactional checkout, split payments, immutable receipt snapshots, and order history.
