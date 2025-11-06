-- ======================================================================
--  NODUS v7.7  •  UNIVERSAL + DEFENCE/NATO GREENFIELD PRODUCTION SCHEMA
--  Principle: ENHANCE, DON'T PROLIFERATE
--  Ontology: Single table (type_definitions) drives objects & events
-- ======================================================================
BEGIN;

-- ----------------------------------------------------------------------
-- EXTENSIONS (safe if missing: comment out as needed)
-- ----------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid(), digest()
CREATE EXTENSION IF NOT EXISTS citext;     -- citext email

-- ----------------------------------------------------------------------
-- ENUMS / TYPES (idempotent guards)
-- ----------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='data_domain') THEN
    CREATE TYPE data_domain AS ENUM ('data','event','system','ui','user','meta');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='security_classification') THEN
    CREATE TYPE security_classification AS ENUM (
      'public','internal','restricted','confidential','secret','top_secret',
      'nato_restricted','nato_confidential','nato_secret','cosmic_top_secret'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='event_severity') THEN
    CREATE TYPE event_severity AS ENUM ('debug','info','warning','error','critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='conflict_strategy') THEN
    CREATE TYPE conflict_strategy AS ENUM ('lww','mv_register','or_set','gcounter');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='cache_layer') THEN
    CREATE TYPE cache_layer AS ENUM ('client','edge','app','db');
  END IF;
END $$;

-- ----------------------------------------------------------------------
-- MULTI-TENANCY
-- ----------------------------------------------------------------------
CREATE TABLE organizations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  slug              text UNIQUE,
  classification    security_classification DEFAULT 'internal',
  settings          jsonb NOT NULL DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------
-- USERS / AUTH / RBAC / API KEYS / SESSIONS / MFA
-- ----------------------------------------------------------------------
CREATE TABLE app_users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email             citext NOT NULL,
  display_name      text,
  status            text DEFAULT 'active',

  -- Zero-trust crypto + post-quantum ready
  public_key        bytea,
  key_algorithm     text DEFAULT 'ed25519',
  key_fingerprint   text UNIQUE,
  pq_public_key     bytea,
  pq_algorithm      text,
  key_expires_at    timestamptz,
  key_created_at    timestamptz DEFAULT now(),
  hybrid_key_mode   boolean DEFAULT false,
  quantum_safe_date timestamptz DEFAULT '2030-01-01',
  migration_status  text DEFAULT 'classical', -- classical|hybrid|post_quantum

  -- NATO classification & personnel clearance
  classification    security_classification DEFAULT 'internal',
  clearance_level   security_classification DEFAULT 'internal',
  clearance_expires date,
  investigation_current boolean DEFAULT true,
  nato_citizen      boolean DEFAULT false,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);

CREATE TABLE roles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  description     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE permissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key             text NOT NULL UNIQUE,
  description     text
);

CREATE TABLE role_permissions (
  role_id         uuid REFERENCES roles(id) ON DELETE CASCADE,
  permission_id   uuid REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
  user_id         uuid REFERENCES app_users(id) ON DELETE CASCADE,
  role_id         uuid REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE password_policies (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  min_length      int DEFAULT 14,
  require_upper   boolean DEFAULT true,
  require_lower   boolean DEFAULT true,
  require_digit   boolean DEFAULT true,
  require_symbol  boolean DEFAULT true,
  rotation_days   int DEFAULT 365,
  history_count   int DEFAULT 5,
  lockout_threshold int DEFAULT 10,
  lockout_minutes int DEFAULT 15
);

CREATE TABLE api_keys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  key_hash        bytea NOT NULL, -- store hash only
  scopes          text[] NOT NULL DEFAULT '{}',
  created_by      uuid REFERENCES app_users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,
  last_used_at    timestamptz
);

CREATE TABLE secure_sessions (
  session_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  ip_address            inet,
  user_agent_hash       text,
  mfa_verified          boolean DEFAULT false,
  security_clearance_level text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  last_activity         timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz NOT NULL
);

CREATE TABLE mfa_totp (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  secret_encrypted bytea NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_used_at    timestamptz
);

CREATE TABLE mfa_webauthn (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  credential_id   bytea NOT NULL,
  public_key      bytea NOT NULL,
  sign_count      bigint DEFAULT 0,
  transports      text[] DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------
-- SINGLE ONTOLOGY (drives both objects & events)
-- ----------------------------------------------------------------------
CREATE TABLE type_definitions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid REFERENCES organizations(id) ON DELETE CASCADE,
  type_name         text NOT NULL,
  domain            data_domain NOT NULL,                -- 'data','event',...
  field_schema      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- JSON schema for fields
  ui_schema         jsonb NOT NULL DEFAULT '{}'::jsonb,
  version           text DEFAULT '1.0',
  is_system         boolean DEFAULT false,
  classification    security_classification DEFAULT 'internal',
  compartment_markings text[] DEFAULT '{}',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, type_name)
);

-- ----------------------------------------------------------------------
-- CORE FABRIC (objects / events / links) + CRDT + semantic + compartments
-- ----------------------------------------------------------------------
CREATE TABLE objects (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type_name            text NOT NULL,
  domain               data_domain NOT NULL DEFAULT 'data',
  classification       security_classification NOT NULL DEFAULT 'internal',
  compartment_markings text[] NOT NULL DEFAULT '{}',
  data                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by           uuid REFERENCES app_users(id),
  updated_by           uuid REFERENCES app_users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  -- CRDT
  crdt_enabled         boolean DEFAULT false,
  crdt_type            text,
  vector_clock         jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- search helper (app may populate)
  search_tsv           tsvector
);

