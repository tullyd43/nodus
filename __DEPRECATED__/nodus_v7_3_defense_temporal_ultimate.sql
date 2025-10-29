
-- ============================================================================
-- NODUS V7.3 - DEFENCE EDITION **PLUS** + i18n/l10n + NATO SECRET (PG18)
-- GREENFIELD SCHEMA
-- ============================================================================

SET client_min_messages TO WARNING;
SET search_path TO public;

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  CREATE EXTENSION IF NOT EXISTS citext;
  CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
  CREATE EXTENSION IF NOT EXISTS btree_gin;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Some base extensions not available; continuing';
END $$;

DO $$ BEGIN
  PERFORM 1;
  -- ALTER SYSTEM SET shared_preload_libraries = 'pg_tde';
  -- CREATE EXTENSION IF NOT EXISTS pg_tde;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_tde enablement requires superuser; ensure at deployment time';
END $$;

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector not available; vector indexes may be skipped';
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='data_domain') THEN
    CREATE TYPE data_domain AS ENUM ('data','ui','system','user','meta');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='security_classification') THEN
    CREATE TYPE security_classification AS ENUM ('public','internal','restricted','confidential','secret','top_secret');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='tenant_isolation_mode') THEN
    CREATE TYPE tenant_isolation_mode AS ENUM ('MT_SHARED','MT_SCHEMA','STANDALONE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='audit_operation') THEN
    CREATE TYPE audit_operation AS ENUM ('insert','update','delete','select','grant','revoke');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='event_severity') THEN
    CREATE TYPE event_severity AS ENUM ('info','warning','error','critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='membership_tier') THEN
    CREATE TYPE membership_tier AS ENUM ('free','pro','business','enterprise');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='ui_event_type') THEN
    CREATE TYPE ui_event_type AS ENUM ('click','view','hover','scroll','keypress','drag','drop','focus','blur','submit','contextmenu','custom');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='http_method') THEN
    CREATE TYPE http_method AS ENUM ('GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='cache_layer') THEN
    CREATE TYPE cache_layer AS ENUM ('memory','browser','cdn','edge','redis','memcached','disk');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='metric_unit') THEN
    CREATE TYPE metric_unit AS ENUM ('ms','ns','s','bytes','kb','mb','gb','count','pct','fps');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='mfa_kind') THEN
    CREATE TYPE mfa_kind AS ENUM ('totp','webauthn','sms');
  END IF;
END $$;

-- Orgs & Users
CREATE TABLE organizations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  slug               CITEXT UNIQUE,
  tier               membership_tier NOT NULL DEFAULT 'free',
  isolation_mode     tenant_isolation_mode NOT NULL DEFAULT 'MT_SHARED',
  classification     security_classification NOT NULL DEFAULT 'internal',
  feature_flags      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by         UUID
);
CREATE INDEX idx_org_slug ON organizations(slug);
CREATE INDEX idx_org_tier ON organizations(tier);

CREATE TABLE app_users (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  email              CITEXT NOT NULL UNIQUE,
  display_name       TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  mfa_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  classification     security_classification NOT NULL DEFAULT 'internal',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by         UUID,
  last_login_at      TIMESTAMPTZ
);
CREATE INDEX idx_users_org ON app_users(organization_id);
CREATE INDEX idx_users_email ON app_users(email);

CREATE TABLE user_credentials (
  user_id            UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  password_hash      TEXT NOT NULL,
  password_algo      TEXT NOT NULL DEFAULT 'argon2id',
  password_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  failed_attempts    INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until       TIMESTAMPTZ,
  must_rotate_after  INTERVAL DEFAULT interval '365 days'
);

CREATE TABLE password_policies (
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  min_length         INTEGER NOT NULL DEFAULT 14 CHECK (min_length >= 8),
  require_upper      BOOLEAN NOT NULL DEFAULT TRUE,
  require_lower      BOOLEAN NOT NULL DEFAULT TRUE,
  require_digit      BOOLEAN NOT NULL DEFAULT TRUE,
  require_symbol     BOOLEAN NOT NULL DEFAULT TRUE,
  rotation_days      INTEGER NOT NULL DEFAULT 365 CHECK (rotation_days BETWEEN 30 AND 1095),
  history_count      INTEGER NOT NULL DEFAULT 5 CHECK (history_count BETWEEN 0 AND 24),
  lockout_threshold  INTEGER NOT NULL DEFAULT 10 CHECK (lockout_threshold BETWEEN 3 AND 20),
  lockout_minutes    INTEGER NOT NULL DEFAULT 15 CHECK (lockout_minutes BETWEEN 1 AND 1440),
  PRIMARY KEY (organization_id)
);

CREATE TABLE mfa_factors (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID REFERENCES app_users(id) ON DELETE CASCADE,
  kind               mfa_kind NOT NULL,
  label              TEXT,
  secret_or_pubkey   TEXT NOT NULL,
  added_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at       TIMESTAMPTZ
);
CREATE INDEX idx_mfa_user ON mfa_factors(user_id);

CREATE TABLE secure_sessions (
  session_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID REFERENCES app_users(id) ON DELETE CASCADE,
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  ip_address         INET,
  user_agent_hash    TEXT,
  device_fingerprint TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at         TIMESTAMPTZ,
  last_activity      TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotation_counter   INTEGER NOT NULL DEFAULT 0 CHECK (rotation_counter >= 0),
  mfa_verified       BOOLEAN NOT NULL DEFAULT FALSE,
  security_clearance_level security_classification DEFAULT 'internal'
);
CREATE INDEX idx_secure_sessions_user ON secure_sessions(user_id);
CREATE INDEX idx_secure_sessions_org ON secure_sessions(organization_id);

-- RBAC
CREATE TABLE roles (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  description        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uidx_roles_org_name ON roles(organization_id, name);

CREATE TABLE permissions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code               TEXT NOT NULL UNIQUE,
  description        TEXT
);

CREATE TABLE role_permissions (
  role_id            UUID REFERENCES roles(id) ON DELETE CASCADE,
  permission_id      UUID REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
  user_id            UUID REFERENCES app_users(id) ON DELETE CASCADE,
  role_id            UUID REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE user_permissions (
  user_id            UUID REFERENCES app_users(id) ON DELETE CASCADE,
  permission_code    TEXT NOT NULL,
  role_id            UUID REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, permission_code, role_id)
);

CREATE OR REPLACE FUNCTION grant_permission_to_role(p_code TEXT, p_role UUID) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE perm_id UUID;
BEGIN
  SELECT id INTO perm_id FROM permissions WHERE code = p_code;
  IF perm_id IS NULL THEN
    INSERT INTO permissions(code) VALUES (p_code) RETURNING id INTO perm_id;
  END IF;
  INSERT INTO role_permissions(role_id, permission_id)
  VALUES (p_role, perm_id) ON CONFLICT DO NOTHING;
END $$;

-- Context helpers
CREATE OR REPLACE FUNCTION set_app_context(p_org UUID, p_user UUID, p_perms TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.org_id', COALESCE(p_org::text,''), TRUE);
  PERFORM set_config('app.user_id', COALESCE(p_user::text,''), TRUE);
  PERFORM set_config('app.permissions', COALESCE(p_perms,''), TRUE);
END $$;

CREATE OR REPLACE FUNCTION has_permission_cached(p_code TEXT) 
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT position(p_code in COALESCE(current_setting('app.permissions', true), '')) > 0;
$$;

CREATE OR REPLACE FUNCTION has_permission(p_code TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$ SELECT has_permission_cached(p_code); $$;

CREATE OR REPLACE FUNCTION get_user_clearance() 
RETURNS security_classification 
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (SELECT classification FROM app_users 
     WHERE id = NULLIF(current_setting('app.user_id', true), '')::uuid),
    'public'::security_classification
  );
$$;

-- Configs / Types / Objects / Events / Links (Defence PLUS)
CREATE TABLE configurations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  domain             data_domain NOT NULL DEFAULT 'system',
  scope              TEXT NOT NULL DEFAULT 'global',
  key                TEXT NOT NULL,
  kind               TEXT NOT NULL DEFAULT 'generic',
  value              JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_secret          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by         UUID,
  UNIQUE (organization_id, domain, key)
);
CREATE INDEX idx_cfg_org_domain ON configurations(organization_id, domain);
CREATE INDEX idx_cfg_kind ON configurations(organization_id, kind);
CREATE INDEX idx_cfg_value_gin ON configurations USING GIN (value jsonb_path_ops);

CREATE TABLE type_definitions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  type_name          TEXT NOT NULL,
  category           TEXT NOT NULL DEFAULT 'object',
  parent_type        TEXT,
  field_schema       JSONB NOT NULL DEFAULT '{}'::jsonb,
  ui_schema          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by         UUID,
  UNIQUE (organization_id, type_name)
);
CREATE INDEX idx_type_defs_org_cat ON type_definitions(organization_id, category);
CREATE INDEX idx_type_defs_schema_gin ON type_definitions USING GIN (field_schema jsonb_path_ops);

CREATE TABLE objects (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  type_name          TEXT NOT NULL,
  title              TEXT,
  data               JSONB NOT NULL DEFAULT '{}'::jsonb,
  domain             data_domain NOT NULL DEFAULT 'data',
  classification     security_classification NOT NULL DEFAULT 'internal',
  security_labels    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  search             tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(data::text,''))) STORED,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID REFERENCES app_users(id),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by         UUID REFERENCES app_users(id)
);
CREATE INDEX idx_objects_org_type ON objects(organization_id, type_name);
CREATE INDEX idx_objects_search ON objects USING GIN (search);
CREATE INDEX idx_objects_data_gin ON objects USING GIN (data jsonb_path_ops);
CREATE INDEX idx_objects_classification ON objects(organization_id, classification);

