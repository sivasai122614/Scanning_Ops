// ==============================================================================
// Module 1: Types & Data Interfaces (Enterprise Auth & RBAC)
// ==============================================================================

export type RoleCode =
  | 'super_admin'
  | 'admin'
  | 'supervisor'
  | 'scanner_operator'
  | 'verification_operator'
  | 'coe_user'
  | 'viewer';

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

export interface Role {
  id: string;
  code: RoleCode;
  name: string;
  description: string;
  is_system: boolean;
  created_at: string;
  permissions?: Permission[];
}

export interface Permission {
  id: string;
  code: string;
  module: string;
  description: string;
  created_at: string;
}

export interface RolePermission {
  id: string;
  role_id: string;
  permission_id: string;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role_id: string;
  badge_number: string;
  phone?: string | null;
  department: string;
  status: UserStatus;
  must_change_password: boolean;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
  last_activity_at?: string;
  role?: Role;
}

export type AuditActionType =
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_ACTIVATED'
  | 'USER_DEACTIVATED'
  | 'ROLE_CHANGED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_CHANGED'
  | 'LOGIN'
  | 'LOGOUT'
  | 'SESSION_LOCKED'
  | 'SESSION_UNLOCKED'
  | 'UNAUTHORIZED_ACCESS_ATTEMPT';

export interface AuditLog {
  id: string;
  actor_id?: string | null;
  actor_email?: string | null;
  actor_role?: string | null;
  action: AuditActionType;
  entity_name: string;
  entity_id: string;
  old_values?: Record<string, any> | null;
  new_values?: Record<string, any> | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
}

export interface CreateUserPayload {
  full_name: string;
  email: string;
  badge_number: string;
  phone?: string;
  department: string;
  role_id: string;
  status?: UserStatus;
  initial_password?: string;
}

export interface UpdateUserPayload {
  full_name?: string;
  badge_number?: string;
  phone?: string;
  department?: string;
  role_id?: string;
  status?: UserStatus;
}

export interface AuthSessionState {
  profile: Profile | null;
  role: Role | null;
  permissions: string[];
  isAuthenticated: boolean;
  isLoading: boolean;
  isLocked: boolean;
  mustChangePassword: boolean;
  lockTimeRemaining: number;
}