CREATE TABLE events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type_name            text NOT NULL,
  domain               data_domain NOT NULL DEFAULT 'event',
  classification       security_classification NOT NULL DEFAULT 'internal',
  compartment_markings text[] NOT NULL DEFAULT '{}',
  data                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  entity_table         text,   -- 'objects' or 'events'
  entity_id            uuid,
  created_by           uuid REFERENCES app_users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  -- CRDT
  vector_clock         jsonb NOT NULL DEFAULT '{}'::jsonb,
  crdt_operation_id    uuid
);

CREATE TABLE links (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_table           text NOT NULL,                 -- 'objects' | 'events'
  from_id              uuid NOT NULL,
  to_table             text NOT NULL,                 -- 'objects' | 'events'
  to_id                uuid NOT NULL,
  relation             text NOT NULL,
  domain               data_domain NOT NULL DEFAULT 'data',
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- semantic
  semantic_namespace   text,
  semantic_predicate   text,
  inference_rule       text,
  confidence_score     double precision DEFAULT 1.0,
  is_inferred          boolean DEFAULT false,
  ontology_uri         text,
  -- CRDT
  vector_clock         jsonb NOT NULL DEFAULT '{}'::jsonb,
  conflict_resolution  text DEFAULT 'lww',
  -- NATO parity
  classification       security_classification DEFAULT 'internal',
  compartment_markings text[] DEFAULT '{}',
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, from_table, from_id, to_table, to_id, relation)
);

-- ----------------------------------------------------------------------
-- CONFIGURATION (universal, org-scoped)
-- ----------------------------------------------------------------------
CREATE TABLE configurations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain               text NOT NULL,     -- 'security','sync','semantic','network','ui',...
  scope                text NOT NULL DEFAULT 'global',
  key                  text NOT NULL,
  kind                 text NOT NULL,     -- 'flag','enum','number','json','datetime'
  value                jsonb NOT NULL,
  is_secret            boolean DEFAULT false,
  classification       security_classification DEFAULT 'internal',
  compartment_markings text[] DEFAULT '{}',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, domain, key)
);

-- ----------------------------------------------------------------------
-- AI / EMBEDDINGS (pgvector optional; bytea fallback)
-- ----------------------------------------------------------------------
CREATE TABLE embeddings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_table         text NOT NULL,       -- 'objects' | 'events' | 'configurations'
  entity_id            uuid NOT NULL,
  vector               bytea,
  dims                 int,
  classification       security_classification DEFAULT 'internal',
  compartment_markings text[] DEFAULT '{}',
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, entity_table, entity_id)
);

-- ----------------------------------------------------------------------
-- FIELD-LEVEL ENCRYPTION REGISTRY
-- ----------------------------------------------------------------------
CREATE TABLE encrypted_fields (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_table         text NOT NULL,        -- 'objects'/'events'/etc
  entity_id            uuid NOT NULL,
  field_name           text NOT NULL,
  encrypted_value      bytea NOT NULL,       -- AES-256 etc
  classification_level security_classification NOT NULL,
  compartment_markings text[] DEFAULT '{}',
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, entity_table, entity_id, field_name)
);

-- ----------------------------------------------------------------------
-- EXPORT CONTROL (ITAR/EAR)
-- ----------------------------------------------------------------------
CREATE TABLE export_screening_log (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type             text NOT NULL,
  entity_id               uuid NOT NULL,
  screening_result        jsonb NOT NULL,
  export_license_required boolean DEFAULT false,
  screened_at             timestamptz DEFAULT now(),
  screened_by             uuid REFERENCES app_users(id)
);

