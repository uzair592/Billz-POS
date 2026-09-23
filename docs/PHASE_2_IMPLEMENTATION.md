# Phase 2 implementation note

Phase 2 closes the device-seat and delegated-access gaps identified after Phase 1.

## Delivered

- Device leases are five minutes by default, refreshed by the web client's 30-second heartbeat, and released on last-session logout. Allocation locks the organization row before counting seats, so simultaneous logins cannot oversubscribe a plan.
- Revoked devices cannot re-enter. Owners can recover active leases when a tenant is full; platform billing can preview downgrade conflicts for branches, users, devices, and enabled modules.
- Roles now carry JSON scope and an optional monetary approval threshold. Owners can create custom roles and assign tenant roles/branches, while owner authority and owner-role editing remain protected.
- One-time, payload-bound approval challenges are persisted, expire, are owner-consumed with compare-and-set semantics, and are audited.
- Workspace settings exposes lease recovery and the shell sends heartbeats on the existing mobile-friendly responsive layout.

## Main routes

`POST /api/v1/auth/heartbeat`, `POST /api/v1/devices/recover`, `POST /api/v1/roles`, `PUT /api/v1/users/:id/roles`, `POST /api/v1/approvals`, `POST /api/v1/approvals/:id/consume`, and `GET /api/v1/platform/billing/:organizationId/downgrade-preview/:planId`.

## Invariants

Seat allocation is tenant-wide and transactional; a heartbeat never revives a revoked device; all staff mutations require owner authority; cross-tenant IDs are resolved inside the tenant transaction; approval consumption is one-use and hash-bound.
