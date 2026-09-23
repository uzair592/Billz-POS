ALTER TABLE organization_devices ADD COLUMN lease_expires_at TIMESTAMPTZ(3);
ALTER TABLE roles ADD COLUMN scope JSONB NOT NULL DEFAULT '{}';
ALTER TABLE roles ADD COLUMN approval_limit_minor INTEGER;
CREATE TABLE approval_challenges (
 id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 action VARCHAR(100) NOT NULL, payload_hash CHAR(64) NOT NULL, amount_minor INTEGER,
 requested_by_id UUID NOT NULL, approved_by_id UUID, expires_at TIMESTAMPTZ(3) NOT NULL,
 consumed_at TIMESTAMPTZ(3), created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX approval_challenges_organization_id_action_expires_at_idx ON approval_challenges(organization_id,action,expires_at);
ALTER TABLE approval_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_challenges FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON approval_challenges USING(organization_id=NULLIF(current_setting('app.organization_id',true),'')::uuid OR current_user='cafe_pos_platform');
GRANT SELECT,INSERT,UPDATE ON approval_challenges TO cafe_pos_runtime;
GRANT SELECT,INSERT,UPDATE ON approval_challenges TO cafe_pos_platform;
CREATE INDEX organization_devices_live_lease_idx ON organization_devices(organization_id, lease_expires_at) WHERE revoked_at IS NULL;