-- ----------------------------------------------------------------------
-- AUDIT (hash-chain) + LOGGING + SIEM + DLP
-- ----------------------------------------------------------------------
CREATE TABLE audit_trail (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id                 uuid,
  table_name              text NOT NULL,
  record_id               uuid,
  operation               text NOT NULL,           -- INSERT/UPDATE/DELETE
  old_data                jsonb,
  new_data                jsonb,
  classification          security_classification DEFAULT 'internal',
  compartment_context     text[] DEFAULT '{}',
  prev_hash               text,
  record_hash             text,
  signature               bytea,
  signature_algorithm     text,
  signature_verified      boolean DEFAULT false,
  signature_verification_time timestamptz,
  forensic_preservation   boolean DEFAULT false,
  legal_hold              boolean DEFAULT false,
  timestamp               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  level           event_severity NOT NULL DEFAULT 'info',
  message         text NOT NULL,
  context         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE security_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES app_users(id),
  event_type      text NOT NULL,
  severity        event_severity NOT NULL DEFAULT 'info',
  description     text,
  context         jsonb DEFAULT '{}'::jsonb,
  source_ip       inet,
  user_agent      text,
  nato_event_category text,
  clearance_context jsonb DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE dlp_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id               uuid REFERENCES app_users(id),
  policy_violated       text NOT NULL,
  data_classification   security_classification,
  action_taken          text,                   -- blocked|logged|quarantined
  data_summary          jsonb,
  detected_at           timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------
-- OBSERVABILITY: UI errors, traces, DB & network traces, cache metrics
-- ----------------------------------------------------------------------
CREATE TABLE ui_error_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES app_users(id),
  component       text,
  message         text,
  stack           text,
  browser         text,
  layout_context  jsonb NOT NULL DEFAULT '{}'::jsonb,
  perf_snapshot   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE performance_traces (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  trace_id        uuid,
  span_id         uuid,
  parent_span_id  uuid,
  name            text,
  attributes      jsonb NOT NULL DEFAULT '{}'::jsonb,
  start_time      timestamptz NOT NULL DEFAULT now(),
  end_time        timestamptz,
  duration_ms     numeric(12,3)
);

CREATE TABLE db_query_traces (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  fingerprint     text,
  sql_snippet     text,
  duration_ms     numeric(12,3),
  error           text,
  occurred_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE network_traces (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  method          text,
  url             text,
  status_code     int,
  duration_ms     numeric(12,3),
  bytes_tx        bigint,
  bytes_rx        bigint,
  occurred_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cache_metrics (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid REFERENCES organizations(id) ON DELETE CASCADE,
  layer                  cache_layer NOT NULL,
  key_pattern            text,
  hit_count              bigint DEFAULT 0,
  miss_count             bigint DEFAULT 0,
  eviction_count         bigint DEFAULT 0,
  avg_response_time_ms   numeric(10,2) DEFAULT 0
);

-- ----------------------------------------------------------------------
-- PERFORMANCE CACHES & P2P REPLICATION
-- ----------------------------------------------------------------------
CREATE TABLE signature_cache (
  entity_table          text NOT NULL,
  entity_id             uuid NOT NULL,
  signature_hash        bytea NOT NULL,
  verification_status   text NOT NULL CHECK (verification_status IN ('verified','failed','pending')),
  verified_at           timestamptz,
  expires_at            timestamptz DEFAULT now() + interval '1 hour',
  PRIMARY KEY (entity_table, entity_id, signature_hash)
);

CREATE TABLE replication_status (
  entity_table          text NOT NULL,
  entity_id             uuid NOT NULL,
  node_id               uuid NOT NULL, -- references objects(id) type 'network_node'
  last_synchronized     timestamptz,
  checksum              bytea,
  replica_type          text DEFAULT 'full', -- full|partial|edge
  PRIMARY KEY (entity_table, entity_id, node_id)
);

CREATE TABLE shard_registry (
  shard_id              int PRIMARY KEY,
  classification_level  security_classification,
  geographic_region     text,
  connection_string_encrypted text,
  status                text DEFAULT 'active',
  capacity_percent      int DEFAULT 0
);

CREATE TABLE geo_replica_registry (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_name           text NOT NULL,
  classification_levels security_classification[],
  replica_lag_ms        int,
  is_active             boolean DEFAULT true,
  connection_config     jsonb,
  last_health_check     timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------
-- NATO POLICY OVERRIDES
-- ----------------------------------------------------------------------
CREATE TABLE nato_policy_overrides (
  organization_id     uuid REFERENCES organizations(id) ON DELETE CASCADE,
  policy_domain       text NOT NULL,
  policy_key          text NOT NULL,
  nato_override_value jsonb,
  required_clearance  security_classification DEFAULT 'nato_restricted',
  justification       text,
  approved_by         uuid REFERENCES app_users(id),
  expires_at          timestamptz,
  PRIMARY KEY (organization_id, policy_domain, policy_key)
);

-- ----------------------------------------------------------------------
-- I18N / L10N
-- ----------------------------------------------------------------------
CREATE TABLE i18n_locales (
  code              text PRIMARY KEY,  -- 'en-US', 'fr-FR'
  english_name      text NOT NULL,
  native_name       text NOT NULL,
  is_rtl            boolean DEFAULT false
);

CREATE TABLE i18n_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid REFERENCES organizations(id) ON DELETE CASCADE,
  locale_code       text NOT NULL REFERENCES i18n_locales(code) ON DELETE RESTRICT,
  namespace         text NOT NULL, -- 'ui','errors','forms',...
  msg_key           text NOT NULL,
  message           text NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, locale_code, namespace, msg_key)
);

-- ----------------------------------------------------------------------
-- PLUGINS
-- ----------------------------------------------------------------------
CREATE TABLE plugin_manifests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid REFERENCES organizations(id) ON DELETE CASCADE,
  plugin_id             text NOT NULL,
  manifest              jsonb NOT NULL,
  required_clearance    security_classification DEFAULT 'internal',
  nato_certified        boolean DEFAULT false,
  compartment_markings  text[] DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, plugin_id)
);

CREATE TABLE plugin_hooks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid REFERENCES organizations(id) ON DELETE CASCADE,
  plugin_id             text NOT NULL,
  hook_type             text NOT NULL,
  config                jsonb NOT NULL DEFAULT '{}'::jsonb,
  clearance_required    security_classification DEFAULT 'internal',
  nato_compliant        boolean DEFAULT TRUE,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------
