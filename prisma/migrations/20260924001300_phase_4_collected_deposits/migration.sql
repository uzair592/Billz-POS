ALTER TABLE service_bookings ADD COLUMN collected_deposit_minor INTEGER NOT NULL DEFAULT 0 CHECK(collected_deposit_minor>=0);
ALTER TABLE service_bookings ADD COLUMN refunded_deposit_minor INTEGER NOT NULL DEFAULT 0 CHECK(refunded_deposit_minor>=0);
ALTER TABLE service_bookings ADD COLUMN applied_deposit_minor INTEGER NOT NULL DEFAULT 0 CHECK(applied_deposit_minor>=0);
ALTER TABLE service_bookings ADD CONSTRAINT service_bookings_id_organization_key UNIQUE(id,organization_id);
CREATE TABLE booking_deposit_transactions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 booking_id UUID NOT NULL, kind VARCHAR(20) NOT NULL CHECK(kind IN ('COLLECTION','REFUND')),
 method VARCHAR(40) NOT NULL, amount_minor INTEGER NOT NULL CHECK(amount_minor>0), reference VARCHAR(160), created_by_id UUID NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(booking_id,organization_id) REFERENCES service_bookings(id,organization_id) ON DELETE RESTRICT,
 FOREIGN KEY(created_by_id,organization_id) REFERENCES users(id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX booking_deposit_transactions_booking_idx ON booking_deposit_transactions(organization_id,booking_id,created_at);
ALTER TABLE booking_deposit_transactions ENABLE ROW LEVEL SECURITY; ALTER TABLE booking_deposit_transactions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON booking_deposit_transactions USING(organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid OR current_user='cafe_pos_platform') WITH CHECK(organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid OR current_user='cafe_pos_platform');
GRANT SELECT,INSERT ON booking_deposit_transactions TO cafe_pos_runtime,cafe_pos_platform;
