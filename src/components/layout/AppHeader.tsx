// ==============================================================================
// ExamScan Top Header (Blue Theme #1565D8 - Light Theme System)
// Mobile-first, compact height, white text/icons matching visual reference
// ==============================================================================

import React from 'react';
import { ArrowLeft, Bell, ScanLine, ShieldCheck, Lock, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface AppHeaderProps {
  title?: string;
  subtitle?: string;
  showBackButton?: boolean;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  onOpenNotifications?: () => void;
  onOpenProfile?: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  title,
  subtitle,
  showBackButton = false,
  onBack,
  rightAction,
  onOpenNotifications,
  onOpenProfile,
}) => {
  const { user, role, lockSession, logout } = useAuth();
  const [showDropdown, setShowDropdown] = React.useState(false);

  return (
    <header className="sticky top-0 z-40 w-full bg-[#1565D8] text-white shadow-sm">
      <div className="max-w-5xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-3">
        {/* Left Slot: Back Button OR Logo */}
        <div className="flex items-center gap-2 min-w-0">
          {showBackButton ? (
            <button
              type="button"
              onClick={onBack}
              className="h-10 w-10 -ml-1.5 flex items-center justify-center rounded-full hover:bg-white/10 active:bg-white/20 transition-colors focus:outline-none"
              aria-label="Go Back"
            >
              <ArrowLeft className="h-5 w-5 text-white" />
            </button>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-[#1565D8] shadow-xs">
                <ScanLine className="h-5 w-5 stroke-[2.5]" />
              </div>
            </div>
          )}

          {/* Title / Brand Display */}
          <div className="min-w-0">
            {showBackButton ? (
              <h1 className="text-base sm:text-lg font-semibold text-white tracking-tight truncate">
                {title || 'ExamScan'}
              </h1>
            ) : (
              <div>
                <div className="text-base font-bold text-white tracking-tight leading-tight">
                  ExamScan
                </div>
                <div className="text-[10px] text-blue-100 font-normal leading-tight hidden sm:block">
                  Digitize. Verify. Simplify.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center Slot (if custom title in desktop/tablet) */}
        {!showBackButton && title && (
          <div className="hidden md:block text-sm font-semibold text-white/90 truncate">
            {title}
          </div>
        )}

        {/* Right Slot: Contextual Actions / Notifications & Profile */}
        <div className="flex items-center gap-2 shrink-0">
          {rightAction ? (
            rightAction
          ) : (
            <>
              {/* Notification Bell */}
              <button
                type="button"
                onClick={onOpenNotifications}
                className="relative h-9 w-9 flex items-center justify-center rounded-full hover:bg-white/10 active:bg-white/20 transition-colors focus:outline-none"
                aria-label="Notifications"
                title="Notifications"
              >
                <Bell className="h-4 w-4 text-white" />
                <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-[#1565D8]" />
              </button>

              {/* User Avatar Circle */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="h-8 w-8 flex items-center justify-center rounded-full bg-white text-[#1565D8] font-bold text-xs shadow-xs hover:ring-2 hover:ring-white/40 focus:outline-none transition-all"
                  aria-label="User Profile"
                  title={user?.full_name || 'Staff User'}
                >
                  {user?.full_name
                    ? user.full_name
                        .split(' ')
                        .map(n => n[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()
                    : 'OP'}
                </button>

                {/* Profile Quick Popover */}
                {showDropdown && (
                  <div
                    className="absolute right-0 mt-2 w-56 rounded-lg border border-[#E2E8F0] bg-white p-1.5 shadow-lg text-[#172033] z-50 animate-in fade-in zoom-in-95 duration-100"
                    onMouseLeave={() => setShowDropdown(false)}
                  >
                    <div className="px-3 py-2 border-b border-slate-100">
                      <div className="font-semibold text-xs text-[#172033]">{user?.full_name}</div>
                      <div className="text-[11px] text-[#64748B] truncate">{user?.email}</div>
                      <div className="mt-1 text-[10px] font-medium text-[#1565D8] uppercase tracking-wider">
                        {role?.name || 'Operator'}
                      </div>
                    </div>

                    <div className="py-1">
                      <button
                        type="button"
                        onClick={() => {
                          setShowDropdown(false);
                          onOpenProfile?.();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#172033] hover:bg-slate-50 rounded-md transition-colors text-left"
                      >
                        <ShieldCheck className="h-4 w-4 text-[#64748B]" />
                        <span>Staff Profile</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowDropdown(false);
                          lockSession();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#172033] hover:bg-slate-50 rounded-md transition-colors text-left"
                      >
                        <Lock className="h-4 w-4 text-[#64748B]" />
                        <span>Lock Terminal</span>
                      </button>
                    </div>

                    <div className="border-t border-slate-100 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setShowDropdown(false);
                          logout();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#DC2626] hover:bg-rose-50 rounded-md transition-colors text-left font-medium"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