-- FIELD DEFINITIONS CACHE + VERSIONED HISTORY (A + B)
-- ----------------------------------------------------------------------
CREATE TABLE field_definitions_cache (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type_name            text NOT NULL,
  domain               data_domain NOT NULL DEFAULT 'data',
  field_name           text NOT NULL,
  field_spec           jsonb NOT NULL,
  version              text DEFAULT '1.0',
  classification       security_classification DEFAULT 'internal',
  compartment_markings text[] DEFAULT '{}',
  last_refreshed_at    timestamptz DEFAULT now(),
  UNIQUE (organization_id, type_name, field_name)
);

CREATE TABLE field_definition_versions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type_name            text NOT NULL,
  field_name           text NOT NULL,
  field_spec           jsonb NOT NULL,
  version              text NOT NULL,
  changed_by           uuid REFERENCES app_users(id),
  change_comment       text,
  change_hash          text,
  prev_version_hash    text,
  classification       security_classification DEFAULT 'internal',
  compartment_markings text[] DEFAULT '{}',
  created_at           timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------
-- CONFIG OBSERVABILITY (AI embeddings + metrics + audit)
-- ----------------------------------------------------------------------
CREATE TABLE config_metrics (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid REFERENCES organizations(id) ON DELETE CASCADE,
  config_id            uuid REFERENCES configurations(id) ON DELETE CASCADE,
  metric_name          text,
  metric_value         numeric,
  classification       security_classification DEFAULT 'internal',
  compartment_markings text[] DEFAULT '{}',
  captured_at          timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------
-- INDEXES (hot-paths)
-- ----------------------------------------------------------------------
CREATE INDEX idx_org_slug                 ON organizations(slug);
CREATE INDEX idx_users_org_email          ON app_users(organization_id, email);
CREATE INDEX idx_types_org_name           ON type_definitions(organization_id, type_name);
CREATE INDEX idx_objects_org_type         ON objects(organization_id, type_name);
CREATE INDEX idx_objects_class            ON objects(classification);
CREATE INDEX idx_events_org_type          ON events(organization_id, type_name);
CREATE INDEX idx_events_class             ON events(classification);
CREATE INDEX idx_links_semantic           ON links(semantic_namespace, semantic_predicate);
CREATE INDEX idx_links_confidence         ON links(is_inferred, confidence_score);
CREATE INDEX idx_conf_org_key             ON configurations(organization_id, domain, key);
CREATE INDEX idx_embed_entity             ON embeddings(organization_id, entity_table, entity_id);
CREATE INDEX idx_audit_table_rec          ON audit_trail(organization_id, table_name, record_id);
CREATE INDEX idx_sec_events               ON security_events(organization_id, event_type, severity);
CREATE INDEX idx_ui_errors_user           ON ui_error_logs(organization_id, user_id, created_at);
CREATE INDEX idx_signature_expires        ON signature_cache(expires_at);
CREATE INDEX idx_objects_vector_clock_gin ON objects USING gin (vector_clock jsonb_path_ops);
CREATE INDEX idx_events_vector_clock_gin  ON events  USING gin (vector_clock jsonb_path_ops);
CREATE INDEX idx_links_vector_clock_gin   ON links   USING gin (vector_clock jsonb_path_ops);
CREATE INDEX idx_field_cache_org_type     ON field_definitions_cache(organization_id, type_name);
CREATE INDEX idx_field_versions_type      ON field_definition_versions(organization_id, type_name, field_name);
CREATE INDEX idx_field_versions_time      ON field_definition_versions(created_at DESC);
CREATE INDEX idx_config_metrics_time      ON config_metrics(organization_id, captured_at DESC);

-- ----------------------------------------------------------------------
-- FUNCTIONS (clearance/permissions/compartments/config/CRDT/obs/helpers)
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_user_clearance()
RETURNS security_classification
LANGUAGE sql STABLE AS $$
  SELECT COALESCE((
    SELECT clearance_level
    FROM app_users
    WHERE id = NULLIF(current_setting('app.user_id', true), '')::uuid
      AND organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid
  ), 'public'::security_classification);
$$;

CREATE OR REPLACE FUNCTION has_permission_cached(p_perm text)
RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    JOIN permissions p ON p.id   = rp.permission_id
    WHERE ur.user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
      AND p.key = p_perm
  );
$$;

CREATE OR REPLACE FUNCTION has_compartment_access(p_compartments text[])
RETURNS boolean
LANGUAGE plpgsql STABLE AS $$
DECLARE
  uid uuid := NULLIF(current_setting('app.user_id', true), '')::uuid;
  org uuid := NULLIF(current_setting('app.org_id', true), '')::uuid;
  user_compartments text[] := ARRAY[]::text[];
  req text;
BEGIN
  IF uid IS NULL OR org IS NULL THEN
    RETURN FALSE;
  END IF;

  -- via links (relation='compartment_access') -> objects(type_name='compartment_access')
  SELECT COALESCE(ARRAY_AGG(DISTINCT (o.data->>'compartment_name')::text), ARRAY[]::text[])
  INTO user_compartments
  FROM links l
  JOIN objects o ON o.id = l.to_id AND o.organization_id = org AND o.type_name = 'compartment_access'
  WHERE l.org_id = org
    AND l.relation = 'compartment_access'
    AND l.from_id = uid
    AND (
      (o.data ? 'expires_at' = FALSE) OR
      ((o.data->>'expires_at')::date IS NULL) OR
      ((o.data->>'expires_at')::date > CURRENT_DATE)
    );

  IF p_compartments IS NULL OR array_length(p_compartments,1) IS NULL THEN
    RETURN TRUE;
  END IF;

  FOREACH req IN ARRAY p_compartments LOOP
    IF req IS NULL OR req = '' THEN CONTINUE; END IF;
    IF NOT (req = ANY (user_compartments)) THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION compartments_satisfied(p_marks text[])
RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(array_length(p_marks,1) IS NULL OR has_compartment_access(p_marks), TRUE);
$$;

CREATE OR REPLACE FUNCTION can_see_entity(p_class security_classification, p_marks text[])
RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT (p_class <= get_user_clearance() OR has_permission_cached('security:override'))
         AND compartments_satisfied(p_marks);
$$;

-- CRDT vector clock merge (pairwise max)
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

-- Signature cache helper
CREATE OR REPLACE FUNCTION upsert_signature_cache(
  p_entity_table text, p_entity_id uuid, p_sig_hash bytea, p_status text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO signature_cache(entity_table, entity_id, signature_hash, verification_status, verified_at)
  VALUES (p_entity_table, p_entity_id, p_sig_hash, p_status, CASE WHEN p_status='verified' THEN now() END)
  ON CONFLICT (entity_table, entity_id, signature_hash)
  DO UPDATE SET verification_status = EXCLUDED.verification_status,
                verified_at = EXCLUDED.verified_at,
                expires_at = now() + interval '1 hour';
END;
$$;

-- Emit semantic inference event
CREATE OR REPLACE FUNCTION emit_semantic_inference(
  p_org uuid, p_user uuid, p_rule text, p_inferred_links uuid[], p_confidence numeric
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE eid uuid;
BEGIN
  INSERT INTO events (id, organization_id, created_by, type_name, domain, classification, data, created_at)
  VALUES (
    gen_random_uuid(), p_org, p_user, 'semantic_inference', 'event', 'internal',
    jsonb_build_object('rule_applied', p_rule, 'inferred_links', p_inferred_links, 'confidence_score', p_confidence),
    now()
  ) RETURNING id INTO eid;
  RETURN eid;
END;
$$;

-- Health thresholds + system health
CREATE TABLE monitoring_thresholds (
  metric_name        text PRIMARY KEY,
  warning_threshold  numeric,
  critical_threshold numeric,
  evaluation_window  interval DEFAULT '5 minutes'
);

CREATE OR REPLACE FUNCTION system_health_check()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result jsonb := '{}'::jsonb;
BEGIN
  result := jsonb_build_object(
    'time', now(),
    'db_size_mb', (SELECT pg_database_size(current_database())/1024/1024),
    'connections', (SELECT count(*) FROM pg_stat_activity)
  );
  RETURN result;
END;
$$;

-- FIELD CACHE REFRESH + VERSIONING
CREATE OR REPLACE FUNCTION refresh_field_cache() RETURNS trigger AS $$
DECLARE
  field_entry record;
  new_hash text;
  prev_hash text;
BEGIN
  DELETE FROM field_definitions_cache
   WHERE organization_id = NEW.organization_id AND type_name = NEW.type_name;

  FOR field_entry IN
    SELECT key AS field_name, value AS field_spec
      FROM jsonb_each(COALESCE(NEW.field_schema->'fields','{}'::jsonb))
  LOOP
    INSERT INTO field_definitions_cache(
      organization_id, type_name, domain, field_name, field_spec,
      version, classification, compartment_markings, last_refreshed_at)
    VALUES (
      NEW.organization_id, NEW.type_name, NEW.domain, field_entry.field_name, field_entry.field_spec,
      NEW.version, COALESCE(NEW.classification,'internal'), COALESCE(NEW.compartment_markings,'{}'::text[]), now()
    );

    new_hash := encode(digest(
      coalesce(NEW.organization_id::text,'') ||
      coalesce(NEW.type_name,'') || coalesce(field_entry.field_name,'') ||
      coalesce(field_entry.field_spec::text,''), 'sha256'),'hex');

    SELECT change_hash INTO prev_hash
      FROM field_definition_versions
     WHERE organization_id=NEW.organization_id
       AND type_name=NEW.type_name
       AND field_name=field_entry.field_name
     ORDER BY created_at DESC
     LIMIT 1;

    INSERT INTO field_definition_versions(
      organization_id, type_name, field_name, field_spec,
      version, changed_by, change_comment, change_hash, prev_version_hash,
      classification, compartment_markings, created_at)
    VALUES (
      NEW.organization_id, NEW.type_name, field_entry.field_name, field_entry.field_spec,
      NEW.version, NEW.updated_by, concat('Auto-refresh @', now()),
      new_hash, prev_hash,
      COALESCE(NEW.classification,'internal'), COALESCE(NEW.compartment_markings,'{}'::text[]), now()
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- CONFIG → AI EMBEDDINGS (stubbed vector)
CREATE OR REPLACE FUNCTION create_config_embedding()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_bytes bytea;
BEGIN
  v_bytes := digest((NEW.domain || ':' || NEW.key || ':' || NEW.value::text),'sha256');
  INSERT INTO embeddings(organization_id, entity_table, entity_id, vector, dims, classification, compartment_markings)
  VALUES (NEW.organization_id, 'configurations', NEW.id, v_bytes, 32, NEW.classification, NEW.compartment_markings)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- Propagate config compartments/classification to children
CREATE OR REPLACE FUNCTION propagate_config_compartments() RETURNS trigger AS $$
BEGIN
  UPDATE embeddings
     SET classification = GREATEST(embeddings.classification, NEW.classification),
         compartment_markings = ARRAY(SELECT DISTINCT unnest(embeddings.compartment_markings || NEW.compartment_markings))
   WHERE organization_id = NEW.organization_id
     AND entity_table = 'configurations'
     AND entity_id = NEW.id;

  UPDATE config_metrics
     SET classification = NEW.classification,
         compartment_markings = NEW.compartment_markings
   WHERE organization_id = NEW.organization_id
     AND config_id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Optional SIEM: config drift
CREATE OR REPLACE FUNCTION detect_config_drift()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND (OLD.value IS DISTINCT FROM NEW.value OR OLD.classification IS DISTINCT FROM NEW.classification OR OLD.compartment_markings IS DISTINCT FROM NEW.compartment_markings) THEN
    INSERT INTO security_events(organization_id, event_type, severity, description, context)
    VALUES (
      NEW.organization_id,
      'config_drift_detected',
      'warning',
      concat('Configuration changed: ', NEW.domain, '.', NEW.key),
      jsonb_build_object('old_value', OLD.value, 'new_value', NEW.value)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- AUDIT: hash chain computer
CREATE OR REPLACE FUNCTION trg_audit_hash() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_prev_hash text;
BEGIN
  SELECT record_hash INTO v_prev_hash
  FROM audit_trail
  WHERE organization_id = NEW.organization_id
  ORDER BY timestamp DESC
  LIMIT 1;

  NEW.prev_hash := v_prev_hash;
  NEW.record_hash := encode(
    digest(
      coalesce(NEW.id::text,'') || coalesce(NEW.user_id::text,'') ||
      coalesce(NEW.table_name,'') || coalesce(NEW.operation,'') ||
      coalesce(NEW.old_data::text,'') || coalesce(NEW.new_data::text,'') ||
      coalesce(NEW.prev_hash,'')
    ,'sha256'),
    'hex'
  );
  RETURN NEW;
END;
$$;

-- Generic audit writer
CREATE OR REPLACE FUNCTION audit_if_changed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO audit_trail(organization_id,user_id,table_name,record_id,operation,new_data,classification)
    VALUES (NEW.organization_id, NEW.created_by, TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), COALESCE(NEW.classification,'internal'));
    RETURN NEW;
  ELSIF TG_OP='UPDATE' THEN
    INSERT INTO audit_trail(organization_id,user_id,table_name,record_id,operation,old_data,new_data,classification)
    VALUES (NEW.organization_id, COALESCE(NEW.updated_by, OLD.updated_by), TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), COALESCE(NEW.classification,'internal'));
    RETURN NEW;
  ELSIF TG_OP='DELETE' THEN
    INSERT INTO audit_trail(organization_id,user_id,table_name,record_id,operation,old_data,classification)
    VALUES (OLD.organization_id, OLD.updated_by, TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), COALESCE(OLD.classification,'internal'));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- ----------------------------------------------------------------------
-- TRIGGERS (audit, field cache, config ai/propagation, audit hash)
-- ----------------------------------------------------------------------
CREATE TRIGGER audit_hash_compute
BEFORE INSERT ON audit_trail
FOR EACH ROW EXECUTE FUNCTION trg_audit_hash();

CREATE TRIGGER audit_objects  AFTER INSERT OR UPDATE OR DELETE ON objects FOR EACH ROW EXECUTE FUNCTION audit_if_changed();
CREATE TRIGGER audit_events   AFTER INSERT OR UPDATE OR DELETE ON events  FOR EACH ROW EXECUTE FUNCTION audit_if_changed();
CREATE TRIGGER audit_links    AFTER INSERT OR UPDATE OR DELETE ON links   FOR EACH ROW EXECUTE FUNCTION audit_if_changed();

CREATE TRIGGER trg_field_cache_refresh
AFTER INSERT OR UPDATE ON type_definitions
FOR EACH ROW EXECUTE FUNCTION refresh_field_cache();

CREATE TRIGGER audit_field_cache
AFTER INSERT OR UPDATE OR DELETE ON field_definitions_cache
FOR EACH ROW EXECUTE FUNCTION audit_if_changed();

CREATE TRIGGER audit_field_versions
AFTER INSERT OR UPDATE OR DELETE ON field_definition_versions
FOR EACH ROW EXECUTE FUNCTION audit_if_changed();

CREATE TRIGGER audit_configurations
AFTER INSERT OR UPDATE OR DELETE ON configurations
FOR EACH ROW EXECUTE FUNCTION audit_if_changed();

CREATE TRIGGER trg_config_embeddings
AFTER INSERT OR UPDATE ON configurations
FOR EACH ROW EXECUTE FUNCTION create_config_embedding();

CREATE TRIGGER trg_propagate_config_compartments
AFTER INSERT OR UPDATE ON configurations
FOR EACH ROW EXECUTE FUNCTION propagate_config_compartments();

CREATE TRIGGER trg_config_drift
AFTER UPDATE ON configurations
FOR EACH ROW EXECUTE FUNCTION detect_config_drift();

CREATE TRIGGER audit_config_metrics
AFTER INSERT OR UPDATE OR DELETE ON config_metrics
FOR EACH ROW EXECUTE FUNCTION audit_if_changed();

-- ----------------------------------------------------------------------
-- ROW-LEVEL SECURITY (enable everywhere + policies)
-- ----------------------------------------------------------------------
ALTER TABLE organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles            ENABLE ROW LEVEL SECURITY;

ALTER TABLE type_definitions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE objects               ENABLE ROW LEVEL SECURITY;
ALTER TABLE events                ENABLE ROW LEVEL SECURITY;
ALTER TABLE links                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE configurations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE encrypted_fields      ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_screening_log  ENABLE ROW LEVEL SECURITY;

ALTER TABLE app_logs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE dlp_events            ENABLE ROW LEVEL SECURITY;

ALTER TABLE ui_error_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_traces    ENABLE ROW LEVEL SECURITY;
ALTER TABLE db_query_traces       ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_traces        ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache_metrics         ENABLE ROW LEVEL SECURITY;

ALTER TABLE signature_cache       ENABLE ROW LEVEL SECURITY;
ALTER TABLE replication_status    ENABLE ROW LEVEL SECURITY;
ALTER TABLE shard_registry        ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo_replica_registry  ENABLE ROW LEVEL SECURITY;

ALTER TABLE i18n_messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_manifests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_hooks          ENABLE ROW LEVEL SECURITY;

ALTER TABLE field_definitions_cache  ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_definition_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_metrics            ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_trail               ENABLE ROW LEVEL SECURITY;

-- Org isolation
CREATE POLICY org_isolation_orgs ON organizations
  USING (id = NULLIF(current_setting('app.org_id', true), '')::uuid);

CREATE POLICY org_isolation_users ON app_users
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);

