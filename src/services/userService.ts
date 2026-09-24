// ==============================================================================
// User & Provisioning Service (Module 1 - Auth & Management)
// ==============================================================================

import { Profile, CreateUserPayload, UpdateUserPayload, UserStatus, Role, Permission, AuditLog } from '../types/auth';
import { enterpriseStore } from './store';

export const userService = {
  getUsers(callerId: string, filters?: { search?: string; roleCode?: string; status?: string }): Profile[] {
    return enterpriseStore.getProfiles(callerId, filters);
  },

  getUserById(callerId: string, id: string): Profile | null {
    return enterpriseStore.getProfileById(callerId, id);
  },

  async provisionUser(
    callerId: string,
    payload: CreateUserPayload
  ): Promise<{ success: boolean; data?: { profile: Profile; tempPassword: string }; error?: string }> {
    // In production, this invokes the Supabase Edge Function `create-user` via supabase.functions.invoke.
    // The Edge Function verifies caller JWT and uses service_role credentials securely in the edge runtime.
    // Here we invoke our secure edge function boundary engine.
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
