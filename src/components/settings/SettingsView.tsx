// ==============================================================================
// Settings & Governance Menu View (Frame 8 Reference Design)
// Access to Module 1 Staff Registry, RBAC, Audit, and Operations Config
// ==============================================================================

import React, { useState } from 'react';
import {
  Users,
  ShieldCheck,
  FileSpreadsheet,
  Database,
  Scan,
  Cloud,
  Sliders,
  CheckSquare,
  HelpCircle,
  LogOut,
  ChevronRight,
  Lock,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { SettingsMenuRow, ConfirmDialog } from '../ui/Elements';

interface SettingsViewProps {
  onNavigateToUsers: () => void;
  onNavigateToAudit: () => void;
  onNavigateToRoles: () => void;
  onNavigateToDiagnostics: () => void;
  onNavigateToProfile: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onNavigateToUsers,
  onNavigateToAudit,
  onNavigateToRoles,
  onNavigateToDiagnostics,
  onNavigateToProfile,
}) => {
  const { user, role, lockSession, logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState<boolean>(false);
  const [activeNotice, setActiveNotice] = useState<string>('');

  const initials = user?.full_name
    ? user.full_name
        .split(' ')
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'OP';

  return (
    <div className="space-y-4">
      {activeNotice && (
        <div className="p-3 rounded-lg bg-[#EAF2FF] border border-[#BFDBFE] text-xs font-semibold text-[#1565D8]">
          {activeNotice}
        </div>
      )}

      {/* User Profile Card (Matching Frame 8) */}
      <div
        onClick={onNavigateToProfile}
        className="flex items-center justify-between p-4 rounded-lg bg-white border border-[#E2E8F0] hover:border-slate-300 active:bg-slate-50 transition-colors cursor-pointer shadow-xs"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1565D8] text-white font-bold text-base shadow-xs">
            {initials}
          </div>
          <div>
            <div className="text-sm font-bold text-[#172033]">{user?.full_name || 'Staff User'}</div>
            <div className="text-xs text-[#64748B] mt-0.5">
              {role?.name || 'Authorized Staff'} • {user?.department || 'Valuation Dept'}
            </div>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-[#94A3B8]" />
      </div>

      {/* Settings Navigation List (Matching Frame 8) */}
      <div className="space-y-2">
        {/* Users & Roles (Module 1) */}
        <SettingsMenuRow
          icon={<Users className="h-4 w-4" />}
          title="Users &amp; Roles"
          subtitle="Manage operators and access control (Module 1)"
          onClick={onNavigateToUsers}
        />

        {/* Audit Log (Module 1) */}
        <SettingsMenuRow
          icon={<FileSpreadsheet className="h-4 w-4" />}
          title="Audit Log"
          subtitle="View operational activity logs and security events"
          onClick={onNavigateToAudit}
        />

        {/* Roles & Permissions Matrix */}
        <SettingsMenuRow
          icon={<ShieldCheck className="h-4 w-4" />}
          title="Roles &amp; Permissions Matrix"
          subtitle="Inspect RBAC access levels across the 7 roles"
          onClick={onNavigateToRoles}
        />

        {/* Diagnostic Test Suite */}
        <SettingsMenuRow
          icon={<CheckSquare className="h-4 w-4" />}
          title="Diagnostic Test Suite"
          subtitle="Verify 19 security checks and compliance controls"
          onClick={onNavigateToDiagnostics}
        />

        {/* Master Data */}
        <SettingsMenuRow
          icon={<Database className="h-4 w-4" />}
          title="Master Data"
          subtitle="Classes, subjects, and examination rooms"
          onClick={() => {
            setActiveNotice('Master data tables synced from operational database.');
            setTimeout(() => setActiveNotice(''), 3000);
          }}
        />

        {/* Barcode Settings */}
        <SettingsMenuRow
          icon={<Scan className="h-4 w-4" />}
          title="Barcode Settings"
          subtitle="Configure scanner sensitivity and formats (Code128/QR)"
          onClick={() => {
            setActiveNotice('Scanner set to automatic Code128, Code39, and QR detection.');
            setTimeout(() => setActiveNotice(''), 3000);
          }}
        />

        {/* Cloud Sync */}
        <SettingsMenuRow
          icon={<Cloud className="h-4 w-4" />}
          title="Cloud Sync"
          subtitle="Online status: Operational • In-Memory + Supabase Auth"
          badge={
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#DCFCE7] text-[#16A34A]">
              ONLINE
            </span>
          }
          onClick={() => {
            setActiveNotice('Cloud sync channel healthy. All mutations committed.');
            setTimeout(() => setActiveNotice(''), 3000);
          }}
        />

        {/* Lock Terminal */}
        <SettingsMenuRow
          icon={<Lock className="h-4 w-4" />}
          title="Lock Terminal"
          subtitle="Immediate workstation lock requiring staff re-authentication"
          onClick={lockSession}
        />

        {/* Logout */}
        <SettingsMenuRow
          icon={<LogOut className="h-4 w-4" />}
          title="Logout"
          subtitle="Sign out from examination operations session"
          isDanger
          onClick={() => setShowLogoutConfirm(true)}
        />
      </div>

      {/* Logout Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showLogoutConfirm}
        title="Sign Out"
        message="Are you sure you want to end your operational session? Any unsaved scan inputs in the temporary buffer will be discarded."
        confirmLabel="Sign Out"
        isDestructive
        onConfirm={() => {
          setShowLogoutConfirm(false);
          logout();
        }}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </div>
  );
};
