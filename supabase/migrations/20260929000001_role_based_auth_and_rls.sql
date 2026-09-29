-- ==============================================================================
-- MIGRATION: 20260929000001_role_based_auth_and_rls.sql
-- Purpose: Complete Role-Based Access Control (RBAC) & Database-Level RLS
-- Target: Supabase PostgreSQL 15+
-- Roles: 'admin' (full access) and 'inward' (restricted scan/inward operations only)
-- ==============================================================================

-- Enable standard cryptographic & UUID extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. DROP EXISTING CONFLICTING FUNCTIONS FIRST (Avoids Error 42P13)
-- ==============================================================================
DROP FUNCTION IF EXISTS public.get_auth_role() CASCADE;
DROP FUNCTION IF EXISTS auth.get_auth_role() CASCADE;
DROP FUNCTION IF EXISTS public.is_admin() CASCADE;
DROP FUNCTION IF EXISTS public.is_inward_or_admin() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_updated_at() CASCADE;

-- ==============================================================================
-- 2. PROFILES TABLE & ROLE CONSTRAINTS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'inward' CHECK (role IN ('admin', 'inward')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Safely adapt existing columns if profiles table already existed from prior schema
DO $$
BEGIN
  -- Make sure username exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'username'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN username TEXT UNIQUE;
  END IF;

  -- Make sure role exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'inward';
  END IF;

  -- Make sure is_active exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
  END IF;

  -- Make sure updated_at exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;

  -- Relax legacy NOT NULL constraints from previous module 1 schema if present
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'full_name' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.profiles ALTER COLUMN full_name DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'email' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.profiles ALTER COLUMN email DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.profiles ALTER COLUMN role_id DROP NOT NULL;
  END IF;
END $$;

-- Enforce role check constraint ('admin', 'inward')
DO $$
BEGIN
  ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS chk_profile_role;
  ALTER TABLE public.profiles ADD CONSTRAINT chk_profile_role CHECK (role IN ('admin', 'inward'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Fast index lookups
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON public.profiles(is_active);

-- ==============================================================================
-- 3. AUTOMATIC UPDATED_AT TRIGGER
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- 4. AUTOMATIC PROFILE CREATION ON USER SIGNUP (Supabase Auth Hook)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  assigned_role TEXT;
  extracted_username TEXT;
BEGIN
  -- Determine role from raw_user_meta_data or default to 'inward'
  assigned_role := COALESCE(NEW.raw_user_meta_data->>'role', 'inward');
  IF assigned_role NOT IN ('admin', 'inward') THEN
    assigned_role := 'inward';
  END IF;

  -- Determine username from metadata or email prefix
  extracted_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.profiles (id, username, role, is_active, created_at, updated_at)
  VALUES (
    NEW.id,
    extracted_username,
    assigned_role,
    true,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    username = COALESCE(EXCLUDED.username, public.profiles.username),
    role = EXCLUDED.role,
    is_active = EXCLUDED.is_active,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==============================================================================
-- 5. NON-RECURSIVE SECURITY DEFINER ROLE HELPER FUNCTIONS
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_inward_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'inward')
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles
  WHERE id = auth.uid() AND is_active = true
  LIMIT 1;
$$;

-- ==============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Enable RLS on core tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN ALTER TABLE public.imported_inward ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.import_inwarded_data ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.manual_inwarded_data ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.scan_sessions ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.scan_session_items ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.saved_scan_data ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.class_bundles ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ------------------------------------------------------------------------------
-- 6A. PROFILES POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Admin can manage all profiles" ON public.profiles;
CREATE POLICY "Admin can manage all profiles"
  ON public.profiles FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- 6B. IMPORTED INWARD DATA (Master Excel Expected Data)
-- Admin: Full control
-- Inward: Read-Only (Cannot modify or import master records)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'imported_inward') THEN
    DROP POLICY IF EXISTS "Inward and Admin can read imported data" ON public.imported_inward;
    CREATE POLICY "Inward and Admin can read imported data"
      ON public.imported_inward FOR SELECT
      TO authenticated
      USING (public.is_inward_or_admin());

    DROP POLICY IF EXISTS "Admin full control on imported data" ON public.imported_inward;
    CREATE POLICY "Admin full control on imported data"
      ON public.imported_inward FOR ALL
      TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'import_inwarded_data') THEN
    DROP POLICY IF EXISTS "Inward and Admin can read import_inwarded_data" ON public.import_inwarded_data;
    CREATE POLICY "Inward and Admin can read import_inwarded_data"
      ON public.import_inwarded_data FOR SELECT
      TO authenticated
      USING (public.is_inward_or_admin());

    DROP POLICY IF EXISTS "Admin full control on import_inwarded_data" ON public.import_inwarded_data;
    CREATE POLICY "Admin full control on import_inwarded_data"
      ON public.import_inwarded_data FOR ALL
      TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 6C. MANUAL INWARD DATA
-- Admin: Full control
-- Inward: Read and Insert (Cannot delete existing inward records)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'manual_inwarded_data') THEN
    DROP POLICY IF EXISTS "Inward and Admin can read manual_inwarded_data" ON public.manual_inwarded_data;
    CREATE POLICY "Inward and Admin can read manual_inwarded_data"
      ON public.manual_inwarded_data FOR SELECT
      TO authenticated
      USING (public.is_inward_or_admin());

    DROP POLICY IF EXISTS "Inward can insert manual_inwarded_data" ON public.manual_inwarded_data;
    CREATE POLICY "Inward can insert manual_inwarded_data"
      ON public.manual_inwarded_data FOR INSERT
      TO authenticated
      WITH CHECK (public.is_inward_or_admin());

    DROP POLICY IF EXISTS "Admin full control on manual_inwarded_data" ON public.manual_inwarded_data;
    CREATE POLICY "Admin full control on manual_inwarded_data"
      ON public.manual_inwarded_data FOR ALL
      TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 6D. SCAN SESSIONS & STAGED SESSION ITEMS
