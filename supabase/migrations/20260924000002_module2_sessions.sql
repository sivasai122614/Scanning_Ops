-- ==============================================================================
-- MODULE 2: SESSION MANAGEMENT MIGRATION
-- Database Target: Supabase PostgreSQL 15+
-- ==============================================================================

-- 1. SESSIONS TABLE
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_code VARCHAR(50) UNIQUE NOT NULL,
  exam_name VARCHAR(150) NOT NULL,
  exam_code VARCHAR(50) NOT NULL,
  exam_date DATE NOT NULL,
  subject VARCHAR(150) NOT NULL,
  shift VARCHAR(50) NOT NULL,
  expected_script_count INT NOT NULL CHECK (expected_script_count > 0),
  received_scripts INT NOT NULL DEFAULT 0 CHECK (received_scripts >= 0),
  scanned_scripts INT NOT NULL DEFAULT 0 CHECK (scanned_scripts >= 0),
  verified_scripts INT NOT NULL DEFAULT 0 CHECK (verified_scripts >= 0),
  status VARCHAR(30) NOT NULL DEFAULT 'Draft' CHECK (
    status IN ('Draft', 'Ready', 'Scanning', 'Verification', 'Completed', 'Archived')
  ),
  description TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_expected_script_limits CHECK (
    expected_script_count >= received_scripts AND
    expected_script_count >= scanned_scripts AND
    expected_script_count >= verified_scripts
  )
);

-- 2. INDEXES
CREATE INDEX IF NOT EXISTS idx_sessions_session_code ON public.sessions(session_code);
CREATE INDEX IF NOT EXISTS idx_sessions_exam_date ON public.sessions(exam_date);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON public.sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON public.sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_created_by ON public.sessions(created_by);

-- 3. SERVER-SIDE UNIQUE SESSION CODE GENERATOR TRIGGER
CREATE OR REPLACE FUNCTION public.generate_session_code()
RETURNS TRIGGER AS $$
DECLARE
  date_str VARCHAR(8);
  seq_num INT;
  new_code VARCHAR(50);
BEGIN
  IF NEW.session_code IS NULL OR NEW.session_code = '' THEN
    date_str := to_char(NEW.exam_date, 'YYYYMMDD');
    SELECT COALESCE(COUNT(*), 0) + 1 INTO seq_num
    FROM public.sessions
    WHERE exam_date = NEW.exam_date;
    
    new_code := 'SES-' || date_str || '-' || LPAD(seq_num::text, 4, '0');
    WHILE EXISTS (SELECT 1 FROM public.sessions WHERE session_code = new_code) LOOP
      seq_num := seq_num + 1;
      new_code := 'SES-' || date_str || '-' || LPAD(seq_num::text, 4, '0');
    END LOOP;
    NEW.session_code := new_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_session_code ON public.sessions;
CREATE TRIGGER trg_generate_session_code
BEFORE INSERT ON public.sessions
FOR EACH ROW
EXECUTE FUNCTION public.generate_session_code();

-- 4. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- SELECT Policy
CREATE POLICY "Authenticated users with read access can view sessions"
  ON public.sessions FOR SELECT
  TO authenticated
  USING (
    auth.has_permission('sessions:read') OR
    auth.get_user_role() IN ('super_admin', 'admin', 'supervisor', 'scanner_operator', 'verification_operator', 'coe_user', 'viewer')
  );

-- INSERT Policy
CREATE POLICY "Authorized administrators and supervisors can create sessions"
  ON public.sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.has_permission('sessions:create') OR
    auth.get_user_role() IN ('super_admin', 'admin', 'supervisor')
  );

-- UPDATE Policy
CREATE POLICY "Authorized administrators and supervisors can update sessions"
  ON public.sessions FOR UPDATE
  TO authenticated
  USING (
    auth.has_permission('sessions:update') OR
    auth.get_user_role() IN ('super_admin', 'admin', 'supervisor')
  )
  WITH CHECK (
    auth.has_permission('sessions:update') OR
    auth.get_user_role() IN ('super_admin', 'admin', 'supervisor')
  );

-- Prevent hard DELETE: Application enforces archiving
CREATE POLICY "Disallow hard delete on sessions"
  ON public.sessions FOR DELETE
  TO authenticated
  USING (false);
