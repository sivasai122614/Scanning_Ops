// ==============================================================================
// ExamScan UI Design System - Core Atomic & Layout Components
// Standardized on Roboto, 40-48px touch targets, #1565D8 Blue, Light surfaces
// Strictly zero sample data. Pure operational UI components.
// ==============================================================================

import React from 'react';
import { Search, X, ChevronRight, AlertCircle, RefreshCw } from 'lucide-react';

// ------------------------------------------------------------------------------
// 1. PageContainer & SectionHeader
// ------------------------------------------------------------------------------

export const PageContainer: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => {
  return (
    <div className={`w-full max-w-5xl mx-auto px-4 py-4 sm:px-6 sm:py-6 space-y-4 pb-24 md:pb-8 ${className}`}>
      {children}
    </div>
  );
};

export const SectionHeader: React.FC<{
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  className?: string;
}> = ({ title, actionLabel, onAction, className = '' }) => {
  return (
    <div className={`flex items-center justify-between py-1 ${className}`}>
      <h2 className="text-base font-semibold text-[#172033] tracking-tight">{title}</h2>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="text-xs font-semibold text-[#1565D8] hover:text-[#0D47A1] transition-colors focus:outline-none"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

// ------------------------------------------------------------------------------
// 2. Buttons: Primary, Secondary, Danger, Outline
// ------------------------------------------------------------------------------

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
  fullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const PrimaryButton: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  fullWidth = false,
  size = 'md',
  loading = false,
  icon,
  className = '',
  disabled,
  ...props
}) => {
  const sizeClasses = {
    sm: 'h-9 px-3 text-xs',
    md: 'h-11 px-4 text-sm font-medium',
    lg: 'h-12 px-5 text-sm font-semibold',
  }[size];

  const variantClasses = {
    primary: 'bg-[#1565D8] text-white hover:bg-[#0D47A1] active:bg-[#0A3880] border-transparent shadow-xs',
    secondary: 'bg-[#EAF2FF] text-[#1565D8] hover:bg-[#D8E6FC] active:bg-[#C4DBFA] border border-[#1565D8]/20',
    danger: 'bg-[#DC2626] text-white hover:bg-[#B91C1C] active:bg-[#991B1B] border-transparent shadow-xs',
    outline: 'bg-white text-[#172033] hover:bg-slate-50 active:bg-slate-100 border border-[#E2E8F0]',
  }[variant];

  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg transition-colors select-none focus:outline-none focus:ring-2 focus:ring-[#1565D8]/30 disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses} ${variantClasses} ${
        fullWidth ? 'w-full' : ''
      } ${className}`}
      {...props}
    >
      {loading && <RefreshCw className="h-4 w-4 animate-spin text-current" />}
      {!loading && icon}
      <span>{children}</span>
    </button>
  );
};

export const SecondaryButton: React.FC<ButtonProps> = props => {
  return <PrimaryButton variant="secondary" {...props} />;
};

// ------------------------------------------------------------------------------
// 3. Form Inputs, Selects, Labels
// ------------------------------------------------------------------------------

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightAction?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  leftIcon,
  rightAction,
  id,
  className = '',
  ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-[#172033]">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {leftIcon && <div className="absolute left-3.5 text-[#64748B] pointer-events-none">{leftIcon}</div>}
        <input
          id={inputId}
          className={`w-full h-11 rounded-lg bg-white border border-[#E2E8F0] px-3.5 text-sm text-[#172033] placeholder:text-[#94A3B8] transition-colors focus:border-[#1565D8] focus:ring-1 focus:ring-[#1565D8] focus:outline-none disabled:bg-slate-50 disabled:text-slate-400 ${
            leftIcon ? 'pl-10' : ''
          } ${rightAction ? 'pr-11' : ''} ${error ? 'border-[#DC2626] focus:border-[#DC2626] focus:ring-[#DC2626]' : ''} ${className}`}
          {...props}
        />
        {rightAction && <div className="absolute right-3 flex items-center">{rightAction}</div>}
      </div>
      {error && <p className="text-xs text-[#DC2626]">{error}</p>}
      {!error && helperText && <p className="text-xs text-[#64748B]">{helperText}</p>}
    </div>
  );
};

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: { label: string; value: string }[];
}

export const Select: React.FC<SelectProps> = ({
  label,
  error,
  helperText,
  options,
  id,
  className = '',
  ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-[#172033]">
          {label}
        </label>
      )}
      <select
        id={inputId}
        className={`w-full h-11 rounded-lg bg-white border border-[#E2E8F0] px-3 text-sm text-[#172033] transition-colors focus:border-[#1565D8] focus:ring-1 focus:ring-[#1565D8] focus:outline-none disabled:bg-slate-50 ${
          error ? 'border-[#DC2626]' : ''
        } ${className}`}
        {...props}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-[#DC2626]">{error}</p>}
      {!error && helperText && <p className="text-xs text-[#64748B]">{helperText}</p>}
    </div>
  );
};

// ------------------------------------------------------------------------------
// 4. KPI Summary Card (Direct match to reference image 4-pack cards)
// ------------------------------------------------------------------------------

export interface KpiCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  iconBgColor?: string;
  iconTextColor?: string;
  cardBgColor?: string;
  subtitle?: string;
  onClick?: () => void;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  icon,
  iconBgColor = 'bg-[#EAF2FF]',
  iconTextColor = 'text-[#1565D8]',
  cardBgColor = 'bg-white',
  subtitle,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={`rounded-lg border border-[#E2E8F0] ${cardBgColor} p-3 sm:p-4 shadow-xs transition-colors ${
        onClick ? 'cursor-pointer hover:border-slate-300 active:bg-slate-50' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-md ${iconBgColor} ${iconTextColor} shrink-0`}>
          {icon}
        </div>
        <span className="text-2xl font-bold font-tabular text-[#172033] tracking-tight">{value}</span>
      </div>
      <div className="mt-1 text-xs font-medium text-[#64748B]">{label}</div>
      {subtitle && <div className="text-[11px] text-[#94A3B8]">{subtitle}</div>}
    </div>
  );
};

// ------------------------------------------------------------------------------
// 5. Status Badges
// ------------------------------------------------------------------------------

export type OperationalStatus =
  | 'Verified'
  | 'In Progress'
  | 'Missing'
  | 'Duplicate'
  | 'Unknown'
  | 'Damaged'
  | 'Completed'
  | 'Scheduled'
  | 'Active'
  | 'Suspended'
  | 'Deactivated';

export const StatusBadge: React.FC<{
  status: OperationalStatus | string;
  size?: 'sm' | 'md';
}> = ({ status, size = 'sm' }) => {
  const norm = status.toLowerCase();

  let colors = 'bg-slate-100 text-slate-700 border-slate-200';
  let dotColor = 'bg-slate-400';

  if (norm.includes('verif') || norm.includes('active') || norm.includes('completed') || norm.includes('valid')) {
    colors = 'bg-[#DCFCE7] text-[#16A34A] border-[#BBF7D0]';
    dotColor = 'bg-[#16A34A]';
  } else if (norm.includes('progress') || norm.includes('pending') || norm.includes('scheduled')) {
    colors = 'bg-[#EAF2FF] text-[#1565D8] border-[#BFDBFE]';
    dotColor = 'bg-[#1565D8]';
  } else if (norm.includes('missing') || norm.includes('deactivated') || norm.includes('error') || norm.includes('damaged')) {
    colors = 'bg-[#FEE2E2] text-[#DC2626] border-[#FECACA]';
    dotColor = 'bg-[#DC2626]';
  } else if (norm.includes('duplicate') || norm.includes('warning') || norm.includes('suspended')) {
    colors = 'bg-[#FEF3C7] text-[#D97706] border-[#FDE68A]';
    dotColor = 'bg-[#D97706]';
  }

  const padding = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  return (
    <span className={`inline-flex items-center gap-1.5 font-medium rounded border ${padding} ${colors}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      <span>{status}</span>
    </span>
  );
};