CREATE TABLE events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  type_name          TEXT NOT NULL,
  entity_id          UUID,
  entity_type        TEXT,
  severity           event_severity NOT NULL DEFAULT 'info',
  message            TEXT,
  data               JSONB NOT NULL DEFAULT '{}'::jsonb,
  domain             data_domain NOT NULL DEFAULT 'data',
  classification     security_classification NOT NULL DEFAULT 'internal',
  occurred_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID REFERENCES app_users(id)
);
CREATE INDEX idx_events_org_type ON events(organization_id, type_name, occurred_at DESC);
CREATE INDEX idx_events_data_gin ON events USING GIN (data jsonb_path_ops);

CREATE TABLE links (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID REFERENCES organizations(id) ON DELETE CASCADE,
  from_id            UUID NOT NULL,
  to_id              UUID NOT NULL,
  relation           TEXT,
  domain             data_domain NOT NULL DEFAULT 'data',
  classification     security_classification NOT NULL DEFAULT 'internal',
  security_labels    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  weight             INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID REFERENCES app_users(id),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by         UUID REFERENCES app_users(id)
);
CREATE INDEX idx_links_org_domain ON links(org_id, domain);
CREATE INDEX idx_links_from ON links(from_id);
CREATE INDEX idx_links_to ON links(to_id);
CREATE INDEX idx_links_relation ON links(relation);
CREATE INDEX idx_links_metadata_gin ON links USING GIN (metadata jsonb_path_ops);

-- UI layer
CREATE TABLE ui_themes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  key                TEXT NOT NULL,
  variables          JSONB NOT NULL DEFAULT '{}'::jsonb,
  css                TEXT NOT NULL,
  parent_theme       TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);
CREATE INDEX idx_ui_themes_org_key ON ui_themes(organization_id, key);

CREATE TABLE ui_widgets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  component_name     TEXT NOT NULL,
  category           TEXT NOT NULL DEFAULT 'core',
  props_schema       JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_props      JSONB NOT NULL DEFAULT '{}'::jsonb,
  style_refs         TEXT[] DEFAULT ARRAY[]::TEXT[],
  source_plugin      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, component_name)
);
CREATE INDEX idx_ui_widgets_org_component ON ui_widgets(organization_id, component_name);
CREATE INDEX idx_ui_widgets_cat ON ui_widgets(organization_id, category);

CREATE TABLE ui_layouts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  key                TEXT NOT NULL,
  title              TEXT,
  description        TEXT,
  structure          JSONB NOT NULL,
  version            TEXT NOT NULL DEFAULT '1.0.0',
  theme_key          TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);
CREATE INDEX idx_ui_layouts_org_key ON ui_layouts(organization_id, key);

CREATE TABLE ui_assets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  key                TEXT NOT NULL,
  kind               TEXT NOT NULL DEFAULT 'image',
  mime_type          TEXT,
  bytes              BYTEA,
  size_bytes         BIGINT,
  hash_sha256        TEXT,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);
CREATE INDEX idx_ui_assets_org_key ON ui_assets(organization_id, key);
CREATE INDEX idx_ui_assets_kind ON ui_assets(organization_id, kind);

-- Plugins
CREATE TABLE plugin_manifests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  plugin_id          TEXT NOT NULL,
  version            TEXT NOT NULL DEFAULT '1.0.0',
  manifest           JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  autoload           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, plugin_id)
);
CREATE INDEX idx_plugin_manifests_org ON plugin_manifests(organization_id);
CREATE INDEX idx_plugin_manifests_enabled ON plugin_manifests(organization_id, enabled);

CREATE TABLE plugin_states (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  plugin_id          TEXT NOT NULL,
  state              JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, plugin_id)
);
CREATE INDEX idx_plugin_states_org ON plugin_states(organization_id);

CREATE TABLE plugin_hooks (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  plugin_id          TEXT NOT NULL,
  hook_type          TEXT NOT NULL,
  target             TEXT NOT NULL,
  script             TEXT NOT NULL,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_plugin_hooks_org_plugin ON plugin_hooks(organization_id, plugin_id);
CREATE INDEX idx_plugin_hooks_type_target ON plugin_hooks(hook_type, target);

-- AI / Embeddings
CREATE TABLE embeddings (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  entity_id          UUID,
  entity_type        TEXT,
  field              TEXT,
  vector             VECTOR(1536),
  classification     security_classification NOT NULL DEFAULT 'internal',
  meta               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_id, field)
);
CREATE INDEX idx_embeddings_org ON embeddings(organization_id);
CREATE INDEX idx_embeddings_class ON embeddings(organization_id, classification);

DO $$ BEGIN EXECUTE 'CREATE INDEX idx_embeddings_hnsw ON embeddings USING hnsw (vector)'; 
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'HNSW index not available; skipping'; END $$;

CREATE TABLE embedding_jobs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  target             TEXT NOT NULL,
  params             JSONB NOT NULL DEFAULT '{}'::jsonb,
  status             TEXT NOT NULL DEFAULT 'queued',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at         TIMESTAMPTZ,
  finished_at        TIMESTAMPTZ
);
CREATE INDEX idx_embedding_jobs_org ON embedding_jobs(organization_id);
CREATE INDEX idx_embedding_jobs_status ON embedding_jobs(status, created_at);

