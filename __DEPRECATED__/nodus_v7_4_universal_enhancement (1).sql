
-- ============================================================================
-- NODUS V7.4 - UNIVERSAL ENHANCEMENT APPROACH (Greenfield Add-On)
-- Layers onto: nodus_v7_3_defense_temporal_ultimate.sql
-- Philosophy: ENHANCE, DON'T PROLIFERATE
-- ============================================================================

BEGIN;

-- 1) SCHEMA VERSIONING
CREATE TABLE IF NOT EXISTS schema_migrations (
  id bigserial PRIMARY KEY,
  version text NOT NULL UNIQUE,
  applied_at timestamptz NOT NULL DEFAULT now(),
  details jsonb DEFAULT '{}'::jsonb
);
INSERT INTO schema_migrations(version, details)
VALUES ('v7_4_universal_enhancement', jsonb_build_object('description','Universal Enhancement: crypto+CRDT+semantic+P2P+quantum','date', now()))
ON CONFLICT (version) DO NOTHING;

-- 2) ENUMS / TYPES
DO $$ BEGIN
  PERFORM 1 FROM pg_type WHERE typname = 'security_classification';
  IF NOT FOUND THEN
    CREATE TYPE security_classification AS ENUM (
      'public','internal','restricted','confidential','secret','top_secret',
      'nato_restricted','nato_confidential','nato_secret','cosmic_top_secret'
    );
  END IF;
END $$;

DO $$ BEGIN
  PERFORM 1 FROM pg_type WHERE typname = 'conflict_strategy';
  IF NOT FOUND THEN
    CREATE TYPE conflict_strategy AS ENUM ('lww','mv_register','or_set','gcounter');
  END IF;
END $$;

-- 3) CRYPTO + ZERO TRUST
ALTER TABLE IF EXISTS app_users
  ADD COLUMN IF NOT EXISTS public_key bytea,
  ADD COLUMN IF NOT EXISTS key_algorithm text DEFAULT 'ed25519',
  ADD COLUMN IF NOT EXISTS key_fingerprint text UNIQUE,
  ADD COLUMN IF NOT EXISTS pq_public_key bytea,
  ADD COLUMN IF NOT EXISTS pq_algorithm text,
  ADD COLUMN IF NOT EXISTS key_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS key_created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS hybrid_key_mode boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS quantum_safe_date timestamptz DEFAULT '2030-01-01',
  ADD COLUMN IF NOT EXISTS migration_status text DEFAULT 'classical';

ALTER TABLE IF EXISTS audit_trail
  ADD COLUMN IF NOT EXISTS signature bytea,
  ADD COLUMN IF NOT EXISTS signature_algorithm text,
  ADD COLUMN IF NOT EXISTS signature_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS signature_verification_time timestamptz;

CREATE TABLE IF NOT EXISTS signature_cache (
  entity_table text NOT NULL,
  entity_id uuid NOT NULL,
  signature_hash bytea NOT NULL,
  verification_status text NOT NULL CHECK (verification_status IN ('verified','failed','pending')),
  verified_at timestamptz,
  expires_at timestamptz DEFAULT now() + interval '1 hour',
  PRIMARY KEY (entity_table, entity_id, signature_hash)
);
CREATE INDEX IF NOT EXISTS idx_signature_cache_expires ON signature_cache(expires_at);

CREATE OR REPLACE FUNCTION upsert_signature_cache(p_entity_table text, p_entity_id uuid, p_sig_hash bytea, p_status text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO signature_cache(entity_table, entity_id, signature_hash, verification_status, verified_at)
  VALUES (p_entity_table, p_entity_id, p_sig_hash, p_status, CASE WHEN p_status='verified' THEN now() END)
  ON CONFLICT (entity_table, entity_id, signature_hash)
  DO UPDATE SET verification_status = EXCLUDED.verification_status,
                verified_at = EXCLUDED.verified_at,
                expires_at = now() + interval '1 hour';
END $$;

-- 4) CRDT
ALTER TABLE IF EXISTS objects
  ADD COLUMN IF NOT EXISTS crdt_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS vector_clock jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS crdt_type text;

ALTER TABLE IF EXISTS events
  ADD COLUMN IF NOT EXISTS vector_clock jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS crdt_operation_id uuid;

ALTER TABLE IF EXISTS links
  ADD COLUMN IF NOT EXISTS vector_clock jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS conflict_resolution text DEFAULT 'lww';

