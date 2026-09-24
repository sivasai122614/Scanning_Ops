// ==============================================================================
// Mandatory First-Time Password Change Modal (Module 1 - Auth & Governance - Light Theme)
// User cannot bypass this screen until compliant credentials are saved
// ==============================================================================

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { KeyRound, ShieldAlert, Check, X, AlertCircle } from 'lucide-react';

export const ForcedPasswordChangeModal: React.FC = () => {
  const { user, changePassword } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Password criteria
  const hasMinLength = newPassword.length >= 8;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
  const isMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const isDifferentFromOld = newPassword.length > 0 && newPassword !== currentPassword;

  const isFormValid =
    hasMinLength && hasUpper && hasLower && hasNumber && hasSpecial && isMatch && isDifferentFromOld;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!isFormValid) {
      setErrorMessage('Please satisfy all institutional password security rules before proceeding.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await changePassword(currentPassword, newPassword);
      if (!result.success) {
        setErrorMessage(result.error || 'Failed to update credentials. Please verify your current password.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred during password change.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="forced-password-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl p-6 sm:p-8 text-slate-800 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 border border-amber-200 text-amber-700">
            <KeyRound className="h-6 w-6" />
          </div>
          <div>
            <h2 id="forced-password-title" className="text-lg font-bold tracking-tight text-slate-900">
              Mandatory Password Change
            </h2>
            <p className="text-xs text-slate-500">
              Institutional Security Policy: First-time credential initialization required.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-start gap-2.5">
          <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-amber-900">Action Required:</span> You have been provisioned with a temporary
            password. Per university exam governance, you cannot access operational queues until you establish a
            private compliant password.
          </div>
        </div>

        <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
          <div className="text-slate-500">Authenticated Staff:</div>
          <div className="font-semibold text-slate-900 mt-0.5">
            {user?.full_name} ({user?.badge_number})
          </div>
          <div className="text-slate-500 font-mono text-[11px]">{user?.email}</div>
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Current / Temporary Password <span className="text-rose-500">*</span>
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="Enter current or temporary password"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              New Password <span className="text-rose-500">*</span>
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Create strong compliant password"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Confirm New Password <span className="text-rose-500">*</span>
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 font-mono"
            />
          </div>

          {/* Validation Checklist */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1.5 text-xs">
            <div className="text-slate-600 font-semibold mb-1">Password Complexity Rules:</div>
            <div className={`flex items-center gap-2 ${hasMinLength ? 'text-emerald-700 font-medium' : 'text-slate-400'}`}>
              {hasMinLength ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <X className="h-3.5 w-3.5" />}
              <span>At least 8 characters in length</span>
            </div>
            <div className={`flex items-center gap-2 ${hasUpper ? 'text-emerald-700 font-medium' : 'text-slate-400'}`}>
              {hasUpper ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <X className="h-3.5 w-3.5" />}
              <span>At least one uppercase letter (A-Z)</span>
            </div>
            <div className={`flex items-center gap-2 ${hasLower ? 'text-emerald-700 font-medium' : 'text-slate-400'}`}>
              {hasLower ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <X className="h-3.5 w-3.5" />}
              <span>At least one lowercase letter (a-z)</span>
            </div>
            <div className={`flex items-center gap-2 ${hasNumber ? 'text-emerald-700 font-medium' : 'text-slate-400'}`}>
              {hasNumber ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <X className="h-3.5 w-3.5" />}
              <span>At least one numeral (0-9)</span>
            </div>
            <div className={`flex items-center gap-2 ${hasSpecial ? 'text-emerald-700 font-medium' : 'text-slate-400'}`}>
              {hasSpecial ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <X className="h-3.5 w-3.5" />}
              <span>At least one special character (@#$%&amp;*)</span>
            </div>
            <div className={`flex items-center gap-2 ${isMatch ? 'text-emerald-700 font-medium' : 'text-slate-400'}`}>
              {isMatch ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <X className="h-3.5 w-3.5" />}
              <span>Password confirmation matches</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={!isFormValid || isSubmitting}
            className="w-full mt-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all focus:outline-none focus:ring-2 focus:ring-indigo-600"
          >
            {isSubmitting ? 'Updating Credentials...' : 'Save Password & Unlock Operational Access'}
          </button>
        </form>
      </div>
    </div>
  );
};