-- Deep Observability & Security
CREATE TABLE system_metrics (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  metric             TEXT NOT NULL,
  value              DOUBLE PRECISION NOT NULL,
  unit               metric_unit DEFAULT 'count',
  tags               JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_metrics_org_metric_time ON system_metrics(organization_id, metric, recorded_at DESC);
CREATE INDEX idx_metrics_tags_gin ON system_metrics USING GIN (tags jsonb_path_ops);

CREATE TABLE performance_traces (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  span_id            TEXT,
  parent_span_id     TEXT,
  name               TEXT,
  duration_ms        INTEGER,
  attributes         JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_traces_org_time ON performance_traces(organization_id, recorded_at DESC);

CREATE TABLE ui_render_stats (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id            UUID REFERENCES app_users(id),
  layout_key         TEXT,
  widget_name        TEXT,
  fps                DOUBLE PRECISION,
  render_time_ms     INTEGER,
  paint_time_ms      INTEGER,
  memory_bytes       BIGINT,
  props_hash         TEXT,
  tags               JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ui_render_stats_org_time ON ui_render_stats(organization_id, recorded_at DESC);
CREATE INDEX idx_ui_render_stats_layout_widget ON ui_render_stats(organization_id, layout_key, widget_name);

CREATE TABLE network_traces (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id            UUID REFERENCES app_users(id),
  method             http_method NOT NULL,
  url                TEXT NOT NULL,
  status_code        INTEGER,
  dns_ms             INTEGER,
  connect_ms         INTEGER,
  tls_ms             INTEGER,
  ttfb_ms            INTEGER,
  download_ms        INTEGER,
  bytes_sent         BIGINT,
  bytes_received     BIGINT,
  tags               JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_network_traces_org_time ON network_traces(organization_id, recorded_at DESC);
CREATE INDEX idx_network_traces_status ON network_traces(status_code);

CREATE TABLE db_query_traces (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id            UUID REFERENCES app_users(id),
  query_fingerprint  TEXT,
  rows               INTEGER,
  duration_ms        INTEGER,
  error_message      TEXT,
  tags               JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_db_query_traces_org_time ON db_query_traces(organization_id, recorded_at DESC);

CREATE TABLE cache_metrics (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  layer              cache_layer NOT NULL,
  key                TEXT,
  hits               BIGINT DEFAULT 0,
  misses             BIGINT DEFAULT 0,
  evictions          BIGINT DEFAULT 0,
  bytes              BIGINT DEFAULT 0,
  operation          TEXT,
  duration_ms        INTEGER,
  tags               JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cache_metrics_org_time ON cache_metrics(organization_id, recorded_at DESC);
CREATE INDEX idx_cache_metrics_layer ON cache_metrics(organization_id, layer);

CREATE TABLE app_logs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  level              TEXT NOT NULL,
  logger             TEXT,
  message            TEXT,
  context            JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_app_logs_org_time ON app_logs(organization_id, recorded_at DESC);
CREATE INDEX idx_app_logs_level ON app_logs(organization_id, level);

CREATE TABLE ui_error_logs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id            UUID REFERENCES app_users(id),
  layout_key         TEXT,
  widget_name        TEXT,
  error_message      TEXT,
  stack_trace        TEXT,
  browser_info       JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ui_error_logs_org_time ON ui_error_logs(organization_id, recorded_at DESC);

CREATE TABLE api_calls (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id            UUID REFERENCES app_users(id),
  method             http_method NOT NULL,
  route              TEXT NOT NULL,
  status_code        INTEGER,
  request_size       BIGINT,
  response_size      BIGINT,
  latency_ms         INTEGER,
  auth_subject       TEXT,
  client_ip          INET,
  user_agent         TEXT,
  meta               JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_calls_org_time ON api_calls(organization_id, recorded_at DESC);
CREATE INDEX idx_api_calls_route ON api_calls(route);

CREATE TABLE security_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id            UUID,
  event_type         TEXT NOT NULL,
  severity           event_severity NOT NULL DEFAULT 'info',
  description        TEXT,
  context            JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_ip          INET,
  user_agent         TEXT,
  recorded_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_security_events_org_time ON security_events(organization_id, recorded_at DESC);
CREATE INDEX idx_security_events_type ON security_events(organization_id, event_type);

CREATE TABLE dlp_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id            UUID,
  policy_violated    TEXT NOT NULL,
  data_classification security_classification,
  action_taken       TEXT,
  data_summary       JSONB,
  recorded_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_dlp_events_org_time ON dlp_events(organization_id, recorded_at DESC);
CREATE INDEX idx_dlp_events_verdict ON dlp_events(organization_id, action_taken);

CREATE TABLE threat_anomalies (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id            UUID,
  anomaly_type       TEXT NOT NULL,
  score              NUMERIC(5,2) NOT NULL,
  details            JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at        TIMESTAMPTZ
);
CREATE INDEX idx_threat_anomalies_org_time ON threat_anomalies(organization_id, detected_at DESC);
CREATE INDEX idx_threat_anomalies_type ON threat_anomalies(organization_id, anomaly_type);

CREATE TABLE denied_parties (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_name          TEXT NOT NULL,
  entity_name        TEXT NOT NULL,
  country_code       TEXT,
  identifiers        JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_denied_parties_name ON denied_parties USING GIN (to_tsvector('simple', entity_name));

CREATE TABLE export_screening_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id           UUID,
  entity_type        TEXT,
  entity_id          UUID,
  screening_result   JSONB NOT NULL,
  export_license_required BOOLEAN DEFAULT FALSE,
  details            JSONB NOT NULL DEFAULT '{}'::jsonb,
  screened_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_export_screening_org_time ON export_screening_log(organization_id, screened_at DESC);

-- Behavior analytics & thresholds
CREATE TABLE user_behavior_baselines (
  user_id            UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  typical_login_hours INTEGER[],
  typical_ip_ranges  INET[],
  typical_access_patterns JSONB,
  last_updated       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_behavior_org ON user_behavior_baselines(organization_id);

CREATE TABLE monitoring_thresholds (
  metric_name        TEXT PRIMARY KEY,
  warning_threshold  NUMERIC,
  critical_threshold NUMERIC,
  evaluation_window  INTERVAL DEFAULT '5 minutes'
);

-- UI interactions / experiments
CREATE TABLE ui_interactions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id            UUID REFERENCES app_users(id),
  layout_key         TEXT,
  widget_name        TEXT,
  event_type         ui_event_type NOT NULL,
  target             TEXT,
  x                  INTEGER,
  y                  INTEGER,
  scroll_y           INTEGER,
  keys               TEXT,
  duration_ms        INTEGER,
  payload            JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ui_interactions_org_time ON ui_interactions(organization_id, recorded_at DESC);
CREATE INDEX idx_ui_interactions_event ON ui_interactions(organization_id, event_type);

CREATE TABLE ui_experiments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  experiment_key     TEXT NOT NULL,
  description        TEXT,
  variants           JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, experiment_key)
);
CREATE INDEX idx_ui_experiments_org_key ON ui_experiments(organization_id, experiment_key);

CREATE TABLE ui_experiment_assignments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  experiment_id      UUID REFERENCES ui_experiments(id) ON DELETE CASCADE,
  user_id            UUID REFERENCES app_users(id),
  variant_key        TEXT NOT NULL,
  assigned_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (experiment_id, user_id)
);
CREATE INDEX idx_ui_experiment_assign_org ON ui_experiment_assignments(organization_id, experiment_id);

-- Audit trail
CREATE TABLE audit_trail (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name         TEXT NOT NULL,
  row_id             UUID,
  operation          audit_operation NOT NULL,
  actor_id           UUID,
  actor_org          UUID,
  actor_permissions  TEXT,
  ip_address         INET,
  user_agent         TEXT,
  before_state       JSONB,
  after_state        JSONB,
  security_context   JSONB,
  compliance_flags   TEXT[],
  previous_hash      TEXT,
  current_hash       TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_tbl_time ON audit_trail(table_name, created_at DESC);
CREATE INDEX idx_audit_org_time ON audit_trail(actor_org, created_at DESC);

CREATE OR REPLACE FUNCTION trg_audit_row() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  prev_hash TEXT;
  concatenated TEXT;
BEGIN
  SELECT current_hash INTO prev_hash
  FROM audit_trail
  WHERE table_name = TG_TABLE_NAME
  ORDER BY created_at DESC
  LIMIT 1;

  concatenated := coalesce(prev_hash,'') || '|' ||
                  coalesce(TG_TABLE_NAME,'') || '|' ||
                  coalesce(TG_OP,'') || '|' ||
                  coalesce((CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN row_to_json(OLD)::text END),'') || '|' ||
                  coalesce((CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN row_to_json(NEW)::text END),'');

  INSERT INTO audit_trail(
    table_name,row_id,operation,actor_id,actor_org,actor_permissions,
    ip_address,user_agent,before_state,after_state,security_context,
    compliance_flags,previous_hash,current_hash,created_at
  )
  VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP::audit_operation,
    NULLIF(current_setting('app.user_id', true), '')::uuid,
    NULLIF(current_setting('app.org_id', true), '')::uuid,
    current_setting('app.permissions', true),
    NULL, NULL,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    NULL, NULL,
    prev_hash,
    encode(digest(concatenated, 'sha256'), 'hex'),
    now()
  );

  RETURN COALESCE(NEW,OLD);
END $$;

-- Field-level encryption
CREATE TABLE encrypted_fields (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type        TEXT NOT NULL,
  entity_id          UUID NOT NULL,
  field_name         TEXT NOT NULL,
  classification     security_classification NOT NULL DEFAULT 'confidential',
  encrypted_value    BYTEA NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID
);
CREATE UNIQUE INDEX uidx_encrypted_field ON encrypted_fields(organization_id, entity_type, entity_id, field_name);

CREATE OR REPLACE FUNCTION kms_encrypt(p_plain TEXT, p_context JSONB DEFAULT '{}'::jsonb)
RETURNS BYTEA LANGUAGE plpgsql AS $$
BEGIN
  RETURN pgp_sym_encrypt(p_plain, COALESCE(current_setting('app.kms_fallback_key', true),'changeme'));
END $$;

CREATE OR REPLACE FUNCTION kms_decrypt(p_cipher BYTEA, p_context JSONB DEFAULT '{}'::jsonb)
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  RETURN pgp_sym_decrypt(p_cipher, COALESCE(current_setting('app.kms_fallback_key', true),'changeme'));
END $$;

CREATE OR REPLACE FUNCTION read_encrypted_field(p_org UUID, p_entity TEXT, p_id UUID, p_field TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v BYTEA; cls security_classification;
BEGIN
  IF NOT (has_permission_cached('data:read') OR has_permission_cached('admin:full')) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  SELECT encrypted_value, classification INTO v, cls
    FROM encrypted_fields
   WHERE organization_id=p_org AND entity_type=p_entity AND entity_id=p_id AND field_name=p_field;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF cls > get_user_clearance() AND NOT has_permission_cached('security:override') THEN
    RAISE EXCEPTION 'insufficient clearance';
  END IF;
  RETURN kms_decrypt(v, jsonb_build_object('entity',p_entity,'field',p_field));
END $$;

-- Data lineage
CREATE TABLE lineage_links (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID REFERENCES organizations(id) ON DELETE CASCADE,
  src_table          TEXT NOT NULL,
  src_id             UUID,
  dst_table          TEXT NOT NULL,
  dst_id             UUID,
  relation           TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID REFERENCES app_users(id)
);
CREATE INDEX idx_lineage_src ON lineage_links(src_table, src_id);
CREATE INDEX idx_lineage_dst ON lineage_links(dst_table, dst_id);

-- HA / Geo / Sharding
CREATE TABLE geo_replica_registry (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_code        TEXT NOT NULL,
  endpoint           TEXT NOT NULL,
  role               TEXT NOT NULL,
  classification_levels security_classification[],
  replica_lag_ms     INTEGER,
  status             TEXT NOT NULL DEFAULT 'active',
  connection_config  JSONB,
  last_health_check  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_geo_replica_region ON geo_replica_registry(region_code, role);

CREATE TABLE shard_registry (
  shard_id           INTEGER PRIMARY KEY,
  classification     security_classification NOT NULL DEFAULT 'internal',
  geographic_region  TEXT,
  connection_string  TEXT,
  status             TEXT NOT NULL DEFAULT 'active',
  capacity_percent   INTEGER NOT NULL DEFAULT 0 CHECK (capacity_percent BETWEEN 0 AND 100),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS enablement (Defence PLUS set)
ALTER TABLE organizations     DISABLE ROW LEVEL SECURITY;
ALTER TABLE permissions       DISABLE ROW LEVEL SECURITY;
ALTER TABLE denied_parties    DISABLE ROW LEVEL SECURITY;
ALTER TABLE monitoring_thresholds DISABLE ROW LEVEL SECURITY;

ALTER TABLE app_users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credentials  ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE mfa_factors       ENABLE ROW LEVEL SECURITY;
ALTER TABLE secure_sessions   ENABLE ROW LEVEL SECURITY;

ALTER TABLE roles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions  ENABLE ROW LEVEL SECURITY;

ALTER TABLE configurations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE type_definitions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE objects           ENABLE ROW LEVEL SECURITY;
ALTER TABLE events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE links             ENABLE ROW LEVEL SECURITY;

ALTER TABLE ui_themes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ui_widgets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ui_layouts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ui_assets         ENABLE ROW LEVEL SECURITY;

ALTER TABLE plugin_manifests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_states     ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_hooks      ENABLE ROW LEVEL SECURITY;

ALTER TABLE embeddings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE embedding_jobs    ENABLE ROW LEVEL SECURITY;

ALTER TABLE system_metrics    ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE ui_render_stats   ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_traces    ENABLE ROW LEVEL SECURITY;
ALTER TABLE db_query_traces   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache_metrics     ENABLE ROW LEVEL SECURITY;
ALTER TABLE dlp_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE threat_anomalies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_screening_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE app_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ui_error_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_calls         ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events   ENABLE ROW LEVEL SECURITY;

ALTER TABLE user_behavior_baselines ENABLE ROW LEVEL SECURITY;

ALTER TABLE ui_interactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ui_experiments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ui_experiment_assignments ENABLE ROW LEVEL SECURITY;

ALTER TABLE audit_trail       ENABLE ROW LEVEL SECURITY;
ALTER TABLE encrypted_fields  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineage_links     ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY app_users_access ON app_users
    USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid
           AND (has_permission_cached('admin:full') OR id = NULLIF(current_setting('app.user_id', true), '')::uuid OR has_permission_cached('users:read')));
EXCEPTION WHEN duplicate_object THEN END $$;

DO $$ BEGIN
  CREATE POLICY credentials_access ON user_credentials
    USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid OR has_permission_cached('admin:full'));
EXCEPTION WHEN duplicate_object THEN END $$;

DO $$ BEGIN
  CREATE POLICY password_policy_access ON password_policies
    USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);
EXCEPTION WHEN duplicate_object THEN END $$;

DO $$ BEGIN
  CREATE POLICY mfa_access ON mfa_factors
    USING (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid OR has_permission_cached('admin:full'));
EXCEPTION WHEN duplicate_object THEN END $$;

DO $$ BEGIN
  CREATE POLICY sessions_access ON secure_sessions
    USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid 
           AND (user_id = NULLIF(current_setting('app.user_id', true), '')::uuid OR has_permission_cached('admin:full')));
EXCEPTION WHEN duplicate_object THEN END $$;

DO $$ DECLARE stmt text; BEGIN
  FOR stmt IN SELECT
    'CREATE POLICY '||tbl||'_org_isolation ON '||tbl||' USING ('||orgcol||' = NULLIF(current_setting('''||'app.org_id'||''', true), '''')::uuid);'
  FROM (VALUES
    ('configurations','organization_id'),
    ('type_definitions','organization_id'),
    ('objects','organization_id'),
    ('events','organization_id'),
    ('links','org_id'),
    ('ui_themes','organization_id'),
    ('ui_widgets','organization_id'),
    ('ui_layouts','organization_id'),
    ('ui_assets','organization_id'),
    ('plugin_manifests','organization_id'),
    ('plugin_states','organization_id'),
    ('plugin_hooks','organization_id'),
    ('embeddings','organization_id'),
    ('embedding_jobs','organization_id'),
    ('system_metrics','organization_id'),
    ('performance_traces','organization_id'),
    ('ui_render_stats','organization_id'),
    ('network_traces','organization_id'),
    ('db_query_traces','organization_id'),
    ('cache_metrics','organization_id'),
    ('app_logs','organization_id'),
    ('ui_error_logs','organization_id'),
    ('api_calls','organization_id'),
    ('security_events','organization_id'),
    ('dlp_events','organization_id'),
    ('threat_anomalies','organization_id'),
    ('export_screening_log','organization_id'),
    ('user_behavior_baselines','organization_id'),
    ('ui_interactions','organization_id'),
    ('ui_experiments','organization_id'),
    ('ui_experiment_assignments','organization_id'),
    ('audit_trail','actor_org'),
    ('encrypted_fields','organization_id'),
    ('lineage_links','org_id')
  ) t(tbl, orgcol)
  LOOP
    BEGIN
      EXECUTE stmt;
    EXCEPTION WHEN duplicate_object THEN NULL;
  END LOOP;
END $$;

DO $$ BEGIN
  CREATE POLICY objects_classified ON objects
    USING (classification <= get_user_clearance()::security_classification
           OR has_permission_cached('security:override'));
EXCEPTION WHEN duplicate_object THEN END $$;

DO $$ BEGIN
  CREATE POLICY events_classified ON events
    USING (classification <= get_user_clearance()::security_classification
           OR has_permission_cached('security:override'));
EXCEPTION WHEN duplicate_object THEN END $$;

DO $$ BEGIN
  CREATE POLICY links_classified ON links
    USING (classification <= get_user_clearance()::security_classification
           OR has_permission_cached('security:override'));
EXCEPTION WHEN duplicate_object THEN END $$;

DO $$ BEGIN
  CREATE POLICY encrypted_fields_classified ON encrypted_fields
    USING (classification <= get_user_clearance()::security_classification
           OR has_permission_cached('security:override'));
EXCEPTION WHEN duplicate_object THEN END $$;

DO $$ BEGIN
  CREATE POLICY embeddings_classified ON embeddings
    USING (classification <= get_user_clearance()::security_classification
           OR has_permission_cached('security:override'));
EXCEPTION WHEN duplicate_object THEN END $$;

DO $$ BEGIN
  CREATE POLICY audit_visibility ON audit_trail
    FOR SELECT USING (has_permission_cached('audit:view') OR has_permission_cached('admin:full'));
EXCEPTION WHEN duplicate_object THEN END $$;

-- Attach audit triggers to mutable tables (Defence PLUS set)
DO $$ DECLARE r record; BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname='public'
      AND tablename IN (
        'organizations','app_users','user_credentials','password_policies','mfa_factors','secure_sessions',
        'roles','permissions','role_permissions','user_roles','user_permissions',
        'configurations','type_definitions','objects','events','links',
        'ui_themes','ui_widgets','ui_layouts','ui_assets',
        'plugin_manifests','plugin_states','plugin_hooks',
        'embeddings','embedding_jobs',
        'system_metrics','performance_traces','ui_render_stats','network_traces','db_query_traces','cache_metrics',
        'app_logs','ui_error_logs','api_calls','security_events','dlp_events','threat_anomalies',
        'user_behavior_baselines','monitoring_thresholds',
        'ui_interactions','ui_experiments','ui_experiment_assignments',
        'export_screening_log',
        'audit_trail','encrypted_fields','lineage_links',
        'geo_replica_registry','shard_registry'
      )
  LOOP
    EXECUTE format('CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION trg_audit_row();', r.tablename, r.tablename);
  END LOOP;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Audit triggers already exist (some tables)';
END $$;

-- Health / Integrity / Retention
CREATE OR REPLACE FUNCTION system_health_check()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result JSONB := '{}'; t RECORD; slow_queries INTEGER;
BEGIN
  FOR t IN 
    SELECT schemaname, tablename, n_tup_ins, n_tup_upd, n_tup_del, n_live_tup, n_dead_tup
    FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY n_live_tup DESC
  LOOP
    result := result || jsonb_build_object(
      'table_'||t.tablename,
      jsonb_build_object(
        'inserts', t.n_tup_ins, 'updates', t.n_tup_upd, 'deletes', t.n_tup_del,
        'live', t.n_live_tup, 'dead', t.n_dead_tup,
        'dead_ratio', CASE WHEN t.n_live_tup>0 THEN ROUND((t.n_dead_tup::float/t.n_live_tup)*100,2) ELSE 0 END
      )
    );
  END LOOP;
  BEGIN
    SELECT COUNT(*) INTO slow_queries FROM pg_stat_statements WHERE mean_exec_time > 1000;
    result := result || jsonb_build_object('slow_queries_count', slow_queries);
  EXCEPTION WHEN undefined_table THEN
    result := result || jsonb_build_object('slow_queries_count','pg_stat_statements not available');
  END;
  result := result || jsonb_build_object(
    'checked_at', now(),
    'db_size', pg_size_pretty(pg_database_size(current_database())),
    'version', version()
  );
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION check_system_alerts()
RETURNS TABLE(alert_type TEXT, severity TEXT, message TEXT, details JSONB)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT 'dead_tuples','warning','High dead tuple ratio in '||tablename,
         jsonb_build_object('table', tablename,
           'dead_ratio', ROUND((n_dead_tup::float / NULLIF(n_live_tup,0))*100,2),
           'live', n_live_tup,'dead', n_dead_tup)
  FROM pg_stat_user_tables
  WHERE schemaname='public' AND n_live_tup>1000 AND (n_dead_tup::float/NULLIF(n_live_tup,0))>0.2;

  RETURN QUERY
  SELECT 'audit_size', CASE WHEN n_live_tup>10000000 THEN 'critical' ELSE 'warning' END,
         'Audit trail very large',
         jsonb_build_object('records', n_live_tup)
  FROM pg_stat_user_tables WHERE tablename='audit_trail' AND n_live_tup>1000000;

  RETURN QUERY
  SELECT 'connections',
         CASE WHEN (curr::float/maxc)>0.8 THEN 'critical' ELSE 'warning' END,
         'Connection usage at '||ROUND((curr::float/maxc)*100)||'%',
         jsonb_build_object('current', curr,'max', maxc,'pct', ROUND((curr::float/maxc)*100))
  FROM (SELECT (SELECT count(*) FROM pg_stat_activity) curr,
               (SELECT setting::int FROM pg_settings WHERE name='max_connections') maxc) s
  WHERE (curr::float/maxc)>0.7;
END; $$;

CREATE OR REPLACE FUNCTION validate_data_integrity()
RETURNS TABLE(check_name TEXT, status TEXT, details TEXT)
LANGUAGE plpgsql AS $$
DECLARE c1 int; c2 int; c3 int; c4 int;
BEGIN
  SELECT COUNT(*) INTO c1 FROM objects o LEFT JOIN organizations org ON o.organization_id=org.id WHERE org.id IS NULL;
  RETURN QUERY SELECT 'orphaned_objects', CASE WHEN c1=0 THEN 'OK' ELSE 'ERROR' END, c1||' objects w/o org';

  SELECT COUNT(*) INTO c2 FROM events e LEFT JOIN organizations org ON e.organization_id=org.id WHERE org.id IS NULL;
  RETURN QUERY SELECT 'orphaned_events', CASE WHEN c2=0 THEN 'OK' ELSE 'ERROR' END, c2||' events w/o org';

  SELECT COUNT(*) INTO c3 FROM links l LEFT JOIN organizations org ON l.org_id=org.id WHERE org.id IS NULL;
  RETURN QUERY SELECT 'orphaned_links', CASE WHEN c3=0 THEN 'OK' ELSE 'ERROR' END, c3||' links w/o org';

  SELECT COUNT(*) INTO c4 FROM user_roles ur LEFT JOIN app_users u ON ur.user_id=u.id LEFT JOIN roles r ON ur.role_id=r.id WHERE u.id IS NULL OR r.id IS NULL;
  RETURN QUERY SELECT 'broken_user_roles', CASE WHEN c4=0 THEN 'OK' ELSE 'ERROR' END, c4||' invalid user_roles';
END; $$;

CREATE OR REPLACE FUNCTION cleanup_old_audit_records(retention_years INTEGER DEFAULT 7)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE deleted_count INTEGER := 0; cutoff TIMESTAMPTZ;
BEGIN
  cutoff := now() - (retention_years||' years')::interval;
  DELETE FROM audit_trail
   WHERE created_at < cutoff
     AND table_name NOT IN ('organizations','app_users','roles')
     AND operation <> 'delete';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  INSERT INTO system_metrics(organization_id, metric, value, unit, tags)
    VALUES (NULL,'audit_cleanup_records_deleted',deleted_count,'count',jsonb_build_object('retention_years',retention_years,'cutoff',cutoff));
  RETURN deleted_count;
END; $$;

-- Permissions seed
INSERT INTO permissions (code, description) VALUES
  ('admin:full','Full administrative access'),
  ('data:read','Read data domain objects'),
  ('data:write','Write data domain objects'),
  ('data:read_all','Read all data regardless of ownership'),
  ('ui:read','Read UI configurations'),
  ('ui:write','Write UI configurations'),
  ('system:read','Read system configurations'),
  ('system:write','Write system configurations'),
  ('user:read','Read user data'),
  ('user:write','Write user data'),
  ('meta:read','Read metadata'),
  ('meta:write','Write metadata'),
  ('events:read','Read events'),
  ('events:write','Write events'),
  ('relationships:read','Read relationships'),
  ('relationships:write','Write relationships'),
  ('types:read','Read type definitions'),
  ('types:write','Write type definitions'),
  ('audit:view','View audit trail'),
  ('metrics:read','Read system metrics'),
  ('plugins:read','Read plugin configurations'),
  ('plugins:write','Write plugin configurations'),
  ('ai:read','Read AI/embeddings data'),
  ('ai:write','Write AI/embeddings data'),
  ('lineage:read','Read data lineage'),
  ('users:read','Read user information'),
  ('roles:read','Read role information'),
  ('security:override','Override security classification restrictions'),
  ('security:dlp','Manage DLP policies'),
  ('security:export','Manage export control screening'),
  ('security:threat','Manage threat detection')
ON CONFLICT (code) DO NOTHING;

-- ====================== i18n / l10n ======================
CREATE TABLE i18n_languages (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE i18n_strings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  default_text TEXT NOT NULL,
  context data_domain DEFAULT 'ui',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organization_id, key)
);

CREATE TABLE i18n_translations (
  string_id UUID REFERENCES i18n_strings(id) ON DELETE CASCADE,
  lang_code TEXT REFERENCES i18n_languages(code) ON DELETE CASCADE,
  translated_text TEXT NOT NULL,
  last_updated TIMESTAMPTZ DEFAULT now(),
  translator_id UUID REFERENCES app_users(id),
  PRIMARY KEY (string_id, lang_code)
);

CREATE OR REPLACE FUNCTION get_translation(p_org UUID, p_key TEXT, p_lang TEXT)
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT t.translated_text
       FROM i18n_translations t
       JOIN i18n_strings s ON s.id=t.string_id
      WHERE s.organization_id=p_org AND s.key=p_key AND t.lang_code=p_lang),
    (SELECT s.default_text FROM i18n_strings s
      WHERE s.organization_id=p_org AND s.key=p_key)
  );
$$;

ALTER TABLE i18n_strings ENABLE ROW LEVEL SECURITY;
ALTER TABLE i18n_translations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY i18n_strings_org ON i18n_strings
    USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);
EXCEPTION WHEN duplicate_object THEN END $$;

DO $$ BEGIN
  CREATE POLICY i18n_translations_org ON i18n_translations
    USING (EXISTS (SELECT 1 FROM i18n_strings s
                   WHERE s.id = i18n_translations.string_id
                     AND s.organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid));
EXCEPTION WHEN duplicate_object THEN END $$;

-- ====================== NATO SECRET Extension ======================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
                 WHERE t.typname='security_classification' AND e.enumlabel='nato_restricted') THEN
    ALTER TYPE security_classification ADD VALUE 'nato_restricted';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
                 WHERE t.typname='security_classification' AND e.enumlabel='nato_confidential') THEN
    ALTER TYPE security_classification ADD VALUE 'nato_confidential';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
                 WHERE t.typname='security_classification' AND e.enumlabel='nato_secret') THEN
    ALTER TYPE security_classification ADD VALUE 'nato_secret';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
                 WHERE t.typname='security_classification' AND e.enumlabel='cosmic_top_secret') THEN
    ALTER TYPE security_classification ADD VALUE 'cosmic_top_secret';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='app_users' AND column_name='clearance_level') THEN
    ALTER TABLE app_users ADD COLUMN clearance_level security_classification DEFAULT 'internal';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='app_users' AND column_name='clearance_expires') THEN
    ALTER TABLE app_users ADD COLUMN clearance_expires DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='app_users' AND column_name='investigation_current') THEN
    ALTER TABLE app_users ADD COLUMN investigation_current BOOLEAN DEFAULT TRUE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='app_users' AND column_name='nato_citizen') THEN
    ALTER TABLE app_users ADD COLUMN nato_citizen BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='objects' AND column_name='compartment_markings') THEN
    ALTER TABLE objects ADD COLUMN compartment_markings TEXT[] DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='compartment_markings') THEN
    ALTER TABLE events ADD COLUMN compartment_markings TEXT[] DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='encrypted_fields' AND column_name='compartment_markings') THEN
    ALTER TABLE encrypted_fields ADD COLUMN compartment_markings TEXT[] DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='embeddings' AND column_name='compartment_markings') THEN
    ALTER TABLE embeddings ADD COLUMN compartment_markings TEXT[] DEFAULT '{}';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='links' AND column_name='compartment_access_required') THEN
    ALTER TABLE links ADD COLUMN compartment_access_required TEXT[] DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='links' AND column_name='releasability_markings') THEN
    ALTER TABLE links ADD COLUMN releasability_markings TEXT[] DEFAULT '{}';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_trail' AND column_name='nato_compliance_level') THEN
    ALTER TABLE audit_trail ADD COLUMN nato_compliance_level security_classification;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_trail' AND column_name='compartment_context') THEN
    ALTER TABLE audit_trail ADD COLUMN compartment_context TEXT[] DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_trail' AND column_name='physical_location_id') THEN
    ALTER TABLE audit_trail ADD COLUMN physical_location_id UUID REFERENCES objects(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_trail' AND column_name='forensic_preservation') THEN
    ALTER TABLE audit_trail ADD COLUMN forensic_preservation BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_trail' AND column_name='legal_hold') THEN
    ALTER TABLE audit_trail ADD COLUMN legal_hold BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_trail' AND column_name='witness_signatures') THEN
    ALTER TABLE audit_trail ADD COLUMN witness_signatures JSONB DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_trail' AND column_name='timestamp_authority') THEN
    ALTER TABLE audit_trail ADD COLUMN timestamp_authority TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='security_events' AND column_name='nato_event_category') THEN
    ALTER TABLE security_events ADD COLUMN nato_event_category TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='security_events' AND column_name='clearance_context') THEN
    ALTER TABLE security_events ADD COLUMN clearance_context JSONB DEFAULT '{}';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS app_cache (
  key TEXT PRIMARY KEY,
  value TEXT,
  expires_at TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION has_clearance_cached(required_level security_classification)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE AS $$
DECLARE
  user_clearance security_classification;
  cache_key TEXT;
BEGIN
  cache_key := 'clearance_' || NULLIF(current_setting('app.user_id', true), '');
  IF cache_key IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT value::security_classification
    INTO user_clearance
    FROM app_cache
   WHERE key = cache_key AND expires_at > now();

  IF NOT FOUND THEN
    SELECT get_user_clearance() INTO user_clearance;
    INSERT INTO app_cache (key, value, expires_at)
    VALUES (cache_key, user_clearance::text, now() + interval '5 minutes')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at;
  END IF;

  RETURN user_clearance >= required_level;
END $$;

CREATE OR REPLACE FUNCTION get_user_clearance() 
RETURNS security_classification 
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE uid UUID; level security_classification; exp DATE; inv_ok BOOLEAN;
BEGIN
  uid := NULLIF(current_setting('app.user_id', true), '')::uuid;
  IF uid IS NULL THEN
    RETURN 'public'::security_classification;
  END IF;

  SELECT COALESCE(clearance_level, 'public'::security_classification), clearance_expires, COALESCE(investigation_current, TRUE)
    INTO level, exp, inv_ok
    FROM app_users WHERE id = uid;

  IF exp IS NOT NULL AND exp < CURRENT_DATE THEN
    RETURN 'public'::security_classification;
  END IF;
  IF NOT inv_ok THEN
    RETURN 'internal'::security_classification;
  END IF;
  RETURN COALESCE(level, 'public'::security_classification);
END $$;

DO $$ BEGIN
  CREATE POLICY objects_nato_classified ON objects
    USING (classification <= get_user_clearance() OR has_permission_cached('security:override'));
EXCEPTION WHEN duplicate_object THEN END $$;

DO $$ BEGIN
  CREATE POLICY events_nato_classified ON events
    USING (classification <= get_user_clearance() OR has_permission_cached('security:override'));
EXCEPTION WHEN duplicate_object THEN END $$;

DO $$ BEGIN
  CREATE POLICY embeddings_nato_classified ON embeddings
    USING (classification <= get_user_clearance() OR has_permission_cached('security:override'));
EXCEPTION WHEN duplicate_object THEN END $$;

CREATE TABLE IF NOT EXISTS nato_policy_overrides (
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  policy_domain TEXT NOT NULL,
  policy_key TEXT NOT NULL,
  nato_override_value JSONB,
  required_clearance security_classification DEFAULT 'nato_restricted',
  justification TEXT,
  approved_by UUID REFERENCES app_users(id),
  expires_at TIMESTAMPTZ,
  PRIMARY KEY (organization_id, policy_domain, policy_key)
);
ALTER TABLE nato_policy_overrides ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY nato_overrides_org ON nato_policy_overrides
    USING (organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid);
EXCEPTION WHEN duplicate_object THEN END $$;

CREATE OR REPLACE FUNCTION get_nato_config(p_key TEXT, p_default JSONB)
RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  config_value JSONB;
  override_value JSONB;
  org UUID := NULLIF(current_setting('app.org_id', true), '')::uuid;
BEGIN
  IF org IS NULL THEN
    RETURN p_default;
  END IF;

  SELECT nato_override_value INTO override_value
    FROM nato_policy_overrides
   WHERE organization_id = org
     AND policy_key = p_key
     AND required_clearance <= get_user_clearance()
     AND (expires_at IS NULL OR expires_at > now())
   LIMIT 1;

  IF override_value IS NOT NULL THEN
    RETURN override_value;
  END IF;

  SELECT value INTO config_value
    FROM configurations
   WHERE organization_id = org
     AND key = p_key
   LIMIT 1;

  RETURN COALESCE(config_value, p_default);
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plugin_manifests' AND column_name='required_clearance') THEN
    ALTER TABLE plugin_manifests ADD COLUMN required_clearance security_classification DEFAULT 'internal';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plugin_manifests' AND column_name='nato_certified') THEN
    ALTER TABLE plugin_manifests ADD COLUMN nato_certified BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plugin_manifests' AND column_name='compartment_access') THEN
    ALTER TABLE plugin_manifests ADD COLUMN compartment_access TEXT[] DEFAULT '{}';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plugin_hooks' AND column_name='clearance_required') THEN
    ALTER TABLE plugin_hooks ADD COLUMN clearance_required security_classification DEFAULT 'internal';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plugin_hooks' AND column_name='nato_compliant') THEN
    ALTER TABLE plugin_hooks ADD COLUMN nato_compliant BOOLEAN DEFAULT TRUE;
  END IF;
END $$;

DO $$ BEGIN
  PERFORM 1 FROM pg_proc WHERE proname='execute_plugin_hook';
  IF NOT FOUND THEN
    CREATE OR REPLACE FUNCTION execute_plugin_hook(p_plugin_id TEXT, p_hook_type TEXT, p_context JSONB)
    RETURNS JSONB LANGUAGE plpgsql AS $$
    BEGIN
      RETURN COALESCE(p_context, '{}'::jsonb);
    END $$;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION execute_plugin_with_clearance(
  p_plugin_id TEXT,
  p_hook_type TEXT,
  p_context JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  plugin_clearance security_classification;
  user_clearance security_classification;
  result JSONB;
BEGIN
  SELECT required_clearance INTO plugin_clearance
    FROM plugin_manifests
   WHERE plugin_id = p_plugin_id;

  user_clearance := get_user_clearance();

  IF plugin_clearance IS NOT NULL AND user_clearance < plugin_clearance THEN
    RAISE EXCEPTION 'Insufficient clearance for plugin %', p_plugin_id;
  END IF;

  result := execute_plugin_hook(p_plugin_id, p_hook_type, p_context);

  INSERT INTO security_events (event_type, severity, description, context, nato_event_category, clearance_context)
  VALUES ('plugin_execution', 'info', 'Plugin executed',
          jsonb_build_object('plugin', p_plugin_id, 'hook', p_hook_type),
          'plugin_security', jsonb_build_object('user_clearance', user_clearance));

  RETURN result;
END $$;

-- Audit triggers for i18n + nato tables
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY[
    'i18n_languages','i18n_strings','i18n_translations',
    'nato_policy_overrides','app_cache'
  ]
  LOOP
    BEGIN
      EXECUTE format('CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION trg_audit_row();', r, r);
    EXCEPTION WHEN duplicate_object THEN NULL;
  END LOOP;
END $$;

RAISE NOTICE 'Nodus V7.3 Defence Edition PLUS + i18n + NATO SECRET schema complete';



-- ============================================================================
-- NATO SECRET COMPLETION PACK (Composable Zones, Seeds, Compartment RLS)
-- Extends: nodus_v7_3_defence_edition_pg18_NATO_SECRET.sql
-- Philosophy: extend existing core; no parallel frameworks
-- ============================================================================

-- 1) Composable Security Types as Organization-Scoped Type Definitions
--    We seed via helper function to respect RLS (per-org).
CREATE OR REPLACE FUNCTION seed_nato_composable_types(p_org UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  -- security_zone
  INSERT INTO type_definitions(organization_id, type_name, category, parent_type, field_schema, ui_schema)
  VALUES (
    p_org,
    'security_zone',
    'object',
    NULL,
    jsonb_build_object(
      'zone_type', jsonb_build_object('type','select','options',jsonb_build_array('physical','tempest','compartment')),
      'clearance_required', jsonb_build_object('type','select','options',jsonb_build_array('internal','restricted','nato_secret','cosmic_top_secret')),
      'physical_controls', jsonb_build_object('type','multiselect','options',jsonb_build_array('badge','biometric','escort','two_person')),
      'tempest_rating', jsonb_build_object('type','text'),
      'compartment_requirements', jsonb_build_object('type','multiselect','options',jsonb_build_array('noforn','eyes_only','orcon'))
    ),
    jsonb_build_object('icon','Shield','color','amber')
  )
  ON CONFLICT (organization_id, type_name) DO NOTHING;

  -- zone_access
  INSERT INTO type_definitions(organization_id, type_name, category, parent_type, field_schema, ui_schema)
  VALUES (
    p_org,
    'zone_access',
    'object',
    NULL,
    jsonb_build_object(
      'access_method', jsonb_build_object('type','select','options',jsonb_build_array('badge','biometric','escort')),
      'time_restrictions', jsonb_build_object('type','text'),
      'escort_required', jsonb_build_object('type','checkbox'),
      'purpose', jsonb_build_object('type','textarea')
    ),
    jsonb_build_object('icon','KeyRound','color','indigo')
  )
  ON CONFLICT (organization_id, type_name) DO NOTHING;

  -- compartment_access
  INSERT INTO type_definitions(organization_id, type_name, category, parent_type, field_schema, ui_schema)
  VALUES (
    p_org,
    'compartment_access',
    'object',
    NULL,
    jsonb_build_object(
      'compartment_name', jsonb_build_object('type','text'),
      'access_level', jsonb_build_object('type','select','options',jsonb_build_array('read','write','admin')),
      'justification', jsonb_build_object('type','textarea'),
      'granted_by', jsonb_build_object('type','user_reference'),
      'expires_at', jsonb_build_object('type','date')
    ),
    jsonb_build_object('icon','Tag','color','teal')
  )
  ON CONFLICT (organization_id, type_name) DO NOTHING;
END;
$$;

-- 2) Seed NATO Configuration (per-org) using same configuration framework
CREATE OR REPLACE FUNCTION seed_nato_config(p_org UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO configurations (organization_id, domain, scope, key, kind, value, is_secret, classification)
  VALUES
  (p_org,'security','global','nato_mode_enabled','flag','false'::jsonb,false,'internal'),
  (p_org,'security','global','clearance_validation_mode','enum','"disabled"'::jsonb,false,'internal'),
  (p_org,'security','global','nato_classification_ui','flag','true'::jsonb,false,'internal'),
  (p_org,'security','global','compartment_enforcement','enum','"advisory"'::jsonb,false,'nato_restricted'),
  (p_org,'security','global','physical_zone_integration','flag','false'::jsonb,false,'nato_restricted'),
  (p_org,'security','global','tempest_compliance_checks','flag','false'::jsonb,false,'nato_restricted'),
  (p_org,'security','global','forensic_audit_mode','flag','false'::jsonb,false,'nato_secret'),
  (p_org,'security','global','supply_chain_validation','enum','"basic"'::jsonb,false,'nato_secret'),
  (p_org,'security','global','opsec_pattern_detection','flag','false'::jsonb,false,'nato_secret'),
  (p_org,'security','global','auto_clearance_downgrade','flag','true'::jsonb,false,'internal'),
  (p_org,'security','global','foreign_national_access','flag','false'::jsonb,false,'nato_restricted'),
  (p_org,'security','global','escort_requirement_level','enum','"nato_secret"'::jsonb,false,'nato_restricted')
  ON CONFLICT (organization_id, domain, key) DO NOTHING;
END;
$$;

-- 3) Compartment Access Validation from Composable Grants
--    Grants are modeled as objects of type 'compartment_access' linked from user->object via links relation 'compartment_access'.
CREATE OR REPLACE FUNCTION has_compartment_access(p_compartments TEXT[])
RETURNS BOOLEAN LANGUAGE plpgsql STABLE AS $$
DECLARE
  uid UUID := NULLIF(current_setting('app.user_id', true), '')::uuid;
  org UUID := NULLIF(current_setting('app.org_id', true), '')::uuid;
  user_compartments TEXT[] := ARRAY[]::TEXT[];
  required_compartment TEXT;
BEGIN
  IF uid IS NULL OR org IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Aggregate user's active compartment grants for this org
  SELECT COALESCE(ARRAY_AGG(DISTINCT (o.data->>'compartment_name')::text), ARRAY[]::TEXT[])
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

  -- Require that user possesses every compartment in entity markings
  IF p_compartments IS NULL OR array_length(p_compartments,1) IS NULL THEN
    RETURN TRUE; -- No compartments required
  END IF;

  FOREACH required_compartment IN ARRAY p_compartments LOOP
    IF required_compartment IS NULL OR required_compartment = '' THEN
      CONTINUE;
    END IF;
    IF NOT (required_compartment = ANY (user_compartments)) THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$$;

-- Convenience: returns TRUE if entity has no compartments OR user has all required.
CREATE OR REPLACE FUNCTION compartments_satisfied(p_marks TEXT[])
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT COALESCE(array_length(p_marks,1) IS NULL OR has_compartment_access(p_marks), TRUE);
$$;

-- 4) Tighten RLS to combine Clearance AND Compartment checks
--    Replace earlier NATO classified policies with stricter versions.
DO $$ BEGIN
  DROP POLICY IF EXISTS objects_nato_classified ON objects;
  CREATE POLICY objects_nato_classified ON objects
    USING (
      (classification <= get_user_clearance() OR has_permission_cached('security:override'))
      AND compartments_satisfied(compartment_markings)
      AND organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid
    );
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS events_nato_classified ON events;
  CREATE POLICY events_nato_classified ON events
    USING (
      (classification <= get_user_clearance() OR has_permission_cached('security:override'))
      AND compartments_satisfied(compartment_markings)
      AND organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid
    );
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  DROP POLICY IF EXISTS embeddings_nato_classified ON embeddings;
  CREATE POLICY embeddings_nato_classified ON embeddings
    USING (
      (classification <= get_user_clearance() OR has_permission_cached('security:override'))
      AND compartments_satisfied(compartment_markings)
      AND organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid
    );
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- 5) Audit trigger coverage for new helper/seed tables not needed; reuse existing audit_trail via DDL audit at app layer.

