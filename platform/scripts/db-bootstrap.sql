-- One-time local setup. Run as a PostgreSQL superuser:
--   psql -U postgres -f scripts/db-bootstrap.sql
-- Creates three roles:
--   ayten_owner  owns the schema and runs migrations
--   ayten_app    used by the application at runtime; cannot bypass RLS
--   ayten_admin  used only by the platform admin panel; reads across stores
--                (BYPASSRLS) with narrow write grants (see 0006_platform.sql)
-- Passwords here are for local development only.

CREATE ROLE ayten_owner LOGIN PASSWORD 'ayten_owner_dev';
CREATE ROLE ayten_app LOGIN PASSWORD 'ayten_app_dev' NOBYPASSRLS;
CREATE ROLE ayten_admin LOGIN PASSWORD 'ayten_admin_dev' BYPASSRLS;

CREATE DATABASE ayten OWNER ayten_owner;
CREATE DATABASE ayten_test OWNER ayten_owner;

\connect ayten
ALTER SCHEMA public OWNER TO ayten_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;

\connect ayten_test
ALTER SCHEMA public OWNER TO ayten_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