CREATE INDEX IF NOT EXISTS idx_objects_vector_clock_gin ON objects USING gin (vector_clock jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_events_vector_clock_gin  ON events  USING gin (vector_clock jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_links_vector_clock_gin   ON links   USING gin (vector_clock jsonb_path_ops);

CREATE OR REPLACE FUNCTION crdt_merge_vector_clock(a jsonb, b jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(
    jsonb_object_agg(k, to_jsonb(GREATEST( (a->>k)::bigint, (b->>k)::bigint ))),
    '{}'::jsonb
  )
  FROM (
    SELECT DISTINCT key AS k FROM jsonb_each_text(a)
    UNION
    SELECT DISTINCT key AS k FROM jsonb_each_text(b)
  ) s;
$$;

-- 5) SEMANTIC WEB
ALTER TABLE IF EXISTS links
  ADD COLUMN IF NOT EXISTS semantic_namespace text,
  ADD COLUMN IF NOT EXISTS semantic_predicate text,
  ADD COLUMN IF NOT EXISTS inference_rule text,
  ADD COLUMN IF NOT EXISTS confidence_score double precision DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS is_inferred boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ontology_uri text;

CREATE INDEX IF NOT EXISTS idx_links_semantic_predicate ON links(semantic_namespace, semantic_predicate);
CREATE INDEX IF NOT EXISTS idx_links_is_inferred ON links(is_inferred);
CREATE INDEX IF NOT EXISTS idx_links_confidence ON links(confidence_score);
CREATE INDEX IF NOT EXISTS idx_links_semantic_full ON links(semantic_namespace, semantic_predicate, is_inferred, confidence_score);

-- 6) P2P REPLICATION STATUS
CREATE TABLE IF NOT EXISTS replication_status (
  entity_table text NOT NULL,
  entity_id uuid NOT NULL,
  node_id uuid NOT NULL,     -- references objects(id) type 'network_node'
  last_synchronized timestamptz,
  checksum bytea,
  replica_type text DEFAULT 'full', -- full|partial|edge
  PRIMARY KEY (entity_table, entity_id, node_id)
);
CREATE INDEX IF NOT EXISTS idx_replication_status_sync ON replication_status(last_synchronized);

-- 7) CLASSIFICATION & COMPARTMENTS (ensure presence)
ALTER TABLE IF EXISTS objects ADD COLUMN IF NOT EXISTS classification security_classification DEFAULT 'internal';
ALTER TABLE IF EXISTS events  ADD COLUMN IF NOT EXISTS classification security_classification DEFAULT 'internal';
ALTER TABLE IF EXISTS objects ADD COLUMN IF NOT EXISTS compartment_markings text[] DEFAULT '{}';
ALTER TABLE IF EXISTS events  ADD COLUMN IF NOT EXISTS compartment_markings text[] DEFAULT '{}';

-- 8) RLS HELPERS (safe stubs if missing)
DO $$ BEGIN
  PERFORM 1 FROM pg_proc WHERE proname = 'get_user_clearance';
  IF NOT FOUND THEN
    CREATE OR REPLACE FUNCTION get_user_clearance()
    RETURNS security_classification LANGUAGE sql STABLE AS $$
      SELECT 'internal'::security_classification;
    $$;
  END IF;
END $$;

DO $$ BEGIN
  PERFORM 1 FROM pg_proc WHERE proname = 'has_permission_cached';
  IF NOT FOUND THEN
    CREATE OR REPLACE FUNCTION has_permission_cached(p_perm text)
    RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false; $$;
  END IF;
END $$;

DO $$ BEGIN
  PERFORM 1 FROM pg_proc WHERE proname = 'has_compartment_access';
  IF NOT FOUND THEN
    CREATE OR REPLACE FUNCTION has_compartment_access(p_compartments text[])
    RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true; $$;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION compartments_satisfied(p_marks text[])
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(array_length(p_marks,1) IS NULL OR has_compartment_access(p_marks), TRUE);
$$;

CREATE OR REPLACE FUNCTION can_see_entity(p_class security_classification, p_marks text[])
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT (p_class <= get_user_clearance() OR has_permission_cached('security:override'))
         AND compartments_satisfied(p_marks);
$$;

-- 9) CONFIG SEED HELPERS
CREATE OR REPLACE FUNCTION ensure_universal_config(p_org uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO configurations (organization_id, domain, scope, key, kind, value, is_secret, classification)
  VALUES
    (p_org,'security','global','pq_migration_deadline','datetime',to_jsonb('2030-01-01T00:00:00Z'::timestamptz),false,'internal'),
    (p_org,'security','global','min_signature_strength','number','128'::jsonb,false,'internal'),
    (p_org,'security','global','zero_trust_mode','flag','true'::jsonb,false,'internal')
  ON CONFLICT (organization_id, domain, key) DO NOTHING;

  INSERT INTO configurations (organization_id, domain, scope, key, kind, value, is_secret, classification)
  VALUES
    (p_org,'sync','global','crdt_default_type','enum','"lww_register"'::jsonb,false,'internal'),
    (p_org,'sync','global','crdt_clock_skew_tolerance_ms','number','250'::jsonb,false,'internal')
  ON CONFLICT (organization_id, domain, key) DO NOTHING;

  INSERT INTO configurations (organization_id, domain, scope, key, kind, value, is_secret, classification)
  VALUES
    (p_org,'semantic','global','inference_enabled','flag','true'::jsonb,false,'internal'),
    (p_org,'semantic','global','inference_confidence_threshold','number','0.8'::jsonb,false,'internal')
  ON CONFLICT (organization_id, domain, key) DO NOTHING;

  INSERT INTO configurations (organization_id, domain, scope, key, kind, value, is_secret, classification)
  VALUES
    (p_org,'network','global','replication_mode','enum','"active_active"'::jsonb,false,'internal'),
    (p_org,'network','global','replication_window_sec','number','5'::jsonb,false,'internal')
  ON CONFLICT (organization_id, domain, key) DO NOTHING;
END;
$$;

-- 10) OBSERVABILITY GLUE
CREATE OR REPLACE FUNCTION emit_semantic_inference(p_org uuid, p_user uuid, p_rule text, p_inferred_links uuid[], p_confidence numeric)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  eid uuid;
BEGIN
  INSERT INTO events (id, organization_id, created_by, type_name, domain, classification, data, created_at)
  VALUES (
    gen_random_uuid(), p_org, p_user, 'semantic_inference', 'event', 'internal',
    jsonb_build_object(
      'rule_applied', p_rule,
      'inferred_links', p_inferred_links,
      'confidence_score', p_confidence
    ),
    now()
  )
  RETURNING id INTO eid;
  RETURN eid;
END;
$$;

COMMIT;

-- USAGE:
--   SELECT ensure_universal_config('<ORG_UUID>'::uuid);
