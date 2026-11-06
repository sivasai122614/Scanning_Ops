// ==============================================================================
// Users Management View
// Realtime synchronized with Supabase public.profiles and Supabase Auth
// Single User Provisioning + Bulk Excel Import + Multi-row Bulk Deletion
// Smooth wave and hover animations with modern typography
// ==============================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { userService } from '../../services/userService';
import { Profile, AppRole } from '../../types/auth';
import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient';
import { CreateUserModal } from './CreateUserModal';
import { BulkImportUsersModal } from './BulkImportUsersModal';
import {
  Users,
  UserPlus,
  FileSpreadsheet,
  Download,
  RefreshCw,
  Search,
  Filter,
  ShieldCheck,
  UserCheck,
  CheckCircle2,
  Ban,
  AlertCircle,
  Shield,
  KeyRound,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface UserManagementViewProps {
  isCreateModalOpen?: boolean;
  setIsCreateModalOpen?: (open: boolean) => void;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  isCreateModalOpen: controlledCreateOpen,
  setIsCreateModalOpen: controlledSetCreateOpen,
}) => {
  const { user: callerUser } = useAuth();

  const [usersList, setUsersList] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');

  // Modals
  const [localCreateOpen, setLocalCreateOpen] = useState(false);
  const isCreateOpen = controlledCreateOpen !== undefined ? controlledCreateOpen : localCreateOpen;
  const setCreateOpen = controlledSetCreateOpen || setLocalCreateOpen;

  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [editingRoleUser, setEditingRoleUser] = useState<Profile | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Fetch users directly from Supabase public.profiles
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await userService.fetchProfilesFromSupabase(callerUser?.id);
      setUsersList(data);
    } catch (err) {
      console.warn('[UserManagementView] Error loading users:', err);
    } finally {
      setIsLoading(false);
    }
  }, [callerUser]);

  useEffect(() => {
    loadData();

    // Subscribe to Realtime Postgres changes on public.profiles
    if (isSupabaseConfigured) {
      const channel = supabase
        .channel('realtime:public:profiles')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'profiles' },
          () => {
            loadData();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [loadData]);

  const showNotification = (msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(null), 3500);
  };

  // Toggle user active / inactive in Supabase public.profiles
  const handleToggleStatus = async (targetUser: Profile) => {
    const newStatus = targetUser.status === 'ACTIVE' ? false : true;
    const res = await userService.toggleUserStatus(targetUser.id, targetUser.status);
    if (res.success) {
      showNotification(`User status updated to ${newStatus ? 'ACTIVE' : 'DEACTIVATED'}.`);
      loadData();
    } else {
      showNotification(`Error updating status: ${res.error}`);
    }
  };

  // Update role in Supabase public.profiles
  const handleRoleChange = async (targetUser: Profile, newRole: AppRole) => {
    const res = await userService.updateUserRole(targetUser.id, newRole);
    if (res.success) {
      showNotification(`User role changed to ${newRole === 'admin' ? 'Administrator' : 'Inward Operator'}.`);
      setEditingRoleUser(null);
      loadData();
    } else {
      showNotification(`Error updating role: ${res.error}`);
    }
  };

  // Direct download clean template with ZERO sample data
  const handleDownloadTemplate = () => {
    const headers = ['Mail Id', 'Password', 'Role'];
    const sampleData = [headers]; // No sample data rows

    const ws = XLSX.utils.aoa_to_sheet(sampleData);
    ws['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Users');
    XLSX.writeFile(wb, 'Users_Bulk_Import_Template.xlsx');
  };

  // Filtered users list
  const filteredUsers = useMemo(() => {
    return usersList.filter(u => {
      // Role filter
      if (selectedRoleFilter !== 'ALL') {
        const r = u.appRole || (u.role?.code as string) || 'inward';
        if (r !== selectedRoleFilter) return false;
      }
      // Status filter
      if (selectedStatusFilter !== 'ALL') {
        if (u.status !== selectedStatusFilter) return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesEmail = u.email.toLowerCase().includes(q);
        const matchesName = u.full_name?.toLowerCase().includes(q) || false;
        const matchesUsername = u.username?.toLowerCase().includes(q) || false;
        if (!matchesEmail && !matchesName && !matchesUsername) return false;
      }
      return true;
    });
  }, [usersList, selectedRoleFilter, selectedStatusFilter, searchQuery]);

  // Statistics with modern numbers
  const stats = useMemo(() => {
    const total = usersList.length;
    const admins = usersList.filter(u => u.appRole === 'admin' || (u.role?.code as string) === 'admin').length;
    const inwards = usersList.filter(u => u.appRole === 'inward' || (u.role?.code as string) === 'inward').length;
    const active = usersList.filter(u => u.status === 'ACTIVE').length;
    return { total, admins, inwards, active };
  }, [usersList]);

  const isFiltering = searchQuery.trim() !== '' || selectedRoleFilter !== 'ALL' || selectedStatusFilter !== 'ALL';

  return (
    <div className="space-y-6 w-full pb-16 select-none font-sans">
      {/* Action Notification Toast */}
      {actionFeedback && (
        <div className="fixed top-16 right-6 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="rounded-xl bg-slate-900 text-white px-4 py-2.5 shadow-xl text-xs flex items-center gap-2 border border-slate-700">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{actionFeedback}</span>
          </div>
        </div>
      )}

      {/* Header & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#1565D8] ring-1 ring-blue-500/20">
              <Users className="h-5 w-5" />
            </div>
            <span>Users Management</span>
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Manage user accounts, assign roles (Admin / Inward), and bulk import credentials from Excel.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Download Template */}
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-all duration-150 cursor-pointer shadow-2xs hover:scale-[1.02] active:scale-95"
            title="Download clean Excel template with Mail Id, Password, Role columns"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span>Template</span>
          </button>

          {/* Import Excel Bulk */}
          <button
            type="button"
            onClick={() => setIsBulkImportOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-[#1565D8] hover:bg-blue-100 hover:border-blue-300 transition-all duration-150 cursor-pointer shadow-2xs hover:scale-[1.02] active:scale-95"
          >
            <FileSpreadsheet className="h-4 w-4 text-[#1565D8]" />
            <span>Import Excel (Bulk)</span>
          </button>

          {/* Refresh */}
          <button
            type="button"
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all duration-150 cursor-pointer shadow-2xs hover:scale-[1.02] active:scale-95"
            title="Refresh from Supabase profiles"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-[#1565D8]' : ''}`} />
            <span>Refresh</span>
          </button>

          {/* Add User */}
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-[#1565D8] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#0D47A1] active:scale-95 transition-all duration-150 cursor-pointer hover:shadow-md hover:shadow-blue-500/20"
          >
            <UserPlus className="h-4 w-4" />
            <span>Add User</span>
          </button>
        </div>
      </div>

      {/* KPI Cards with Modern Typography & Hover Wave */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 w-full">
        {/* Total Users */}
        <div className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:-translate-y-1 hover:shadow-lg hover:border-blue-200 transition-all duration-300 ease-out cursor-default relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50/50 rounded-full blur-xl group-hover:scale-125 transition-transform duration-500 pointer-events-none" />
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Total Users</span>
            <div className="p-1.5 rounded-lg bg-slate-100 group-hover:bg-blue-50 group-hover:text-[#1565D8] transition-colors">
              <Users className="h-4 w-4 text-slate-500 group-hover:text-[#1565D8]" />
            </div>
          </div>
          <div className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 group-hover:text-[#1565D8] transition-colors">
            {stats.total}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-medium flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
            <span>Synced with public.profiles</span>
          </div>
        </div>

        {/* Inward Operators */}
        <div className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:-translate-y-1 hover:shadow-lg hover:border-blue-200 transition-all duration-300 ease-out cursor-default relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50/50 rounded-full blur-xl group-hover:scale-125 transition-transform duration-500 pointer-events-none" />
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Inward Operators</span>
            <div className="p-1.5 rounded-lg bg-blue-50 text-[#1565D8] group-hover:bg-blue-100 transition-colors">
              <KeyRound className="h-4 w-4 text-[#1565D8]" />
            </div>
          </div>
          <div className="mt-2 text-3xl font-extrabold tracking-tight text-[#1565D8]">
            {stats.inwards}
          </div>
          <div className="text-[11px] text-blue-600 font-semibold mt-1">
            Role: inward (Scan Terminal)
          </div>
        </div>

        {/* Administrators */}
        <div className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:-translate-y-1 hover:shadow-lg hover:border-purple-200 transition-all duration-300 ease-out cursor-default relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-50/50 rounded-full blur-xl group-hover:scale-125 transition-transform duration-500 pointer-events-none" />
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Administrators</span>
            <div className="p-1.5 rounded-lg bg-purple-50 text-purple-700 group-hover:bg-purple-100 transition-colors">
              <ShieldCheck className="h-4 w-4 text-purple-600" />
            </div>
          </div>
          <div className="mt-2 text-3xl font-extrabold tracking-tight text-purple-700">
            {stats.admins}
          </div>
          <div className="text-[11px] text-purple-600 font-semibold mt-1">
            Role: admin (Full Governance)
          </div>
        </div>

        {/* Active Accounts */}
        <div className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:-translate-y-1 hover:shadow-lg hover:border-emerald-200 transition-all duration-300 ease-out cursor-default relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50/50 rounded-full blur-xl group-hover:scale-125 transition-transform duration-500 pointer-events-none" />
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>Active Accounts</span>
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100 transition-colors">
              <UserCheck className="h-4 w-4 text-emerald-600" />
            </div>
          </div>
          <div className="mt-2 text-3xl font-extrabold tracking-tight text-emerald-600">
            {stats.active}
          </div>
          <div className="text-[11px] text-emerald-600 font-semibold mt-1 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>Status: is_active = true</span>
          </div>
        </div>
      </div>

      {/* Search, Filters, and Bulk Action Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs w-full space-y-3">
        <div className="flex flex-col md:flex-row items-center gap-3 w-full">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
              <Search className="h-4 w-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by Mail Id or username..."
              className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-[#1565D8] focus:ring-2 focus:ring-[#1565D8]/20 focus:outline-hidden transition-all"
            />
          </div>

          {/* Role Filter */}
          <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
            <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0 hidden md:block" />
            <select
              value={selectedRoleFilter}
              onChange={e => setSelectedRoleFilter(e.target.value)}
              className="w-full md:w-44 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#1565D8] focus:ring-2 focus:ring-[#1565D8]/20 focus:outline-hidden font-medium cursor-pointer"
            >
              <option value="ALL">All Roles ({stats.total})</option>
              <option value="inward">Inward Operator ({stats.inwards})</option>
              <option value="admin">Administrator ({stats.admins})</option>
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatusFilter}
              onChange={e => setSelectedStatusFilter(e.target.value)}
              className="w-full md:w-36 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#1565D8] focus:ring-2 focus:ring-[#1565D8]/20 focus:outline-hidden font-medium cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="DEACTIVATED">Deactivated</option>
            </select>
          </div>
        </div>

      </div>

      {/* Users Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs w-full">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs text-slate-800">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th scope="col" className="px-5 py-3.5">
                  User / Mail Id
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Role
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Account Status
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Created Date
                </th>
                <th scope="col" className="px-5 py-3.5 text-right">
                  Account Control
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="h-6 w-6 animate-spin text-[#1565D8]" />
                      <span className="font-semibold text-xs text-slate-700">Loading users from Supabase...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <AlertCircle className="h-8 w-8 text-slate-400" />
                      <span className="font-bold text-sm text-slate-800">
                        {isFiltering ? 'No matching users found' : 'No users found'}
                      </span>
                      <p className="text-xs text-slate-500 max-w-sm">
                        {isFiltering
                          ? 'Try adjusting your search query or role/status filters.'
                          : 'Use "Add User" or "Import Excel (Bulk)" above to add user accounts.'}
                      </p>
                      {!isFiltering && (
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setCreateOpen(true)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1565D8] text-white text-xs font-semibold hover:bg-[#0D47A1] cursor-pointer"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            <span>Add First User</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsBulkImportOpen(true)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                          >
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                            <span>Bulk Import Excel</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map(u => {
                  const isCurrentCaller = u.id === callerUser?.id;
                  const rawRole = String(u.appRole || u.role?.code || 'inward').toLowerCase();
                  const roleCode: AppRole = rawRole === 'admin' ? 'admin' : 'inward';
                  const isActive = u.status === 'ACTIVE';

                  return (
                    <tr
                      key={u.id}
                      className="transition-colors duration-150 hover:bg-slate-50/90"
                    >
                      {/* User / Mail Id */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-bold text-xs border transition-transform duration-200 group-hover:scale-105 ${
                              roleCode === 'admin'
                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                : 'bg-blue-50 text-[#1565D8] border-blue-200'
                            }`}
                          >
                            {u.email.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                              <span>{u.email}</span>
                              {isCurrentCaller && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-50 text-[#1565D8] border border-blue-200 font-bold">
                                  YOU
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 font-medium">
                              User: {u.username || u.email.split('@')[0]}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td
                        className="px-4 py-3.5"
                        onClick={e => e.stopPropagation()}
                      >
                        {editingRoleUser?.id === u.id ? (
                          <div className="flex items-center gap-1.5">
                            <select
                              defaultValue={roleCode}
                              onChange={e => handleRoleChange(u, e.target.value as AppRole)}
                              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold focus:outline-hidden cursor-pointer"
                            >
                              <option value="inward">inward</option>
                              <option value="admin">admin</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => setEditingRoleUser(null)}
                              className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1 border transition-all ${
                                roleCode === 'admin'
                                  ? 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100'
                                  : 'bg-blue-50 text-[#1565D8] border-blue-200 hover:bg-blue-100'
                              }`}
                            >
                              <Shield className="h-3 w-3" />
                              <span>{roleCode}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => setEditingRoleUser(u)}
                              className="text-[11px] text-slate-400 hover:text-[#1565D8] underline font-medium cursor-pointer"
                              title="Change Role"
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Account Status */}
                      <td
                        className="px-4 py-3.5"
                        onClick={e => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(u)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold cursor-pointer transition-all hover:scale-105 active:scale-95 ${
                            isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                          }`}
                          title="Click to toggle account status"
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}
                          />
                          <span>{isActive ? 'ACTIVE' : 'DEACTIVATED'}</span>
                        </button>
                      </td>

                      {/* Created Date */}
                      <td className="px-4 py-3.5 font-medium text-slate-600 text-xs">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                      </td>

                      {/* Actions */}
                      <td
                        className="px-5 py-3.5 text-right"
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Toggle Active / Deactivated */}
                          {!isCurrentCaller && (
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(u)}
                              className={`p-1.5 rounded-lg border transition-all duration-150 cursor-pointer hover:scale-110 active:scale-90 ${
                                isActive
                                  ? 'border-slate-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300'
                                  : 'border-slate-200 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300'
                              }`}
                              title={isActive ? 'Deactivate Account' : 'Activate Account'}
                            >
                              {isActive ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                            </button>
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

      {/* Single User Creation Modal */}
      <CreateUserModal
        isOpen={isCreateOpen}
        onClose={() => setCreateOpen(false)}
        onUserCreated={loadData}
      />

      {/* Excel Bulk Import Modal */}
      <BulkImportUsersModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        onUsersImported={loadData}
      />
    </div>
  );
};