CREATE POLICY org_isolation_roles ON roles
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);

CREATE POLICY org_isolation_user_roles ON user_roles
  USING (EXISTS (SELECT 1 FROM app_users au WHERE au.id = user_id AND au.organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid));

CREATE POLICY org_isolation_role_perms ON role_permissions
  USING (EXISTS (SELECT 1 FROM roles r WHERE r.id = role_id AND r.organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid));

-- Core entities + clearance/compartments
CREATE POLICY type_defs_access ON type_definitions
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid
         AND can_see_entity(classification, compartment_markings));

CREATE POLICY objects_access ON objects
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid
         AND can_see_entity(classification, compartment_markings));

CREATE POLICY events_access ON events
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid
         AND can_see_entity(classification, compartment_markings));

CREATE POLICY links_access ON links
  USING (org_id = NULLIF(current_setting('app.org_id', true), '')::uuid
         AND can_see_entity(classification, compartment_markings));

-- Configs & derivatives
CREATE POLICY conf_access ON configurations
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid
         AND can_see_entity(classification, compartment_markings));

CREATE POLICY emb_access ON embeddings
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid
         AND can_see_entity(classification, compartment_markings));

CREATE POLICY encfld_access ON encrypted_fields
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);

CREATE POLICY export_access ON export_screening_log
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);

