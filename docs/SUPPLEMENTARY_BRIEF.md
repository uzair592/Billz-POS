# AI AGENT BUILD PROMPT — MULTI-TENANT CAFE POS & BUSINESS MANAGEMENT SAAS

Copy everything below this line and give it to your AI coding agent (Claude Code, Cursor, etc.) as the project brief.

---

## ROLE

You are a senior full-stack architect and engineer. You are building a **production-grade, multi-tenant SaaS Cafe POS & Business Management System** — not a single-café app, not a demo, not a student project. Multiple independent cafés/restaurants must be able to sign up, configure the system to their own needs, and run their daily operations on it without seeing each other's data.

Work in phases. At the start of each phase, output: (1) database schema changes, (2) API endpoints, (3) frontend components, (4) user flow, (5) permissions, (6) validation rules, (7) error handling — then implement. Never generate fake/stubbed functionality silently; if something isn't built yet, mark it clearly as "Coming soon" in the UI.

---

## 1. CORE PRINCIPLE: MULTI-TENANCY & VERSATILITY

This is the difference between this system and a typical demo POS. Every design decision must support many independent businesses on one codebase:

- **Tenant model**: `Organization` → `Branch(es)` → `Users/Roles` → everything else. Every table that holds business data carries a `tenant_id`/`branch_id` and is filtered by it at the query layer (row-level security in Postgres, or an ORM middleware that makes cross-tenant leakage structurally impossible, not just "usually filtered").
- **Configurable business type**: a café, a restaurant, a bakery, a cloud kitchen, a juice bar, and a food truck should all be able to use this by toggling modules on/off during onboarding (e.g. a food truck disables Tables/Kitchen Display, a cloud kitchen disables Dine-In).
- **Configurable everything**: tax rates, currency, service charge, receipt format, order numbering, payment methods, modifier structures, and units of measure must be admin-configurable per tenant — nothing hardcoded to one business's rules.
- **Plans/tiers**: design (even if not fully enforced in MVP) for a subscription model — e.g. Starter (1 branch, POS + Inventory), Growth (multi-branch, reports, KDS), Pro (API access, loyalty, advanced analytics). Gate features by plan in one central place, not scattered checks.
- **White-label readiness**: tenant logo, tenant name, and accent color should be swappable per business without code changes.
- **Localization-ready**: Pakistan (PKR, DD-MM-YYYY, 12-hour time, Urdu/English) is the default market, but currency, date format, and language must be per-tenant settings, not global constants.

---

## 2. DESIGN PHILOSOPHY

Minimal, professional, fast — inspired by the clarity of Vyapar and the speed of Square/Toast/Lightspeed Restaurant, without copying their branding.

- Large touch targets for POS screens; dense, information-rich screens for back-office/reports.
- White/off-white background, dark charcoal text, a configurable accent color (default: coffee-brown or green), clear status colors (green=paid/ready, amber=pending, red=overdue/cancelled).
- No excessive gradients, glassmorphism, or animation — clarity over decoration.
- Support light/dark mode.

---

## 3. MODULES (NAVIGATION)

Dashboard · POS/New Sale · Orders · Tables · Products · Categories · Inventory · Purchases · Suppliers · Customers · Expenses · Employees · Cash/Register · Reports · Accounting · Offers & Discounts · Kitchen Display · Loyalty · Online Ordering · Notifications · Integrations · Settings

Modules are enable/disable toggles per tenant (see Section 1).

---

## 4. FEATURE SET (BASED ON PROVEN REQUIREMENTS)

Build all of the following — treat this as the functional backbone, not a wishlist:

- **Dashboard**: today's sales/orders/AOV/cash/card/online/credit split, discounts, expenses, gross & net profit, tax collected; hourly/weekly/monthly charts; sales by category/product/payment method; low-stock/out-of-stock/expiring alerts; best-selling, most profitable, and slow-moving products; recent orders/purchases/expenses/adjustments.
- **POS screen**: category rail, product grid with images/price/stock status, cart with qty controls, per-item notes/modifiers, price-edit (permission-gated), barcode scanning, hold/park orders, global search (Ctrl+K), full keyboard shortcut set (F1–F9 configurable).
- **Product modifiers**: size/milk/extras style option groups with per-option price deltas; base + modifiers × qty auto-calculated.
- **Order types**: Dine-in (table, guests, server), Takeaway (packaging charge), Delivery (address, rider, delivery charge, status), Quick Sale.
- **Table management**: visual floor plan, statuses (available/occupied/reserved/cleaning/billing), merge/split/transfer tables.
- **Checkout & payments**: subtotal/discount/tax/service/delivery charge → grand total; cash/card/bank transfer/JazzCash/Easypaisa/other; split payments across multiple methods; cash-received/change calculator with quick-cash buttons.
- **Receipts**: 58mm/80mm thermal, A4, and PDF layouts; print/download/WhatsApp share; all financial totals computed server-side.
- **Order management**: filter by date/number/customer/cashier/table/payment/type/status; view/print/reprint/refund/edit/duplicate.
- **Kitchen Display System**: New → Preparing → Ready → Completed columns, per-order items/modifiers/notes/elapsed time, drag-or-tap status changes.
- **Products & inventory**: full product record (SKU, barcode, category, prices, tax, unit, min/current stock, image, recipe, supplier); stock movement ledger (opening + purchases + adjustments − sales − wastage = closing); recipe-based auto-deduction of ingredients on sale; low-stock alerts.
- **Purchasing & suppliers**: purchase orders with paid/partial/credit status, auto stock increase, full supplier ledger with outstanding balances.
- **Customers & credit/khata**: customer profiles, credit limits, ledger, statements, loyalty points.
- **Expenses**: categorized expenses with attachments and payment method.
- **Cash register / shift management**: opening float, expected vs. actual cash, shortage/overage tracking.
- **Employees & role-based permissions**: Owner/Manager/Cashier/Waiter/Kitchen/Inventory Manager, with granular view/create/edit/delete/refund/discount/price-change/report/user-management permissions; sensitive actions require manager PIN.
- **Discounts, tax, combos**: percentage/fixed, item- or order-level, coupon codes; configurable inclusive/exclusive tax; combo pricing with automatic multi-item inventory deduction.
- **Reports**: sales (daily/weekly/monthly/annual/by product/category/cashier/table/payment), inventory (stock, valuation, movement, wastage), purchases (by supplier/product, outstanding balances), financial (revenue, expenses, gross/net profit, tax, cash flow); export PDF/Excel/CSV.
- **Refunds/voids/audit log**: full reason/employee/timestamp trail on every refund, cancellation, price override, and stock adjustment; nothing silently disappears.
- **Notifications**: low stock, credit due, register discrepancy, cancelled order, large discount, failed payment.
- **Offline-first POS**: cached products, local order queue, safe sync with duplicate-prevention when connectivity returns.

