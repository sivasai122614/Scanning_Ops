-- ==============================================================================
-- MIGRATION: 20260924000004_create_imported_table.sql
-- Purpose: Dedicated imported records table for Excel inwarding & high-speed barcode scanning
-- Target: Supabase PostgreSQL 15+
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.imported (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id VARCHAR(100) NOT NULL,
  member_id VARCHAR(100) NOT NULL,
  barcode VARCHAR(255),
  scan_status VARCHAR(50) NOT NULL DEFAULT 'not_started' CHECK (scan_status IN ('not_started', 'started', 'completed')),
  scanned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- High-performance indexes for large dataset scale (1,000 to 100,000+ records)
CREATE INDEX IF NOT EXISTS idx_imported_class_id ON public.imported(class_id);
CREATE INDEX IF NOT EXISTS idx_imported_member_id ON public.imported(member_id);
CREATE INDEX IF NOT EXISTS idx_imported_barcode ON public.imported(barcode);
CREATE INDEX IF NOT EXISTS idx_imported_scan_status ON public.imported(scan_status);
CREATE INDEX IF NOT EXISTS idx_imported_class_status ON public.imported(class_id, scan_status);

-- Enable Row Level Security (RLS)
ALTER TABLE public.imported ENABLE ROW LEVEL SECURITY;

-- Allow read & write access for authenticated users & system anon
CREATE POLICY "Allow public read access to imported" 
  ON public.imported FOR SELECT 
  USING (true);

CREATE POLICY "Allow public insert access to imported" 
  ON public.imported FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Allow public update access to imported" 
  ON public.imported FOR UPDATE 
  USING (true);

CREATE POLICY "Allow public delete access to imported" 
  ON public.imported FOR DELETE 
  USING (true);