-- Admin: Full control
-- Inward: Read, Insert, and Update (Cannot delete sessions)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'scan_sessions') THEN
    DROP POLICY IF EXISTS "Inward and Admin can read scan_sessions" ON public.scan_sessions;
    CREATE POLICY "Inward and Admin can read scan_sessions"
      ON public.scan_sessions FOR SELECT
      TO authenticated
      USING (public.is_inward_or_admin());

    DROP POLICY IF EXISTS "Inward and Admin can insert scan_sessions" ON public.scan_sessions;
    CREATE POLICY "Inward and Admin can insert scan_sessions"
      ON public.scan_sessions FOR INSERT
      TO authenticated
      WITH CHECK (public.is_inward_or_admin());

    DROP POLICY IF EXISTS "Inward and Admin can update scan_sessions" ON public.scan_sessions;
    CREATE POLICY "Inward and Admin can update scan_sessions"
      ON public.scan_sessions FOR UPDATE
      TO authenticated
      USING (public.is_inward_or_admin())
      WITH CHECK (public.is_inward_or_admin());

    DROP POLICY IF EXISTS "Admin can delete scan_sessions" ON public.scan_sessions;
    CREATE POLICY "Admin can delete scan_sessions"
      ON public.scan_sessions FOR DELETE
      TO authenticated
      USING (public.is_admin());
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'scan_session_items') THEN
    DROP POLICY IF EXISTS "Inward and Admin can read scan_session_items" ON public.scan_session_items;
    CREATE POLICY "Inward and Admin can read scan_session_items"
      ON public.scan_session_items FOR SELECT
      TO authenticated
      USING (public.is_inward_or_admin());

    DROP POLICY IF EXISTS "Inward and Admin can insert scan_session_items" ON public.scan_session_items;
    CREATE POLICY "Inward and Admin can insert scan_session_items"
      ON public.scan_session_items FOR INSERT
      TO authenticated
      WITH CHECK (public.is_inward_or_admin());

    DROP POLICY IF EXISTS "Inward and Admin can update scan_session_items" ON public.scan_session_items;
    CREATE POLICY "Inward and Admin can update scan_session_items"
      ON public.scan_session_items FOR UPDATE
      TO authenticated
      USING (public.is_inward_or_admin())
      WITH CHECK (public.is_inward_or_admin());

    DROP POLICY IF EXISTS "Admin can delete scan_session_items" ON public.scan_session_items;
    CREATE POLICY "Admin can delete scan_session_items"
      ON public.scan_session_items FOR DELETE
      TO authenticated
      USING (public.is_admin());
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 6E. SAVED SCAN DATA (Finalized Inward Booklets)
-- Admin: Full control
-- Inward: Read and Insert (Cannot delete or truncate)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'saved_scan_data') THEN
    DROP POLICY IF EXISTS "Inward and Admin can read saved_scan_data" ON public.saved_scan_data;
    CREATE POLICY "Inward and Admin can read saved_scan_data"
      ON public.saved_scan_data FOR SELECT
      TO authenticated
      USING (public.is_inward_or_admin());

    DROP POLICY IF EXISTS "Inward and Admin can insert saved_scan_data" ON public.saved_scan_data;
    CREATE POLICY "Inward and Admin can insert saved_scan_data"
      ON public.saved_scan_data FOR INSERT
      TO authenticated
      WITH CHECK (public.is_inward_or_admin());

    DROP POLICY IF EXISTS "Admin full control on saved_scan_data" ON public.saved_scan_data;
    CREATE POLICY "Admin full control on saved_scan_data"
      ON public.saved_scan_data FOR ALL
      TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 6F. CLASS BUNDLES (Class Summaries & Progress)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'class_bundles') THEN
    DROP POLICY IF EXISTS "Inward and Admin can read class_bundles" ON public.class_bundles;
    CREATE POLICY "Inward and Admin can read class_bundles"
      ON public.class_bundles FOR SELECT
      TO authenticated
      USING (public.is_inward_or_admin());

    DROP POLICY IF EXISTS "Inward and Admin can manage class_bundles" ON public.class_bundles;
    CREATE POLICY "Inward and Admin can manage class_bundles"
      ON public.class_bundles FOR ALL
      TO authenticated
      USING (public.is_inward_or_admin())
      WITH CHECK (public.is_inward_or_admin());
  END IF;
