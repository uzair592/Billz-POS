-- Passwords are provisioned outside migrations. Neither API login owns tables.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='cafe_pos_runtime') THEN CREATE ROLE cafe_pos_runtime LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='cafe_pos_platform') THEN CREATE ROLE cafe_pos_platform LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO cafe_pos_runtime, cafe_pos_platform;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cafe_pos_platform;
REVOKE ALL ON _prisma_migrations FROM cafe_pos_platform;
GRANT SELECT ON subscription_plans, modules, plan_modules, permissions, billing_plan_versions TO cafe_pos_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations, organization_subscriptions, organization_modules, branches, users,
 branch_memberships, roles, user_roles, role_permissions, business_settings, branch_settings, payment_methods, file_assets,
 idempotency_keys, sessions, organization_devices, password_reset_tokens, login_attempts TO cafe_pos_runtime;
GRANT SELECT ON billing_invoices, billing_settlements TO cafe_pos_runtime;
GRANT SELECT, INSERT ON audit_logs TO cafe_pos_runtime;
REVOKE UPDATE, DELETE ON audit_logs, billing_plan_versions, billing_invoices, billing_settlements FROM cafe_pos_platform;
-- Replace every legacy platform-setting bypass. A forged GUC cannot become a platform identity.
DO $$ DECLARE t TEXT; p RECORD; BEGIN
 FOREACH t IN ARRAY ARRAY['organization_subscriptions','organization_modules','branches','users','branch_memberships','roles','user_roles','business_settings','branch_settings','payment_methods','file_assets','idempotency_keys','sessions','organization_devices','password_reset_tokens','login_attempts','support_notes','support_access_grants','support_access_sessions','billing_invoices','billing_settlements'] LOOP
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP EXECUTE format('DROP POLICY %I ON %I', p.policyname,t); END LOOP;
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = NULLIF(current_setting(''app.organization_id'',true),'''')::uuid OR current_user = ''cafe_pos_platform'')',t);
 END LOOP;
END $$;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_isolation ON organizations USING(id = NULLIF(current_setting('app.organization_id',true),'')::uuid OR current_user = 'cafe_pos_platform');
DROP POLICY role_permissions_tenant_isolation ON role_permissions;
CREATE POLICY role_permissions_tenant_isolation ON role_permissions USING(EXISTS(SELECT 1 FROM roles WHERE id=role_id));
DROP POLICY audit_logs_tenant_read ON audit_logs;
DROP POLICY audit_logs_tenant_insert ON audit_logs;
CREATE POLICY audit_logs_tenant_read ON audit_logs FOR SELECT USING(organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid OR current_user='cafe_pos_platform');
CREATE POLICY audit_logs_tenant_insert ON audit_logs FOR INSERT WITH CHECK(
 (organization_id = NULLIF(current_setting('app.organization_id',true),'')::uuid AND actor_type='USER') OR current_user='cafe_pos_platform');
-- Narrow bootstrap lookups return identifiers only; never arbitrary table access.
CREATE FUNCTION auth_identity(identifier TEXT) RETURNS TABLE(id UUID, organization_id UUID)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT u.id,u.organization_id FROM public.users u WHERE lower(u.username)=lower(identifier) OR lower(u.email)=lower(identifier) LIMIT 1
$$;
CREATE FUNCTION auth_session(token TEXT) RETURNS TABLE(id UUID, user_id UUID, organization_id UUID, csrf_hash CHAR(64))
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT s.id,s.user_id,s.organization_id,s.csrf_hash FROM public.sessions s WHERE s.token_hash=token AND s.revoked_at IS NULL AND s.expires_at>now() LIMIT 1
$$;
CREATE FUNCTION auth_reset(token TEXT) RETURNS TABLE(id UUID, user_id UUID, organization_id UUID)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT r.id,r.user_id,r.organization_id FROM public.password_reset_tokens r WHERE r.token_hash=token AND r.used_at IS NULL AND r.expires_at>now() LIMIT 1
$$;
REVOKE ALL ON FUNCTION auth_identity(TEXT), auth_session(TEXT), auth_reset(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_identity(TEXT), auth_session(TEXT), auth_reset(TEXT) TO cafe_pos_runtime;