// ------------------------------------------------------------------------------
// 6. Search Bar & Filter Bar
// ------------------------------------------------------------------------------

export const SearchBar: React.FC<{
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  onClear?: () => void;
  className?: string;
}> = ({ value, onChange, placeholder = 'Search...', onClear, className = '' }) => {
  return (
    <div className={`relative flex items-center w-full ${className}`}>
      <Search className="absolute left-3.5 h-4 w-4 text-[#64748B] pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-11 pl-10 pr-9 rounded-lg bg-white border border-[#E2E8F0] text-sm text-[#172033] placeholder:text-[#94A3B8] transition-colors focus:border-[#1565D8] focus:ring-1 focus:ring-[#1565D8] focus:outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange('');
            onClear?.();
          }}
          className="absolute right-3 p-1 text-slate-400 hover:text-slate-600 rounded focus:outline-none"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};

// ------------------------------------------------------------------------------
// 7. Empty State (Mandatory Zero Sample Data presentation)
// ------------------------------------------------------------------------------

export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ icon, title, description, actionLabel, onAction }) => {
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white p-8 text-center shadow-xs">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#EAF2FF] text-[#1565D8] mb-3">
        {icon || <AlertCircle className="h-6 w-6" />}
      </div>
      <h3 className="text-sm font-semibold text-[#172033]">{title}</h3>
      <p className="mt-1 text-xs text-[#64748B] max-w-sm mx-auto">{description}</p>
      {actionLabel && onAction && (
        <div className="mt-4">
          <PrimaryButton size="sm" onClick={onAction}>
            {actionLabel}
          </PrimaryButton>
        </div>
      )}
    </div>
  );
};

