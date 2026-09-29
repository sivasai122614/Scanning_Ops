// ==============================================================================
// Enterprise Login Screen
// Authentic Supabase Auth credentials only.
// Zero demo/simulator login, zero hardcoded credentials, zero bypass.
// ==============================================================================

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck, Lock, Mail, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { ForgotPasswordModal } from './ForgotPasswordModal';

export const LoginScreen: React.FC = () => {
  const { login, isLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    const res = await login(cleanEmail, password);
    if (!res.success) {
      setErrorMessage(res.error || 'Invalid email or password.');
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-slate-50 text-slate-800 relative selection:bg-[#1565D8] selection:text-white">
      {/* Top Banner: Enterprise Security Classification Notice */}
      <header className="w-full border-b border-slate-200 bg-white px-4 py-2.5 sm:px-6 shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-600"></span>
            <span className="font-mono text-emerald-700 font-semibold tracking-wider uppercase text-[11px]">
              CONFIDENTIAL VALUATION GATEWAY
            </span>
            <span className="hidden sm:inline text-slate-300">|</span>
            <span className="hidden sm:inline text-slate-600 font-medium">
              Department of Examinations &amp; Spot Valuation Directorate
            </span>
          </div>
          <div className="text-[11px] font-mono text-slate-500 hidden md:block">
            PORTAL VER: 1.0.0-PROD • AUTHORIZED PERSONNEL ONLY
          </div>
        </div>
      </header>

      {/* Main Login Viewport */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 my-auto">
        <div className="w-full max-w-md">
          {/* Main Card */}
          <div className="rounded-2xl border border-[#CBD5E1] bg-white shadow-md p-6 sm:p-8">
            {/* Crest / Header */}
            <div className="text-center mb-6">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#1565D8] text-white shadow-xs mb-3">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-[#172033]">
                Exam Scanning &amp; Script Verification
              </h1>
              <p className="mt-1 text-xs text-[#64748B] max-w-xs mx-auto">
                Internal examination staff portal. Please authenticate with your authorized Supabase credentials.
              </p>
            </div>

            {/* Error Message Box */}
            {errorMessage && (
              <div
                role="alert"
                className="mb-4 rounded-xl bg-[#FEE2E2] border border-[#FECACA] p-3 text-xs text-[#DC2626] flex items-start gap-2.5 animate-in fade-in duration-200"
              >
                <AlertCircle className="h-4 w-4 text-[#DC2626] shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-semibold block text-[#991B1B]">Authentication Notice:</span>
                  {errorMessage}
                </div>
              </div>
            )}

            {/* Real Production Authentication Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#172033] mb-1">
                  Official Email Address
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#64748B]">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="name@institution.edu"
                    className="w-full h-11 rounded-lg border border-[#CBD5E1] bg-white pl-10 pr-3.5 text-sm text-[#172033] placeholder-[#94A3B8] focus:border-[#1565D8] focus:outline-hidden focus:ring-1 focus:ring-[#1565D8] transition-colors"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-[#172033]">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsForgotPasswordOpen(true)}
                    className="text-xs text-[#1565D8] hover:text-[#0D47A1] font-medium transition-colors focus:outline-hidden cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#64748B]">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter account password"
                    className="w-full h-11 rounded-lg border border-[#CBD5E1] bg-white pl-10 pr-10 text-sm text-[#172033] placeholder-[#94A3B8] focus:border-[#1565D8] focus:outline-hidden focus:ring-1 focus:ring-[#1565D8] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#64748B] hover:text-[#172033] transition-colors cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 h-11 rounded-lg bg-[#1565D8] px-4 text-sm font-semibold text-white shadow-xs hover:bg-[#0D47A1] active:bg-[#0A3880] disabled:opacity-50 transition-all focus:outline-hidden cursor-pointer"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    Authenticating with Supabase...
                  </span>
                ) : (
                  'Sign In to Terminal'
                )}
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-[#E2E8F0] text-center">
              <div className="text-[11px] text-[#64748B]">
                Access is restricted to authorized examination staff with active profiles in the database.
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-200 bg-white px-4 py-3 text-center text-xs text-slate-500">
        Internal Examination Operations System • Restricted Staff Access
      </footer>

      {/* Forgot Password Modal */}
      <ForgotPasswordModal
        isOpen={isForgotPasswordOpen}
        onClose={() => setIsForgotPasswordOpen(false)}
        defaultEmail={email}
      />
    </div>
  );
};
