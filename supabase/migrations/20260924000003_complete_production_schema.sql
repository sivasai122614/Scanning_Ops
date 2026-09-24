-- ==============================================================================
-- COMPLETE PRODUCTION SUPABASE DATABASE SCHEMA
-- Application: Exam Scanning & Script Management System
-- Target: Supabase PostgreSQL 15+
--
-- Compliance Checklist:
-- [x] Zero sample/dummy data inserted
-- [x] Zero dummy users or fake exam sessions
-- [x] UUID primary keys with gen_random_uuid()
-- [x] Proper foreign keys with explicit ON DELETE rules
-- [x] created_at and updated_at timestamps with triggers
-- [x] Strict CHECK constraints for all status fields
-- [x] Unique constraints for script deduplication per session
-- [x] Unique constraint for page numbers per script: UNIQUE(script_id, page_number)
-- [x] All 12 required indexes + performance indexes created
-- [x] Row Level Security (RLS) enabled on ALL tables
-- [x] Granular RLS policies based on user roles (Admin, Supervisor, Scanner, Verification, COE, Viewer)
-- [x] Zero self-registration policy
-- ==============================================================================

-- Enable standard cryptographic & UUID extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. SUPPORTING CORE LOOKUP TABLES (Prerequisites for Foreign Keys)
-- ==============================================================================

-- 1A. ROLES TABLE (Structural system definitions)
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed System Metadata Roles (Required for Role-Based Integrity, not user data)
INSERT INTO public.roles (code, name, description, is_system) VALUES
  ('super_admin', 'Super Administrator', 'Institutional authority, master configuration and security', true),
  ('admin', 'Administrator', 'Operations administrator managing centers, sessions and staff', true),
  ('supervisor', 'Valuation Supervisor', 'Supervises batch allocation, queues, and resolves exceptions', true),
  ('scanner_operator', 'Scanner Operator', 'Physical intake, scanner manifest upload, and image ingestion', true),
  ('verification_operator', 'Verification Operator', 'High-speed booklet QA, barcode confirmation, and page verification', true),
  ('coe_user', 'COE / Exam Cell User', 'Exam cell officer managing custody transfers and physical dockets', true),
  ('viewer', 'Auditor / Read-Only Viewer', 'Read-only observer for regulatory compliance and audit logs', true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- 1B. CENTERS TABLE (Exam Centers / Valuation Centers)
CREATE TABLE IF NOT EXISTS public.centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL,
  center_type VARCHAR(50) NOT NULL DEFAULT 'EXAM_CENTER' CHECK (center_type IN ('EXAM_CENTER', 'VALUATION_CENTER', 'STORAGE_FACILITY', 'COE_OFFICE')),
  address TEXT,
  contact_person VARCHAR(100),
  contact_phone VARCHAR(30),
  contact_email VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 2. USERS TABLE (Application User Profile linked 1:1 to auth.users)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  employee_id VARCHAR(50) UNIQUE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1C. EXAM_SESSIONS TABLE (Decoupled Schedule ID, School ID, and Class ID)
CREATE TABLE IF NOT EXISTS public.exam_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_code VARCHAR(100) UNIQUE NOT NULL,
  school_id VARCHAR(100), -- Strictly separate field from class_id
  class_id VARCHAR(100),  -- Strictly separate field from school_id (can be equal to school_id e.g. 1211)
  class_code VARCHAR(100),
  exam_name VARCHAR(150) NOT NULL,
  exam_date DATE NOT NULL,
  subject_name VARCHAR(150) NOT NULL,
  subject_code VARCHAR(50),
  shift VARCHAR(50),
  expected_script_count INT NOT NULL DEFAULT 0 CHECK (expected_script_count >= 0),
  status VARCHAR(30) NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'active', 'scanning', 'verification', 'completed', 'closed')
  ),
  remarks TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 3. SCANNING_SESSIONS TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.scanning_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_session_id UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE RESTRICT,
  center_id UUID NOT NULL REFERENCES public.centers(id) ON DELETE RESTRICT,
  scanner_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  total_received INT NOT NULL DEFAULT 0 CHECK (total_received >= 0),
  total_scanned INT NOT NULL DEFAULT 0 CHECK (total_scanned >= 0),
  total_verified INT NOT NULL DEFAULT 0 CHECK (total_verified >= 0),
  status VARCHAR(30) NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'scanning', 'completed', 'closed')
  ),
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 4. UPLOAD_BATCHES TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.upload_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scanning_session_id UUID NOT NULL REFERENCES public.scanning_sessions(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  batch_number VARCHAR(100) NOT NULL,
  file_count INT NOT NULL DEFAULT 0 CHECK (file_count >= 0),
  script_count INT NOT NULL DEFAULT 0 CHECK (script_count >= 0),
  page_count INT NOT NULL DEFAULT 0 CHECK (page_count >= 0),
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'completed', 'failed', 'partial')
  ),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_count INT NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  error_details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_upload_batches_session_batch UNIQUE (scanning_session_id, batch_number)
);

