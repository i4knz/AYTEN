-- One-time local setup. Run as a PostgreSQL superuser:
--   psql -U postgres -f scripts/db-bootstrap.sql
-- Creates two roles:
--   ayten_owner  owns the schema and runs migrations
--   ayten_app    used by the application at runtime; cannot bypass RLS
-- Passwords here are for local development only.

CREATE ROLE ayten_owner LOGIN PASSWORD 'ayten_owner_dev';
CREATE ROLE ayten_app LOGIN PASSWORD 'ayten_app_dev' NOBYPASSRLS;

CREATE DATABASE ayten OWNER ayten_owner;
CREATE DATABASE ayten_test OWNER ayten_owner;

\connect ayten
ALTER SCHEMA public OWNER TO ayten_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;

\connect ayten_test
ALTER SCHEMA public OWNER TO ayten_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
