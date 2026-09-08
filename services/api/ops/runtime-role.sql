-- Run as the migration owner after reviewing migrations. No login/password is created.
-- Grant this group to a SEPARATE runtime login managed in the deployment secret store.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='pd_runtime') THEN CREATE ROLE pd_runtime NOLOGIN; END IF;
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO pd_runtime', current_database());
END $$;
GRANT USAGE ON SCHEMA public TO pd_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pd_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pd_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON "AdminAuditEvent", "ConsentRecord", "Invoice" FROM pd_runtime;
REVOKE ALL ON "_prisma_migrations" FROM pd_runtime;
-- Do not grant ownership, CREATE, ALTER, TRUNCATE, BYPASSRLS or superuser rights.
-- Reapply/review grants after each migration; never run the API with migration credentials.
