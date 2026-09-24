// ==============================================================================
// Auth Context: Enterprise Session & Access Control Provider (Module 1)
// ==============================================================================

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Profile, Role, RoleCode } from '../types/auth';
import { enterpriseStore } from '../services/store';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

interface AuthContextType {
  user: Profile | null;
  role: Role | null;
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
  hasRole: (roleCode: RoleCode | RoleCode[]) => boolean;
  refreshProfile: () => void;
  simulateQuickIdle: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_STORAGE_KEY = 'exam_ops_active_session_v1';
const INACTIVITY_TIMEOUT_MS = 45 * 60 * 1000; // 45 minutes per PRD

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Profile | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);
  const [remainingSecondsBeforeLock, setRemainingSecondsBeforeLock] = useState<number>(45 * 60);

  const lastActivityRef = useRef<number>(Date.now());
  const idleCheckIntervalRef = useRef<any>(null);

  // 1. Restore session on mount
  useEffect(() => {
    try {
      const savedSession = localStorage.getItem(SESSION_STORAGE_KEY);
      if (savedSession) {
        const parsed = JSON.parse(savedSession);
        if (parsed.userId) {
          // Re-fetch fresh profile from store
          const currentProfile = enterpriseStore.getProfileById(parsed.userId, parsed.userId);
          if (currentProfile && currentProfile.status === 'ACTIVE') {
            setUser(currentProfile);
            if (currentProfile.role) {
              setRole(currentProfile.role);
              const perms = enterpriseStore.getRolePermissions(currentProfile.role.code);
              setPermissions(new Set(perms));
            }
            if (currentProfile.must_change_password) {
              setMustChangePassword(true);
            }
            if (parsed.isLocked) {
              setIsLocked(true);
            }
          } else {
            // Invalidate if deactivated or suspended
            localStorage.removeItem(SESSION_STORAGE_KEY);
          }
        }
      }
    } catch (e) {
      console.warn('Failed restoring auth session:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Update session state in localStorage
  const updateSessionPersistence = useCallback((profile: Profile | null, locked: boolean) => {
    if (profile) {
      localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          userId: profile.id,
          email: profile.email,
          roleCode: profile.role?.code,
          isLocked: locked,
          timestamp: Date.now(),
        })
      );
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, []);

  // 2. Inactivity Monitor (45 minutes per PRD)
  const resetInactivityTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    setRemainingSecondsBeforeLock(45 * 60);
  }, []);

  const triggerAutoLock = useCallback(() => {
    if (!user || isLocked) return;
    setIsLocked(true);
    updateSessionPersistence(user, true);

    enterpriseStore.recordAudit({
      actor_id: user.id,
      actor_email: user.email,
      actor_role: role?.code,
      action: 'SESSION_LOCKED',
      entity_name: 'auth.session',
      entity_id: user.id,
      new_values: { reason: 'INACTIVITY_TIMEOUT_45M' },
    });
  }, [user, isLocked, role, updateSessionPersistence]);

  useEffect(() => {
    if (!user || isLocked) return;

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    const handleUserActivity = () => {
      resetInactivityTimer();
    };

    activityEvents.forEach(event => {
      window.addEventListener(event, handleUserActivity, { passive: true });
    });

    // Tick every second to monitor idle countdown
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

  // 3. Login
  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      if (isSupabaseConfigured) {
        try {
          // Authenticate directly with Supabase Auth
          const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

          if (!authError && authData?.user) {
            // Fetch user profile from public.profiles table
            const { data: profileRow, error: profileError } = await supabase
              .from('profiles')
              .select('*, role:roles(*)')
              .eq('id', authData.user.id)
              .single();

            if (!profileError && profileRow) {
              if (profileRow.status === 'DEACTIVATED') {
                await supabase.auth.signOut();
                return {
                  success: false,
                  error: 'Account has been DEACTIVATED by the Examination Directorate. Access denied.',
                };
              }

              if (profileRow.status === 'SUSPENDED') {
                await supabase.auth.signOut();
                return {
                  success: false,
                  error: 'Account is currently SUSPENDED pending review. Please contact your Valuation Supervisor.',
                };
              }

              const userProfile: Profile = {
                id: profileRow.id,
                email: profileRow.email,
                full_name: profileRow.full_name,
                role_id: profileRow.role_id,
                badge_number: profileRow.badge_number,
                phone: profileRow.phone,
                department: profileRow.department,
                status: profileRow.status,
                must_change_password: profileRow.must_change_password,
                created_by: profileRow.created_by,
                updated_by: profileRow.updated_by,
                created_at: profileRow.created_at,
                updated_at: profileRow.updated_at,
                last_activity_at: new Date().toISOString(),
                role: profileRow.role,
              };

              setUser(userProfile);
              if (profileRow.role) {
                setRole(profileRow.role);
                const perms = enterpriseStore.getRolePermissions(profileRow.role.code);
                setPermissions(new Set(perms));
              }

              setIsLocked(false);
              setMustChangePassword(Boolean(profileRow.must_change_password));
              updateSessionPersistence(userProfile, false);
              resetInactivityTimer();

              return { success: true };
            }
          }
        } catch (supaErr) {
          console.warn('Supabase Auth error, attempting local store fallback:', supaErr);
        }
      }

      // Local store authentication fallback (operates with zero mock users until created)
      const result = enterpriseStore.authenticate(email, password);

      if (!result.success || !result.profile) {
        return {
          success: false,
          error:
            result.error ||
            'Invalid credentials or account does not exist. All staff accounts must be provisioned by an administrator.',
        };
      }

      setUser(result.profile);
      if (result.role) {
        setRole(result.role);
      }
      if (result.permissions) {
        setPermissions(new Set(result.permissions));
      }

      setIsLocked(false);
      const requiresPasswordChange = Boolean(result.profile.must_change_password);
      setMustChangePassword(requiresPasswordChange);

      updateSessionPersistence(result.profile, false);
      resetInactivityTimer();

      return { success: true };
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Logout
  const logout = async (): Promise<void> => {
    if (user) {
      enterpriseStore.recordAudit({
        actor_id: user.id,
        actor_email: user.email,
        actor_role: role?.code,
        action: 'LOGOUT',
        entity_name: 'auth.session',
        entity_id: user.id,
      });
    }

    setUser(null);
    setRole(null);
    setPermissions(new Set());
    setIsLocked(false);
    setMustChangePassword(false);
    localStorage.removeItem(SESSION_STORAGE_KEY);
  };

  // 5. Lock Workstation
  const lockSession = () => {
    triggerAutoLock();
  };

  // 6. Unlock Workstation
  const unlockSession = async (password: string): Promise<{ success: boolean; error?: string }> => {
    if (!user) {
      return { success: false, error: 'No active session found.' };
    }

    const verify = enterpriseStore.authenticate(user.email, password);
    if (!verify.success) {
      return { success: false, error: 'Incorrect password. Terminal remains locked.' };
    }

    setIsLocked(false);
    updateSessionPersistence(user, false);
    resetInactivityTimer();

    enterpriseStore.recordAudit({
      actor_id: user.id,
      actor_email: user.email,
      actor_role: role?.code,
      action: 'SESSION_UNLOCKED',
      entity_name: 'auth.session',
      entity_id: user.id,
    });

    return { success: true };
  };

  // 7. Change Password
  const changePassword = async (
    currentPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Unauthorized.' };

    const res = enterpriseStore.changePassword(user.id, currentPassword, newPassword);
    if (res.success) {
      setMustChangePassword(false);
      setUser(prev => (prev ? { ...prev, must_change_password: false } : null));
    }
    return res;
  };

  // 8. Password Reset Request
  const requestPasswordReset = async (email: string) => {
    return enterpriseStore.requestPasswordReset(email);
  };

  // 9. Permission Helpers
  const hasPermission = useCallback(
    (code: string): boolean => {
      if (!user || user.status !== 'ACTIVE') return false;
      if (role?.code === 'super_admin') return true; // Super Admin has all
      return permissions.has(code);
    },
    [user, role, permissions]
  );

  const hasRole = useCallback(
    (target: RoleCode | RoleCode[]): boolean => {
      if (!role || !user || user.status !== 'ACTIVE') return false;
      if (Array.isArray(target)) {
        return target.includes(role.code);
      }
      return role.code === target;
    },
    [role, user]
  );

  const refreshProfile = useCallback(() => {
    if (user) {
      const refreshed = enterpriseStore.getProfileById(user.id, user.id);
      if (refreshed) {
        setUser(refreshed);
        if (refreshed.role) {
          setRole(refreshed.role);
          setPermissions(new Set(enterpriseStore.getRolePermissions(refreshed.role.code)));
        }
      }
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
        permissions,
        isAuthenticated: Boolean(user),
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