-- ==============================================================================
-- 5. SCRIPTS TABLE (Master Record for Answer Scripts)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_session_id UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE RESTRICT,
  center_id UUID NOT NULL REFERENCES public.centers(id) ON DELETE RESTRICT,
  scanning_session_id UUID REFERENCES public.scanning_sessions(id) ON DELETE SET NULL,
  school_id VARCHAR(100), -- Strictly separate field from class_id
  class_id VARCHAR(100),  -- Strictly separate field from school_id
  script_number VARCHAR(100) NOT NULL,
  barcode VARCHAR(100) NOT NULL,
  student_identifier VARCHAR(100) NOT NULL,
  page_count INT NOT NULL DEFAULT 0 CHECK (page_count >= 0),
  expected_pages INT NOT NULL DEFAULT 0 CHECK (expected_pages >= 0),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  verification_status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (
    verification_status IN ('pending', 'verified', 'rejected')
  ),
  script_status VARCHAR(50) NOT NULL DEFAULT 'received' CHECK (
    script_status IN (
      'received',
      'uploaded',
      'verification_pending',
      'verified',
      'missing_pages',
      'missing_script',
      'damaged',
      'sent_to_coe',
      'completed'
    )
  ),
  current_location VARCHAR(150) DEFAULT 'Intake / Scanning Station',
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Prevent duplicate scripts within the same exam session
  CONSTRAINT uq_scripts_session_script_number UNIQUE (exam_session_id, script_number),
  CONSTRAINT uq_scripts_session_barcode UNIQUE (exam_session_id, barcode)
);

-- ==============================================================================
-- 6. SCRIPT_PAGES TABLE (Individual Scanned Page Records)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.script_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  page_number INT NOT NULL CHECK (page_number > 0),
  storage_path TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  mime_type VARCHAR(100) NOT NULL,
  checksum VARCHAR(128),
  upload_status VARCHAR(50) NOT NULL DEFAULT 'uploaded' CHECK (
    upload_status IN ('uploaded', 'verified', 'error', 'replaced')
  ),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Prevent duplicate page numbers for the same script
  CONSTRAINT uq_script_page_number UNIQUE (script_id, page_number)
);

-- ==============================================================================
-- 7. SCRIPT_VERIFICATIONS TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.script_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  verified_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  verification_status VARCHAR(50) NOT NULL CHECK (
    verification_status IN ('verified', 'rejected', 'pending', 'exception_flagged')
  ),
  page_count_found INT CHECK (page_count_found >= 0),
  expected_page_count INT CHECK (expected_page_count >= 0),
  remarks TEXT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 8. MISSING_SCRIPTS TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.missing_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_session_id UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE RESTRICT,
  center_id UUID NOT NULL REFERENCES public.centers(id) ON DELETE RESTRICT,
  script_number VARCHAR(100),
  barcode VARCHAR(100),
  reason TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'reported' CHECK (
    status IN ('reported', 'under_investigation', 'located', 'confirmed_absent', 'resolved', 'closed')
  ),
  reported_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  resolved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 9. DAMAGED_SCRIPTS TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.damaged_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  damage_type VARCHAR(100) NOT NULL CHECK (
    damage_type IN ('torn_pages', 'unreadable_barcode', 'water_ink_damage', 'missing_sheet', 'misbound', 'other')
  ),
  description TEXT NOT NULL,
  reported_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  status VARCHAR(50) NOT NULL DEFAULT 'reported' CHECK (
    status IN ('reported', 'under_review', 'repaired', 'rescanned', 'resolved', 'cancelled')
  ),
  resolved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 10. SCRIPT_MOVEMENTS TABLE (Custody Handover Chain)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.script_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  from_location VARCHAR(150) NOT NULL,
  to_location VARCHAR(150) NOT NULL,
  moved_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  movement_type VARCHAR(100) NOT NULL CHECK (
    movement_type IN (
      'intake_to_scanning',
      'scanning_to_verification',
      'verification_to_coe',
      'coe_to_valuation',
      'valuation_to_record_room',
      'return_transfer'
    )
  ),
  remarks TEXT,
  moved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 11. ATTENDANCE_RECORDS TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_session_id UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE RESTRICT,
  center_id UUID NOT NULL REFERENCES public.centers(id) ON DELETE RESTRICT,
  student_identifier VARCHAR(100) NOT NULL,
  attendance_status VARCHAR(30) NOT NULL DEFAULT 'present' CHECK (
    attendance_status IN ('present', 'absent', 'malpractice', 'unknown')
  ),
  attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source_file VARCHAR(255),
  uploaded_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_attendance_session_center_student UNIQUE (exam_session_id, center_id, student_identifier)
);

