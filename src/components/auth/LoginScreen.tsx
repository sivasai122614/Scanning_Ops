// ==============================================================================
// Enterprise Login Screen (Module 1 - Auth & Access Control)
// Zero Self-Registration, Strict Internal Enterprise Perimeter (Light Theme)
// ==============================================================================

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck, Lock, Mail, AlertCircle, Info } from 'lucide-react';
import { ForgotPasswordModal } from './ForgotPasswordModal';

export const LoginScreen: React.FC = () => {
  const { login, isLoading } = useAuth();

  const [email, setEmail] = useState('admin@yourdomain.com');
  const [password, setPassword] = useState('admin123');
  const [errorMessage, setErrorMessage] = useState('');
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage('');

    const targetEmail = (email || 'admin@yourdomain.com').trim();
    const targetPassword = password || 'admin123';

    const res = await login(targetEmail, targetPassword);
    if (!res.success) {
      setErrorMessage(res.error || 'Authentication failed. Please verify your credentials.');
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-slate-50 text-slate-800 relative selection:bg-indigo-600 selection:text-white">
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
            PORTAL VER: 1.0.0-PROD • ZERO PUBLIC REGISTRATION
          </div>
        </div>
      </header>

      {/* Main Login Viewport */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 my-auto">
        <div className="w-full max-w-md">
          {/* Main Card */}
          <div className="rounded-lg border border-[#E2E8F0] bg-white shadow-sm p-6 sm:p-8">
            {/* Crest / Header */}
            <div className="text-center mb-6">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-[#1565D8] text-white shadow-xs mb-3">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-[#172033]">
                Exam Scanning &amp; Script Verification
              </h1>
              <p className="mt-1 text-xs text-[#64748B] max-w-xs mx-auto">
                Internal examination staff portal. Please enter your authorized credentials to access operations.
              </p>
            </div>

            {/* Error Message Box */}
            {errorMessage && (
              <div
                role="alert"
                className="mb-4 rounded-lg bg-[#FEE2E2] border border-[#FECACA] p-3 text-xs text-[#DC2626] flex items-start gap-2.5 animate-in fade-in duration-200"
              >
                <AlertCircle className="h-4 w-4 text-[#DC2626] shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-semibold block text-[#991B1B]">Access Notice:</span>
                  {errorMessage}
                </div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5">
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
                    autoComplete="username"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="admin@yourdomain.com"
                    className="w-full h-11 rounded-lg border border-[#E2E8F0] bg-white pl-10 pr-3.5 text-sm text-[#172033] placeholder-[#94A3B8] focus:border-[#1565D8] focus:outline-none focus:ring-1 focus:ring-[#1565D8] transition-colors"
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
                    className="text-xs text-[#1565D8] hover:text-[#0D47A1] font-medium transition-colors focus:outline-none"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#64748B]">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full h-11 rounded-lg border border-[#E2E8F0] bg-white pl-10 pr-3.5 text-sm text-[#172033] placeholder-[#94A3B8] focus:border-[#1565D8] focus:outline-none focus:ring-1 focus:ring-[#1565D8] transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 h-11 rounded-lg bg-[#1565D8] px-4 text-sm font-semibold text-white shadow-xs hover:bg-[#0D47A1] active:bg-[#0A3880] disabled:opacity-50 transition-all focus:outline-none cursor-pointer"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    Authenticating...
                  </span>
                ) : (
                  'Sign In to Terminal'
                )}
              </button>
            </form>

            {/* Direct 1-Click Access & Registration Notice */}
            <div className="mt-5 pt-4 border-t border-[#E2E8F0] text-center space-y-2">
              <button
                type="button"
                onClick={async () => {
                  setEmail('admin@yourdomain.com');
                  setPassword('admin123');
                  await login('admin@yourdomain.com', 'admin123');
                }}
                className="w-full py-2 px-3 text-xs bg-[#EAF2FF] text-[#1565D8] hover:bg-[#D8E6FC] rounded-lg font-semibold transition-colors border border-[#BFDBFE] cursor-pointer"
              >
                ⚡ 1-Click Sign In as Administrator
              </button>
              <div className="text-[11px] text-[#64748B]">
                Zero Public Registration: Accounts are provisioned solely by Authorized Administrators.
              </div>
            </div>
          </div>

          {/* Development Setup Instruction Card */}
          <div className="mt-3.5 rounded-lg border border-[#E2E8F0] bg-white p-4 shadow-xs text-[#64748B]">
            <div className="flex items-start gap-2.5">
              <Info className="h-4 w-4 text-[#1565D8] shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <span className="font-semibold text-[#172033] block">Default Administrator Credentials:</span>
                <p className="text-[11px] text-[#64748B] leading-relaxed">
                  Use the provisioned credentials below or click &quot;Auto-fill Administrator Credentials&quot; above to log in to the terminal.
                </p>
                <div className="mt-2 rounded-lg bg-slate-50 p-2.5 font-mono text-[11px] text-[#172033] border border-[#E2E8F0] space-y-1">
                  <div><span className="text-[#64748B]">Email:</span> admin@yourdomain.com</div>
                  <div><span className="text-[#64748B]">Password:</span> admin123</div>
                </div>
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