END $$;

-- ==============================================================================
-- 7. PERMISSIONS & GRANTS
-- ==============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

DO $$ BEGIN GRANT SELECT, INSERT, UPDATE ON public.manual_inwarded_data TO authenticated; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT, INSERT, UPDATE ON public.saved_scan_data TO authenticated; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT, INSERT, UPDATE ON public.scan_sessions TO authenticated; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT, INSERT, UPDATE ON public.scan_session_items TO authenticated; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT, INSERT, UPDATE ON public.class_bundles TO authenticated; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON public.imported_inward TO authenticated; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON public.import_inwarded_data TO authenticated; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ==============================================================================
-- 8. REALTIME PUBLICATION CONFIGURATION
-- ==============================================================================

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.imported_inward; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.saved_scan_data; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.scan_sessions; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.scan_session_items; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.manual_inwarded_data; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.class_bundles; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Set REPLICA IDENTITY FULL for seamless Realtime diffs
DO $$ BEGIN ALTER TABLE public.profiles REPLICA IDENTITY FULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.saved_scan_data REPLICA IDENTITY FULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.scan_sessions REPLICA IDENTITY FULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.scan_session_items REPLICA IDENTITY FULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.manual_inwarded_data REPLICA IDENTITY FULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.class_bundles REPLICA IDENTITY FULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ==============================================================================
-- 9. USER PROVISIONING SEED (Admin & Inward Users)
-- Creates default auth.users & profiles for:
-- 1. admin (role: 'admin')
-- 2. inward_1, inward_2, inward_3 (role: 'inward')
-- ==============================================================================

DO $$
DECLARE
  v_admin_id UUID := gen_random_uuid();
  v_inward1_id UUID := gen_random_uuid();
  v_inward2_id UUID := gen_random_uuid();
  v_inward3_id UUID := gen_random_uuid();