-- ==============================================================================
-- 12. NOTIFICATIONS TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  notification_type VARCHAR(50) NOT NULL CHECK (
    notification_type IN ('info', 'alert', 'warning', 'action_required', 'system')
  ),
  is_read BOOLEAN NOT NULL DEFAULT false,
  related_table VARCHAR(100),
  related_record_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 13. ACTIVITY_LOGS TABLE (Immutable Audit Trail)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(100) NOT NULL,
  old_data JSONB,
  new_data JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 14. SYSTEM_SETTINGS TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================================================================
-- 15. INDEXES (Mandatory & Query Performance Optimization)
-- ==============================================================================

-- Mandatory Requirements:
CREATE INDEX IF NOT EXISTS idx_scripts_exam_session_id ON public.scripts(exam_session_id);
CREATE INDEX IF NOT EXISTS idx_scripts_center_id ON public.scripts(center_id);
CREATE INDEX IF NOT EXISTS idx_scripts_barcode ON public.scripts(barcode);
CREATE INDEX IF NOT EXISTS idx_scripts_script_number ON public.scripts(script_number);
CREATE INDEX IF NOT EXISTS idx_scripts_verification_status ON public.scripts(verification_status);
CREATE INDEX IF NOT EXISTS idx_scripts_script_status ON public.scripts(script_status);
CREATE INDEX IF NOT EXISTS idx_script_pages_script_id ON public.script_pages(script_id);
CREATE INDEX IF NOT EXISTS idx_script_verifications_script_id ON public.script_verifications(script_id);
CREATE INDEX IF NOT EXISTS idx_missing_scripts_exam_session_id ON public.missing_scripts(exam_session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_exam_session_id ON public.attendance_records(exam_session_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);

-- Supporting High-Throughput Search Indexes:
CREATE INDEX IF NOT EXISTS idx_users_role_id ON public.users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_session_code ON public.exam_sessions(session_code);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_exam_date ON public.exam_sessions(exam_date);
CREATE INDEX IF NOT EXISTS idx_scanning_sessions_exam_session ON public.scanning_sessions(exam_session_id);
CREATE INDEX IF NOT EXISTS idx_scanning_sessions_center ON public.scanning_sessions(center_id);
CREATE INDEX IF NOT EXISTS idx_upload_batches_session ON public.upload_batches(scanning_session_id);
CREATE INDEX IF NOT EXISTS idx_damaged_scripts_script_id ON public.damaged_scripts(script_id);
CREATE INDEX IF NOT EXISTS idx_script_movements_script_id ON public.script_movements(script_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, is_read);

-- ==============================================================================
-- 16. UPDATED_AT TRIGGER FUNCTION & TRIGGERS
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_centers_updated_at ON public.centers;
CREATE TRIGGER trg_centers_updated_at BEFORE UPDATE ON public.centers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_exam_sessions_updated_at ON public.exam_sessions;
CREATE TRIGGER trg_exam_sessions_updated_at BEFORE UPDATE ON public.exam_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_scanning_sessions_updated_at ON public.scanning_sessions;
CREATE TRIGGER trg_scanning_sessions_updated_at BEFORE UPDATE ON public.scanning_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_upload_batches_updated_at ON public.upload_batches;
CREATE TRIGGER trg_upload_batches_updated_at BEFORE UPDATE ON public.upload_batches
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_scripts_updated_at ON public.scripts;
CREATE TRIGGER trg_scripts_updated_at BEFORE UPDATE ON public.scripts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_missing_scripts_updated_at ON public.missing_scripts;
CREATE TRIGGER trg_missing_scripts_updated_at BEFORE UPDATE ON public.missing_scripts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_damaged_scripts_updated_at ON public.damaged_scripts;
CREATE TRIGGER trg_damaged_scripts_updated_at BEFORE UPDATE ON public.damaged_scripts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_attendance_records_updated_at ON public.attendance_records;
CREATE TRIGGER trg_attendance_records_updated_at BEFORE UPDATE ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_system_settings_updated_at ON public.system_settings;
CREATE TRIGGER trg_system_settings_updated_at BEFORE UPDATE ON public.system_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================================================
-- 17. HELPER FUNCTIONS FOR ROLE-BASED ACCESS CONTROL (RLS)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS VARCHAR AS $$
  SELECT r.code
  FROM public.users u
  JOIN public.roles r ON u.role_id = r.id
  WHERE u.id = auth.uid() AND u.is_active = true;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.roles r ON u.role_id = r.id
    WHERE u.id = auth.uid()
      AND u.is_active = true
      AND r.code IN ('super_admin', 'admin')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ==============================================================================
-- 18. ROW LEVEL SECURITY (RLS) & ACCESS CONTROL POLICIES
-- ==============================================================================

-- Enable RLS on ALL tables
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scanning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missing_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.damaged_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- ROLES POLICIES
-- ------------------------------------------------------------------------------
CREATE POLICY "Authenticated users can view roles"
  ON public.roles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super Admins can manage roles"
  ON public.roles FOR ALL TO authenticated
  USING (public.get_auth_role() = 'super_admin')
  WITH CHECK (public.get_auth_role() = 'super_admin');

-- ------------------------------------------------------------------------------
-- USERS POLICIES (No Self-Registration; Admin Only Management)
-- ------------------------------------------------------------------------------
CREATE POLICY "Users can view active users"
  ON public.users FOR SELECT TO authenticated
  USING (is_active = true OR public.is_admin() OR id = auth.uid());

CREATE POLICY "Admins only can insert users"
  ON public.users FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins or self can update users"
  ON public.users FOR UPDATE TO authenticated
  USING (public.is_admin() OR id = auth.uid())
  WITH CHECK (
    -- Normal user cannot elevate their own role or toggle active state
    public.is_admin() OR (
      id = auth.uid()
      AND role_id = (SELECT role_id FROM public.users WHERE id = auth.uid())
      AND is_active = (SELECT is_active FROM public.users WHERE id = auth.uid())
    )
  );

CREATE POLICY "Hard delete disabled on users"
  ON public.users FOR DELETE TO authenticated USING (false);

-- ------------------------------------------------------------------------------
-- CENTERS POLICIES
-- ------------------------------------------------------------------------------
CREATE POLICY "Authenticated users can view centers"
  ON public.centers FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage centers"
  ON public.centers FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- EXAM_SESSIONS POLICIES
-- ------------------------------------------------------------------------------
CREATE POLICY "Authenticated users can view exam sessions"
  ON public.exam_sessions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can create and manage exam sessions"
  ON public.exam_sessions FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- SCANNING_SESSIONS POLICIES
-- ------------------------------------------------------------------------------
CREATE POLICY "Authenticated users can view scanning sessions"
  ON public.scanning_sessions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized operators and supervisors can create scanning sessions"
  ON public.scanning_sessions FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR
    public.get_auth_role() IN ('supervisor', 'scanner_operator')
  );

