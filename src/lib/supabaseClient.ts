// ==============================================================================
// Supabase Client Initialization (Module 1 - Auth & Security)
// ==============================================================================

import { createClient } from '@supabase/supabase-js';

// Retrieve public frontend credentials from Vite environment
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Verify that the service role key is NEVER used on frontend
if (
  (import.meta as any).env?.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  (import.meta as any).env?.SUPABASE_SERVICE_ROLE_KEY
) {
  console.error('FATAL SECURITY VIOLATION: SUPABASE_SERVICE_ROLE_KEY detected in frontend client environment!');
}

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl !== 'https://your-project.supabase.co' &&
  !supabaseUrl.includes('placeholder')
);

// Instantiate standard Supabase client with anon key
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  }
);
