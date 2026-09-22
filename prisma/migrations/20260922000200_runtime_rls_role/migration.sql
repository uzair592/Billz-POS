-- The migration owner is privileged. Application transactions explicitly assume
-- this NOLOGIN/NO-BYPASSRLS role so local development exercises real RLS.
DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cafe_pos_app') THEN
    CREATE ROLE cafe_pos_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$role$;

GRANT CONNECT ON DATABASE cafe_pos TO cafe_pos_app;
GRANT USAGE ON SCHEMA public TO cafe_pos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cafe_pos_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cafe_pos_app;
GRANT cafe_pos_app TO CURRENT_USER;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cafe_pos_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO cafe_pos_app;
