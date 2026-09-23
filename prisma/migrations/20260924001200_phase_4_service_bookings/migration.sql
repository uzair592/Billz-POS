CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE service_bookings (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 branch_id UUID NOT NULL, table_id UUID, kind VARCHAR(30) NOT NULL DEFAULT 'RESERVATION', status VARCHAR(30) NOT NULL DEFAULT 'CONFIRMED',
 customer_name VARCHAR(150) NOT NULL, contact VARCHAR(100), party_size INTEGER NOT NULL DEFAULT 1,
 starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL, notes VARCHAR(500), details JSONB NOT NULL DEFAULT '{}',
 deposit_minor INTEGER NOT NULL DEFAULT 0 CHECK (deposit_minor >= 0), applied_order_id UUID UNIQUE, version INTEGER NOT NULL DEFAULT 1,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY (branch_id,organization_id) REFERENCES branches(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY (table_id,organization_id,branch_id) REFERENCES floor_tables(id,organization_id,branch_id) ON DELETE RESTRICT,
 FOREIGN KEY (applied_order_id,organization_id) REFERENCES pos_orders(id,organization_id) ON DELETE RESTRICT,
 CHECK (ends_at > starts_at), CHECK (party_size > 0)
);
ALTER TABLE service_bookings ADD CONSTRAINT service_bookings_no_overlap EXCLUDE USING gist
 (organization_id WITH =, table_id WITH =, tstzrange(starts_at,ends_at,'[)') WITH &&)
 WHERE (table_id IS NOT NULL AND status IN ('CONFIRMED','SEATED'));
CREATE INDEX service_bookings_branch_time_idx ON service_bookings(organization_id,branch_id,starts_at);
ALTER TABLE service_bookings ENABLE ROW LEVEL SECURITY; ALTER TABLE service_bookings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON service_bookings USING (organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid OR current_user='cafe_pos_platform') WITH CHECK (organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid OR current_user='cafe_pos_platform');
GRANT SELECT,INSERT,UPDATE,DELETE ON service_bookings TO cafe_pos_runtime,cafe_pos_platform;
INSERT INTO permissions(id,key,name,module_key) VALUES
 (gen_random_uuid(),'reservations.view','View reservations and service bookings','reservations'),
 (gen_random_uuid(),'reservations.manage','Manage reservations, waitlist, deposits and delivery','reservations') ON CONFLICT(key) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.is_system=true AND r.key='manager' AND p.key IN ('reservations.view','reservations.manage') ON CONFLICT DO NOTHING;