-- ============================================================================
-- TEMPORAL QUERY FUNCTIONS (NATO Security Enhanced)
-- ============================================================================

-- Get entity state at any point in time (with NATO clearance and compartment checks)
CREATE OR REPLACE FUNCTION get_entity_at_time(
    p_entity_id UUID,
    p_timestamp TIMESTAMPTZ
) RETURNS JSONB 
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
    result JSONB;
    user_clearance security_classification;
    user_compartments TEXT[];
BEGIN
    -- Get user's current clearance and compartments
    user_clearance := get_user_clearance();
    
    -- Get user's compartment access
    SELECT ARRAY_AGG(DISTINCT data->>'compartment_name')
    INTO user_compartments
    FROM objects o
    JOIN links l ON l.to_id = o.id AND l.relation = 'compartment_access'
    WHERE l.from_id = NULLIF(current_setting('app.user_id', true), '')::uuid
      AND o.data->>'expires_at' > now()::text;
    
    user_compartments := COALESCE(user_compartments, ARRAY[]::TEXT[]);
    
    -- Try to get from entity_versions first (if table exists)
    BEGIN
        SELECT snapshot INTO result
        FROM entity_versions ev
        WHERE ev.entity_id = p_entity_id 
          AND ev.valid_from <= p_timestamp
          AND (ev.valid_to IS NULL OR ev.valid_to > p_timestamp)
          AND ev.organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid
          AND ev.classification <= user_clearance
          AND (ev.compartment_markings IS NULL 
               OR ev.compartment_markings <@ user_compartments 
               OR has_permission_cached('security:override'))
        ORDER BY ev.recorded_at DESC
        LIMIT 1;
    EXCEPTION
        WHEN undefined_table THEN
            -- entity_versions doesn't exist, continue to objects table
            NULL;
    END;
    
    -- If no version found, try getting from current objects table
    IF result IS NULL THEN
        SELECT to_jsonb(o.*) INTO result
        FROM objects o
        WHERE o.id = p_entity_id 
          AND o.created_at <= p_timestamp
          AND o.organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid
          AND o.classification <= user_clearance
          AND (o.compartment_markings IS NULL 
               OR o.compartment_markings <@ user_compartments 
               OR has_permission_cached('security:override'));
    END IF;
    
    RETURN result;
