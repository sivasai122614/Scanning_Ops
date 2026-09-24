// ==============================================================================
// User Management View (Module 1 - Primary Operational Screen - Light Theme)
// Search, Filter by Role/Status, Staff Table, Direct Activation/Deactivation
// Honest 0 / Empty State Handling
// ==============================================================================

import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { userService } from '../../services/userService';
import { Profile, Role, RoleCode, UserStatus } from '../../types/auth';
import { StatusBadge, RoleBadge } from '../common/StatusBadge';
import { CreateUserModal } from './CreateUserModal';
import { UserDetailsModal } from './UserDetailsModal';
import { EditUserModal } from './EditUserModal';
import {
  Search,
  Filter,
  UserPlus,
  RefreshCw,
  Eye,
  Edit2,
  CheckCircle,
  Ban,
  Users,
  ShieldCheck,
  UserCheck,
  UserX,
  AlertCircle,
} from 'lucide-react';

interface UserManagementViewProps {
  onOpenCreateUserModal?: () => void;
  isCreateModalOpen?: boolean;
  setIsCreateModalOpen?: (open: boolean) => void;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  isCreateModalOpen: controlledCreateOpen,
  setIsCreateModalOpen: controlledSetCreateOpen,
}) => {
  const { user: callerUser, role: callerRole, hasPermission } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');
  const [usersList, setUsersList] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);

  // Internal modal states
  const [localCreateOpen, setLocalCreateOpen] = useState(false);
  const isCreateOpen = controlledCreateOpen !== undefined ? controlledCreateOpen : localCreateOpen;
  const setCreateOpen = controlledSetCreateOpen || setLocalCreateOpen;

  const [selectedUserForDetails, setSelectedUserForDetails] = useState<Profile | null>(null);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<Profile | null>(null);

  const canCreate =
    hasPermission('users:create') ||
    callerRole?.code === 'super_admin' ||
    callerRole?.code === 'admin';
  const canUpdate =
    hasPermission('users:update') ||
    callerRole?.code === 'super_admin' ||
    callerRole?.code === 'admin';
  const canDeactivate =
    hasPermission('users:deactivate') ||
    callerRole?.code === 'super_admin' ||
    callerRole?.code === 'admin';

  const loadData = () => {
    if (!callerUser) return;
    const fetchedUsers = userService.getUsers(callerUser.id, {
      search: searchQuery,
      roleCode: selectedRoleFilter,
      status: selectedStatusFilter,
    });
    setUsersList(fetchedUsers);
    setRoles(userService.getRoles());
  };

  useEffect(() => {
    loadData();
  }, [callerUser, searchQuery, selectedRoleFilter, selectedStatusFilter]);

  // Status statistics counts
  const stats = useMemo(() => {
    if (!callerUser) return { total: 0, active: 0, suspended: 0, deactivated: 0 };
    const all = userService.getUsers(callerUser.id, {});
    return {
      total: all.length,
      active: all.filter(u => u.status === 'ACTIVE').length,
      suspended: all.filter(u => u.status === 'SUSPENDED').length,
      deactivated: all.filter(u => u.status === 'DEACTIVATED').length,
    };
  }, [callerUser, usersList]);

  const handleToggleStatus = async (user: Profile, newStatus: UserStatus) => {
    if (!callerUser) return;
    const res = await userService.setUserStatus(callerUser.id, user.id, newStatus);
    if (res.success) {
      loadData();
      if (selectedUserForDetails?.id === user.id) {
        setSelectedUserForDetails(prev => (prev ? { ...prev, status: newStatus } : null));
      }
    }
  };

  const isFiltering = searchQuery.trim() !== '' || selectedRoleFilter !== 'ALL' || selectedStatusFilter !== 'ALL';

  return (
    <div className="space-y-6">
      {/* Top Banner & Operational Counts */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#172033] flex items-center gap-2.5">
            <Users className="h-6 w-6 text-[#1565D8]" />
            <span>Staff Directory &amp; User Management</span>
          </h1>
          <p className="mt-1 text-xs text-[#64748B]">
            Internal governance of examination personnel, role assignments, and authentication states.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadData}
            className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs font-medium text-[#172033] hover:bg-slate-50 transition-colors shadow-xs"
            title="Refresh list"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </button>

          {canCreate && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-[#1565D8] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#0D47A1] active:bg-[#0A3880] transition-all"
            >
              <UserPlus className="h-4 w-4" />
              <span>Provision User</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-[#E2E8F0] bg-white p-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#64748B]">Total Registered</span>
            <Users className="h-4 w-4 text-[#94A3B8]" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[#172033]">{stats.total}</div>
        </div>

        <div className="rounded-lg border border-[#E2E8F0] bg-white p-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#64748B]">Active Operators</span>
            <UserCheck className="h-4 w-4 text-[#16A34A]" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[#16A34A]">{stats.active}</div>
        </div>

        <div className="rounded-lg border border-[#E2E8F0] bg-white p-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#64748B]">Suspended</span>
            <ShieldCheck className="h-4 w-4 text-[#D97706]" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[#D97706]">{stats.suspended}</div>
        </div>

        <div className="rounded-lg border border-[#E2E8F0] bg-white p-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#64748B]">Deactivated</span>
            <UserX className="h-4 w-4 text-[#DC2626]" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[#DC2626]">{stats.deactivated}</div>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 shadow-xs">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[#64748B]">
              <Search className="h-4 w-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by name, official email, badge number, or department..."
              className="w-full rounded-lg border border-[#E2E8F0] bg-white pl-9 pr-3.5 py-2 text-xs text-[#172033] placeholder-[#94A3B8] focus:border-[#1565D8] focus:outline-none focus:ring-1 focus:ring-[#1565D8]"
            />
          </div>

          {/* Role Filter */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Filter className="h-3.5 w-3.5 text-[#64748B] shrink-0 hidden md:block" />
            <select
              value={selectedRoleFilter}
              onChange={e => setSelectedRoleFilter(e.target.value)}
              className="w-full md:w-48 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs text-[#172033] focus:border-[#1565D8] focus:outline-none focus:ring-1 focus:ring-[#1565D8]"
            >
              <option value="ALL">All Roles ({roles.length})</option>
              {roles.map(r => (
                <option key={r.id} value={r.code}>
                  {r.name}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatusFilter}
              onChange={e => setSelectedStatusFilter(e.target.value)}
              className="w-full md:w-36 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-xs text-[#172033] focus:border-[#1565D8] focus:outline-none focus:ring-1 focus:ring-[#1565D8]"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="DEACTIVATED">Deactivated</option>
            </select>
          </div>
        </div>
      </div>

      {/* Staff Registry Table */}
      <div className="rounded-lg border border-[#E2E8F0] bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#172033]">
            <thead className="border-b border-[#E2E8F0] bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
              <tr>
                <th scope="col" className="px-4 py-3.5">
                  Staff Member
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Official Email
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Badge ID
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Operational Role
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Department
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Status
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Created
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Last Activity
                </th>
                <th scope="col" className="px-4 py-3.5 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {usersList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-[#64748B]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <AlertCircle className="h-8 w-8 text-[#94A3B8]" />
                      <span className="font-semibold text-sm text-[#172033]">
                        {isFiltering ? 'No results found' : 'No users found'}
                      </span>
                      <p className="text-xs text-[#64748B] max-w-sm">
                        {isFiltering
                          ? 'Try adjusting your search query or status/role filter options.'
                          : 'No staff profiles exist yet. Authorized administrators can provision users above.'}
                      </p>
                      {canCreate && !isFiltering && (
                        <button
                          type="button"
                          onClick={() => setCreateOpen(true)}
                          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EAF2FF] text-[#1565D8] border border-[#BFDBFE] text-xs font-semibold hover:bg-[#D8E6FC]"
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          <span>Provision First User</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                usersList.map(u => {
                  const roleCode = (u.role?.code || 'viewer') as RoleCode;
                  const isCurrentCaller = u.id === callerUser?.id;

                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-slate-50 transition-colors group"
                    >
                      {/* Name & Avatar */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#EAF2FF] border border-[#BFDBFE] text-[#1565D8] font-bold text-xs">
                            {u.full_name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-semibold text-[#172033] flex items-center gap-1.5">
                              <span>{u.full_name}</span>
                              {isCurrentCaller && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#EAF2FF] text-[#1565D8] border border-[#BFDBFE] font-semibold">
                                  YOU
                                </span>
                              )}
                              {u.must_change_password && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                                  FIRST RESET PENDING
                                </span>
                              )}
                            </div>
                            {u.phone && <div className="text-[11px] text-slate-400">{u.phone}</div>}
                          </div>
                        </div>
                      </td>

                      {/* Official Email */}
                      <td className="px-4 py-3.5 font-mono text-slate-700">{u.email}</td>

                      {/* Badge Number */}
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-medium">
                          {u.badge_number}
                        </span>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3.5">
                        <RoleBadge roleCode={roleCode} roleName={u.role?.name} size="sm" />
                      </td>

                      {/* Department */}
                      <td className="px-4 py-3.5 text-slate-600 max-w-xs truncate">{u.department}</td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <StatusBadge status={u.status} size="sm" />
                      </td>

                      {/* Created Date */}
                      <td className="px-4 py-3.5 font-mono text-slate-500">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>

                      {/* Last Activity */}
                      <td className="px-4 py-3.5 font-mono text-slate-500">
                        {u.last_activity_at && u.last_activity_at !== 'Never'
                          ? new Date(u.last_activity_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : 'Never'}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View Details */}
                          <button
                            type="button"
                            onClick={() => setSelectedUserForDetails(u)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                            title="View Staff Profile &amp; Permissions"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>

                          {/* Edit User */}
                          {canUpdate && (
                            <button
                              type="button"
                              onClick={() => setSelectedUserForEdit(u)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                              title="Edit User Profile"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {/* Deactivate / Activate Toggle */}
                          {canDeactivate && !isCurrentCaller && (
                            <>
                              {u.status === 'ACTIVE' ? (
                                <button
                                  type="button"
                                  onClick={() => handleToggleStatus(u, 'DEACTIVATED')}
                                  className="p-1.5 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                                  title="Deactivate Account"
                                >
                                  <Ban className="h-3.5 w-3.5" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleToggleStatus(u, 'ACTIVE')}
                                  className="p-1.5 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                                  title="Activate Account"
                                >
                                  <CheckCircle className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <CreateUserModal
        isOpen={isCreateOpen}
        onClose={() => setCreateOpen(false)}
        onUserCreated={loadData}
      />

      <UserDetailsModal
        user={selectedUserForDetails}
        isOpen={Boolean(selectedUserForDetails)}
        onClose={() => setSelectedUserForDetails(null)}
        onEdit={userToEdit => setSelectedUserForEdit(userToEdit)}
        onToggleStatus={handleToggleStatus}
      />

      <EditUserModal
        user={selectedUserForEdit}
        isOpen={Boolean(selectedUserForEdit)}
        onClose={() => setSelectedUserForEdit(null)}
        onUserUpdated={loadData}
      />
    </div>
  );
};
