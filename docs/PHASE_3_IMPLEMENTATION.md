# Phase 3 implementation note

Phase 3 adds the first operational POS vertical slice while preserving the tenant and authorization boundaries from Phases 1–2.

- Catalog entities: categories, products, branch prices, variants, combo metadata, modifier configuration, and tax basis points.
- Register opening/closing is branch-scoped and prevents two open registers for one branch with a partial unique index.
- POS permissions are explicit, branch membership and role branch scopes are checked in the service, and tenant-consistent composite constraints protect references.
- Orders calculate subtotal, tax, and total on the server from current branch pricing. Payment totals must exactly match the authoritative total and retries are idempotent by request hash.
- Order items store name, quantity, price, tax, and modifier snapshots; receipts receive stable tenant-scoped numbers.
- The responsive `/workspace/pos` page supports branch selection, catalog search, cart quantity editing/removal, register selection, server quote display, split cash/manual-card tender, and checkout. `/workspace/menu` provides category/product management.

The API surface is under `/api/v1/pos`: catalog, products, quote, register opening/closing, held-order resume, orders, refunds, voids, history, and 80mm/PDF receipt retrieval. Combos remain disabled until component pricing and stock semantics are implemented.
