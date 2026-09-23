CREATE UNIQUE INDEX IF NOT EXISTS product_categories_id_org_key ON product_categories(id,organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS products_id_org_key ON products(id,organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS pos_orders_id_org_key ON pos_orders(id,organization_id);
ALTER TABLE products ADD CONSTRAINT products_category_org_fk FOREIGN KEY(category_id,organization_id) REFERENCES product_categories(id,organization_id) ON DELETE SET NULL;
ALTER TABLE product_prices ADD CONSTRAINT product_prices_product_org_fk FOREIGN KEY(product_id,organization_id) REFERENCES products(id,organization_id) ON DELETE CASCADE;
ALTER TABLE product_variants ADD CONSTRAINT product_variants_product_org_fk FOREIGN KEY(product_id,organization_id) REFERENCES products(id,organization_id) ON DELETE CASCADE;
ALTER TABLE pos_order_items ADD CONSTRAINT pos_order_items_product_org_fk FOREIGN KEY(product_id,organization_id) REFERENCES products(id,organization_id) ON DELETE RESTRICT;
ALTER TABLE pos_order_items ADD CONSTRAINT pos_order_items_order_org_fk FOREIGN KEY(order_id,organization_id) REFERENCES pos_orders(id,organization_id) ON DELETE CASCADE;
ALTER TABLE pos_order_payments ADD CONSTRAINT pos_order_payments_order_org_fk FOREIGN KEY(order_id,organization_id) REFERENCES pos_orders(id,organization_id) ON DELETE CASCADE;
ALTER TABLE pos_receipts ADD CONSTRAINT pos_receipts_order_org_fk FOREIGN KEY(order_id,organization_id) REFERENCES pos_orders(id,organization_id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS register_sessions_one_open_per_branch ON register_sessions(organization_id,branch_id) WHERE closed_at IS NULL;
CREATE SEQUENCE IF NOT EXISTS pos_order_number_seq START WITH 1;
SELECT setval('pos_order_number_seq', GREATEST(COALESCE((SELECT MAX(order_number) FROM pos_orders),0)+1,1), false);
ALTER TABLE pos_orders ALTER COLUMN order_number SET DEFAULT nextval('pos_order_number_seq');
ALTER SEQUENCE pos_order_number_seq OWNED BY pos_orders.order_number;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS tax_mode VARCHAR(20) NOT NULL DEFAULT 'EXCLUSIVE';
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS discount_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS paid_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS change_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS refunded_minor INTEGER NOT NULL DEFAULT 0;
ALTER TABLE register_sessions ADD COLUMN IF NOT EXISTS closing_total_minor INTEGER;
ALTER TABLE pos_order_payments ADD COLUMN IF NOT EXISTS tender_kind VARCHAR(20) NOT NULL DEFAULT 'MANUAL';
ALTER TABLE pos_order_payments ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ(3);
CREATE TABLE pos_refunds (id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT, order_id UUID NOT NULL, amount_minor INTEGER NOT NULL CHECK(amount_minor > 0), reason VARCHAR(500) NOT NULL, disposition VARCHAR(30) NOT NULL DEFAULT 'NO_STOCK', created_by_id UUID NOT NULL, created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(), CONSTRAINT pos_refunds_order_org_fk FOREIGN KEY(order_id,organization_id) REFERENCES pos_orders(id,organization_id) ON DELETE RESTRICT);
CREATE INDEX pos_refunds_org_order_idx ON pos_refunds(organization_id,order_id);
INSERT INTO permissions (id,key,name,module_key) VALUES
 (gen_random_uuid(),'organization.view','View organization','foundation'),(gen_random_uuid(),'branches.manage','Manage branches','foundation'),(gen_random_uuid(),'users.manage','Manage employees','foundation'),(gen_random_uuid(),'roles.manage','Manage roles and permissions','foundation'),(gen_random_uuid(),'settings.manage','Manage settings','foundation'),(gen_random_uuid(),'audit.view','View audit logs','foundation'),(gen_random_uuid(),'discounts.apply','Apply discounts','pos'),(gen_random_uuid(),'refunds.create','Create refunds','pos'),(gen_random_uuid(),'voids.create','Void orders','pos'),(gen_random_uuid(),'prices.change','Change selling prices','products'),(gen_random_uuid(),'costs.view','View cost prices','products'),(gen_random_uuid(),'profit.view','View profit','reports'),(gen_random_uuid(),'products.manage','Manage products','products'),(gen_random_uuid(),'stock.manage','Manage stock','inventory'),(gen_random_uuid(),'purchases.manage','Manage purchases','purchases'),(gen_random_uuid(),'expenses.manage','Manage expenses','expenses'),(gen_random_uuid(),'reports.view','View reports','reports'),
 (gen_random_uuid(),'pos.catalog.view','View POS catalog','pos'),(gen_random_uuid(),'pos.catalog.manage','Manage POS catalog','pos'),
 (gen_random_uuid(),'pos.register.open','Open and close registers','registers'),(gen_random_uuid(),'pos.sale.create','Create POS sales','pos'),
 (gen_random_uuid(),'pos.sale.refund','Refund POS sales','pos'),(gen_random_uuid(),'pos.sale.void','Void POS sales','pos'),
 (gen_random_uuid(),'pos.sale.history','View POS history','pos'),(gen_random_uuid(),'pos.sale.reprint','Reprint POS receipts','pos')
 ON CONFLICT (key) DO NOTHING;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['pos_refunds'] LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t); EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = NULLIF(current_setting(''app.organization_id'',true),'''')::uuid OR current_user = ''cafe_pos_platform'')',t); EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO cafe_pos_runtime',t); EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO cafe_pos_platform',t); END LOOP; END $$;
GRANT USAGE,SELECT ON SEQUENCE pos_order_number_seq TO cafe_pos_runtime, cafe_pos_platform;
