-- Repair the first Phase 4 migration without editing applied history.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['floor_tables','kitchen_stations','kitchen_tickets','kitchen_outbox'] LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid OR current_user = ''cafe_pos_platform'') WITH CHECK (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid OR current_user = ''cafe_pos_platform'')', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO cafe_pos_runtime', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO cafe_pos_platform', t);
  END LOOP;
END $$;