---

## 5. "LATEST FEATURES" TO ADD ON TOP OF THE BASELINE

These are what make this competitive with 2026-era POS/restaurant SaaS rather than a 2018-era clone. Build them as modular, toggleable add-ons per tenant:

- **QR code table ordering**: customers scan a table QR to view a live menu and place/pay for an order themselves; order lands directly in Orders/KDS.
- **Self-service kiosk mode**: a touch-optimized, simplified frontend for a standalone kiosk/tablet.
- **Online ordering storefront + delivery aggregator sync**: a branded ordering page per tenant, plus a hook layer to reconcile orders coming from Foodpanda/Careem/etc. into one Orders view.
- **AI demand forecasting & smart reordering**: use historical sales + seasonality to suggest purchase quantities and flag ingredients that will stock out before the next delivery.
- **Dynamic/time-based pricing & happy-hour rules**: schedule discounts or price changes by day/hour automatically.
- **WhatsApp/Telegram order & receipt bot**: send receipts, order status updates, and marketing messages via WhatsApp Business API (design the integration layer now, even if MVP just uses share-links).
- **Customer loyalty & rewards engine**: points per spend, tiered rewards, birthday offers, configurable per tenant.
- **AI-assisted menu/recipe costing**: suggest a selling price given ingredient cost and a target margin.
- **Voice/AI-assisted order entry** (stretch goal): a natural-language "2 lattes, 1 large, one burger no onions" parser that builds the cart.
- **Multi-branch consolidated reporting**: an owner with several branches sees combined and per-branch dashboards from one login.
- **API & webhook layer**: expose read/write REST (or GraphQL) endpoints so a tenant can integrate accounting software, a delivery app, or a custom dashboard.
- **PWA support**: installable, works offline, push notifications for order status.

---

## 6. TECH STACK

- **Frontend**: React + TypeScript, Tailwind CSS + a component library (shadcn/ui or similar).
- **Backend**: FastAPI (Python) or NestJS (TypeScript) — pick one and justify briefly if you deviate.
- **Database**: PostgreSQL with row-level security for tenant isolation; SQLAlchemy/Prisma ORM.
- **Validation**: Pydantic (or Zod on the Node stack).
- **Auth**: JWT/session-based, with tenant-scoped role claims.
- **Charts**: Recharts or equivalent.
- **PDF/Receipts**: server-side generation.
- **Money**: decimal-safe arithmetic everywhere — never floats for currency.

If a better equivalent exists for the chosen platform, propose it and explain the trade-off before switching.

---

## 7. NON-NEGOTIABLE RULES

1. All financial calculations (subtotal, tax, discount, change, refunds, profit, ledgers) happen **server-side only**. Never trust totals from the frontend.
2. No cross-tenant data leakage — enforce at the database/ORM layer, not just in application logic.
3. No plain-text passwords; proper hashing, session/token management, input validation, rate limiting, SQL-injection protection.
4. Every dangerous action (delete, refund, void, stock adjustment, register close) requires confirmation, and sensitive ones require a manager PIN.
5. Full audit log on every sensitive action: who, what, when, from where.
6. Cashier-facing screens show only Products/Cart/Total/Payment — never accounting complexity. Owner/manager views carry the analytical depth.
7. Errors shown to staff are plain-language ("Something went wrong — please try again"); technical errors are logged internally only.
8. Build incrementally in phases; do not generate placeholder features that look functional but aren't — label anything unfinished.

---

## 8. BUILD PHASES

1. **Foundation** — multi-tenant data model, auth, roles/permissions, business/branch onboarding, base layout, dashboard shell.
2. **Core POS** — products, categories, modifiers, cart, checkout, payments, receipts.
3. **Restaurant operations** — tables, dine-in/takeaway/delivery, Kitchen Display, order statuses.
4. **Inventory & purchasing** — stock, recipes/ingredient deduction, purchases, suppliers, wastage.
5. **Business management** — customers, khata/credit, expenses, cash register, employees.
6. **Reporting & accounting layer** — sales/inventory/purchase/financial reports, ledgers, profit tracking.
7. **Versatility & latest features** — plan/tier gating, module toggles per business type, QR ordering, loyalty, WhatsApp integration, API/webhooks, AI forecasting.
8. **Polish & hardening** — offline sync, printing, backups, performance tuning, responsive/tablet layouts, audit log completeness.

Start by proposing the full multi-tenant database schema and overall application architecture, get it confirmed, then proceed phase by phase.
