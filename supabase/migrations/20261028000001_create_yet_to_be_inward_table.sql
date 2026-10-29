-- ==============================================================================
-- MIGRATION: 20261028000001_create_yet_to_be_inward_table.sql
-- Purpose: Dedicated Pending Booklets table ("yet_to_be_inward")
-- 1. When admin imports Excel data, records are inserted into imported_inward_data AND yet_to_be_inward.
-- 2. When a booklet is inwarded (scanned or manual), it is deleted from yet_to_be_inward and saved to saved_scanned_data.
-- 3. Pending booklets count is read directly from yet_to_be_inward table.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.yet_to_be_inward (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_session_id VARCHAR(100),
  college_name VARCHAR(255) DEFAULT 'VIT',
  university_name VARCHAR(255) DEFAULT 'VIT',
  class_id VARCHAR(100) NOT NULL,
  sch_id VARCHAR(100),
  member_id VARCHAR(100) NOT NULL,
  barcode VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Fast lookup indexes
CREATE INDEX IF NOT EXISTS idx_yet_to_be_inward_class_id ON public.yet_to_be_inward(class_id);
CREATE INDEX IF NOT EXISTS idx_yet_to_be_inward_member_id ON public.yet_to_be_inward(member_id);
CREATE INDEX IF NOT EXISTS idx_yet_to_be_inward_barcode ON public.yet_to_be_inward(barcode);
CREATE INDEX IF NOT EXISTS idx_yet_to_be_inward_uni ON public.yet_to_be_inward(university_name);
CREATE INDEX IF NOT EXISTS idx_yet_to_be_inward_class_mem ON public.yet_to_be_inward(class_id, member_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.yet_to_be_inward ENABLE ROW LEVEL SECURITY;

-- Allow public read & write access for operational staff
DROP POLICY IF EXISTS "Allow all on yet_to_be_inward" ON public.yet_to_be_inward;
CREATE POLICY "Allow all on yet_to_be_inward" 
  ON public.yet_to_be_inward FOR ALL 
  TO public 
  USING (true) 
  WITH CHECK (true);

-- Auto-populate yet_to_be_inward from existing imported_inward_data excluding already saved members
INSERT INTO public.yet_to_be_inward (id, import_session_id, university_name, college_name, class_id, member_id, barcode, created_at)
SELECT 
  COALESCE(i.id, gen_random_uuid()), 
  i.import_session_id, 
  COALESCE(i.university_name, 'VIT'), 
  COALESCE(i.university_name, 'VIT'), 
  i.class_id, 
  i.member_id, 
  i.barcode, 
  now()
FROM public.imported_inward_data i
WHERE NOT EXISTS (
  SELECT 1 FROM public.saved_scanned_data s 
  WHERE LOWER(s.class_id) = LOWER(i.class_id) AND LOWER(s.member_id) = LOWER(i.member_id)
)
ON CONFLICT (id) DO NOTHING;
