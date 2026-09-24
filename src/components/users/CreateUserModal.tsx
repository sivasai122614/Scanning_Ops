// ==============================================================================
// Admin User Provisioning Modal (Module 1 - Auth & User Management - Light Theme)
// Only Admins / Super Admins can execute this flow; invokes Edge Function simulator
// Sets must_change_password = true
// ==============================================================================

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { userService } from '../../services/userService';
import { Role, UserStatus } from '../../types/auth';
import { UserPlus, ShieldAlert, CheckCircle2, Copy, Check, X, KeyRound } from 'lucide-react';

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserCreated: () => void;
}

export const CreateUserModal: React.FC<CreateUserModalProps> = ({
  isOpen,
  onClose,
  onUserCreated,
}) => {
  const { user: callerUser, hasPermission, role: callerRole } = useAuth();
  const roles = userService.getRoles();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [badgeNumber, setBadgeNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('Valuation Directorate');
  const [selectedRoleId, setSelectedRoleId] = useState(roles[4]?.id || roles[0]?.id || '');
  const [status, setStatus] = useState<UserStatus>('ACTIVE');
  const [customTempPassword, setCustomTempPassword] = useState('');

  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdSuccessData, setCreatedSuccessData] = useState<{
    name: string;
    email: string;
    badge: string;
    tempPassword: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const canCreate =
    hasPermission('users:create') ||
    callerRole?.code === 'super_admin' ||
    callerRole?.code === 'admin';

  const resetForm = () => {
    setFullName('');
    setEmail('');
    setBadgeNumber('');
    setPhone('');
    setDepartment('Valuation Directorate');
    setSelectedRoleId(roles[4]?.id || roles[0]?.id || '');
    setStatus('ACTIVE');
    setCustomTempPassword('');
    setErrorMessage('');
    setCreatedSuccessData(null);
    setCopied(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleCopyPassword = () => {
    if (!createdSuccessData) return;
    navigator.clipboard.writeText(createdSuccessData.tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!callerUser) return;
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const res = await userService.provisionUser(callerUser.id, {
        full_name: fullName.trim(),
        email: email.trim(),
        badge_number: badgeNumber.trim().toUpperCase(),
        phone: phone.trim() || undefined,
        department: department.trim(),
        role_id: selectedRoleId,
        status,
        initial_password: customTempPassword.trim() || undefined,
      });

      if (!res.success || !res.data) {
        setErrorMessage(res.error || 'Failed to provision user.');
      } else {
        setCreatedSuccessData({
          name: res.data.profile.full_name,
          email: res.data.profile.email,
          badge: res.data.profile.badge_number,
          tempPassword: res.data.tempPassword,
        });
        onUserCreated();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred during user provisioning.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="provision-title"
    >
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-2xl text-slate-800 my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 id="provision-title" className="text-base font-bold text-slate-900">
                Provision Operational Staff Account
              </h2>
              <p className="text-xs text-slate-500">
                Secure Edge Function Provisioning • Strictly Zero Self-Registration
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Security / Permission Check Warning */}
        {!canCreate ? (
          <div className="mt-4 rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-800 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-rose-600 shrink-0" />
            <div>
              <div className="font-semibold text-rose-900">Access Denied (RLS Enforced)</div>
              <div>
                Your current role does not possess the <span className="font-mono">users:create</span> permission.
                Only Super Administrators and Operations Administrators may provision personnel accounts.
              </div>
            </div>
          </div>
        ) : createdSuccessData ? (
          /* Success Screen */
          <div className="mt-5 space-y-4">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-xs text-emerald-800 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-sm text-emerald-900">Personnel Provisioned Successfully</div>
                <div className="mt-1 leading-relaxed text-emerald-800">
                  The account has been created in the authentication directory and profiles registry. The user has
                  been flagged with <span className="font-mono font-semibold text-emerald-950">must_change_password = true</span>.
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2.5 text-xs">
              <div className="flex justify-between border-b border-slate-200/80 pb-2">
                <span className="text-slate-500">Staff Full Name:</span>
                <span className="font-semibold text-slate-900">{createdSuccessData.name}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200/80 pb-2">
                <span className="text-slate-500">Official Email:</span>
                <span className="font-mono text-indigo-700 font-medium">{createdSuccessData.email}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200/80 pb-2">
                <span className="text-slate-500">Badge Number:</span>
                <span className="font-mono font-semibold text-slate-900">{createdSuccessData.badge}</span>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-slate-500 font-medium">Temporary Password:</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm bg-white border border-slate-300 px-2.5 py-1 rounded text-slate-900 font-bold shadow-xs">
                    {createdSuccessData.tempPassword}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyPassword}
                    className="flex items-center gap-1 rounded bg-indigo-600 px-2.5 py-1 text-xs text-white hover:bg-indigo-700 transition-colors shadow-xs"
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 italic">
              * Note: For security, deliver this temporary credential through official confidential channels. The user
              will be forced to establish a permanent password immediately upon their first login.
            </div>

            <div className="pt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors shadow-xs"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {errorMessage && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="e.g. Dr. Rajesh Verma"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Official Email <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="staff.name@exam-ops.gov.edu"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Official Badge Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={badgeNumber}
                  onChange={e => setBadgeNumber(e.target.value)}
                  placeholder="e.g. VER-884, SCN-102"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Phone (Optional)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Department <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                  placeholder="e.g. Spot Valuation Center Alpha"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Initial Account Status
                </label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as UserStatus)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                >
                  <option value="ACTIVE">ACTIVE (Operational)</option>
                  <option value="SUSPENDED">SUSPENDED (Pending Review)</option>
                  <option value="DEACTIVATED">DEACTIVATED (Locked)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Assigned Operational Role <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedRoleId}
                onChange={e => setSelectedRoleId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
              >
                {roles.length === 0 ? (
                  <option value="">No roles available</option>
                ) : (
                  roles.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.code}) — {r.description}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-slate-700">
                  Custom Temporary Password (Optional)
                </label>
                <span className="text-[11px] text-slate-500">Leave blank for auto-generation</span>
              </div>
              <input
                type="text"
                value={customTempPassword}
                onChange={e => setCustomTempPassword(e.target.value)}
                placeholder="Auto-generates high-entropy compliant password if empty"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 font-mono"
              />
            </div>

            <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-3 text-[11px] text-indigo-800 flex items-start gap-2">
              <KeyRound className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-indigo-900">Mandatory Policy:</span> Every newly provisioned
                user is configured with <span className="font-mono font-medium">must_change_password = true</span>. They cannot
                access valuation workflows until completing their first-time password rotation.
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-200">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !fullName || !email || !badgeNumber}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-md hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? 'Provisioning Staff...' : 'Provision Staff Account'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
