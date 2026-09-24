// ==============================================================================
// Staff Profile Detail Modal (Module 1 - Auth & User Management - Light Theme)
// ==============================================================================

import React from 'react';
import { Profile } from '../../types/auth';
import { useAuth } from '../../context/AuthContext';
import { StatusBadge, RoleBadge } from '../common/StatusBadge';
import { X, Mail, Phone, Building, Calendar, Clock, Shield, KeyRound, CheckCircle } from 'lucide-react';
import { enterpriseStore } from '../../services/store';

interface UserDetailsModalProps {
  user: Profile | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (user: Profile) => void;
  onToggleStatus: (user: Profile, newStatus: 'ACTIVE' | 'DEACTIVATED' | 'SUSPENDED') => void;
}

export const UserDetailsModal: React.FC<UserDetailsModalProps> = ({
  user,
  isOpen,
  onClose,
  onEdit,
  onToggleStatus,
}) => {
  const { hasPermission, role: callerRole, user: callerUser } = useAuth();

  if (!isOpen || !user) return null;

  const roleCode = user.role?.code || 'viewer';
  const permissions = enterpriseStore.getRolePermissions(roleCode);
  const canUpdate =
    hasPermission('users:update') ||
    callerRole?.code === 'super_admin' ||
    callerRole?.code === 'admin';
  const canDeactivate =
    hasPermission('users:deactivate') ||
    callerRole?.code === 'super_admin' ||
    callerRole?.code === 'admin';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-details-title"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-2xl text-slate-800 my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 font-bold text-white text-lg shadow-md">
              {user.full_name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="user-details-title" className="text-lg font-bold text-slate-900">
                  {user.full_name}
                </h2>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700">
                  {user.badge_number}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <RoleBadge roleCode={roleCode} roleName={user.role?.name} size="sm" />
                <StatusBadge status={user.status} size="sm" />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="mt-6 space-y-6">
          {/* Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs">
            <div className="flex items-center gap-2.5">
              <Mail className="h-4 w-4 text-indigo-600 shrink-0" />
              <div className="min-w-0">
                <div className="text-slate-500">Official Email</div>
                <div className="font-mono font-medium text-slate-900 truncate">{user.email}</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <Phone className="h-4 w-4 text-indigo-600 shrink-0" />
              <div>
                <div className="text-slate-500">Phone Contact</div>
                <div className="font-medium text-slate-900">{user.phone || 'Not recorded'}</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <Building className="h-4 w-4 text-indigo-600 shrink-0" />
              <div>
                <div className="text-slate-500">Assigned Department</div>
                <div className="font-medium text-slate-900">{user.department}</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <KeyRound className="h-4 w-4 text-indigo-600 shrink-0" />
              <div>
                <div className="text-slate-500">Forced Password Rotation</div>
                <div className="font-medium">
                  {user.must_change_password ? (
                    <span className="text-amber-700 font-semibold">Pending First Login Reset</span>
                  ) : (
                    <span className="text-emerald-700 font-medium">Cleared / Established</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <Calendar className="h-4 w-4 text-indigo-600 shrink-0" />
              <div>
                <div className="text-slate-500">Provisioned Date</div>
                <div className="font-mono text-slate-700">
                  {new Date(user.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <Clock className="h-4 w-4 text-indigo-600 shrink-0" />
              <div>
                <div className="text-slate-500">Last Recorded Activity</div>
                <div className="font-mono text-slate-700">
                  {user.last_activity_at && user.last_activity_at !== 'Never'
                    ? new Date(user.last_activity_at).toLocaleString()
                    : 'No sessions recorded yet'}
                </div>
              </div>
            </div>
          </div>

          {/* Assigned Permissions Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-700">
                <Shield className="h-4 w-4 text-indigo-600" />
                <span>Effective Role Permissions ({permissions.length} actions)</span>
              </div>
              <span className="text-[11px] text-slate-500">Evaluated via auth.has_permission()</span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 max-h-48 overflow-y-auto">
              {permissions.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-500">No permissions assigned</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {permissions.map(permCode => (
                    <div
                      key={permCode}
                      className="flex items-center gap-2 rounded bg-white border border-slate-200 px-2.5 py-1 text-slate-800 shadow-2xs"
                    >
                      <CheckCircle className="h-3 w-3 text-emerald-600 shrink-0" />
                      <span className="font-mono text-[11px] text-slate-800">{permCode}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {canDeactivate && user.id !== callerUser?.id && (
                <>
                  {user.status === 'ACTIVE' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onToggleStatus(user, 'SUSPENDED')}
                        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 transition-colors"
                      >
                        Suspend Account
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleStatus(user, 'DEACTIVATED')}
                        className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-100 transition-colors"
                      >
                        Deactivate Account
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onToggleStatus(user, 'ACTIVE')}
                      className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 transition-colors"
                    >
                      Activate Account
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              {canUpdate && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEdit(user);
                  }}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors shadow-xs"
                >
                  Edit Profile
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
