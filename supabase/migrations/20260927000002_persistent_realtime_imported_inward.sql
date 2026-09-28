-- ==============================================================================
-- MIGRATION: 20260927000002_persistent_realtime_imported_inward.sql
-- Purpose: Fully persistent, real-time Supabase backend flow
-- 1. imported_inward   (Expected original Excel inward data)
-- 2. scan_sessions     (Persistent scanning sessions with session_id, user_id, status)
-- 3. saved_scan_data   (Finalized saved scan records tied to imported_inward_id & session_id)
-- 4. scan_session_items (Realtime staged scans prior to batch commit)
-- 5. Full Realtime Publication enabling
-- ==============================================================================

-- 1. TABLE: imported_inward
CREATE TABLE IF NOT EXISTS public.imported_inward (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id VARCHAR(100) NOT NULL,
  import_session_id VARCHAR(100),
  college_name VARCHAR(255) NOT NULL DEFAULT 'General University',
  university_name VARCHAR(255),
  class_id VARCHAR(100) NOT NULL,
  sch_id VARCHAR(100),
  mem_id VARCHAR(100) NOT NULL,
  member_id VARCHAR(100) NOT NULL,
  barcode VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'EXPECTED',
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup indexes
CREATE INDEX IF NOT EXISTS idx_imported_inward_batch ON public.imported_inward(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_imported_inward_class ON public.imported_inward(class_id);
CREATE INDEX IF NOT EXISTS idx_imported_inward_mem ON public.imported_inward(mem_id);
CREATE INDEX IF NOT EXISTS idx_imported_inward_member ON public.imported_inward(member_id);
CREATE INDEX IF NOT EXISTS idx_imported_inward_barcode ON public.imported_inward(barcode);
CREATE INDEX IF NOT EXISTS idx_imported_inward_college ON public.imported_inward(college_name);
CREATE INDEX IF NOT EXISTS idx_imported_inward_class_mem ON public.imported_inward(class_id, mem_id);

-- Enforce logical uniqueness per import batch / session + class_id + mem_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_imported_inward_batch_class_mem'
  ) THEN
    ALTER TABLE public.imported_inward 
      ADD CONSTRAINT uq_imported_inward_batch_class_mem 
      UNIQUE (import_batch_id, class_id, mem_id);
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 2. TABLE: scan_sessions
CREATE TABLE IF NOT EXISTS public.scan_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(100) UNIQUE NOT NULL,
  user_id VARCHAR(255),
  started_by VARCHAR(255),
  college_name VARCHAR(255) NOT NULL DEFAULT 'General University',
  import_batch_id VARCHAR(100),
  import_session_id VARCHAR(100),
  class_id VARCHAR(100),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SAVED', 'COMPLETED', 'CLOSED')),
  saved_at TIMESTAMPTZ,
  saved_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scan_sess_session_id ON public.scan_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_scan_sess_class_id ON public.scan_sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_scan_sess_status ON public.scan_sessions(status);
CREATE INDEX IF NOT EXISTS idx_scan_sess_college ON public.scan_sessions(college_name);

-- 3. TABLE: saved_scan_data
CREATE TABLE IF NOT EXISTS public.saved_scan_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(100) NOT NULL,
  imported_inward_id UUID REFERENCES public.imported_inward(id) ON DELETE SET NULL,
  college_name VARCHAR(255) NOT NULL DEFAULT 'General University',
  import_batch_id VARCHAR(100),
  class_id VARCHAR(100) NOT NULL,
  sch_id VARCHAR(100),
  mem_id VARCHAR(100) NOT NULL,
  member_id VARCHAR(100) NOT NULL,
  barcode VARCHAR(255) NOT NULL,
  scanned_by VARCHAR(255) NOT NULL,
  user_id VARCHAR(255),
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  saved_by VARCHAR(255),
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status VARCHAR(50) NOT NULL DEFAULT 'SAVED'
);

CREATE INDEX IF NOT EXISTS idx_saved_scan_session ON public.saved_scan_data(session_id);
CREATE INDEX IF NOT EXISTS idx_saved_scan_inward_id ON public.saved_scan_data(imported_inward_id);
CREATE INDEX IF NOT EXISTS idx_saved_scan_class ON public.saved_scan_data(class_id);
CREATE INDEX IF NOT EXISTS idx_saved_scan_mem ON public.saved_scan_data(mem_id);
CREATE INDEX IF NOT EXISTS idx_saved_scan_barcode ON public.saved_scan_data(barcode);
CREATE INDEX IF NOT EXISTS idx_saved_scan_college ON public.saved_scan_data(college_name);
CREATE INDEX IF NOT EXISTS idx_saved_scan_class_mem ON public.saved_scan_data(class_id, mem_id);

-- Enforce uniqueness of saved scan per college + class + member
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_saved_scan_college_class_mem'
  ) THEN
    ALTER TABLE public.saved_scan_data 
      ADD CONSTRAINT uq_saved_scan_college_class_mem 
      UNIQUE (college_name, class_id, mem_id);
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 4. TABLE: scan_session_items (Staged scan items before final batch save)
CREATE TABLE IF NOT EXISTS public.scan_session_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_session_id VARCHAR(100),
  session_id VARCHAR(100),
  class_id VARCHAR(100) NOT NULL,
  sch_id VARCHAR(100),
  mem_id VARCHAR(100) NOT NULL,
  member_id VARCHAR(100) NOT NULL,
  barcode VARCHAR(255),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  detected_by VARCHAR(255),
  user_id VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING_SAVE' CHECK (status IN ('PENDING_SAVE', 'SAVED', 'REJECTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scan_items_sess_id ON public.scan_session_items(session_id);
CREATE INDEX IF NOT EXISTS idx_scan_items_class_mem ON public.scan_session_items(class_id, mem_id);

-- Compatibility views & aliases so previous table names continue to function transparently
CREATE OR REPLACE VIEW public.import_inwarded_data AS 
  SELECT id, import_batch_id AS import_session_id, college_name, university_name, class_id, member_id, created_by, created_at 
  FROM public.imported_inward;

CREATE OR REPLACE VIEW public.imported_inward_data AS 
  SELECT id, import_batch_id AS import_session_id, college_name, university_name, class_id, member_id, created_by, created_at 
  FROM public.imported_inward;

CREATE OR REPLACE VIEW public.saved_scanned_data AS 
  SELECT id, session_id AS scan_session_id, import_batch_id AS import_session_id, college_name, class_id, member_id, barcode, scanned_by, scanned_at, saved_by, saved_at, status 
  FROM public.saved_scan_data;

-- ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.imported_inward ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_scan_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_session_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on imported_inward" ON public.imported_inward;
CREATE POLICY "Allow all on imported_inward" ON public.imported_inward FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on scan_sessions" ON public.scan_sessions;
CREATE POLICY "Allow all on scan_sessions" ON public.scan_sessions FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on saved_scan_data" ON public.saved_scan_data;
CREATE POLICY "Allow all on saved_scan_data" ON public.saved_scan_data FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on scan_session_items" ON public.scan_session_items;
CREATE POLICY "Allow all on scan_session_items" ON public.scan_session_items FOR ALL TO public USING (true) WITH CHECK (true);

-- ENABLE SUPABASE REALTIME REPLICATION
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.imported_inward;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.saved_scan_data;
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