-- Logs / SIEM / DLP
CREATE POLICY app_logs_access ON app_logs
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);

CREATE POLICY sec_events_access ON security_events
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);

CREATE POLICY dlp_events_access ON dlp_events
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);

-- Observability
CREATE POLICY ui_errors_access ON ui_error_logs
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);

CREATE POLICY perf_traces_access ON performance_traces
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);

CREATE POLICY db_traces_access ON db_query_traces
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);

CREATE POLICY net_traces_access ON network_traces
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);

CREATE POLICY cache_metrics_access ON cache_metrics
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);

-- Plugins
CREATE POLICY plugin_manifest_access ON plugin_manifests
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid
         AND can_see_entity(required_clearance, compartment_markings));

CREATE POLICY plugin_hooks_access ON plugin_hooks
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);

-- Field cache/history
CREATE POLICY field_cache_access ON field_definitions_cache
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid
         AND can_see_entity(classification, compartment_markings));

CREATE POLICY field_versions_access ON field_definition_versions
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid
         AND can_see_entity(classification, compartment_markings));

-- Config metrics
CREATE POLICY config_metrics_access ON config_metrics
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid
         AND can_see_entity(classification, compartment_markings));

-- Audit
CREATE POLICY audit_access ON audit_trail
  USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid
         AND can_see_entity(classification, compartment_context));