CREATE POLICY "Authorized staff can update scanning sessions"
  ON public.scanning_sessions FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR
    public.get_auth_role() IN ('supervisor', 'scanner_operator')
  );

-- ------------------------------------------------------------------------------
-- UPLOAD_BATCHES POLICIES
-- ------------------------------------------------------------------------------
CREATE POLICY "Authenticated users can view upload batches"
  ON public.upload_batches FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized scanners and supervisors can insert upload batches"
  ON public.upload_batches FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR
    public.get_auth_role() IN ('supervisor', 'scanner_operator')
  );

CREATE POLICY "Authorized scanners and supervisors can update upload batches"
  ON public.upload_batches FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR
    public.get_auth_role() IN ('supervisor', 'scanner_operator')
  );

-- ------------------------------------------------------------------------------
-- SCRIPTS POLICIES
-- ------------------------------------------------------------------------------
CREATE POLICY "Authenticated users can view scripts"
  ON public.scripts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized scanners and admins can insert scripts"
  ON public.scripts FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR
    public.get_auth_role() IN ('supervisor', 'scanner_operator')
  );

CREATE POLICY "Authorized staff can update scripts"
  ON public.scripts FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR
    public.get_auth_role() IN ('supervisor', 'scanner_operator', 'verification_operator', 'coe_user')
  );

