// ==============================================================================
// Inactivity Lock Screen (Module 1 - Auth & Operational Security - Light Theme)
// Displays upon 45-minute inactivity timeout. Requires password re-authentication.
// ==============================================================================

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Lock, LogOut, ArrowRight, ShieldAlert } from 'lucide-react';
import { RoleBadge } from '../common/StatusBadge';

export const InactivityLockScreen: React.FC = () => {
  const { user, role, unlockSession, logout } = useAuth();
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const res = await unlockSession(password);
      if (!res.success) {
        setErrorMessage(res.error || 'Authentication failed. Please verify password.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Unlock error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lock-screen-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-2xl text-center text-slate-800 animate-in fade-in zoom-in-95 duration-200">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 mb-6 shadow-xs">
          <Lock className="h-8 w-8" />
        </div>

        <h1 id="lock-screen-title" className="text-xl font-bold tracking-tight text-slate-900">
          Workstation Session Locked
        </h1>
        <p className="mt-2 text-xs text-slate-500 leading-relaxed">
          Your session has been locked due to 45 minutes of inactivity to protect examination integrity.
        </p>

        {/* User Card */}
        <div className="mt-6 rounded-xl bg-slate-50 border border-slate-200 p-4 text-left shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 font-bold text-white shadow-md">
              {user?.full_name?.charAt(0) || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-slate-900 truncate text-sm">{user?.full_name}</div>
              <div className="text-xs text-slate-500 truncate">{user?.email}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-[11px] font-mono text-slate-600">{user?.badge_number}</span>
                {role && <RoleBadge roleCode={role.code} roleName={role.name} size="sm" />}
              </div>
            </div>
          </div>
          <div className="mt-2.5 text-[11px] text-slate-500 border-t border-slate-200 pt-2 truncate">
            {user?.department}
          </div>
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2 text-left">
            <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleUnlock} className="mt-6 space-y-4">
          <div className="text-left">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Enter Password to Unlock Terminal
            </label>
            <input
              type="password"
              autoFocus
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Workstation password"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 font-mono"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !password}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-600"
          >
            <span>{isSubmitting ? 'Verifying...' : 'Unlock Terminal'}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Different staff member?</span>
          <button
            type="button"
            onClick={() => logout()}
            className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 font-medium transition-colors focus:outline-none"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Exit to Login</span>
          </button>
        </div>
      </div>
    </div>
  );
};
