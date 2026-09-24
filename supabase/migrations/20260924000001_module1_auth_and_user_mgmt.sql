-- ==============================================================================
-- MODULE 1: AUTHENTICATION & USER MANAGEMENT MIGRATION
-- Database Target: Supabase PostgreSQL 15+
-- ==============================================================================

-- 1. ROLES TABLE
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. PERMISSIONS TABLE
CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(100) UNIQUE NOT NULL,
  module VARCHAR(50) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. ROLE_PERMISSIONS JUNCTION TABLE
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_role_permission UNIQUE (role_id, permission_id)
);

-- 4. PROFILES TABLE (Linked 1:1 to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  badge_number VARCHAR(50) UNIQUE,
  phone VARCHAR(30),
  department VARCHAR(100) DEFAULT 'Valuation Directorate',
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DEACTIVATED')),
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.profiles(id),
  updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. AUDIT LOGS TABLE (Append-Only Immutable)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_email VARCHAR(255),
  actor_role VARCHAR(50),
  action VARCHAR(80) NOT NULL,
  entity_name VARCHAR(60) NOT NULL,
  entity_id VARCHAR(100) NOT NULL,
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. INDEXES
CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON public.profiles(role_id);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_badge_number ON public.profiles(badge_number);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_name, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- ==============================================================================
-- 7. HELPER FUNCTIONS FOR RLS
-- ==============================================================================

CREATE OR REPLACE FUNCTION auth.get_user_role()
RETURNS VARCHAR AS $$
  SELECT r.code 
  FROM public.profiles p
  JOIN public.roles r ON p.role_id = r.id
  WHERE p.id = auth.uid() AND p.status = 'ACTIVE';
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth.has_permission(perm_code VARCHAR)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.profiles p
    JOIN public.role_permissions rp ON p.role_id = rp.role_id
    JOIN public.permissions perm ON rp.permission_id = perm.id
    WHERE p.id = auth.uid() 
      AND p.status = 'ACTIVE' 
      AND perm.code = perm_code
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ==============================================================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Enable RLS
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ROLES POLICIES
CREATE POLICY "Authenticated users can read roles" 
  ON public.roles FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Super admin can manage roles" 
  ON public.roles FOR ALL 
  TO authenticated 
  USING (auth.get_user_role() = 'super_admin')
  WITH CHECK (auth.get_user_role() = 'super_admin');

-- PERMISSIONS POLICIES
CREATE POLICY "Authenticated users can read permissions" 
  ON public.permissions FOR SELECT 
  TO authenticated 
  USING (true);

-- ROLE_PERMISSIONS POLICIES
CREATE POLICY "Authenticated users can read role_permissions" 
  ON public.role_permissions FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Super admin can manage role_permissions" 
  ON public.role_permissions FOR ALL 
  TO authenticated 
  USING (auth.get_user_role() = 'super_admin')
  WITH CHECK (auth.get_user_role() = 'super_admin');

-- PROFILES POLICIES
CREATE POLICY "Users can view active profiles" 
  ON public.profiles FOR SELECT 
  TO authenticated 
  USING (
    -- Normal users can view active profiles
    status = 'ACTIVE' 
    -- Or admins / super admins can view any profile
    OR auth.get_user_role() IN ('super_admin', 'admin')
    -- Or users can view their own profile regardless of status
    OR id = auth.uid()
  );

CREATE POLICY "Admins can insert profiles" 
  ON public.profiles FOR INSERT 
  TO authenticated 
  WITH CHECK (
    auth.get_user_role() IN ('super_admin', 'admin') 
    OR auth.has_permission('users:create')
  );

CREATE POLICY "Admins can update profiles" 
  ON public.profiles FOR UPDATE 
  TO authenticated 
  USING (
    auth.get_user_role() IN ('super_admin', 'admin') 
    OR auth.has_permission('users:update')
    OR id = auth.uid() -- self update
  )
  WITH CHECK (
    -- If updating someone else's profile, must be admin
    (id != auth.uid() AND (auth.get_user_role() IN ('super_admin', 'admin') OR auth.has_permission('users:update')))
    -- If updating self, cannot alter role_id or status
    OR (
      id = auth.uid() 
      AND role_id = (SELECT role_id FROM public.profiles WHERE id = auth.uid())
      AND status = (SELECT status FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Admins can deactivate profiles" 
  ON public.profiles FOR DELETE 
  TO authenticated 
  USING (false); -- Hard deletion is strictly forbidden; use status = 'DEACTIVATED'

-- AUDIT LOGS POLICIES (Immutable)
CREATE POLICY "Super Admins, Admins, Viewers can read audit logs" 
  ON public.audit_logs FOR SELECT 
  TO authenticated 
  USING (
    auth.get_user_role() IN ('super_admin', 'admin', 'viewer')
    OR auth.has_permission('audit:read')
  );

CREATE POLICY "Authenticated users can insert audit logs" 
  ON public.audit_logs FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

-- Disallow UPDATE and DELETE on audit_logs completely
REVOKE UPDATE, DELETE ON public.audit_logs FROM PUBLIC;
REVOKE UPDATE, DELETE ON public.audit_logs FROM authenticated;

-- ==============================================================================
-- 9. SEED DEFAULT ROLES & PERMISSIONS
-- ==============================================================================

-- Insert 7 standard system roles
INSERT INTO public.roles (code, name, description, is_system) VALUES
('super_admin', 'Super Administrator', 'Complete institutional authority, configuration and security governance', true),
('admin', 'Administrator', 'Operations administrator managing sessions, subjects, and operational staff', true),
('supervisor', 'Valuation Supervisor', 'Supervises batch allocation, queues, and resolves verification exceptions', true),
('scanner_operator', 'Scanner Operator', 'Physical batch intake, scanner manifest upload, and image ingestion', true),
('verification_operator', 'Verification Operator', 'High-speed booklet QA, barcode confirmation, and page verification', true),
('coe_user', 'COE / Exam Cell User', 'Exam cell officer managing custody transfers and physical dockets', true),
('viewer', 'Auditor / Read-Only Viewer', 'Read-only observer for regulatory compliance and audit logs', true)
ON CONFLICT (code) DO UPDATE SET 
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- Insert granular permissions
INSERT INTO public.permissions (code, module, description) VALUES
-- User Governance
('users:create', 'User Governance', 'Provision new operational user accounts'),
('users:read', 'User Governance', 'View staff registry, roles and profiles'),
('users:update', 'User Governance', 'Update user profiles and details'),
('users:activate', 'User Governance', 'Activate suspended or newly created accounts'),
('users:deactivate', 'User Governance', 'Deactivate or suspend user accounts'),
-- Session & Subject
('sessions:create', 'Session & Subject', 'Create new examination sessions'),
('sessions:read', 'Session & Subject', 'Read examination sessions'),
('sessions:update', 'Session & Subject', 'Update session configuration and status'),
('sessions:close', 'Session & Subject', 'Freeze or close examination session'),
('subjects:create', 'Session & Subject', 'Register examination subjects'),
('subjects:read', 'Session & Subject', 'View examination subjects'),
('subjects:update', 'Session & Subject', 'Update examination subject parameters'),
-- Batch & Ingestion
('batches:create', 'Batch & Ingestion', 'Register physical batch intake'),
('batches:read', 'Batch & Ingestion', 'View batch intake registry'),
('batches:update', 'Batch & Ingestion', 'Update batch attributes and metadata'),
('batches:receive', 'Batch & Ingestion', 'Sign off physical batch receipt'),
('scripts:import', 'Batch & Ingestion', 'Import script manifests and scanned pages'),
('scripts:delete_draft', 'Batch & Ingestion', 'Delete draft uncommitted batches'),
-- Verification
('scripts:read', 'Verification', 'Read answer script records'),
('scripts:update', 'Verification', 'Update script status and metadata'),
('scripts:verify', 'Verification', 'Mark answer scripts as verified'),
('scripts:flag_exception', 'Verification', 'Flag damaged or missing pages'),
('scripts:reopen', 'Verification', 'Reopen verified scripts for re-inspection'),
('pages:read', 'Verification', 'Read script page images'),
('pages:verify', 'Verification', 'Verify individual page continuity'),
('pages:flag_damaged', 'Verification', 'Flag torn or unreadable pages'),
-- Exceptions & Handover
('exceptions:create', 'Exceptions & Handover', 'Create missing booklet or page discrepancy'),
('exceptions:read', 'Exceptions & Handover', 'View exception registry'),
('exceptions:resolve', 'Exceptions & Handover', 'Resolve exception with corrective action'),
('exceptions:escalate', 'Exceptions & Handover', 'Escalate exception to COE'),
('handovers:create', 'Exceptions & Handover', 'Create departmental handover docket'),
('handovers:receive', 'Exceptions & Handover', 'Acknowledge receipt of physical booklets'),
('handovers:return', 'Exceptions & Handover', 'Acknowledge return of physical booklets'),
('handovers:read', 'Exceptions & Handover', 'View handover dockets'),
-- Reports & Oversight
('reports:read', 'Reports & Oversight', 'View operational reports'),
('reports:export_excel', 'Reports & Oversight', 'Export reports to Excel format'),
('reports:export_pdf', 'Reports & Oversight', 'Generate certified PDF dockets'),
('audit:read', 'Reports & Oversight', 'Inspect immutable audit trail'),
('settings:read', 'Reports & Oversight', 'Read system settings'),
('settings:update', 'Reports & Oversight', 'Modify system settings')
ON CONFLICT (code) DO NOTHING;

-- Map permissions to roles
DO $$
DECLARE
  v_role_id UUID;
  v_perm_id UUID;
BEGIN
  -- Super Admin gets ALL permissions
  SELECT id INTO v_role_id FROM public.roles WHERE code = 'super_admin';
  FOR v_perm_id IN SELECT id FROM public.permissions LOOP
    INSERT INTO public.role_permissions (role_id, permission_id) 
    VALUES (v_role_id, v_perm_id)
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END LOOP;

  -- Admin gets all user governance, sessions, batches, exceptions, reports, settings
  SELECT id INTO v_role_id FROM public.roles WHERE code = 'admin';
  FOR v_perm_id IN SELECT id FROM public.permissions WHERE code NOT IN ('settings:update') LOOP
    INSERT INTO public.role_permissions (role_id, permission_id) 
    VALUES (v_role_id, v_perm_id)
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END LOOP;

  -- Supervisor
  SELECT id INTO v_role_id FROM public.roles WHERE code = 'supervisor';
  FOR v_perm_id IN SELECT id FROM public.permissions WHERE code IN (
    'users:read', 'sessions:read', 'subjects:read', 'batches:read', 'batches:update', 'batches:receive',
    'scripts:read', 'scripts:update', 'scripts:verify', 'scripts:flag_exception', 'scripts:reopen',
    'pages:read', 'pages:verify', 'pages:flag_damaged',
    'exceptions:create', 'exceptions:read', 'exceptions:resolve', 'exceptions:escalate',
    'handovers:create', 'handovers:receive', 'handovers:return', 'handovers:read',
    'reports:read', 'reports:export_excel', 'reports:export_pdf', 'audit:read'
  ) LOOP
    INSERT INTO public.role_permissions (role_id, permission_id) 
    VALUES (v_role_id, v_perm_id)
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END LOOP;

  -- Scanner Operator
  SELECT id INTO v_role_id FROM public.roles WHERE code = 'scanner_operator';
  FOR v_perm_id IN SELECT id FROM public.permissions WHERE code IN (
    'sessions:read', 'subjects:read', 'batches:create', 'batches:read', 'batches:update',
    'scripts:import', 'scripts:read', 'pages:read', 'exceptions:create', 'exceptions:read'
  ) LOOP
    INSERT INTO public.role_permissions (role_id, permission_id) 
    VALUES (v_role_id, v_perm_id)
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END LOOP;

  -- Verification Operator
  SELECT id INTO v_role_id FROM public.roles WHERE code = 'verification_operator';
  FOR v_perm_id IN SELECT id FROM public.permissions WHERE code IN (
    'sessions:read', 'subjects:read', 'batches:read',
    'scripts:read', 'scripts:verify', 'scripts:flag_exception',
    'pages:read', 'pages:verify', 'pages:flag_damaged',
    'exceptions:create', 'exceptions:read'
  ) LOOP
    INSERT INTO public.role_permissions (role_id, permission_id) 
    VALUES (v_role_id, v_perm_id)
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END LOOP;

  -- COE User
  SELECT id INTO v_role_id FROM public.roles WHERE code = 'coe_user';
  FOR v_perm_id IN SELECT id FROM public.permissions WHERE code IN (
    'sessions:read', 'subjects:read', 'batches:read', 'scripts:read',
    'exceptions:create', 'exceptions:read', 'exceptions:resolve',
    'handovers:create', 'handovers:receive', 'handovers:return', 'handovers:read',
    'reports:read', 'reports:export_excel', 'reports:export_pdf'
  ) LOOP
    INSERT INTO public.role_permissions (role_id, permission_id) 
    VALUES (v_role_id, v_perm_id)
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END LOOP;

  -- Viewer
  SELECT id INTO v_role_id FROM public.roles WHERE code = 'viewer';
  FOR v_perm_id IN SELECT id FROM public.permissions WHERE code IN (
    'users:read', 'sessions:read', 'subjects:read', 'batches:read', 'scripts:read',
    'pages:read', 'exceptions:read', 'handovers:read', 'reports:read', 'audit:read', 'settings:read'
  ) LOOP
    INSERT INTO public.role_permissions (role_id, permission_id) 
    VALUES (v_role_id, v_perm_id)
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END LOOP;
END $$;
