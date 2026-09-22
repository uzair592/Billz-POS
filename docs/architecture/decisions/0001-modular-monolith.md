# ADR 0001: TypeScript modular monolith

Status: accepted

Use Next.js, NestJS, Prisma, PostgreSQL, and Redis in a pnpm monorepo. Domain modules remain independently testable but deploy as one API during the initial product stages. This keeps database transactions reliable and operations simple while preserving boundaries for later extraction.
