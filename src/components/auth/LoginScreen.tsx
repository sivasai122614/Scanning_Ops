// ==============================================================================
// Simple, Clean Inward Scan Login Screen
// Authentic Supabase Auth credentials only.
// Minimal, neat, enterprise-ready centered card.
// ==============================================================================

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Lock, Mail, AlertCircle, Eye, EyeOff, ScanLine, ArrowRight } from 'lucide-react';
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
    <div className="min-h-screen w-full flex flex-col justify-between bg-[#F5F7FA] text-slate-800 selection:bg-[#1565D8] selection:text-white">
      {/* Top Simple Brand Bar */}
      <header className="w-full bg-[#1565D8] text-white px-4 sm:px-6 h-14 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[#1565D8] shadow-xs">
            <ScanLine className="h-5 w-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="text-base font-bold text-white tracking-tight leading-tight">
              Inward Scan
            </div>
            <div className="text-[10px] text-blue-100 font-normal leading-tight hidden sm:block">
              Digitize. Verify. Simplify.
            </div>
          </div>
        </div>
        <div className="text-xs font-semibold text-blue-100 bg-white/10 px-3 py-1 rounded-full border border-white/15">
          Valuation Camp Portal
        </div>
      </header>

      {/* Main Centered Login Box */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 my-auto">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-slate-200 bg-white p-7 sm:p-8 shadow-sm">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-[#1565D8] border border-blue-100 mb-3">
                <ScanLine className="h-6 w-6 stroke-[2.25]" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Staff Sign In
              </h1>
              <p className="mt-1 text-xs text-slate-500">
                Enter your credentials to access the inwarding terminal
              </p>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div
                role="alert"
                className="mb-4 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-start gap-2.5 animate-in fade-in duration-150"
              >
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-semibold block text-rose-900">Sign In Error:</span>
                  {errorMessage}
                </div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    className="w-full h-11 rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1565D8] focus:ring-2 focus:ring-[#1565D8]/20 focus:outline-hidden transition-colors"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsForgotPasswordOpen(true)}
                    className="text-xs text-[#1565D8] hover:text-blue-800 font-medium transition-colors cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full h-11 rounded-xl border border-slate-300 bg-white pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1565D8] focus:ring-2 focus:ring-[#1565D8]/20 focus:outline-hidden transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 h-11 rounded-xl bg-[#1565D8] hover:bg-[#0D47A1] active:bg-[#0A3880] text-white text-sm font-semibold shadow-xs disabled:opacity-50 transition-colors flex items-center justify-center gap-2 cursor-pointer focus:outline-hidden"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    Signing in...
                  </span>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-slate-100 text-center">
              <span className="text-[11px] text-slate-400">
                Institutional Examination Terminal • Authorized Personnel Only
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-200 bg-white px-4 py-3 text-center text-xs text-slate-500">
        Inward Scan Enterprise • Examination &amp; Script Verification System
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
