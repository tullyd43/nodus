-- =====================================================================
-- NODUS DATABASE MODULE
-- 001_security_polyinstantiation.sql
-- Implements polyinstantiation + MAC (Bell–LaPadula) enforcement
-- Compatible with PostgreSQL 15+
-- =====================================================================

BEGIN;

-- Dependencies
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- === ENUM: Classification Levels =====================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'classification_level') THEN
    CREATE TYPE classification_level AS ENUM (
      'unclassified',
      'confidential',
      'secret',
      'nato_secret'
    );
  END IF;
END$$;

-- === Function: Session Security Context ===============================
CREATE OR REPLACE FUNCTION set_security_context(_clearance text, _compartments text[])
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.clearance', lower(coalesce(_clearance, 'unclassified')), false);
  PERFORM set_config('app.compartments', array_to_string(coalesce(_compartments, '{}'), ','), false);
END$$;

-- === TABLE: Polyinstantiated Objects =================================
CREATE TABLE IF NOT EXISTS objects_poly (
  logical_id     uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  classification classification_level NOT NULL,
  compartments   text[] NOT NULL DEFAULT '{}',
  version        int NOT NULL DEFAULT 1,
  instance_data  jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_objects_poly_classification ON objects_poly(classification);
CREATE INDEX IF NOT EXISTS ix_objects_poly_compartments  ON objects_poly USING gin(compartments);
CREATE INDEX IF NOT EXISTS ix_objects_poly_logical_id    ON objects_poly(logical_id);

-- === Helper: Rank Function ===========================================
CREATE OR REPLACE FUNCTION level_rank(lvl text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower($1)
    WHEN 'unclassified' THEN 0
    WHEN 'confidential' THEN 1
    WHEN 'secret' THEN 2
    WHEN 'nato_secret' THEN 3
    ELSE -1
  END
$$;

-- === Helper: Retrieve Subject Context ================================
CREATE OR REPLACE FUNCTION mac_subject()
RETURNS TABLE(level text, compartments text[]) LANGUAGE plpgsql STABLE AS $$
DECLARE
  lvl text := coalesce(current_setting('app.clearance', true), 'unclassified');
  comps text := coalesce(current_setting('app.compartments', true), '');
BEGIN
  RETURN QUERY SELECT lvl, CASE WHEN comps = '' THEN '{}'::text[] ELSE string_to_array(comps, ',') END;
END$$;

-- === MAC Functions ===================================================
CREATE OR REPLACE FUNCTION mac_can_read(obj_level text, obj_comps text[])
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE s mac_subject%ROWTYPE;
BEGIN
  SELECT * INTO s FROM mac_subject();
  IF level_rank(s.level) < level_rank(obj_level) THEN RETURN false; END IF;
  RETURN true;
END$$;

CREATE OR REPLACE FUNCTION mac_can_write(obj_level text, obj_comps text[])
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE s mac_subject%ROWTYPE;
BEGIN
  SELECT * INTO s FROM mac_subject();
  IF level_rank(s.level) > level_rank(obj_level) THEN RETURN false; END IF;
  RETURN true;
END$$;

-- === RLS Enforcement =================================================
ALTER TABLE objects_poly ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_mac_select ON objects_poly
  FOR SELECT USING (mac_can_read(classification::text, compartments));

CREATE POLICY p_mac_insert ON objects_poly
  FOR INSERT WITH CHECK (mac_can_write(classification::text, compartments));

CREATE POLICY p_mac_update ON objects_poly
  FOR UPDATE USING (mac_can_read(classification::text, compartments))
  WITH CHECK (mac_can_write(classification::text, compartments));

CREATE POLICY p_mac_delete ON objects_poly
  FOR DELETE USING (mac_can_read(classification::text, compartments));

-- === Triggers for No Write Down ======================================
CREATE OR REPLACE FUNCTION trg_mac_no_write_down()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT mac_can_write(NEW.classification::text, NEW.compartments) THEN
    RAISE EXCEPTION 'MAC_DENY_WRITE';
  END IF;
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS t_mac_insert ON objects_poly;
CREATE TRIGGER t_mac_insert BEFORE INSERT ON objects_poly
FOR EACH ROW EXECUTE FUNCTION trg_mac_no_write_down();

DROP TRIGGER IF EXISTS t_mac_update ON objects_poly;
CREATE TRIGGER t_mac_update BEFORE UPDATE ON objects_poly
FOR EACH ROW EXECUTE FUNCTION trg_mac_no_write_down();

COMMIT;
