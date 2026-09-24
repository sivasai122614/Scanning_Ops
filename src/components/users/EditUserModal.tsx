// ==============================================================================
// Edit User Modal (Module 1 - Auth & User Governance - Light Theme)
// Admin controlled modification of staff parameters & role assignment
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { Profile, UserStatus } from '../../types/auth';
import { useAuth } from '../../context/AuthContext';
import { userService } from '../../services/userService';
import { X, ShieldAlert } from 'lucide-react';

interface EditUserModalProps {
  user: Profile | null;
  isOpen: boolean;
  onClose: () => void;
  onUserUpdated: () => void;
}

export const EditUserModal: React.FC<EditUserModalProps> = ({
  user,
  isOpen,
  onClose,
  onUserUpdated,
}) => {
  const { user: callerUser, role: callerRole } = useAuth();
  const roles = userService.getRoles();

  const [fullName, setFullName] = useState('');
  const [badgeNumber, setBadgeNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [roleId, setRoleId] = useState('');
  const [status, setStatus] = useState<UserStatus>('ACTIVE');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || '');
      setBadgeNumber(user.badge_number || '');
      setPhone(user.phone || '');
      setDepartment(user.department || '');
      setRoleId(user.role_id || '');
      setStatus(user.status || 'ACTIVE');
      setErrorMessage('');
    }
  }, [user]);

  if (!isOpen || !user) return null;

  const isAdmin = callerRole?.code === 'super_admin' || callerRole?.code === 'admin';
  const isSelf = callerUser?.id === user.id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!callerUser) return;
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const res = await userService.updateUser(callerUser.id, user.id, {
        full_name: fullName.trim(),
        badge_number: badgeNumber.trim().toUpperCase(),
        phone: phone.trim() || undefined,
        department: department.trim(),
        role_id: isAdmin ? roleId : undefined,
        status: isAdmin ? status : undefined,
      });

      if (!res.success) {
        setErrorMessage(res.error || 'Failed to update user profile.');
      } else {
        onUserUpdated();
        onClose();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-user-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl text-slate-800 my-8 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h2 id="edit-user-title" className="text-base font-bold text-slate-900">
              Edit Staff Profile
            </h2>
            <p className="text-xs text-slate-500">Update personnel metadata and operational parameters</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">Official Email (Immutable)</label>
            <input
              type="email"
              disabled
              value={user.email}
              className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-slate-500 cursor-not-allowed font-mono"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Badge Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                disabled={!isAdmin}
                value={badgeNumber}
                onChange={e => setBadgeNumber(e.target.value)}
                className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 font-mono focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 ${
                  !isAdmin ? 'opacity-60 cursor-not-allowed bg-slate-100' : ''
                }`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Department</label>
              <input
                type="text"
                value={department}
                onChange={e => setDepartment(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Phone Contact</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
              />
            </div>
          </div>

          {isAdmin && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Operational Role (Admin Only)
                </label>
                <select
                  value={roleId}
                  onChange={e => setRoleId(e.target.value)}
                  disabled={isSelf && callerRole?.code === 'super_admin'}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                >
                  {roles.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Account Status (Admin Only)
                </label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as UserStatus)}
                  disabled={isSelf}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                  <option value="DEACTIVATED">DEACTIVATED</option>
                </select>
              </div>
            </div>
          )}

          <div className="pt-3 flex justify-end gap-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !fullName.trim()}
              className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 transition-colors shadow-xs"
            >
              {isSubmitting ? 'Saving...' : 'Save Profile Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
