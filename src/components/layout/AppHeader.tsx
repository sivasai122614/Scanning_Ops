// ==============================================================================
// ExamScan Top Header (Blue Theme #1565D8 - Light Theme System)
// Full-width aligned with sidebar, clean brand logo, streamlined Logout menu
// ==============================================================================

import React, { useState } from 'react';
import { ArrowLeft, ScanLine, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface AppHeaderProps {
  title?: string;
  subtitle?: string;
  showBackButton?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  onOpenNotifications?: () => void;
  onOpenProfile?: () => void;
  onNavigateToImport?: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  title,
  showBackButton = false,
  onBack,
  rightAction,
}) => {
  const { user, role, logout } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full bg-[#1565D8] text-white shadow-sm border-b border-blue-600/30">
      <div className="w-full px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        {/* Left Slot: Back Button OR Brand Logo (Clean left alignment) */}
        <div className="flex items-center gap-3 min-w-0">
          {showBackButton ? (
            <button
              type="button"
              onClick={onBack}
              className="h-9 w-9 -ml-1 flex items-center justify-center rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors focus:outline-hidden cursor-pointer"
              aria-label="Go Back"
            >
              <ArrowLeft className="h-5 w-5 text-white" />
            </button>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#1565D8] shadow-xs shrink-0">
                <ScanLine className="h-5 w-5 stroke-[2.5]" />
              </div>
            </div>
          )}

          {/* Title / Brand Display */}
          <div className="min-w-0">
            {showBackButton ? (
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
                {title || 'Inward Scan'}
              </h1>
            ) : (
              <div>
                <div className="text-base font-bold text-white tracking-tight leading-tight flex items-center gap-2">
                  <span>Inward Scan</span>
                  <span className="hidden lg:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white/15 text-blue-100 tracking-wide uppercase">
                    Valuation Camp Hub
                  </span>
                </div>
                <div className="text-[10px] text-blue-100 font-medium leading-tight hidden sm:block">
                  Digitize. Verify. Simplify.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center Slot (Custom section title pill in desktop) */}
        {!showBackButton && title && (
          <div className="hidden md:flex items-center gap-2 text-sm font-semibold text-white/95 bg-white/10 px-3.5 py-1 rounded-full border border-white/15 shadow-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>{title}</span>
          </div>
        )}

        {/* Right Slot: User Avatar Profile Dropdown (Import & Notifications REMOVED) */}
        <div className="flex items-center gap-3 shrink-0">
          {rightAction ? (
            rightAction
          ) : (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center gap-2.5 px-2 py-1 rounded-lg hover:bg-white/10 active:bg-white/20 transition-all focus:outline-hidden group cursor-pointer"
                aria-label="User Menu"
                title={user?.full_name || 'Staff User'}
              >
                <div className="h-8 w-8 flex items-center justify-center rounded-full bg-white text-[#1565D8] font-bold text-xs shadow-xs group-hover:ring-2 group-hover:ring-white/40 transition-all">
                  {user?.full_name
                    ? user.full_name
                        .split(' ')
                        .map(n => n[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()
                    : 'OP'}
                </div>
                <div className="hidden sm:flex flex-col text-left">
                  <span className="text-xs font-bold text-white leading-tight">
                    {user?.full_name || 'Administrator'}
                  </span>
                  <span className="text-[10px] text-blue-100 font-medium leading-tight">
                    {role?.name || 'Administrator'}
                  </span>
                </div>
              </button>

              {/* Profile Dropdown: User identity header + Logout action only */}
              {showDropdown && (
                <div
                  className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl text-[#172033] z-50 animate-in fade-in zoom-in-95 duration-100"
                  onMouseLeave={() => setShowDropdown(false)}
                >
                  <div className="px-3 py-2.5 bg-slate-50 rounded-lg border border-slate-100 mb-1.5">
                    <div className="font-bold text-xs text-slate-800">{user?.full_name || 'Administrator'}</div>
                    <div className="text-[11px] text-slate-500 truncate">{user?.email || 'admin@inward.in'}</div>
                    <div className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-[#1565D8] uppercase tracking-wider">
                      {role?.name || 'ADMINISTRATOR'}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setShowDropdown(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-600 hover:bg-red-50 active:bg-red-100 rounded-lg transition-colors text-left font-bold cursor-pointer"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
