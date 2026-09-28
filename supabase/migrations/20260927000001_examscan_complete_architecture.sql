-- ==============================================================================
-- MIGRATION: 20260927000001_examscan_complete_architecture.sql
-- Purpose: Complete 4-Table Architecture & Pending Scan Records
-- 1. import_inwarded_data (Excel imported expected dataset)
-- 2. manual_inwarded_data (Manual script intake by operators)
-- 3. scan_sessions        (Active Bundle Scan sessions)
-- 4. saved_scanned_data   (Finalized scanned booklet records after pressing SAVE)
-- 5. scan_session_items   (Pending / Staged scan items prior to SAVE)
-- Target: Supabase PostgreSQL 15+
-- ==============================================================================

-- Enable standard cryptographic & UUID extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- TABLE 1: import_inwarded_data
-- Stores records imported from Excel. Represents the EXPECTED booklet dataset.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.import_inwarded_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_session_id VARCHAR(100),
  college_name VARCHAR(255) NOT NULL,
  university_name VARCHAR(255),
  class_id VARCHAR(100) NOT NULL,
  sch_id VARCHAR(100),
  member_id VARCHAR(100) NOT NULL,
  barcode VARCHAR(255),
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure optional columns exist if table was already created
ALTER TABLE public.import_inwarded_data ADD COLUMN IF NOT EXISTS sch_id VARCHAR(100);
ALTER TABLE public.import_inwarded_data ADD COLUMN IF NOT EXISTS barcode VARCHAR(255);
ALTER TABLE public.import_inwarded_data ADD COLUMN IF NOT EXISTS university_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_imp_inwarded_college ON public.import_inwarded_data(college_name);
CREATE INDEX IF NOT EXISTS idx_imp_inwarded_session ON public.import_inwarded_data(import_session_id);
CREATE INDEX IF NOT EXISTS idx_imp_inwarded_class ON public.import_inwarded_data(class_id);
CREATE INDEX IF NOT EXISTS idx_imp_inwarded_member ON public.import_inwarded_data(member_id);
CREATE INDEX IF NOT EXISTS idx_imp_inwarded_barcode ON public.import_inwarded_data(barcode);
CREATE INDEX IF NOT EXISTS idx_imp_inwarded_class_member ON public.import_inwarded_data(class_id, member_id);

-- Enforce Uniqueness: Exactly 1 record per (college_name, class_id, member_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_import_inwarded_college_class_member'
  ) THEN
    ALTER TABLE public.import_inwarded_data 
      ADD CONSTRAINT uq_import_inwarded_college_class_member 
      UNIQUE (college_name, class_id, member_id);
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Backward compatibility alias
CREATE OR REPLACE VIEW public.imported_inward_data AS 
  SELECT id, import_session_id, college_name, university_name, class_id, sch_id, member_id, barcode, created_by, created_at 
  FROM public.import_inwarded_data;

-- ==============================================================================
-- TABLE 2: manual_inwarded_data
-- Stores records that are manually inwarded/added by an operator.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.manual_inwarded_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_name VARCHAR(255) NOT NULL,
  class_id VARCHAR(100) NOT NULL,
  member_id VARCHAR(100) NOT NULL,
  source VARCHAR(50) NOT NULL DEFAULT 'MANUAL',
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_manual_inwarded_college ON public.manual_inwarded_data(college_name);
CREATE INDEX IF NOT EXISTS idx_manual_inwarded_class ON public.manual_inwarded_data(class_id);
CREATE INDEX IF NOT EXISTS idx_manual_inwarded_member ON public.manual_inwarded_data(member_id);
CREATE INDEX IF NOT EXISTS idx_manual_inwarded_class_member ON public.manual_inwarded_data(class_id, member_id);

CREATE OR REPLACE VIEW public.manual_inward_data AS 
  SELECT * FROM public.manual_inwarded_data;

-- ==============================================================================
-- TABLE 3: scan_sessions
-- Represents an active Bundle Scan / scanning session.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.scan_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_name VARCHAR(255) NOT NULL,
  import_session_id VARCHAR(100),
  class_id VARCHAR(100) NOT NULL,
  started_by VARCHAR(255),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SAVED', 'COMPLETED')),
  saved_at TIMESTAMPTZ,
  saved_by VARCHAR(255),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.scan_sessions ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_scan_sessions_college ON public.scan_sessions(college_name);