END;
$$;

-- Get entity changes with NATO security filtering
CREATE OR REPLACE FUNCTION get_entity_changes(
    p_entity_id UUID,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ
) RETURNS TABLE (
    change_time TIMESTAMPTZ,
    operation TEXT,
    before_state JSONB,
    after_state JSONB,
    changed_by UUID,
    audit_hash TEXT,
    nato_compliance_level security_classification,
    compartment_context TEXT[],
    classification_at_time security_classification
) 
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
    user_clearance security_classification;
    user_compartments TEXT[];
BEGIN
    user_clearance := get_user_clearance();
    
    -- Get user's compartment access
    SELECT ARRAY_AGG(DISTINCT data->>'compartment_name')
    INTO user_compartments
    FROM objects o
    JOIN links l ON l.to_id = o.id AND l.relation = 'compartment_access'
    WHERE l.from_id = NULLIF(current_setting('app.user_id', true), '')::uuid
      AND o.data->>'expires_at' > now()::text;
    
    user_compartments := COALESCE(user_compartments, ARRAY[]::TEXT[]);
    
    RETURN QUERY
    SELECT 
        at.created_at,
        at.operation::TEXT,
        at.before_state,
        at.after_state,
        at.actor_id,
        at.current_hash,
        at.nato_compliance_level,
        at.compartment_context,
        COALESCE(
            (at.security_context->>'classification')::security_classification,
            'internal'::security_classification
        ) as classification_at_time
    FROM audit_trail at
    WHERE at.row_id = p_entity_id
      AND at.created_at BETWEEN p_start_time AND p_end_time
      AND at.actor_org = NULLIF(current_setting('app.org_id', true), '')::uuid
      AND (at.nato_compliance_level IS NULL OR at.nato_compliance_level <= user_clearance)
      AND (at.compartment_context IS NULL 
           OR at.compartment_context <@ user_compartments 
           OR has_permission_cached('security:override'))
    ORDER BY at.created_at;
