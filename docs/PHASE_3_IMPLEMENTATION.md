# Phase 3 implementation note

Phase 3 adds the first operational POS vertical slice while preserving the tenant and authorization boundaries from Phases 1–2.

- Catalog entities: categories, products, branch prices, variants, combo metadata, modifier configuration, and tax basis points.
- Register opening is branch-scoped and prevents two open registers for one branch.
- Orders calculate subtotal, tax, and total on the server from current branch pricing. Payment totals must exactly match the authoritative total.
- Order items store name, quantity, price, tax, and modifier snapshots; receipts receive stable tenant-scoped numbers.
- The responsive `/workspace/pos` page supports branch selection, catalog taps, cart quantity aggregation, register opening, and cash checkout.

The API surface is under `/api/v1/pos`: catalog, products, register opening, orders, and receipt-safe order retrieval. Refund processing and print/PDF adapters remain subsequent work in the Phase 3 gate.
