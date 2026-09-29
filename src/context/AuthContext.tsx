// ==============================================================================
// Auth Context: Enterprise Session & Access Control Provider
// Strictly uses Supabase Auth + public.profiles for Authentication & Authorization
// Zero mock/simulator fallbacks.
// ==============================================================================

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Profile, Role, RoleCode, AppRole } from '../types/auth';
import { supabase } from '../lib/supabaseClient';

export interface AuthContextType {
  user: Profile | null;
  role: Role | null;
  appRole: AppRole | null;
  permissions: Set<string>;
  isAuthenticated: boolean;
  isLoading: boolean;
  isLocked: boolean;
  mustChangePassword: boolean;
  lockTimeoutMinutes: number;
  remainingSecondsBeforeLock: number;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  lockSession: () => void;
  unlockSession: (password: string) => Promise<{ success: boolean; error?: string }>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  requestPasswordReset: (email: string) => Promise<{ success: boolean; message: string; error?: string }>;
  hasPermission: (permissionCode: string) => boolean;
  hasRole: (roleCode: RoleCode | RoleCode[] | AppRole | AppRole[]) => boolean;
  refreshProfile: () => Promise<void>;
  simulateQuickIdle: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const INACTIVITY_TIMEOUT_MS = 45 * 60 * 1000; // 45 minutes

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Profile | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [appRole, setAppRole] = useState<AppRole | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);
  const [remainingSecondsBeforeLock, setRemainingSecondsBeforeLock] = useState<number>(45 * 60);

  const lastActivityRef = useRef<number>(Date.now());
  const idleCheckIntervalRef = useRef<any>(null);

  // Helper to construct profile object from public.profiles row
  const buildProfileFromRow = (authUserId: string, authEmail: string, profileRow: any): { userProfile: Profile; roleObj: Role; resolvedRole: AppRole } => {
    const rawRole = String(profileRow.role || '').toLowerCase();
    const resolvedRole: AppRole = rawRole === 'admin' ? 'admin' : 'inward';
    const username = profileRow.username || authEmail.split('@')[0] || 'User';

    const roleObj: Role = {
      id: resolvedRole,
      code: resolvedRole as any,
      name: resolvedRole === 'admin' ? 'Administrator' : 'Inward Operator',
      description: resolvedRole === 'admin' ? 'Full Institutional Administration' : 'Inward Operations Restricted',
      is_system: true,
      created_at: profileRow.created_at || new Date().toISOString(),
    };

    const userProfile: Profile = {
      id: profileRow.id || authUserId,
      email: authEmail,
      username,
      full_name: username,
      role_id: resolvedRole,
      badge_number: resolvedRole === 'admin' ? 'ADMIN' : 'INWARD',
      department: resolvedRole === 'admin' ? 'Examination Directorate' : 'Inward Valuation',
      status: profileRow.is_active ? 'ACTIVE' : 'DEACTIVATED',
      must_change_password: false,
      created_at: profileRow.created_at || new Date().toISOString(),
      updated_at: profileRow.updated_at || new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
      appRole: resolvedRole,
      role: roleObj,
    };

    return { userProfile, roleObj, resolvedRole };
  };

  // 1. Initial Session Restoration directly from Supabase Auth
  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session?.user) {
          if (isMounted) {
            setUser(null);
            setRole(null);
            setAppRole(null);
            setPermissions(new Set());
          }
          return;
        }

        // Query public.profiles strictly by auth.uid()
        const { data: profileRow, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, role, is_active, created_at, updated_at')
          .eq('id', session.user.id)
          .maybeSingle();

        // STRICT REQUIREMENT #6 & #7: Profile must exist and be active
        if (profileError || !profileRow) {
          console.warn('[AUTH] Profile missing for authenticated session. Signing out.');
          await supabase.auth.signOut();
          if (isMounted) {
            setUser(null);
            setRole(null);
            setAppRole(null);
          }
          return;
        }

        if (!profileRow.is_active) {
          console.warn('[AUTH] Inactive account detected. Signing out.');
          await supabase.auth.signOut();
          if (isMounted) {
            setUser(null);
            setRole(null);
            setAppRole(null);
          }
          return;
        }

        const validRole = profileRow.role === 'admin' || profileRow.role === 'inward';
        if (!validRole) {
          console.warn('[AUTH] Unrecognized role detected. Signing out.');
          await supabase.auth.signOut();
          if (isMounted) {
            setUser(null);
            setRole(null);
            setAppRole(null);
          }
          return;
        }

        const { userProfile, roleObj, resolvedRole } = buildProfileFromRow(
          session.user.id,
          session.user.email || '',
          profileRow
        );

        if (isMounted) {
          setUser(userProfile);
          setRole(roleObj);
          setAppRole(resolvedRole);
          setPermissions(new Set(resolvedRole === 'admin' ? ['admin:all', 'audit:read', 'users:manage'] : ['inward:scan']));
        }
      } catch (err) {
        console.warn('[AUTH] Error during session restoration:', err);
        if (isMounted) {
          setUser(null);
          setRole(null);
          setAppRole(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    restoreSession();

    // Subscribe to Supabase Auth State Changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        if (isMounted) {
          setUser(null);
          setRole(null);
          setAppRole(null);
          setPermissions(new Set());
          setIsLocked(false);
          setIsLoading(false);
        }
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session.user) {
          const { data: profileRow } = await supabase
            .from('profiles')
            .select('id, username, role, is_active, created_at, updated_at')
            .eq('id', session.user.id)
            .maybeSingle();

          if (profileRow && profileRow.is_active && (profileRow.role === 'admin' || profileRow.role === 'inward')) {
            const { userProfile, roleObj, resolvedRole } = buildProfileFromRow(
              session.user.id,
              session.user.email || '',
              profileRow
            );
            if (isMounted) {
              setUser(userProfile);
              setRole(roleObj);
              setAppRole(resolvedRole);
              setPermissions(new Set(resolvedRole === 'admin' ? ['admin:all', 'audit:read', 'users:manage'] : ['inward:scan']));
            }
          }
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // 2. Inactivity Monitor
  const resetInactivityTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    setRemainingSecondsBeforeLock(45 * 60);
  }, []);

  const triggerAutoLock = useCallback(() => {
    if (!user || isLocked) return;
    setIsLocked(true);
  }, [user, isLocked]);

  useEffect(() => {
    if (!user || isLocked) return;

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    const handleUserActivity = () => {
      resetInactivityTimer();
    };

    activityEvents.forEach(event => {
      window.addEventListener(event, handleUserActivity, { passive: true });
    });

    idleCheckIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      const remainingSec = Math.max(0, Math.floor((INACTIVITY_TIMEOUT_MS - elapsed) / 1000));
      setRemainingSecondsBeforeLock(remainingSec);

      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        triggerAutoLock();
      }
    }, 1000);

    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleUserActivity);
      });
      if (idleCheckIntervalRef.current) {
        clearInterval(idleCheckIntervalRef.current);
      }
    };
  }, [user, isLocked, resetInactivityTimer, triggerAutoLock]);

  // ==============================================================================
  // 3. LOGIN: STRICT SUPABASE AUTHENTICATION
  // STRICT REQUIREMENT #1, #2, #3, #5, #6, #7
  // ==============================================================================
  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const cleanEmail = email.trim();
      const cleanPassword = password;

      if (!cleanEmail || !cleanPassword) {
        return {
          success: false,
          error: 'Please enter both email address and password.',
        };
      }

      // STEP 1: Supabase Auth is the ONLY authentication authority
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });

      // STOP: If authentication fails, deny access. Zero fallbacks allowed.
      if (authError || !authData?.user || !authData?.session) {
        return {
          success: false,
          error: 'Invalid email or password.',
        };
      }

      const authUser = authData.user;

      // STEP 2: Query public.profiles strictly by authUser.id
      const { data: profileRow, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, role, is_active, created_at, updated_at')
        .eq('id', authUser.id)
        .maybeSingle();

      // STRICT REQUIREMENT #6: Profile must exist
      if (profileError || !profileRow) {
        await supabase.auth.signOut();
        return {
          success: false,
          error: 'User profile is not configured. Please contact an administrator.',
        };
      }

      // STRICT REQUIREMENT #7: is_active must be true
      if (!profileRow.is_active) {
        await supabase.auth.signOut();
        return {
          success: false,
          error: 'Your account is inactive. Please contact an administrator.',
        };
      }

      // STRICT REQUIREMENT #5: Explicit role check (admin or inward)
      const rawRole = String(profileRow.role || '').toLowerCase();
      if (rawRole !== 'admin' && rawRole !== 'inward') {
        await supabase.auth.signOut();
        return {
          success: false,
          error: 'Unrecognized user role. Access denied.',
        };
      }

      const { userProfile, roleObj, resolvedRole } = buildProfileFromRow(
        authUser.id,
        authUser.email || cleanEmail,
        profileRow
      );

      setUser(userProfile);
      setRole(roleObj);
      setAppRole(resolvedRole);
      setPermissions(new Set(resolvedRole === 'admin' ? ['admin:all', 'audit:read', 'users:manage'] : ['inward:scan']));
      setIsLocked(false);
      setMustChangePassword(false);
      resetInactivityTimer();

      return { success: true };
    } catch (err: any) {
      console.warn('[AUTH] Login exception:', err);
      return {
        success: false,
        error: 'Invalid email or password.',
      };
    } finally {
      setIsLoading(false);
    }
  };

  // ==============================================================================
  // 4. LOGOUT: STRICT SUPABASE SIGN-OUT
  // STRICT REQUIREMENT #18
  // ==============================================================================
  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('[AUTH] Sign out note:', e);
    } finally {
      setUser(null);
      setRole(null);
      setAppRole(null);
      setPermissions(new Set());
      setIsLocked(false);
      setMustChangePassword(false);

      try {
        localStorage.removeItem('examscan_mobile_active_view');
        localStorage.removeItem('examscan_mobile_selected_class_id');
        localStorage.removeItem('exam_ops_active_session_v1');
      } catch {}

      setIsLoading(false);
      window.history.replaceState(null, '', '/login');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  // 5. Lock Workstation
  const lockSession = () => {
    triggerAutoLock();
  };

  // 6. Unlock Workstation via Supabase Auth
  const unlockSession = async (password: string): Promise<{ success: boolean; error?: string }> => {
    if (!user || !user.email) {
      return { success: false, error: 'No active session found.' };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });

      if (error || !data.session) {
        return { success: false, error: 'Incorrect password. Terminal remains locked.' };
      }

      setIsLocked(false);
      resetInactivityTimer();
      return { success: true };
    } catch {
      return { success: false, error: 'Failed to verify credentials.' };
    }
  };

  // 7. Change Password
  const changePassword = async (
    _currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Unauthorized.' };

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        return { success: false, error: error.message };
      }
      setMustChangePassword(false);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to update password.' };
    }
  };

  // 8. Password Reset Request
  const requestPasswordReset = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) {
        return { success: false, error: error.message, message: '' };
      }
      return {
        success: true,
        message: 'A password reset instruction email has been sent if the account exists.',
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'System error.',
        message: '',
      };
    }
  };

  // 9. Permission Helpers
  const hasPermission = useCallback(
    (code: string): boolean => {
      if (!user || user.status !== 'ACTIVE') return false;
      if (appRole === 'admin') return true;
      return permissions.has(code);
    },
    [user, appRole, permissions]
  );

  const hasRole = useCallback(
    (target: RoleCode | RoleCode[] | AppRole | AppRole[]): boolean => {
      if (!appRole || !user || user.status !== 'ACTIVE') return false;
      if (Array.isArray(target)) {
        return (target as string[]).includes(appRole);
      }
      return appRole === target;
    },
    [appRole, user]
  );

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    try {
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('id, username, role, is_active, created_at, updated_at')
        .eq('id', user.id)
        .maybeSingle();

      if (profileRow && profileRow.is_active) {
        const { userProfile, roleObj, resolvedRole } = buildProfileFromRow(
          user.id,
          user.email,
          profileRow
        );
        setUser(userProfile);
        setRole(roleObj);
        setAppRole(resolvedRole);
      } else {
        await logout();
      }
    } catch (e) {
      console.warn('[AUTH] Error refreshing profile:', e);
    }
  }, [user]);

  const simulateQuickIdle = useCallback(() => {
    triggerAutoLock();
  }, [triggerAutoLock]);

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        appRole,
        permissions,
        isAuthenticated: Boolean(user && appRole),
        isLoading,
        isLocked,
        mustChangePassword,
        lockTimeoutMinutes: 45,
        remainingSecondsBeforeLock,
        login,
        logout,
        lockSession,
        unlockSession,
        changePassword,
        requestPasswordReset,
        hasPermission,
        hasRole,
        refreshProfile,
        simulateQuickIdle,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