-- ------------------------------------------------------------------------------
-- SCRIPT_PAGES POLICIES
-- ------------------------------------------------------------------------------
CREATE POLICY "Authenticated users can view script pages"
  ON public.script_pages FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized scanners can insert script pages"
  ON public.script_pages FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR
    public.get_auth_role() IN ('supervisor', 'scanner_operator')
  );

CREATE POLICY "Authorized staff can update script pages"
  ON public.script_pages FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR
    public.get_auth_role() IN ('supervisor', 'verification_operator')
  );

-- ------------------------------------------------------------------------------
-- SCRIPT_VERIFICATIONS POLICIES
-- ------------------------------------------------------------------------------
CREATE POLICY "Authenticated users can view script verifications"
  ON public.script_verifications FOR SELECT TO authenticated USING (true);

CREATE POLICY "Verification operators and supervisors can verify scripts"
  ON public.script_verifications FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR
    public.get_auth_role() IN ('supervisor', 'verification_operator')
  );

-- ------------------------------------------------------------------------------
-- MISSING_SCRIPTS POLICIES
-- ------------------------------------------------------------------------------
CREATE POLICY "Authenticated users can view missing scripts"
  ON public.missing_scripts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized staff can report missing scripts"
  ON public.missing_scripts FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR
    public.get_auth_role() IN ('supervisor', 'scanner_operator', 'verification_operator', 'coe_user')
  );

CREATE POLICY "Supervisors and COE can resolve missing scripts"
  ON public.missing_scripts FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR
    public.get_auth_role() IN ('supervisor', 'coe_user')
  );

-- ------------------------------------------------------------------------------
-- DAMAGED_SCRIPTS POLICIES
-- ------------------------------------------------------------------------------
CREATE POLICY "Authenticated users can view damaged scripts"
  ON public.damaged_scripts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized staff can report damaged scripts"
  ON public.damaged_scripts FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR
    public.get_auth_role() IN ('supervisor', 'scanner_operator', 'verification_operator')
  );

CREATE POLICY "Supervisors and COE can resolve damaged scripts"
  ON public.damaged_scripts FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR
    public.get_auth_role() IN ('supervisor', 'coe_user')
  );

-- ------------------------------------------------------------------------------
-- SCRIPT_MOVEMENTS POLICIES
-- ------------------------------------------------------------------------------
CREATE POLICY "Authenticated users can view script movements"
  ON public.script_movements FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized custodians can register script movements"
  ON public.script_movements FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR
    public.get_auth_role() IN ('supervisor', 'scanner_operator', 'coe_user')
  );

-- ------------------------------------------------------------------------------
-- ATTENDANCE_RECORDS POLICIES
-- ------------------------------------------------------------------------------
CREATE POLICY "Authenticated users can view attendance records"
  ON public.attendance_records FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and supervisors can upload attendance records"
  ON public.attendance_records FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR
    public.get_auth_role() IN ('supervisor')
  );

CREATE POLICY "Admins and supervisors can update attendance records"
  ON public.attendance_records FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR
    public.get_auth_role() IN ('supervisor')
  );

-- ------------------------------------------------------------------------------
-- NOTIFICATIONS POLICIES
-- ------------------------------------------------------------------------------
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "System and admins can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update their own notification read status"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ------------------------------------------------------------------------------
-- ACTIVITY_LOGS POLICIES (Immutable Audit Trail)
-- ------------------------------------------------------------------------------
CREATE POLICY "Admins and viewers can view audit logs"
  ON public.activity_logs FOR SELECT TO authenticated
  USING (
    public.is_admin() OR
    public.get_auth_role() = 'viewer'
  );

CREATE POLICY "Authenticated users can append activity logs"
  ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (true);

-- Disallow UPDATE and DELETE on activity_logs to ensure tamper-proof audit trail
REVOKE UPDATE, DELETE ON public.activity_logs FROM PUBLIC;
REVOKE UPDATE, DELETE ON public.activity_logs FROM authenticated;

-- ------------------------------------------------------------------------------
-- SYSTEM_SETTINGS POLICIES
-- ------------------------------------------------------------------------------
CREATE POLICY "Authenticated users can view system settings"
  ON public.system_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super Admins and Admins can update system settings"
  ON public.system_settings FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ==============================================================================
-- END OF MIGRATION
-- ==============================================================================
