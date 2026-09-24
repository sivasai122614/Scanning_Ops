// ==============================================================================
// Visual Status & Role Badges (Clean Professional Light Theme)
// ==============================================================================

import React from 'react';
import { UserStatus, RoleCode } from '../../types/auth';
import { Shield, ShieldAlert, ShieldCheck, Eye, ScanLine, FileCheck, Landmark } from 'lucide-react';

interface StatusBadgeProps {
  status: UserStatus;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs font-semibold';

  switch (status) {
    case 'ACTIVE':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium ${sizeClasses}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
          ACTIVE
        </span>
      );
    case 'SUSPENDED':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-medium ${sizeClasses}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          SUSPENDED
        </span>
      );
    case 'DEACTIVATED':
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-md bg-rose-50 text-rose-800 border border-rose-200 font-medium ${sizeClasses}`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
          DEACTIVATED
        </span>
      );
    default:
      return (
        <span className={`inline-flex items-center rounded-md bg-slate-100 text-slate-800 border border-slate-200 font-medium ${sizeClasses}`}>
          {status}
        </span>
      );
  }
};

interface RoleBadgeProps {
  roleCode: RoleCode;
  roleName?: string;
  size?: 'sm' | 'md';
}

export const RoleBadge: React.FC<RoleBadgeProps> = ({ roleCode, roleName, size = 'md' }) => {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs font-medium';

  const roleConfig: Record<
    RoleCode,
    { label: string; bg: string; text: string; border: string; icon: React.ReactNode }
  > = {
    super_admin: {
      label: roleName || 'Super Administrator',
      bg: 'bg-purple-50',
      text: 'text-purple-800',
      border: 'border-purple-200',
      icon: <ShieldAlert className="w-3.5 h-3.5 text-purple-600" />,
    },
    admin: {
      label: roleName || 'Administrator',
      bg: 'bg-indigo-50',
      text: 'text-indigo-800',
      border: 'border-indigo-200',
      icon: <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />,
    },
    supervisor: {
      label: roleName || 'Valuation Supervisor',
      bg: 'bg-blue-50',
      text: 'text-blue-800',
      border: 'border-blue-200',
      icon: <Shield className="w-3.5 h-3.5 text-blue-600" />,
    },
    scanner_operator: {
      label: roleName || 'Scanner Operator',
      bg: 'bg-cyan-50',
      text: 'text-cyan-800',
      border: 'border-cyan-200',
      icon: <ScanLine className="w-3.5 h-3.5 text-cyan-600" />,
    },
    verification_operator: {
      label: roleName || 'Verification Operator',
      bg: 'bg-teal-50',
      text: 'text-teal-800',
      border: 'border-teal-200',
      icon: <FileCheck className="w-3.5 h-3.5 text-teal-600" />,
    },
    coe_user: {
      label: roleName || 'COE / Exam Cell',
      bg: 'bg-amber-50',
      text: 'text-amber-800',
      border: 'border-amber-200',
      icon: <Landmark className="w-3.5 h-3.5 text-amber-600" />,
    },
    viewer: {
      label: roleName || 'Auditor / Viewer',
      bg: 'bg-slate-100',
      text: 'text-slate-700',
      border: 'border-slate-200',
      icon: <Eye className="w-3.5 h-3.5 text-slate-500" />,
    },
  };

  const cfg = roleConfig[roleCode] || roleConfig.viewer;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border ${cfg.bg} ${cfg.text} ${cfg.border} ${sizeClasses}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
};