CREATE INDEX IF NOT EXISTS idx_scan_sessions_class ON public.scan_sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_scan_sessions_status ON public.scan_sessions(status);
CREATE INDEX IF NOT EXISTS idx_scan_sessions_import_sess ON public.scan_sessions(import_session_id);

-- Enforce Uniqueness: One active session per (college_name, class_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_scan_sessions_college_class'
  ) THEN
    ALTER TABLE public.scan_sessions 
      ADD CONSTRAINT uq_scan_sessions_college_class 
      UNIQUE (college_name, class_id);
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ==============================================================================
-- TABLE 4: saved_scanned_data
-- Stores FINAL SCANNED RECORDS after the operator presses SAVE.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.saved_scanned_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_session_id VARCHAR(100),
  import_session_id VARCHAR(100),
  college_name VARCHAR(255) NOT NULL,
  class_id VARCHAR(100) NOT NULL,
  sch_id VARCHAR(100),
  member_id VARCHAR(100) NOT NULL,
  barcode VARCHAR(255),
  scanned_by VARCHAR(255),
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  saved_by VARCHAR(255) NOT NULL,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status VARCHAR(50) NOT NULL DEFAULT 'SAVED'
);

ALTER TABLE public.saved_scanned_data ADD COLUMN IF NOT EXISTS sch_id VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_saved_scanned_college ON public.saved_scanned_data(college_name);
CREATE INDEX IF NOT EXISTS idx_saved_scanned_class ON public.saved_scanned_data(class_id);
CREATE INDEX IF NOT EXISTS idx_saved_scanned_member ON public.saved_scanned_data(member_id);
CREATE INDEX IF NOT EXISTS idx_saved_scanned_class_member ON public.saved_scanned_data(class_id, member_id);
CREATE INDEX IF NOT EXISTS idx_saved_scanned_barcode ON public.saved_scanned_data(barcode);
CREATE INDEX IF NOT EXISTS idx_saved_scanned_saved_at ON public.saved_scanned_data(saved_at);
CREATE INDEX IF NOT EXISTS idx_saved_scanned_session ON public.saved_scanned_data(scan_session_id);

-- Enforce Uniqueness: Logical identity: college_name + class_id + member_id (cannot be saved twice)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_saved_scanned_college_class_member'
  ) THEN
    ALTER TABLE public.saved_scanned_data 
      ADD CONSTRAINT uq_saved_scanned_college_class_member 
      UNIQUE (college_name, class_id, member_id);
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ==============================================================================
-- TABLE 5: scan_session_items (Pending Scan Records prior to SAVE)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.scan_session_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_session_id VARCHAR(100),
  class_id VARCHAR(100) NOT NULL,
  member_id VARCHAR(100) NOT NULL,
  barcode VARCHAR(255),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  detected_by VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING_SAVE' CHECK (status IN ('PENDING_SAVE', 'SAVED', 'REJECTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scan_items_session ON public.scan_session_items(scan_session_id);
CREATE INDEX IF NOT EXISTS idx_scan_items_class_member ON public.scan_session_items(class_id, member_id);
CREATE INDEX IF NOT EXISTS idx_scan_items_status ON public.scan_session_items(status);

-- ==============================================================================
-- SUPABASE REALTIME REPLICATION CONFIGURATION
-- ==============================================================================
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.import_inwarded_data;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.saved_scanned_data;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.scan_sessions;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.scan_session_items;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.import_inwarded_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_inwarded_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_scanned_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_session_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on import_inwarded_data" ON public.import_inwarded_data;
CREATE POLICY "Allow all on import_inwarded_data" ON public.import_inwarded_data FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on manual_inwarded_data" ON public.manual_inwarded_data;
CREATE POLICY "Allow all on manual_inwarded_data" ON public.manual_inwarded_data FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on scan_sessions" ON public.scan_sessions;
CREATE POLICY "Allow all on scan_sessions" ON public.scan_sessions FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on saved_scanned_data" ON public.saved_scanned_data;
CREATE POLICY "Allow all on saved_scanned_data" ON public.saved_scanned_data FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on scan_session_items" ON public.scan_session_items;
CREATE POLICY "Allow all on scan_session_items" ON public.scan_session_items FOR ALL TO public USING (true) WITH CHECK (true);
