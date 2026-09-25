// ==============================================================================
// ExamScan Desktop Sidebar Navigation (Responsive Desktop View)
// Adapts the 5 primary mobile destinations + Module 1 Operational Controls
// ==============================================================================

import React from 'react';
import {
  Home,
  Package,
  Scan,
  BarChart2,
  Users,
  ShieldCheck,
  FileSpreadsheet,
  CheckSquare,
  User,
  MoreHorizontal,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export type DesktopNavTarget =
  | 'home'
  | 'import-data'
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
  const { hasPermission, role } = useAuth();
  const canReadAudit = hasPermission('audit:read') || role?.code === 'super_admin' || role?.code === 'admin' || role?.code === 'viewer';

  const primaryNav = [
    { id: 'home' as const, label: 'Dashboard', icon: Home },
    { id: 'import-data' as const, label: 'Import Data', icon: FileSpreadsheet },
    { id: 'scan' as const, label: 'Scanning Dashboard', icon: Scan },
    { id: 'sessions' as const, label: 'Manual Inward', icon: Package },
    { id: 'reports' as const, label: 'Reports & Export', icon: BarChart2 },
  ];

  const adminNav = [
    { id: 'users-directory' as const, label: 'Staff Registry', icon: Users },
    { id: 'role-permissions' as const, label: 'Roles & Matrix', icon: ShieldCheck },
    ...(canReadAudit ? [{ id: 'audit-logs' as const, label: 'Audit Trail', icon: FileSpreadsheet }] : []),
    { id: 'test-suite' as const, label: 'Verification Suite', icon: CheckSquare },
    { id: 'my-profile' as const, label: 'My Profile', icon: User },
  ];

  return (
    <aside className="hidden md:flex w-60 shrink-0 border-r border-[#E2E8F0] bg-white p-3 flex-col justify-between overflow-y-auto">
      <div className="space-y-6">
        {/* Core Operations (Modules 1 - 7) */}
        <div>
          <div className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
            Operations
          </div>
          <nav className="space-y-1">
            {primaryNav.map(item => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-[#1565D8] text-white font-semibold shadow-xs'
                      : 'text-[#172033] hover:bg-slate-50'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Administration & Governance (Module 1 / 8) */}
        <div>
          <div className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
            Governance &amp; Security
          </div>
          <nav className="space-y-1">
            {adminNav.map(item => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-[#1565D8] text-white font-semibold shadow-xs'
                      : 'text-[#172033] hover:bg-slate-50'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Footer System Info */}
      <div className="pt-3 border-t border-[#E2E8F0] px-3 text-[11px] text-[#64748B]">
        <div className="font-medium text-[#172033]">ExamScan Enterprise</div>
        <div className="text-[10px] text-[#94A3B8]">Production Light Theme • v1.0.0</div>
      </div>
    </aside>
  );
};