-- ----------------------------------------------------------------------
-- SEED / SETUP HELPERS (safe to keep here; call explicitly after deploy)
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ensure_universal_config(p_org uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Security
  INSERT INTO configurations (organization_id, domain, scope, key, kind, value, is_secret, classification)
  VALUES
    (p_org,'security','global','nato_mode_enabled','flag','false'::jsonb,false,'internal'),
    (p_org,'security','global','clearance_validation_mode','enum','"advisory"'::jsonb,false,'internal'),
    (p_org,'security','global','pq_migration_deadline','datetime',to_jsonb('2030-01-01T00:00:00Z'::timestamptz),false,'internal'),
    (p_org,'security','global','zero_trust_mode','flag','true'::jsonb,false,'internal')
  ON CONFLICT (organization_id, domain, key) DO NOTHING;

  -- CRDT / Sync
  INSERT INTO configurations (organization_id, domain, scope, key, kind, value, is_secret, classification)
  VALUES
    (p_org,'sync','global','crdt_default_type','enum','"lww_register"'::jsonb,false,'internal'),
    (p_org,'sync','global','crdt_clock_skew_tolerance_ms','number','250'::jsonb,false,'internal')
  ON CONFLICT (organization_id, domain, key) DO NOTHING;

  -- Semantic
  INSERT INTO configurations (organization_id, domain, scope, key, kind, value, is_secret, classification)
  VALUES
    (p_org,'semantic','global','inference_enabled','flag','true'::jsonb,false,'internal'),
    (p_org,'semantic','global','inference_confidence_threshold','number','0.8'::jsonb,false,'internal')
  ON CONFLICT (organization_id, domain, key) DO NOTHING;

  -- Network
  INSERT INTO configurations (organization_id, domain, scope, key, kind, value, is_secret, classification)
  VALUES
    (p_org,'network','global','replication_mode','enum','"active_active"'::jsonb,false,'internal'),
    (p_org,'network','global','replication_window_sec','number','5'::jsonb,false,'internal')
  ON CONFLICT (organization_id, domain, key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION seed_nato_config(p_org uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO configurations (organization_id, domain, scope, key, kind, value, is_secret, classification)
  VALUES
    (p_org,'security','global','nato_classification_ui','flag','true'::jsonb,false,'internal'),
    (p_org,'security','global','compartment_enforcement','enum','"enforced"'::jsonb,false,'nato_restricted'),
    (p_org,'security','global','physical_zone_integration','flag','true'::jsonb,false,'nato_restricted'),
    (p_org,'security','global','forensic_audit_mode','flag','true'::jsonb,false,'nato_secret'),
    (p_org,'security','global','supply_chain_validation','enum','"enhanced"'::jsonb,false,'nato_secret')
  ON CONFLICT (organization_id, domain, key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION seed_nato_types(p_org uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Security zone (object type)
  INSERT INTO type_definitions(organization_id, type_name, domain, field_schema, ui_schema, is_system, classification)
  VALUES (
    p_org,'security_zone','data',
    jsonb_build_object(
      'fields', jsonb_build_object(
        'zone_type', jsonb_build_object('type','select','options',jsonb_build_array('physical','tempest','compartment')),
        'clearance_required', jsonb_build_object('type','select','options',jsonb_build_array('internal','restricted','nato_secret','cosmic_top_secret')),
        'physical_controls', jsonb_build_object('type','multiselect','options',jsonb_build_array('badge','biometric','escort','two_person')),
        'tempest_rating', jsonb_build_object('type','text'),
        'compartment_requirements', jsonb_build_object('type','multiselect','options',jsonb_build_array('noforn','eyes_only','orcon'))
      )
    ),
    jsonb_build_object('icon','Shield','color','amber'),
    true,
    'nato_restricted'
  ) ON CONFLICT (organization_id, type_name) DO NOTHING;

  -- Zone access (event type)
  INSERT INTO type_definitions(organization_id, type_name, domain, field_schema, is_system, classification)
  VALUES (
    p_org,'zone_access','event',
    jsonb_build_object(
      'fields', jsonb_build_object(
        'zone_id', jsonb_build_object('type','object_reference'),
        'action', jsonb_build_object('type','select','options',jsonb_build_array('entry','exit','violation')),
        'timestamp', jsonb_build_object('type','datetime')
      )
    ),
    true,
    'nato_restricted'
  ) ON CONFLICT (organization_id, type_name) DO NOTHING;

  -- Compartment access (event type)
  INSERT INTO type_definitions(organization_id, type_name, domain, field_schema, is_system, classification)
  VALUES (
    p_org,'compartment_access','event',
    jsonb_build_object(
      'fields', jsonb_build_object(
        'compartment_name', jsonb_build_object('type','text'),
        'access_level', jsonb_build_object('type','select','options',jsonb_build_array('read','write','admin')),
        'justification', jsonb_build_object('type','textarea'),
        'granted_by', jsonb_build_object('type','user_reference'),
        'expires_at', jsonb_build_object('type','date')
      )
    ),
    true,
    'nato_restricted'
  ) ON CONFLICT (organization_id, type_name) DO NOTHING;
END;
$$;


-- ===============================================================
-- NODUS SECURITY MODULES (added at the bottom, before final commit)
-- ===============================================================

\echo 'Installing: 001_security_polyinstantiation.sql'
\i db/001_security_polyinstantiation.sql

\echo 'Installing: 002_cds_workflow.sql'
\i db/002_cds_workflow.sql

\echo 'Installing: 003_crypto_domains.sql'
\i db/003_crypto_domains.sql

COMMIT;

\echo '✅ Nodus Database Initialization Complete.'



COMMIT;

-- ======================================================================
-- USAGE (per session):
--   SELECT set_config('app.org_id','<ORG_UUID>', false);
--   SELECT set_config('app.user_id','<USER_UUID>', false);
-- Seeds:
--   SELECT ensure_universal_config('<ORG_UUID>'::uuid);
--   SELECT seed_nato_config('<ORG_UUID>'::uuid);
--   SELECT seed_nato_types('<ORG_UUID>'::uuid);
-- ======================================================================