// ------------------------------------------------------------------------------
// 8. Loading Skeleton
// ------------------------------------------------------------------------------

export const LoadingSkeleton: React.FC<{ count?: number; height?: string }> = ({
  count = 3,
  height = 'h-16',
}) => {
  return (
    <div className="space-y-2.5 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`w-full rounded-lg bg-slate-200/80 ${height}`} />
      ))}
    </div>
  );
};

// ------------------------------------------------------------------------------
// 9. Toast Alert
// ------------------------------------------------------------------------------

export const Toast: React.FC<{
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose?: () => void;
}> = ({ message, type = 'success', onClose }) => {
  const bg = {
    success: 'bg-[#16A34A] text-white',
    error: 'bg-[#DC2626] text-white',
    info: 'bg-[#1565D8] text-white',
  }[type];

  return (
    <div className={`fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-lg shadow-lg text-xs font-medium ${bg} transition-all`}>
      <span>{message}</span>
      {onClose && (
        <button type="button" onClick={onClose} className="p-0.5 hover:opacity-80">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};

// ------------------------------------------------------------------------------
// 10. Confirmation Dialog
// ------------------------------------------------------------------------------

export const ConfirmDialog: React.FC<{
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDestructive = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-sm rounded-xl bg-white border border-[#E2E8F0] p-5 shadow-xl">
        <h3 className="text-base font-semibold text-[#172033]">{title}</h3>
        <p className="mt-2 text-xs text-[#64748B] leading-relaxed">{message}</p>
        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 px-4 text-xs font-medium rounded-lg border border-[#E2E8F0] bg-white text-[#172033] hover:bg-slate-50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`h-10 px-4 text-xs font-medium rounded-lg text-white transition-colors ${
              isDestructive ? 'bg-[#DC2626] hover:bg-[#B91C1C]' : 'bg-[#1565D8] hover:bg-[#0D47A1]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------------------
// 11. Settings Menu Row (Reference Frame 8 style)
// ------------------------------------------------------------------------------

export const SettingsMenuRow: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  isDanger?: boolean;
  onClick: () => void;
}> = ({ icon, title, subtitle, badge, isDanger = false, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between p-3.5 sm:p-4 rounded-lg bg-white border border-[#E2E8F0] hover:bg-slate-50 active:bg-slate-100 transition-colors text-left group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${
            isDanger ? 'bg-[#FEE2E2] text-[#DC2626]' : 'bg-[#EAF2FF] text-[#1565D8]'
          }`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className={`text-sm font-semibold truncate ${isDanger ? 'text-[#DC2626]' : 'text-[#172033]'}`}>
            {title}
          </div>
          {subtitle && <div className="text-xs text-[#64748B] truncate mt-0.5">{subtitle}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-3">
        {badge}
        <ChevronRight className="h-4 w-4 text-[#94A3B8] group-hover:text-[#64748B]" />
      </div>
    </button>
  );
};

// Re-export reference standardized components for cross-module consistency
export {
  PageHeader,
  FormField,
  SelectField,
  DateField,
  SegmentedControl,
  DataCard,
  ConfirmationDialog,
  LoadingState,
} from './ReferenceComponents';