BEGIN
  -- Insert Admin user if not exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@examscan.local') THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      v_admin_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'admin@examscan.local',
      crypt('Admin@12345', gen_salt('bf')),
      now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      '{"username": "admin", "role": "admin"}'::jsonb,
      now(),
      now()
    );

    INSERT INTO public.profiles (id, username, role, is_active, created_at, updated_at)
    VALUES (v_admin_id, 'admin', 'admin', true, now(), now())
    ON CONFLICT (id) DO UPDATE SET role = 'admin', username = 'admin', is_active = true;
  ELSE
    SELECT id INTO v_admin_id FROM auth.users WHERE email = 'admin@examscan.local';
    INSERT INTO public.profiles (id, username, role, is_active, created_at, updated_at)
    VALUES (v_admin_id, 'admin', 'admin', true, now(), now())
    ON CONFLICT (id) DO UPDATE SET role = 'admin', username = 'admin', is_active = true;
  END IF;

  -- Insert Inward 1
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'inward_1@examscan.local') THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      v_inward1_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'inward_1@examscan.local',
      crypt('Inward@12345', gen_salt('bf')),
      now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      '{"username": "inward_1", "role": "inward"}'::jsonb,
      now(),
      now()
    );

    INSERT INTO public.profiles (id, username, role, is_active, created_at, updated_at)
    VALUES (v_inward1_id, 'inward_1', 'inward', true, now(), now())
    ON CONFLICT (id) DO UPDATE SET role = 'inward', username = 'inward_1', is_active = true;
  ELSE
    SELECT id INTO v_inward1_id FROM auth.users WHERE email = 'inward_1@examscan.local';
    INSERT INTO public.profiles (id, username, role, is_active, created_at, updated_at)
    VALUES (v_inward1_id, 'inward_1', 'inward', true, now(), now())
    ON CONFLICT (id) DO UPDATE SET role = 'inward', username = 'inward_1', is_active = true;
  END IF;

  -- Insert Inward 2
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'inward_2@examscan.local') THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      v_inward2_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'inward_2@examscan.local',
      crypt('Inward@12345', gen_salt('bf')),
      now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      '{"username": "inward_2", "role": "inward"}'::jsonb,
      now(),
      now()
    );

    INSERT INTO public.profiles (id, username, role, is_active, created_at, updated_at)
    VALUES (v_inward2_id, 'inward_2', 'inward', true, now(), now())
    ON CONFLICT (id) DO UPDATE SET role = 'inward', username = 'inward_2', is_active = true;
  ELSE
    SELECT id INTO v_inward2_id FROM auth.users WHERE email = 'inward_2@examscan.local';
    INSERT INTO public.profiles (id, username, role, is_active, created_at, updated_at)
    VALUES (v_inward2_id, 'inward_2', 'inward', true, now(), now())
    ON CONFLICT (id) DO UPDATE SET role = 'inward', username = 'inward_2', is_active = true;
  END IF;

  -- Insert Inward 3
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'inward_3@examscan.local') THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      v_inward3_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'inward_3@examscan.local',
      crypt('Inward@12345', gen_salt('bf')),
      now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      '{"username": "inward_3", "role": "inward"}'::jsonb,
      now(),
      now()
    );

    INSERT INTO public.profiles (id, username, role, is_active, created_at, updated_at)
    VALUES (v_inward3_id, 'inward_3', 'inward', true, now(), now())
    ON CONFLICT (id) DO UPDATE SET role = 'inward', username = 'inward_3', is_active = true;
  ELSE
    SELECT id INTO v_inward3_id FROM auth.users WHERE email = 'inward_3@examscan.local';
    INSERT INTO public.profiles (id, username, role, is_active, created_at, updated_at)
    VALUES (v_inward3_id, 'inward_3', 'inward', true, now(), now())
    ON CONFLICT (id) DO UPDATE SET role = 'inward', username = 'inward_3', is_active = true;
  END IF;
END $$;
