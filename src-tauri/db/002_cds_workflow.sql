-- =====================================================================
-- NODUS DATABASE MODULE
-- 002_cds_workflow.sql
-- Cross-Domain Solution (CDS) workflow and 2-person integrity approvals
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS cds_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  logical_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('upgrade','downgrade')),
  from_level classification_level NOT NULL,
  to_level   classification_level NOT NULL,
  from_compartments text[] NOT NULL DEFAULT '{}',
  to_compartments   text[] NOT NULL DEFAULT '{}',
  justification text,
  sanitization_profile text,
  status text NOT NULL DEFAULT 'pending',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_cds_req_status ON cds_requests(status);
CREATE INDEX IF NOT EXISTS ix_cds_req_logical ON cds_requests(logical_id);

CREATE TABLE IF NOT EXISTS cds_approvals (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id uuid NOT NULL REFERENCES cds_requests(id) ON DELETE CASCADE,
  approver_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approve','reject')),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_cds_appr_req ON cds_approvals(request_id);

CREATE TABLE IF NOT EXISTS cds_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id uuid NOT NULL REFERENCES cds_requests(id) ON DELETE CASCADE,
  event text NOT NULL,          -- requested|approved|rejected|completed
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
