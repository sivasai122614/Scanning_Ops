// ==============================================================================
// Create User Modal (Single User Provisioning)
// Inputs: 1. Mail Id, 2. Password, 3. Role
// Automatically provisions user in Supabase Authentication & public.profiles
// ==============================================================================

import React, { useState } from 'react';
import { userService } from '../../services/userService';
import { AppRole } from '../../types/auth';
import {
  UserPlus,
  Mail,
  Lock,
  Shield,
  Eye,
  EyeOff,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react';

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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AppRole>('inward');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [createdUser, setCreatedUser] = useState<{
    email: string;
    role: AppRole;
    tempPassword?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#$';
    let pwd = '';
    for (let i = 0; i < 10; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(pwd);
  };

  const handleClose = () => {
    setEmail('');
    setPassword('');
    setRole('inward');
    setErrorMessage('');
    setCreatedUser(null);
    setCopied(false);
    onClose();
  };

  const handleCopyPassword = () => {
    if (createdUser?.tempPassword) {
      navigator.clipboard.writeText(createdUser.tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail) {
      setErrorMessage('Please enter Mail Id.');
      return;
    }
    if (!cleanPassword || cleanPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await userService.createAuthUser({
        email: cleanEmail,
        password: cleanPassword,
        role,
        fullName: cleanEmail.split('@')[0],
      });

      if (!res.success) {
        setErrorMessage(res.error || 'Failed to create user account.');
      } else {
        setCreatedUser({
          email: cleanEmail,
          role,
          tempPassword: cleanPassword,
        });
        onUserCreated();
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
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 shadow-2xl text-slate-800 my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 border border-blue-200 text-[#1565D8]">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Add New User</h2>
              <p className="text-xs text-slate-500">
                Create user credentials and assign operational role
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

        {/* Success Screen */}
        {createdUser ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-xs text-emerald-800 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-sm text-emerald-950">User Created Successfully!</div>
                <div className="mt-1 leading-relaxed text-emerald-800">
                  Account is active in Supabase Authentication and verified in public.profiles.
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2.5 text-xs">
              <div className="flex justify-between border-b border-slate-200/80 pb-2">
                <span className="text-slate-500">Mail Id:</span>
                <span className="font-mono font-bold text-slate-900">{createdUser.email}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200/80 pb-2 items-center">
                <span className="text-slate-500">Assigned Role:</span>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
                    createdUser.role === 'admin'
                      ? 'bg-purple-100 text-purple-800 border border-purple-200'
                      : 'bg-blue-100 text-[#1565D8] border border-blue-200'
                  }`}
                >
                  {createdUser.role === 'admin' ? 'Administrator' : 'Inward Operator'}
                </span>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-slate-500 font-medium">Password:</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm bg-white border border-slate-300 px-2.5 py-1 rounded text-slate-900 font-bold shadow-2xs">
                    {createdUser.tempPassword}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyPassword}
                    className="flex items-center gap-1 rounded bg-[#1565D8] px-2.5 py-1 text-xs text-white hover:bg-[#0D47A1] transition-colors shadow-2xs"
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="w-full rounded-xl bg-[#1565D8] py-2.5 text-xs font-semibold text-white hover:bg-[#0D47A1] transition-colors shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Form with 1. Mail Id, 2. Password, 3. Role */
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {errorMessage && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* 1. Mail Id */}
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1.5 flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-slate-500" />
                <span>1. Mail Id</span>
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="e.g. operator@gmail.com"
                className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 placeholder-slate-400 focus:border-[#1565D8] focus:ring-2 focus:ring-[#1565D8]/20 focus:outline-hidden font-mono"
              />
            </div>

            {/* 2. Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-slate-500" />
                  <span>2. Password</span>
                  <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={generateRandomPassword}
                  className="text-[11px] font-semibold text-[#1565D8] hover:underline"
                >
                  Generate Password
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full h-10 rounded-xl border border-slate-300 bg-white pl-3 pr-10 text-xs text-slate-900 placeholder-slate-400 focus:border-[#1565D8] focus:ring-2 focus:ring-[#1565D8]/20 focus:outline-hidden font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* 3. Role */}
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1.5 flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-slate-500" />
                <span>3. Role</span>
                <span className="text-rose-500">*</span>
              </label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as AppRole)}
                className="w-full h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-[#1565D8] focus:ring-2 focus:ring-[#1565D8]/20 focus:outline-hidden font-medium"
              >
                <option value="inward">Inward Operator (Inward Terminal &amp; Scanning Access)</option>
                <option value="admin">Admin (Full Dashboard, Reports &amp; Settings Access)</option>
              </select>
              <div className="mt-1 text-[11px] text-slate-400">
                Role is strictly verified against <span className="font-mono">public.profiles</span> in PostgreSQL.
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-200">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !email.trim() || !password.trim()}
                className="px-5 py-2 rounded-xl bg-[#1565D8] text-xs font-semibold text-white shadow-sm hover:bg-[#0D47A1] active:bg-[#0A3880] disabled:opacity-50 transition-all flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Creating User...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="h-3.5 w-3.5" />
                    <span>Create User</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