END;
$$;

-- Replay entity history with NATO classification awareness
CREATE OR REPLACE FUNCTION replay_entity_history(
    p_entity_id UUID,
    p_from_time TIMESTAMPTZ DEFAULT NULL,
    p_to_time TIMESTAMPTZ DEFAULT NULL
) RETURNS TABLE (
    timestamp_point TIMESTAMPTZ,
    entity_state JSONB,
    operation_type TEXT,
    changed_by UUID,
    classification_level security_classification,
    compartments TEXT[],
    clearance_required security_classification
) 
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
    start_time TIMESTAMPTZ := COALESCE(p_from_time, '1970-01-01'::TIMESTAMPTZ);
    end_time TIMESTAMPTZ := COALESCE(p_to_time, now());
    user_clearance security_classification;
    user_compartments TEXT[];
BEGIN
    user_clearance := get_user_clearance();
    
    SELECT ARRAY_AGG(DISTINCT data->>'compartment_name')
    INTO user_compartments
    FROM objects o
    JOIN links l ON l.to_id = o.id AND l.relation = 'compartment_access'
    WHERE l.from_id = NULLIF(current_setting('app.user_id', true), '')::uuid
      AND o.data->>'expires_at' > now()::text;
    
    user_compartments := COALESCE(user_compartments, ARRAY[]::TEXT[]);
    
    RETURN QUERY
    WITH change_points AS (
        -- From entity_versions if available
        SELECT 
            ev.recorded_at as ts,
            ev.snapshot as state,
            'version' as op_type,
            ev.created_by as actor,
            ev.classification as class_level,
            COALESCE(ev.compartment_markings, ARRAY[]::TEXT[]) as comps,
            ev.classification as clearance_req
        FROM entity_versions ev
        WHERE ev.entity_id = p_entity_id
          AND ev.recorded_at BETWEEN start_time AND end_time
          AND ev.organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid
          AND ev.classification <= user_clearance
          AND (ev.compartment_markings IS NULL 
               OR ev.compartment_markings <@ user_compartments 
               OR has_permission_cached('security:override'))
        
        UNION ALL
        
        -- From audit trail
        SELECT 
            at.created_at as ts,
            at.after_state as state,
            at.operation::TEXT as op_type,
            at.actor_id as actor,
            COALESCE(at.nato_compliance_level, 'internal'::security_classification) as class_level,
            COALESCE(at.compartment_context, ARRAY[]::TEXT[]) as comps,
            COALESCE(at.nato_compliance_level, 'internal'::security_classification) as clearance_req
        FROM audit_trail at
        WHERE at.row_id = p_entity_id
          AND at.created_at BETWEEN start_time AND end_time
          AND at.actor_org = NULLIF(current_setting('app.org_id', true), '')::uuid
          AND (at.nato_compliance_level IS NULL OR at.nato_compliance_level <= user_clearance)
          AND (at.compartment_context IS NULL 
               OR at.compartment_context <@ user_compartments 
               OR has_permission_cached('security:override'))
    )
    SELECT cp.ts, cp.state, cp.op_type, cp.actor, cp.class_level, cp.comps, cp.clearance_req
    FROM change_points cp
    ORDER BY cp.ts;
