CREATE TABLE IF NOT EXISTS objects_polyinstantiated (
  logical_id UUID NOT NULL,
  classification_level TEXT NOT NULL,
  instance_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (logical_id, classification_level)
);
CREATE INDEX IF NOT EXISTS idx_polyinst_logical ON objects_polyinstantiated(logical_id);
CREATE INDEX IF NOT EXISTS idx_polyinst_classification ON objects_polyinstantiated(classification_level);

