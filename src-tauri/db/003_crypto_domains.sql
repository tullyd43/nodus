-- =====================================================================
-- NODUS DATABASE MODULE
-- 003_crypto_domains.sql
-- Per-classification cryptographic key domains and policies
-- Implements cryptographic separation between classification levels
-- =====================================================================

BEGIN;

-- === ENUM: Crypto Algorithm Policy ===================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'crypto_algorithm') THEN
    CREATE TYPE crypto_algorithm AS ENUM (
      'AES-256-GCM',
      'CHACHA20-POLY1305',
      'SUITE-B',
      'ARGON2+AES',
      'CUSTOM'
    );
  END IF;
END$$;

-- === TABLE: crypto_domains ===========================================
CREATE TABLE IF NOT EXISTS crypto_domains (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  classification classification_level NOT NULL,
  compartments text[] NOT NULL DEFAULT '{}',
  algorithm crypto_algorithm NOT NULL DEFAULT 'AES-256-GCM',
  kms_key_id text NOT NULL,
  rotation_interval_days int NOT NULL DEFAULT 180,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_crypto_domain_unique
  ON crypto_domains(classification, compartments);

COMMENT ON TABLE crypto_domains IS
  'Defines cryptographic separation between classification/compartment domains.';

-- === TABLE: crypto_key_versions ======================================
CREATE TABLE IF NOT EXISTS crypto_key_versions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id uuid NOT NULL REFERENCES crypto_domains(id) ON DELETE CASCADE,
  version int NOT NULL,
  kms_key_arn text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  retired_at timestamptz,
  is_active boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_crypto_key_versions_unique
  ON crypto_key_versions(domain_id, version);

-- === TABLE: crypto_operations_audit =================================
CREATE TABLE IF NOT EXISTS crypto_operations_audit (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id uuid NOT NULL REFERENCES crypto_domains(id) ON DELETE CASCADE,
  operation text NOT NULL CHECK (operation IN ('encrypt','decrypt','rotate','revoke')),
  classification classification_level NOT NULL,
  actor_id uuid,
  result text NOT NULL DEFAULT 'success',
  details jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE crypto_operations_audit IS
  'Audit trail for cryptographic operations by classification domain.';

-- === FUNCTION: Register or fetch domain =============================
CREATE OR REPLACE FUNCTION ensure_crypto_domain(_class text, _comps text[])
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  did uuid;
BEGIN
  SELECT id INTO did FROM crypto_domains
   WHERE classification = _class::classification_level
     AND compartments = _comps LIMIT 1;

  IF did IS NULL THEN
    INSERT INTO crypto_domains (classification, compartments, algorithm, kms_key_id)
      VALUES (_class::classification_level, _comps, 'AES-256-GCM', 'placeholder')
      RETURNING id INTO did;
  END IF;

  RETURN did;
END$$;

-- === Seed Default Domains ===========================================
INSERT INTO crypto_domains (classification, compartments, algorithm, kms_key_id)
SELECT lvl, '{}', 'AES-256-GCM', 'default-'||lvl
FROM (VALUES ('unclassified'),('confidential'),('secret'),('nato_secret')) AS l(lvl)
ON CONFLICT (classification, compartments) DO NOTHING;

COMMIT;
