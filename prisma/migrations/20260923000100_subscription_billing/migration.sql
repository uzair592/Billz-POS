ALTER TABLE organization_subscriptions ADD COLUMN grace_ends_at TIMESTAMPTZ(3);
CREATE TABLE billing_plan_versions (
 id UUID PRIMARY KEY, plan_id UUID NOT NULL REFERENCES subscription_plans(id), name VARCHAR(100) NOT NULL,
 currency CHAR(3) NOT NULL, monthly_minor INTEGER NOT NULL CHECK(monthly_minor >= 0),
 max_branches INTEGER NOT NULL CHECK(max_branches > 0), max_users INTEGER NOT NULL CHECK(max_users > 0),
 max_devices INTEGER NOT NULL CHECK(max_devices > 0), grace_days INTEGER NOT NULL CHECK(grace_days BETWEEN 0 AND 90),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX billing_plan_versions_plan_id_created_at_idx ON billing_plan_versions(plan_id, created_at);
CREATE TABLE billing_invoices (
 id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES organizations(id),
 plan_version_id UUID NOT NULL REFERENCES billing_plan_versions(id), command_id UUID NOT NULL, request_hash CHAR(64) NOT NULL,
 description TEXT NOT NULL, currency CHAR(3) NOT NULL, total_minor INTEGER NOT NULL CHECK(total_minor >= 0),
 period_start TIMESTAMPTZ(3) NOT NULL, period_end TIMESTAMPTZ(3) NOT NULL, grace_ends_at TIMESTAMPTZ(3) NOT NULL,
 anchor_day INTEGER NOT NULL CHECK(anchor_day BETWEEN 1 AND 31), created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(period_end > period_start), CHECK(grace_ends_at >= period_end),
 UNIQUE(organization_id, command_id), UNIQUE(id, organization_id)
);
CREATE INDEX billing_invoices_organization_id_created_at_idx ON billing_invoices(organization_id, created_at);
CREATE TABLE billing_settlements (
 id UUID PRIMARY KEY, organization_id UUID NOT NULL, invoice_id UUID NOT NULL, command_id UUID NOT NULL,
 request_hash CHAR(64) NOT NULL, kind VARCHAR(20) NOT NULL CHECK(kind IN ('PAYMENT','CREDIT')),
 amount_minor INTEGER NOT NULL CHECK(amount_minor > 0), method VARCHAR(30) NOT NULL,
 reference VARCHAR(200) NOT NULL, reason TEXT NOT NULL, created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(organization_id, command_id),
 FOREIGN KEY(invoice_id, organization_id) REFERENCES billing_invoices(id, organization_id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX billing_settlements_organization_id_invoice_id_idx ON billing_settlements(organization_id, invoice_id);
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['billing_invoices','billing_settlements'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid OR NULLIF(current_setting(''app.platform_admin_id'', true), '''') IS NOT NULL)', t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['billing_plan_versions','billing_invoices','billing_settlements'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_billing BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation()', t);
 END LOOP;
END $$;
