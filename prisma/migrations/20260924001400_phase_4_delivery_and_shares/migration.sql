ALTER TABLE service_bookings ADD COLUMN delivery_address VARCHAR(300);
ALTER TABLE service_bookings ADD COLUMN delivery_phone VARCHAR(30);
ALTER TABLE service_bookings ADD COLUMN delivery_fee_minor INTEGER NOT NULL DEFAULT 0 CHECK (delivery_fee_minor >= 0);
ALTER TABLE service_bookings ADD COLUMN courier_name VARCHAR(120);
ALTER TABLE service_bookings ADD COLUMN dispatched_at TIMESTAMPTZ(3);
ALTER TABLE service_bookings ADD COLUMN delivered_at TIMESTAMPTZ(3);
ALTER TABLE service_bookings ADD COLUMN cancellation_reason VARCHAR(300);
ALTER TABLE service_bookings ADD CONSTRAINT service_bookings_delivery_window CHECK (delivered_at IS NULL OR dispatched_at IS NOT NULL);
CREATE INDEX service_bookings_delivery_idx ON service_bookings(organization_id,branch_id,status) WHERE kind='DELIVERY';

CREATE TABLE pos_order_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  order_id UUID NOT NULL, label VARCHAR(80) NOT NULL, total_minor INTEGER NOT NULL CHECK (total_minor > 0),
  paid_minor INTEGER NOT NULL DEFAULT 0 CHECK (paid_minor >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','SETTLED','VOID')),
  settled_by_id UUID, settled_at TIMESTAMPTZ(3), created_by_id UUID NOT NULL,
  receipt_number VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (order_id,organization_id) REFERENCES pos_orders(id,organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_id,organization_id) REFERENCES users(id,organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (settled_by_id,organization_id) REFERENCES users(id,organization_id) ON DELETE RESTRICT,
  UNIQUE (organization_id,order_id,label)
);
CREATE UNIQUE INDEX pos_order_shares_id_org_key ON pos_order_shares(id,organization_id);
ALTER TABLE pos_order_shares ENABLE ROW LEVEL SECURITY; ALTER TABLE pos_order_shares FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pos_order_shares USING (organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid OR current_user='cafe_pos_platform') WITH CHECK (organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid OR current_user='cafe_pos_platform');
GRANT SELECT,INSERT,UPDATE,DELETE ON pos_order_shares TO cafe_pos_runtime,cafe_pos_platform;

ALTER TABLE pos_order_payments ADD COLUMN share_id UUID;
ALTER TABLE pos_order_payments ADD CONSTRAINT pos_order_payments_share_fk FOREIGN KEY (share_id,organization_id) REFERENCES pos_order_shares(id,organization_id) ON DELETE RESTRICT;
CREATE INDEX pos_order_payments_share_idx ON pos_order_payments(organization_id,share_id);

INSERT INTO modules(id,key,name,phase) VALUES (gen_random_uuid(),'delivery','Delivery',4) ON CONFLICT(key) DO NOTHING;
INSERT INTO permissions(id,key,name,module_key) VALUES
  (gen_random_uuid(),'orders.split.manage','Split a bill into shares and settle each share','orders'),
  (gen_random_uuid(),'delivery.dispatch','Dispatch and complete delivery bookings','delivery') ON CONFLICT(key) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
  SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
  WHERE r.is_system=true AND r.key IN ('manager','cashier') AND p.key IN ('orders.split.manage','delivery.dispatch') ON CONFLICT DO NOTHING;