END;
$$;

-- NATO-compliant audit trail analysis
CREATE OR REPLACE FUNCTION get_classified_audit_trail(
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ,
    p_min_classification security_classification DEFAULT 'confidential',
    p_compartment_filter TEXT DEFAULT NULL
) RETURNS TABLE (
    audit_id UUID,
    timestamp_occurred TIMESTAMPTZ,
    operation_type TEXT,
    entity_id UUID,
    actor_id UUID,
    classification_level security_classification,
    compartments TEXT[],
    nato_compliance security_classification,
    physical_location UUID,
    details JSONB
) 
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
    user_clearance security_classification;
BEGIN
    user_clearance := get_user_clearance();
    
    -- Only users with sufficient clearance can query classified audit trails
    IF user_clearance < p_min_classification AND NOT has_permission_cached('security:override') THEN
        RAISE EXCEPTION 'Insufficient clearance for requested classification level';
    END IF;
    
    RETURN QUERY
    SELECT 
        at.id,
        at.created_at,
        at.operation::TEXT,
        at.row_id,
        at.actor_id,
        COALESCE(
            (at.security_context->>'classification')::security_classification,
            'internal'::security_classification
        ) as class_level,
        COALESCE(at.compartment_context, ARRAY[]::TEXT[]),
        at.nato_compliance_level,
        at.physical_location_id,
        jsonb_build_object(
            'before', at.before_state,
            'after', at.after_state,
            'hash', at.current_hash,
            'ip', at.ip_address,
            'user_agent', at.user_agent
        )
    FROM audit_trail at
    WHERE at.created_at BETWEEN p_start_time AND p_end_time
      AND at.actor_org = NULLIF(current_setting('app.org_id', true), '')::uuid
      AND COALESCE(at.nato_compliance_level, 'internal'::security_classification) >= p_min_classification
      AND COALESCE(at.nato_compliance_level, 'internal'::security_classification) <= user_clearance
      AND (p_compartment_filter IS NULL OR p_compartment_filter = ANY(at.compartment_context))
    ORDER BY at.created_at DESC;
