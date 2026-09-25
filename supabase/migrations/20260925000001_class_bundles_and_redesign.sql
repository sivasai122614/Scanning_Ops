-- ==============================================================================
-- MIGRATION: 20260925000001_class_bundles_and_redesign.sql
-- Purpose: Class-Wise Bundle Workflow & Session Statistics
-- Target: Supabase PostgreSQL 15+
-- ==============================================================================

-- 1. Table: class_bundles
CREATE TABLE IF NOT EXISTS public.class_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(100),
  university_name VARCHAR(255) NOT NULL,
  class_id VARCHAR(100) NOT NULL,
  expected_count INT NOT NULL DEFAULT 0 CHECK (expected_count >= 0),
  received_count INT NOT NULL DEFAULT 0 CHECK (received_count >= 0),
  missing_count INT NOT NULL DEFAULT 0 CHECK (missing_count >= 0),
  status VARCHAR(50) NOT NULL DEFAULT 'NOT STARTED' CHECK (status IN ('NOT STARTED', 'IN PROGRESS', 'PARTIAL / SAVED', 'COMPLETED')),
  is_saved BOOLEAN NOT NULL DEFAULT false,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  saved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_session_class UNIQUE (session_id, class_id)
);

-- Fast lookup indexes
CREATE INDEX IF NOT EXISTS idx_class_bundles_class_id ON public.class_bundles(class_id);
CREATE INDEX IF NOT EXISTS idx_class_bundles_session_id ON public.class_bundles(session_id);
CREATE INDEX IF NOT EXISTS idx_class_bundles_status ON public.class_bundles(status);
CREATE INDEX IF NOT EXISTS idx_class_bundles_university ON public.class_bundles(university_name);

-- Enable RLS and public access policies
ALTER TABLE public.class_bundles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on class_bundles" ON public.class_bundles;
CREATE POLICY "Allow all on class_bundles" ON public.class_bundles FOR ALL TO public USING (true) WITH CHECK (true);

-- Ensure imported_inward_data and imported tables have bundle_id and saved_at columns if not present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'imported_inward_data') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'imported_inward_data' AND column_name = 'bundle_id') THEN
      ALTER TABLE public.imported_inward_data ADD COLUMN bundle_id UUID REFERENCES public.class_bundles(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'imported_inward_data' AND column_name = 'saved_at') THEN
      ALTER TABLE public.imported_inward_data ADD COLUMN saved_at TIMESTAMPTZ;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'imported') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'imported' AND column_name = 'bundle_id') THEN
      ALTER TABLE public.imported ADD COLUMN bundle_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'imported' AND column_name = 'saved_at') THEN
      ALTER TABLE public.imported ADD COLUMN saved_at TIMESTAMPTZ;
    END IF;
  END IF;
END $$;
