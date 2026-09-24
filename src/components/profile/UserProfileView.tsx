// ==============================================================================
// Logged-in User Profile View (Module 1 - Auth & Self-Service - Light Theme)
// Shows personal credentials, effective permissions, and allowed updates
// ==============================================================================

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { userService } from '../../services/userService';
import { StatusBadge, RoleBadge } from '../common/StatusBadge';
import { User, Shield, KeyRound, Check, AlertCircle, CheckCircle2 } from 'lucide-react';
import { enterpriseStore } from '../../services/store';
import { RoleCode } from '../../types/auth';

export const UserProfileView: React.FC = () => {
  const { user, role, refreshProfile, changePassword } = useAuth();

  const [phone, setPhone] = useState(user?.phone || '');
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Change password states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isUpdatingPwd, setIsUpdatingPwd] = useState(false);

  if (!user) return null;

  const roleCode = (role?.code || 'viewer') as RoleCode;
  const permissions = enterpriseStore.getRolePermissions(roleCode);

  const handleUpdateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingProfile(true);
    setProfileMsg(null);

    try {
      const res = await userService.updateUser(user.id, user.id, {
        phone: phone.trim() || undefined,
      });

      if (res.success) {
        refreshProfile();
        setProfileMsg({ type: 'success', text: 'Contact telephone successfully updated in staff registry.' });
      } else {
        setProfileMsg({ type: 'error', text: res.error || 'Failed to update contact info.' });
      }
    } catch (err: any) {
      setProfileMsg({ type: 'error', text: err.message || 'System error.' });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(null);

    if (newPassword.length < 8) {
      setPwdMsg({ type: 'error', text: 'New password must be at least 8 characters long.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPwdMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setIsUpdatingPwd(true);
    try {
      const res = await changePassword(currentPassword, newPassword);
      if (res.success) {
        setPwdMsg({ type: 'success', text: 'Password successfully changed and updated in authentication directory.' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPwdMsg({ type: 'error', text: res.error || 'Current password was incorrect.' });
      }
    } catch (err: any) {
      setPwdMsg({ type: 'error', text: err.message || 'Failed to change password.' });
    } finally {
      setIsUpdatingPwd(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 font-bold text-white text-2xl shadow-md">
              {user.full_name?.charAt(0) || 'U'}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-slate-900">{user.full_name}</h1>
                <span className="font-mono text-xs px-2.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700">
                  {user.badge_number}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-500">{user.email}</div>
              <div className="mt-2 flex items-center gap-2">
                <RoleBadge roleCode={roleCode} roleName={role?.name} size="sm" />
                <StatusBadge status={user.status} size="sm" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Staff Details & Contact Form */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
              <User className="h-4 w-4 text-indigo-600" />
              <span>Official Institutional Record</span>
            </h2>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-500 block mb-0.5">Assigned Department</span>
                <span className="font-medium text-slate-900">{user.department}</span>
              </div>

              <div>
                <span className="text-slate-500 block mb-0.5">Assigned Operational Role</span>
                <span className="font-medium text-slate-900">
                  {role?.name} ({role?.code})
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">{role?.description}</p>
              </div>

              <div>
                <span className="text-slate-500 block mb-0.5">Account Creation Date</span>
                <span className="font-mono text-slate-700">
                  {new Date(user.created_at).toLocaleDateString()}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block mb-0.5">Security Notice</span>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Per valuation policy, sensitive identity markers (Full Name, Official Email, Badge Number, and
                  Role) are managed strictly by institutional administrators.
                </p>
              </div>
            </div>

            {/* Editable Contact Info */}
            <form onSubmit={handleUpdateContact} className="pt-3 border-t border-slate-100 space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  Contact Phone Number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                />
              </div>

              {profileMsg && (
                <div
                  className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                    profileMsg.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {profileMsg.type === 'success' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>{profileMsg.text}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isUpdatingProfile}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-xs"
              >
                {isUpdatingProfile ? 'Saving...' : 'Update Contact Info'}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Password Rotation & Effective Permissions */}
        <div className="space-y-6">
          {/* Password Change Form */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
              <KeyRound className="h-4 w-4 text-indigo-600" />
              <span>Change Workstation Password</span>
            </h2>

            <form onSubmit={handleChangePassword} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Current Password</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 font-mono focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">New Password (Min 8 chars)</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 font-mono focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Confirm New Password</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 font-mono focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                />
              </div>

              {pwdMsg && (
                <div
                  className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                    pwdMsg.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {pwdMsg.type === 'success' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>{pwdMsg.text}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isUpdatingPwd || !newPassword || !currentPassword}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-xs"
              >
                {isUpdatingPwd ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>

          {/* Permissions Overview */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-indigo-600" />
                <span>My Active Permissions</span>
              </div>
              <span className="font-mono text-xs text-indigo-700 font-semibold">{permissions.length} actions</span>
            </h2>

            <div className="max-h-48 overflow-y-auto space-y-1.5 text-xs pr-1">
              {permissions.map(p => (
                <div
                  key={p}
                  className="flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1 text-slate-700 font-mono text-[11px]"
                >
                  <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>{p}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
