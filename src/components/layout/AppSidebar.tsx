// ==============================================================================
// ExamScan Desktop Sidebar Navigation (Responsive Desktop View)
// Streamlined Operations Focus, Wider layout, Enhanced Uniform Typography
// ==============================================================================

import React from 'react';
import {
  Home,
  Package,
  Scan,
  BarChart2,
  FileSpreadsheet,
  CheckCircle2,
  CalendarDays,
  Users,
} from 'lucide-react';

export type DesktopNavTarget =
  | 'home'
  | 'import-data'
  | 'date-mapper'
  | 'sessions'
  | 'scan'
  | 'reports'
  | 'users-directory'
  | 'role-permissions'
  | 'audit-logs'
  | 'test-suite'
  | 'my-profile';

interface AppSidebarProps {
  currentTab: DesktopNavTarget;
  onSelectTab: (tab: DesktopNavTarget) => void;
  onOpenCreateUser?: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({ currentTab, onSelectTab }) => {
  // Operational & User Management Navigation
  const primaryNav = [
    { id: 'home' as const, label: 'Dashboard', icon: Home, badge: 'Overview' },
    { id: 'users-directory' as const, label: 'Users', icon: Users, badge: 'Staff' },
    { id: 'import-data' as const, label: 'Import Data', icon: FileSpreadsheet, badge: 'Excel' },
    { id: 'date-mapper' as const, label: 'Excel Date Mapper', icon: CalendarDays, badge: 'Match' },
    { id: 'scan' as const, label: 'Scanning Dashboard', icon: Scan, badge: 'Live Gun' },
    { id: 'sessions' as const, label: 'Manual Inward', icon: Package, badge: 'Manual' },
    { id: 'reports' as const, label: 'Reports & Export', icon: BarChart2, badge: 'Audit' },
  ];

  return (
    <aside className="hidden md:flex w-72 shrink-0 border-r border-slate-200 bg-white p-4 flex-col justify-between overflow-y-auto select-none">
      <div className="space-y-6">
        {/* Core Operations Section */}
        <div>
          <div className="px-3 mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
            <span>Operations Hub</span>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          </div>

          <nav className="space-y-1.5">
            {primaryNav.map(item => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-[14.5px] font-semibold transition-all duration-200 ease-out cursor-pointer group ${
                    isActive
                      ? 'bg-[#1565D8] text-white shadow-md shadow-blue-500/25 translate-x-1 ring-1 ring-blue-400/30'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-blue-50/70 hover:translate-x-1.5 active:scale-[0.98]'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <Icon className={`h-5 w-5 shrink-0 transition-transform duration-200 group-hover:scale-110 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-[#1565D8]'}`} />
                    <span className="truncate">{item.label}</span>
                  </div>

                  {isActive ? (
                    <span className="h-2 w-2 rounded-full bg-white shrink-0 animate-ping"></span>
                  ) : (
                    <span className="text-[11px] font-medium text-slate-400 group-hover:text-slate-600 transition-colors shrink-0">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Footer System Status & Telemetry */}
      <div className="pt-4 border-t border-slate-200/80 px-2 space-y-2">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-emerald-50 border border-emerald-100">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold text-emerald-800 leading-tight">Inward Gun Interceptor</div>
            <div className="text-[10px] text-emerald-600 font-medium">Station Armed & Online</div>
          </div>
        </div>

        <div className="px-2 pt-1 text-[11px] text-slate-400 flex items-center justify-between">
          <span className="font-semibold text-slate-600">Inward Scan Pro</span>
          <span>v1.0.0</span>
        </div>
      </div>
    </aside>
  );
};