END;
$$;

-- Validate audit integrity with NATO compliance tracking
CREATE OR REPLACE FUNCTION validate_classified_audit_integrity(
    p_start_time TIMESTAMPTZ DEFAULT NULL,
    p_end_time TIMESTAMPTZ DEFAULT NULL,
    p_classification security_classification DEFAULT 'secret'
) RETURNS TABLE (
    is_valid BOOLEAN,
    broken_at TIMESTAMPTZ,
    expected_hash TEXT,
    actual_hash TEXT,
    audit_id UUID,
    classification_breach BOOLEAN,
    compartment_violation TEXT[]
) 
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
    start_time TIMESTAMPTZ := COALESCE(p_start_time, now() - INTERVAL '24 hours');
    end_time TIMESTAMPTZ := COALESCE(p_end_time, now());
    user_clearance security_classification;
    prev_hash TEXT := '';
    rec RECORD;
    computed_hash TEXT;
BEGIN
    user_clearance := get_user_clearance();
    
    -- Require high clearance for integrity validation
    IF user_clearance < 'secret'::security_classification AND NOT has_permission_cached('security:override') THEN
        RAISE EXCEPTION 'Secret clearance or higher required for audit integrity validation';
    END IF;
    
    -- Get the hash from just before our start time
    SELECT current_hash INTO prev_hash
    FROM audit_trail 
    WHERE created_at < start_time
      AND actor_org = NULLIF(current_setting('app.org_id', true), '')::uuid
      AND COALESCE(nato_compliance_level, 'internal'::security_classification) <= user_clearance
    ORDER BY created_at DESC 
    LIMIT 1;
    
    prev_hash := COALESCE(prev_hash, '');
    
    FOR rec IN 
        SELECT *
        FROM audit_trail at
        WHERE at.created_at BETWEEN start_time AND end_time
          AND at.actor_org = NULLIF(current_setting('app.org_id', true), '')::uuid
          AND COALESCE(at.nato_compliance_level, 'internal'::security_classification) <= user_clearance
        ORDER BY at.created_at
    LOOP
        -- Compute expected hash (using existing audit_hash function)
        computed_hash := (
            SELECT encode(digest(
                COALESCE(prev_hash,'')::bytea || 
                digest(jsonb_build_object(
                    'tbl', rec.table_name, 
                    'op', rec.operation, 
                    'when', rec.created_at,
                    'who', rec.actor_id, 
                    'org', rec.actor_org,
                    'before', rec.before_state,
                    'after', rec.after_state
                )::text, 'sha256'), 
                'sha256'
            ), 'hex')
        );
        
        -- Check if hash matches
        IF computed_hash != rec.current_hash THEN
            RETURN QUERY SELECT 
                false,
                rec.created_at,
                computed_hash,
                rec.current_hash,
                rec.id,
                false, -- classification breach detection would require more complex logic
                ARRAY[]::TEXT[]; -- compartment violation detection
            RETURN;
        END IF;
        
        prev_hash := rec.current_hash;
    END LOOP;
    
    -- If we get here, integrity is valid
    RETURN QUERY SELECT true, NULL::TIMESTAMPTZ, ''::TEXT, ''::TEXT, NULL::UUID, false, ARRAY[]::TEXT[];
END;
$$;

-- Enhanced entity diff with classification tracking
CREATE OR REPLACE FUNCTION get_classified_entity_diff(
    p_entity_id UUID,
    p_time1 TIMESTAMPTZ,
    p_time2 TIMESTAMPTZ
) RETURNS TABLE (
    field_path TEXT,
    value_at_time1 JSONB,
    value_at_time2 JSONB,
    change_type TEXT,
    classification_change BOOLEAN,
    compartment_change BOOLEAN
) 
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
    state1 JSONB;
    state2 JSONB;
    key TEXT;
    val1 JSONB;
    val2 JSONB;
    class1 security_classification;
    class2 security_classification;
BEGIN
    -- Get states at both times
    SELECT get_entity_at_time(p_entity_id, p_time1) INTO state1;
    SELECT get_entity_at_time(p_entity_id, p_time2) INTO state2;
    
    -- Extract classifications if available
    class1 := COALESCE((state1->>'classification')::security_classification, 'internal');
    class2 := COALESCE((state2->>'classification')::security_classification, 'internal');
    
    -- Handle case where entity didn't exist at one of the times
    IF state1 IS NULL AND state2 IS NOT NULL THEN
        RETURN QUERY SELECT 'entity', NULL::JSONB, state2, 'created', false, false;
        RETURN;
    ELSIF state1 IS NOT NULL AND state2 IS NULL THEN
        RETURN QUERY SELECT 'entity', state1, NULL::JSONB, 'deleted', false, false;
        RETURN;
    ELSIF state1 IS NULL AND state2 IS NULL THEN
        RETURN;
    END IF;
    
    -- Compare all keys from both states
    FOR key IN SELECT DISTINCT jsonb_object_keys(state1) UNION SELECT DISTINCT jsonb_object_keys(state2)
    LOOP
        val1 := state1 -> key;
        val2 := state2 -> key;
        
        IF val1 IS NULL AND val2 IS NOT NULL THEN
            RETURN QUERY SELECT 
                key, val1, val2, 'added',
                (key = 'classification'),
                (key = 'compartment_markings');
        ELSIF val1 IS NOT NULL AND val2 IS NULL THEN
            RETURN QUERY SELECT 
                key, val1, val2, 'removed',
                (key = 'classification'),
                (key = 'compartment_markings');
        ELSIF val1 != val2 THEN
            RETURN QUERY SELECT 
                key, val1, val2, 'modified',
                (key = 'classification'),
                (key = 'compartment_markings');
        END IF;
    END LOOP;
END;
$$;

-- Create NATO-enhanced temporal view
CREATE OR REPLACE VIEW v_temporal_classified_entities AS
SELECT 
    e.id,
    e.organization_id,
    e.type_name,
    e.domain,
    e.classification,
    e.compartment_markings,
    e.data,
    e.created_at,
    e.updated_at,
    e.created_at as valid_from,
    NULL::TIMESTAMPTZ as valid_to,
    now() as recorded_at,
    'current'::TEXT as temporal_status
FROM objects e
WHERE e.organization_id = NULLIF(current_setting('app.org_id', true), '')::uuid
  AND e.classification <= get_user_clearance()
  AND (e.compartment_markings IS NULL 
       OR has_permission_cached('security:override')
       OR EXISTS (
           SELECT 1 FROM objects comp_obj
           JOIN links comp_link ON comp_link.to_id = comp_obj.id
           WHERE comp_link.from_id = NULLIF(current_setting('app.user_id', true), '')::uuid
             AND comp_link.relation = 'compartment_access'
             AND comp_obj.data->>'compartment_name' = ANY(e.compartment_markings)
             AND comp_obj.data->>'expires_at' > now()::text
       ));

-- ============================================================================
-- Usage Notes ============================================================
-- To seed for an organization, execute:
--   SELECT seed_nato_composable_types('<ORG_UUID>'::uuid);
--   SELECT seed_nato_config('<ORG_UUID>'::uuid);
-- Compartment grants:
--   - Create an object (objects) with type_name='compartment_access' and data:
--       {"compartment_name":"NOFORN","access_level":"read","granted_by":"<user>","expires_at":"2030-01-01"}
--   - Link user -> that object in links with relation='compartment_access'.
-- RLS will then enforce both classification and compartment membership.
-- 
-- TEMPORAL QUERIES:
--   - Time travel: SELECT get_entity_at_time(uuid, timestamp);
--   - Change history: SELECT * FROM get_entity_changes(uuid, start_time, end_time);
--   - Replay: SELECT * FROM replay_entity_history(uuid);
--   - Classified audit: SELECT * FROM get_classified_audit_trail(start_time, end_time, 'secret');
-- ============================================================================
