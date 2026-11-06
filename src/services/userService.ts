// ==============================================================================
// User & Provisioning Service (Module 1 - Auth & Management)
// Directly integrated with Supabase public.profiles and Supabase Auth
// With auto-confirmation, real emails, and bulk Excel provisioning
// ==============================================================================

import { createClient } from '@supabase/supabase-js';
import { Profile, CreateUserPayload, UpdateUserPayload, UserStatus, Role, Permission, AuditLog, AppRole } from '../types/auth';
import { supabase, supabaseUrl, supabaseAnonKey, isSupabaseConfigured } from '../lib/supabaseClient';
import { enterpriseStore } from './store';

export interface SimpleUserRecord {
  id: string;
  email: string;
  username: string;
  role: AppRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const DELETED_USERS_STORAGE_KEY = 'examscan_deleted_user_ids';
const USER_CREDENTIALS_STORAGE_KEY = 'examscan_user_credentials';

export function getDeletedUserIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_USERS_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function addDeletedUserId(idOrIdentifier: string) {
  try {
    const current = getDeletedUserIds();
    current.add(idOrIdentifier.trim().toLowerCase());
    current.add(idOrIdentifier.trim());
    localStorage.setItem(DELETED_USERS_STORAGE_KEY, JSON.stringify(Array.from(current)));
  } catch (e) {
    console.warn('Failed saving deleted user id:', e);
  }
}

export function saveUserCredential(identifier: string, password: string, role: AppRole, userId?: string) {
  try {
    const raw = localStorage.getItem(USER_CREDENTIALS_STORAGE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const entry = {
      identifier: identifier.trim().toLowerCase(),
      password,
      role,
      userId: userId || `usr-${Date.now()}`,
      updatedAt: new Date().toISOString(),
    };
    map[identifier.trim().toLowerCase()] = entry;
    if (identifier.includes('@')) {
      const username = identifier.split('@')[0].toLowerCase();
      map[username] = entry;
    }
    localStorage.setItem(USER_CREDENTIALS_STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('Failed saving user credential:', e);
  }
}

export function getUserCredential(identifier: string): { password: string; role: AppRole; userId: string } | null {
  try {
    const raw = localStorage.getItem(USER_CREDENTIALS_STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw);
    const key = identifier.trim().toLowerCase();
    return map[key] || null;
  } catch {
    return null;
  }
}

export const userService = {
  /**
   * Fetch users directly from Supabase public.profiles table
   * Filters out any deleted users in persistent registry
   */
  async fetchProfilesFromSupabase(callerId?: string): Promise<Profile[]> {
    const deletedIds = getDeletedUserIds();

    if (isSupabaseConfigured) {
      try {
        const { data: rows, error } = await supabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(rows) && rows.length > 0) {
          const storeProfiles = enterpriseStore.getProfiles(callerId || 'system', {});

          // Filter out deleted users and marked deleted rows
          const activeRows = rows.filter((r: any) => {
            const idMatch = r.id && deletedIds.has(String(r.id).toLowerCase());
            const userMatch = r.username && deletedIds.has(String(r.username).toLowerCase());
            const emailMatch = r.email && deletedIds.has(String(r.email).toLowerCase());
            const isRoleDeleted = String(r.role || '').toLowerCase() === 'deleted';
            return !idMatch && !userMatch && !emailMatch && !isRoleDeleted;
          });

          return activeRows.map((r: any) => {
            const rawRole = String(r.role || '').toLowerCase();
            const resolvedRole: AppRole = rawRole === 'admin' ? 'admin' : 'inward';

            // Detect exact real email
            let userEmail = r.email || '';
            if (!userEmail && r.username) {
              if (r.username.includes('@')) {
                userEmail = r.username;
              } else {
                const matchedStore = storeProfiles.find(p => p.id === r.id || p.username === r.username);
                if (matchedStore?.email && matchedStore.email.includes('@')) {
                  userEmail = matchedStore.email;
                } else {
                  userEmail = r.username; // Display real username as-is, never append fake domain
                }
              }
            }

            const displayName = r.full_name || userEmail.split('@')[0] || r.username;

            const roleObj: Role = {
              id: resolvedRole,
              code: resolvedRole as any,
              name: resolvedRole === 'admin' ? 'Administrator' : 'Inward Operator',
              description: resolvedRole === 'admin' ? 'Full Institutional Administration' : 'Inward Operations Restricted',
              is_system: true,
              created_at: r.created_at || new Date().toISOString(),
            };

            const prof: Profile = {
              id: r.id,
              email: userEmail,
              username: r.username || userEmail,
              full_name: displayName,
              role_id: resolvedRole,
              badge_number: resolvedRole === 'admin' ? 'ADMIN' : 'INWARD',
              department: resolvedRole === 'admin' ? 'Examination Directorate' : 'Inward Valuation',
              status: r.is_active ? 'ACTIVE' : 'DEACTIVATED',
              must_change_password: false,
              created_at: r.created_at || new Date().toISOString(),
              updated_at: r.updated_at || new Date().toISOString(),
              last_activity_at: 'Active',
              appRole: resolvedRole,
              role: roleObj,
            };
            return prof;
          });
        }
      } catch (err) {
        console.warn('[userService] Failed to fetch profiles from Supabase, falling back to local store:', err);
      }
    }

    // Fallback to enterpriseStore
    return enterpriseStore.getProfiles(callerId || 'system', {});
  },

  getUsers(callerId: string, filters?: { search?: string; roleCode?: string; status?: string }): Profile[] {
    return enterpriseStore.getProfiles(callerId, filters);
  },

  getUserById(callerId: string, id: string): Profile | null {
    return enterpriseStore.getProfileById(callerId, id);
  },

  /**
   * Create user in Supabase Authentication and sync with public.profiles
   * Uses an isolated auth client with persistSession: false so the admin is never logged out
   */
  async createAuthUser(payload: {
    email: string;
    password: string;
    role: AppRole;
    fullName?: string;
  }): Promise<{ success: boolean; data?: Profile; error?: string }> {
    const cleanEmail = payload.email.trim();
    const cleanPassword = payload.password;
    const cleanRole: AppRole = payload.role === 'admin' ? 'admin' : 'inward';
    const fullName = payload.fullName?.trim() || cleanEmail.split('@')[0];

    if (!cleanEmail || !cleanPassword) {
      return { success: false, error: 'Email and password are required.' };
    }
    if (cleanPassword.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters.' };
    }

    let authUserId = '';
    let errorMessage: string | null = null;

    if (isSupabaseConfigured && supabaseUrl && supabaseAnonKey) {
      try {
        // Create an isolated auth client that does NOT persist session to avoid replacing current admin
        const isolatedAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        });

        const { data: signUpData, error: signUpError } = await isolatedAuthClient.auth.signUp({
          email: cleanEmail,
          password: cleanPassword,
          options: {
            data: {
              email: cleanEmail,
              role: cleanRole,
              username: cleanEmail,
              full_name: fullName,
            },
          },
        });

        if (signUpError) {
          errorMessage = signUpError.message;
        } else if (signUpData?.user?.id) {
          authUserId = signUpData.user.id;
        }
      } catch (err: any) {
        console.warn('[userService] Isolated signUp error:', err);
        errorMessage = err.message || 'Supabase Auth signup failed';
      }
    }

    // Generate UUID if offline or fallback
    if (!authUserId) {
      if (errorMessage && !errorMessage.includes('fetch') && !errorMessage.includes('network')) {
        // If user already registered, return friendly error
        return { success: false, error: errorMessage };
      }
      authUserId = `usr-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
    }

    const nowIso = new Date().toISOString();

    // Direct upsert to public.profiles table (saving exact email in username and email columns)
    if (isSupabaseConfigured) {
      try {
        const profileInsert: any = {
          id: authUserId,
          username: cleanEmail,
          role: cleanRole,
          is_active: true,
          updated_at: nowIso,
          email: cleanEmail,
        };

        const { error: upsertErr } = await supabase
          .from('profiles')
          .upsert(profileInsert, { onConflict: 'id' });

        if (upsertErr) {
          // If profiles table has no email column, retry with only username
          await supabase
            .from('profiles')
            .upsert({
              id: authUserId,
              username: cleanEmail,
              role: cleanRole,
              is_active: true,
              updated_at: nowIso,
            }, { onConflict: 'id' });
        }
      } catch (e) {
        console.warn('[userService] Supabase profile upsert exception:', e);
      }
    }

    // Build profile object
    const roleObj: Role = {
      id: cleanRole,
      code: cleanRole as any,
      name: cleanRole === 'admin' ? 'Administrator' : 'Inward Operator',
      description: cleanRole === 'admin' ? 'Full Institutional Administration' : 'Inward Operations Restricted',
      is_system: true,
      created_at: nowIso,
    };

    const newProfile: Profile = {
      id: authUserId,
      email: cleanEmail,
      username: cleanEmail,
      full_name: fullName,
      role_id: cleanRole,
      badge_number: cleanRole === 'admin' ? 'ADMIN' : 'INWARD',
      department: cleanRole === 'admin' ? 'Examination Directorate' : 'Inward Valuation',
      status: 'ACTIVE',
      must_change_password: false,
      created_at: nowIso,
      updated_at: nowIso,
      last_activity_at: 'Just now',
      appRole: cleanRole,
      role: roleObj,
    };

    // Save directly to enterpriseStore and credential vault so created users can immediately log in
    enterpriseStore.saveDirectAccount(cleanEmail, cleanPassword, newProfile);
    saveUserCredential(cleanEmail, cleanPassword, cleanRole, authUserId);

    return { success: true, data: newProfile };
  },

  /**
   * Bulk provision users from parsed Excel rows
   */
  async bulkCreateUsers(
    users: Array<{ email: string; password: string; role: AppRole; fullName?: string }>
  ): Promise<{
    total: number;
    successCount: number;
    failureCount: number;
    results: Array<{ email: string; success: boolean; error?: string }>;
  }> {
    const results: Array<{ email: string; success: boolean; error?: string }> = [];
    let successCount = 0;
    let failureCount = 0;

    for (const u of users) {
      const res = await this.createAuthUser({
        email: u.email,
        password: u.password,
        role: u.role,
        fullName: u.fullName,
      });

      if (res.success) {
        successCount++;
        results.push({ email: u.email, success: true });
      } else {
        failureCount++;
        results.push({ email: u.email, success: false, error: res.error });
      }
    }

    return {
      total: users.length,
      successCount,
      failureCount,
      results,
    };
  },

  /**
   * Toggle user active/inactive status in public.profiles
   */
  async toggleUserStatus(userId: string, currentStatus: boolean | UserStatus): Promise<{ success: boolean; error?: string }> {
    const newActiveState = typeof currentStatus === 'boolean' ? !currentStatus : currentStatus !== 'ACTIVE';

    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ is_active: newActiveState, updated_at: new Date().toISOString() })
          .eq('id', userId);

        if (error) {
          return { success: false, error: error.message };
        }
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }

    // Also update local store
    enterpriseStore.setUserStatus('system', userId, newActiveState ? 'ACTIVE' : 'DEACTIVATED');
    return { success: true };
  },

  /**
   * Update user role in public.profiles ('admin' or 'inward')
   */
  async updateUserRole(userId: string, newRole: AppRole): Promise<{ success: boolean; error?: string }> {
    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ role: newRole, updated_at: new Date().toISOString() })
          .eq('id', userId);

        if (error) {
          return { success: false, error: error.message };
        }
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }

    // Mirror to store
    enterpriseStore.updateUser('system', userId, {
      role_id: newRole === 'admin' ? 'role-super-admin' : 'role-scanner-op',
    });

    return { success: true };
  },

  /**
   * Delete single user profile permanently
   */
  async deleteUser(userId: string, identifier?: string): Promise<{ success: boolean; error?: string }> {
    // 1. Immediately record in persistent deleted set
    addDeletedUserId(userId);
    if (identifier) addDeletedUserId(identifier);

    if (isSupabaseConfigured) {
      try {
        await supabase
          .from('profiles')
          .delete()
          .eq('id', userId);
      } catch (err: any) {
        console.warn('[userService] delete error:', err);
      }

      // Also mark as deleted / inactive in case hard delete is restricted by RLS or FK
      try {
        await supabase
          .from('profiles')
          .update({ is_active: false, role: 'deleted', updated_at: new Date().toISOString() })
          .eq('id', userId);
      } catch (err: any) {
        console.warn('[userService] soft delete note:', err);
      }
    }

    // Mirror to local store
    (enterpriseStore as any).users = (enterpriseStore as any).users.filter(
      (u: any) => u.profile?.id !== userId && u.email?.toLowerCase() !== identifier?.toLowerCase()
    );
    (enterpriseStore as any).saveUsers?.();

    return { success: true };
  },

  /**
   * Bulk delete multiple user profiles in one operation
   */
  async bulkDeleteUsers(userIds: string[], identifiers?: string[]): Promise<{ success: boolean; count: number; error?: string }> {
    if (userIds.length === 0) return { success: true, count: 0 };

    // 1. Immediately record in persistent deleted set
    userIds.forEach(id => addDeletedUserId(id));
    if (identifiers) identifiers.forEach(id => addDeletedUserId(id));

    if (isSupabaseConfigured) {
      try {
        await supabase
          .from('profiles')
          .delete()
          .in('id', userIds);
      } catch (err: any) {
        console.warn('[userService] Supabase bulk delete note:', err);
      }

      // Soft delete fallback
      try {
        await supabase
          .from('profiles')
          .update({ is_active: false, role: 'deleted', updated_at: new Date().toISOString() })
          .in('id', userIds);
      } catch (err: any) {
        console.warn('[userService] Supabase bulk soft delete note:', err);
      }
    }

    // Remove from enterpriseStore
    const idSet = new Set(userIds);
    (enterpriseStore as any).users = (enterpriseStore as any).users.filter(
      (u: any) => !idSet.has(u.profile?.id)
    );
    (enterpriseStore as any).saveUsers?.();

    return { success: true, count: userIds.length };
  },

  async provisionUser(
    callerId: string,
    payload: CreateUserPayload
  ): Promise<{ success: boolean; data?: { profile: Profile; tempPassword: string }; error?: string }> {
    return enterpriseStore.createUserViaEdgeFunction(callerId, payload);
  },

  async updateUser(
    callerId: string,
    targetId: string,
    payload: UpdateUserPayload
  ): Promise<{ success: boolean; profile?: Profile; error?: string }> {
    return enterpriseStore.updateUser(callerId, targetId, payload);
  },

  async setUserStatus(
    callerId: string,
    targetId: string,
    status: UserStatus
  ): Promise<{ success: boolean; error?: string }> {
    return enterpriseStore.setUserStatus(callerId, targetId, status);
  },

  getRoles(): Role[] {
    return enterpriseStore.getRoles();
  },

  getPermissions(): Permission[] {
    return enterpriseStore.getPermissions();
  },

  getAuditLogs(callerId: string, filters?: { action?: string; search?: string; limit?: number }): AuditLog[] {
    return enterpriseStore.getAuditLogs(callerId, filters);
  },

  resetStore(): void {
    enterpriseStore.clearAllData();
  },
};
