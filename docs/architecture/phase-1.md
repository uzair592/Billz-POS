# Phase 1 architecture

The system is a TypeScript modular monolith: Next.js web client, NestJS REST API, PostgreSQL through Prisma, Redis, BullMQ-ready workers, and S3-compatible object storage.

Tenant context is resolved exclusively from an authenticated session. Tenant-scoped application services require that context, apply organization and branch predicates, and run protected reads and writes in a PostgreSQL transaction that sets `app.organization_id`. Row-level security policies provide a second boundary. Composite constraints prevent cross-tenant relationships.

Platform administrators use a separate identity table and separate routes. Support access is time-limited, reason-bound, and audited.

Money will use integer minor units. Stock quantities will use `DECIMAL(18,6)`.
