// ==============================================================================
// Scripts Inwarding Login Screen
// Faithfully matching the high-fidelity reference design with micro-animations
// ==============================================================================

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Lock, Mail, AlertCircle, Eye, EyeOff, ArrowRight } from 'lucide-react';
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

  const handleQuickFill = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setErrorMessage('');
  };

  return (
    <div className="min-h-screen w-full bg-[#EBF2FA] flex items-center justify-center p-4 sm:p-6 lg:p-8 relative selection:bg-[#0D6EFD] selection:text-white font-sans overflow-x-hidden">
      {/* Background ambient lighting for depth */}
      <div className="absolute top-10 left-10 w-96 h-96 bg-blue-300/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-indigo-300/20 rounded-full blur-3xl pointer-events-none" />

      {/* Main Login Card - Split 2-Panel Desktop / Stacked Mobile */}
      <div className="w-full max-w-[940px] bg-white rounded-3xl sm:rounded-[32px] shadow-2xl shadow-blue-900/10 border border-slate-200/80 overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[580px] z-10 transition-all duration-300 animate-in fade-in zoom-in-95">
        
        {/* ==================================================================== */}
        {/* LEFT PANEL: BLUE BRANDING & 3D ISOMETRIC BOOKLET ILLUSTRATION        */}
        {/* ==================================================================== */}
        <div className="md:col-span-5 lg:col-span-6 bg-gradient-to-br from-[#0D6EFD] via-[#0B5ED7] to-[#0A58CA] p-7 sm:p-9 lg:p-10 text-white flex flex-col justify-between relative overflow-hidden">
          {/* Subtle Isometric Grid & Contour Arc Overlays in Background */}
          <div className="absolute inset-0 pointer-events-none opacity-20">
            <div className="absolute -bottom-20 -right-20 w-[420px] h-[420px] rounded-full border border-white/20" />
            <div className="absolute -bottom-36 -right-36 w-[560px] h-[560px] rounded-full border border-white/10" />
            <div className="absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          </div>

          {/* Top Brand Header & Dot Grid Pattern */}
          <div className="relative z-10 flex items-start justify-between">
            <div>
              {/* Document Checkmark Logo matching the reference icon */}
              <div className="mb-4 inline-flex items-center justify-center">
                <svg
                  viewBox="0 0 44 48"
                  className="w-12 h-13 text-white drop-shadow-md"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {/* Document outline */}
                  <path
                    d="M6 4C6 2.89543 6.89543 2 8 2H26.5L38 13.5V36C38 37.1046 37.1046 38 36 38H8C6.89543 38 6 37.1046 6 36V4Z"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Folded corner */}
                  <path
                    d="M26 2V14H38"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Document lines */}
                  <path
                    d="M13 15H21"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <path
                    d="M13 22H25"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <path
                    d="M13 29H18"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  {/* Checkmark circle badge */}
                  <circle
                    cx="30"
                    cy="34"
                    r="8.5"
                    fill="#0B5ED7"
                    stroke="white"
                    strokeWidth="3"
                  />
                  {/* Checkmark tick */}
                  <path
                    d="M26.5 34L29 36.5L34 31.5"
                    stroke="white"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              {/* Title & Tagline */}
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight">
                Scripts Inwarding
              </h1>
              <p className="text-xs sm:text-sm font-medium text-blue-100/90 tracking-wide mt-1">
                Organize. Track. Simplify.
              </p>
            </div>

            {/* Top-Right Translucent Dot Grid Pattern */}
            <div className="grid grid-cols-4 gap-1.5 p-1 animate-dot-pulse pointer-events-none">
              {Array.from({ length: 16 }).map((_, i) => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/30" />
              ))}
            </div>
          </div>

          {/* Center/Bottom 3D Isometric Booklet Graphic with Levitation Animation */}
          <div className="relative z-10 my-auto pt-6 pb-2 flex items-center justify-center">
            <div className="relative w-full max-w-[340px] flex items-center justify-center animate-float-slow group">
              {/* Image from actual reference mockup */}
              <img
                src="/assets/scripts_illustration.png"
                alt="Scripts Inwarding 3D Illustration"
                className="w-full h-auto object-contain drop-shadow-2xl select-none pointer-events-none"
              />

              {/* Laser Scanning Beam Animation across the booklets */}
              <div className="absolute left-6 right-6 h-[2px] bg-gradient-to-r from-transparent via-cyan-300 to-transparent shadow-[0_0_12px_#38bdf8] animate-laser-beam pointer-events-none opacity-80" />

              {/* Subtle ambient glow behind illustration */}
              <div className="absolute inset-0 bg-blue-400/20 rounded-full blur-2xl -z-10" />
            </div>
          </div>

          {/* Bottom subtle indicator */}
          <div className="relative z-10 text-[11px] font-medium text-blue-100/60 hidden sm:block">
            Examination Valuation Camp Intake Terminal
          </div>
        </div>

        {/* ==================================================================== */}
        {/* RIGHT PANEL: SIGN IN FORM MATCHING THE EXACT MOCKUP                  */}
        {/* ==================================================================== */}
        <div className="md:col-span-7 lg:col-span-6 p-7 sm:p-10 lg:p-12 flex flex-col justify-center bg-white relative">
          <div className="max-w-md w-full mx-auto">
            {/* Header */}
            <div className="mb-7">
              <h2 className="text-2xl sm:text-3xl font-black text-[#111827] tracking-tight">
                Welcome back
              </h2>
              <p className="text-xs sm:text-sm text-[#6B7280] font-normal mt-1.5">
                Sign in to manage your scripts
              </p>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div
                role="alert"
                className="mb-5 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-start gap-2.5 animate-in fade-in duration-150"
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
              {/* Email Address Field */}
              <div>
                <label className="block text-xs font-semibold text-[#111827] mb-2">
                  Email address
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
                    className="w-full h-12 rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:border-[#0D6EFD] focus:ring-2 focus:ring-[#0D6EFD]/20 focus:outline-hidden transition-all duration-150"
                  />
                </div>
              </div>

              {/* Password Field (Cleanly integrated for Supabase Auth) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-[#111827]">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsForgotPasswordOpen(true)}
                    className="text-xs text-[#0D6EFD] hover:underline font-medium transition-colors cursor-pointer"
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
                    className="w-full h-12 rounded-xl border border-slate-300 bg-white pl-10 pr-10 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:border-[#0D6EFD] focus:ring-2 focus:ring-[#0D6EFD]/20 focus:outline-hidden transition-all duration-150"
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

              {/* Quick Fill Demo Credentials (Convenient for testing) */}
              <div className="pt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                <span className="font-medium text-slate-400">Quick Fill:</span>
                <button
                  type="button"
                  onClick={() => handleQuickFill('admin1@examscan.org', 'Admin@12345')}
                  className="px-2 py-0.5 rounded-md bg-blue-50 hover:bg-blue-100 text-[#0D6EFD] font-semibold border border-blue-200 transition-colors cursor-pointer"
                >
                  Admin
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickFill('inward1@examscan.org', 'Inward@12345')}
                  className="px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold border border-emerald-200 transition-colors cursor-pointer"
                >
                  Inward Operator
                </button>
              </div>

              {/* Main Submit Button - Matching exact blue button with arrow */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-3 h-12 rounded-xl bg-[#0D6EFD] hover:bg-[#0B5ED7] active:scale-[0.99] text-white text-sm font-bold shadow-md shadow-blue-500/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer focus:outline-hidden group"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  <>
                    <span>Sign in</span>
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>

            {/* Footer Divider matching reference image */}
            <div className="mt-8 flex items-center gap-3 text-xs text-[#9CA3AF] font-medium">
              <div className="flex-1 h-px bg-slate-200" />
              <span>Scripts Inwarding Portal</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      <ForgotPasswordModal
        isOpen={isForgotPasswordOpen}
        onClose={() => setIsForgotPasswordOpen(false)}
        defaultEmail={email}
      />
    </div>
  );
};
