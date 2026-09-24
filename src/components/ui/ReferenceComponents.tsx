// ==============================================================================
// ExamScan Standardized Design System Components (Reference Image Specification)
// Strict Visual Language: Roboto, Light Theme, #1565D8 Exam Blue, Thin Borders,
// Light Grey Input Backgrounds, Minimal Shadows, Compact Spacing.
// Zero Hardcoded Mock Data.
// ==============================================================================

import React from 'react';
import { ArrowLeft, Calendar, ChevronDown, CheckCircle2, AlertCircle, RefreshCw, X } from 'lucide-react';
import { AppHeader } from '../layout/AppHeader';
import { BottomNavigation } from '../layout/BottomNavigation';

// ------------------------------------------------------------------------------
// 1. AppHeader (Re-exported for consistency)
// ------------------------------------------------------------------------------
export { AppHeader, BottomNavigation };

// ------------------------------------------------------------------------------
// 2. PageHeader (Operational Header matching Screen 2, 3, 4, etc.)
// ------------------------------------------------------------------------------
export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
  variant?: 'blue' | 'white';
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  onBack,
  rightAction,
  variant = 'blue',
}) => {
  if (variant === 'blue') {
    return (
      <div className="w-full bg-[#1565D8] text-white px-3 sm:px-4 py-3 flex items-center justify-between shadow-xs sticky top-0 z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="h-9 w-9 -ml-1 flex items-center justify-center rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors focus:outline-none"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5 text-white" />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-semibold text-white tracking-tight truncate">
              {title}
            </h1>
            {subtitle && (
              <p className="text-[11px] text-blue-100/90 truncate">{subtitle}</p>
            )}
          </div>
        </div>

        {rightAction && <div className="flex items-center gap-2 shrink-0">{rightAction}</div>}
      </div>
    );
  }

  return (
    <div className="w-full bg-white border-b border-[#E2E8F0] px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2.5 min-w-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="h-9 w-9 -ml-1 flex items-center justify-center rounded-lg text-[#64748B] hover:text-[#172033] hover:bg-slate-100 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div>
          <h1 className="text-base sm:text-lg font-bold text-[#172033] tracking-tight">{title}</h1>
          {subtitle && <p className="text-xs text-[#64748B]">{subtitle}</p>}
        </div>
      </div>
      {rightAction && <div className="flex items-center gap-2">{rightAction}</div>}
    </div>
  );
};

// ------------------------------------------------------------------------------
// 3. PrimaryButton (Strong Examination-System Blue)
// ------------------------------------------------------------------------------
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const PrimaryButton: React.FC<ButtonProps> = ({
  children,
  loading = false,
  icon,
  fullWidth = false,
  size = 'md',
  disabled,
  className = '',
  ...props
}) => {
  const sizeClasses = {
    sm: 'h-9 px-3 text-xs font-semibold',
    md: 'h-11 px-4 text-xs sm:text-sm font-semibold',
    lg: 'h-12 px-5 text-sm font-semibold',
  }[size];

  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-[#1565D8] text-white hover:bg-[#0D47A1] active:bg-[#0A3880] disabled:opacity-50 disabled:cursor-not-allowed shadow-xs transition-colors select-none focus:outline-none focus:ring-2 focus:ring-[#1565D8]/30 ${
        fullWidth ? 'w-full' : ''
      } ${sizeClasses} ${className}`}
      {...props}
    >
      {loading && <RefreshCw className="h-4 w-4 animate-spin text-white" />}
      {!loading && icon}
      <span>{children}</span>
    </button>
  );
};

// ------------------------------------------------------------------------------
// 4. SecondaryButton (Light Blue / Outline)
// ------------------------------------------------------------------------------
export const SecondaryButton: React.FC<ButtonProps & { variant?: 'light' | 'outline' | 'header-pill' }> = ({
  children,
  loading = false,
  icon,
  fullWidth = false,
  size = 'md',
  variant = 'light',
  disabled,
  className = '',
  ...props
}) => {
  const sizeClasses = {
    sm: 'h-9 px-3 text-xs font-semibold',
    md: 'h-11 px-4 text-xs sm:text-sm font-semibold',
    lg: 'h-12 px-5 text-sm font-semibold',
  }[size];

  const variantClasses = {
    light: 'bg-[#EAF2FF] text-[#1565D8] hover:bg-[#D8E6FC] active:bg-[#C4DBFA] border border-[#BFDBFE]',
    outline: 'bg-white text-[#172033] hover:bg-slate-50 active:bg-slate-100 border border-[#E2E8F0]',
    'header-pill': 'bg-white/95 text-[#1565D8] hover:bg-white active:bg-blue-50 px-3.5 py-1.5 rounded-md text-xs font-bold shadow-xs',
  }[variant];

  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg transition-colors select-none focus:outline-none ${
        variant !== 'header-pill' ? sizeClasses : ''
      } ${variantClasses} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {loading && <RefreshCw className="h-4 w-4 animate-spin text-current" />}
      {!loading && icon}
      <span>{children}</span>
    </button>
  );
};

// ------------------------------------------------------------------------------
// 5. FormField (Structured form label, child, helper and error)
// ------------------------------------------------------------------------------
export interface FormFieldProps {
  label: string;
  required?: boolean;
  optionalText?: string;
  error?: string;
  helperText?: string;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  required,
  optionalText,
  error,
  helperText,
  children,
  className = '',
}) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-[#172033]">
          {label}
          {required && <span className="text-[#DC2626] ml-0.5">*</span>}
        </label>
        {optionalText && <span className="text-[11px] text-[#64748B]">{optionalText}</span>}
      </div>

      {children}

      {error && <p className="text-xs text-[#DC2626] font-medium">{error}</p>}
      {!error && helperText && <p className="text-[11px] text-[#64748B]">{helperText}</p>}
    </div>
  );
};

// ------------------------------------------------------------------------------
// 6. SelectField (Matching Screen 2 University & Exam Type dropdowns)
// ------------------------------------------------------------------------------
export interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  required?: boolean;
  error?: string;
  helperText?: string;
  options: { label: string; value: string }[];
  placeholder?: string;
}

export const SelectField: React.FC<SelectFieldProps> = ({
  label,
  required,
  error,
  helperText,
  options,
  placeholder,
  id,
  className = '',
  ...props
}) => {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-semibold text-[#172033]">
          {label}
          {required && <span className="text-[#DC2626] ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          className={`w-full h-11 appearance-none rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-3.5 pr-9 text-xs sm:text-sm text-[#172033] focus:bg-white focus:border-[#1565D8] focus:ring-1 focus:ring-[#1565D8] focus:outline-none transition-colors ${
            error ? 'border-[#DC2626] focus:border-[#DC2626] focus:ring-[#DC2626]' : ''
          } ${className}`}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-[#64748B]">
          <ChevronDown className="h-4 w-4" />
        </div>
      </div>
      {error && <p className="text-xs text-[#DC2626] font-medium">{error}</p>}
      {!error && helperText && <p className="text-[11px] text-[#64748B]">{helperText}</p>}
    </div>
  );
};

// ------------------------------------------------------------------------------
// 7. DateField (Matching Screen 2 Exam Date input with calendar icon)
// ------------------------------------------------------------------------------
export interface DateFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  required?: boolean;
  error?: string;
  helperText?: string;
}

export const DateField: React.FC<DateFieldProps> = ({
  label,
  required,
  error,
  helperText,
  id,
  className = '',
  ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold text-[#172033]">
          {label}
          {required && <span className="text-[#DC2626] ml-0.5">*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#64748B]">
          <Calendar className="h-4 w-4" />
        </div>
        <input
          id={inputId}
          type="date"
          className={`w-full h-11 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] pl-10 pr-3.5 text-xs sm:text-sm text-[#172033] focus:bg-white focus:border-[#1565D8] focus:ring-1 focus:ring-[#1565D8] focus:outline-none transition-colors ${
            error ? 'border-[#DC2626] focus:border-[#DC2626] focus:ring-[#DC2626]' : ''
          } ${className}`}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-[#DC2626] font-medium">{error}</p>}
      {!error && helperText && <p className="text-[11px] text-[#64748B]">{helperText}</p>}
    </div>
  );
};

// ------------------------------------------------------------------------------
// 8. SegmentedControl (Matching Screen 2: FN, AN, Full Day)
// ------------------------------------------------------------------------------
export interface SegmentedControlProps {
  label?: string;
  required?: boolean;
  options: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
  className?: string;
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  label,
  required,
  options,
  value,
  onChange,
  error,
  className = '',
}) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label className="block text-xs font-semibold text-[#172033]">
          {label}
          {required && <span className="text-[#DC2626] ml-0.5">*</span>}
        </label>
      )}
      <div className="w-full grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-[#F1F5F9] border border-[#E2E8F0]">
        {options.map(opt => {
          const isActive = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`h-10 text-xs sm:text-sm font-semibold rounded-md transition-all select-none flex items-center justify-center ${
                isActive
                  ? 'bg-[#1565D8] text-white shadow-xs'
                  : 'bg-transparent text-[#64748B] hover:text-[#172033] hover:bg-slate-200/60'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs text-[#DC2626] font-medium">{error}</p>}
    </div>
  );
};

// ------------------------------------------------------------------------------
// 9. StatusBadge (Subtle Examination Operational Indicators)
// ------------------------------------------------------------------------------
export const StatusBadge: React.FC<{
  status: string;
  size?: 'sm' | 'md';
}> = ({ status, size = 'sm' }) => {
  const norm = status.toLowerCase();

  let colors = 'bg-slate-100 text-slate-700 border-slate-200';
  let dotColor = 'bg-slate-400';

  if (
    norm.includes('verif') ||
    norm.includes('active') ||
    norm.includes('completed') ||
    norm.includes('valid') ||
    norm.includes('ready')
  ) {
    colors = 'bg-[#DCFCE7] text-[#16A34A] border-[#BBF7D0]';
    dotColor = 'bg-[#16A34A]';
  } else if (
    norm.includes('scan') ||
    norm.includes('progress') ||
    norm.includes('scheduled')
  ) {
    colors = 'bg-[#EAF2FF] text-[#1565D8] border-[#BFDBFE]';
    dotColor = 'bg-[#1565D8]';
  } else if (
    norm.includes('miss') ||
    norm.includes('deactiv') ||
    norm.includes('error') ||
    norm.includes('damag')
  ) {
    colors = 'bg-[#FEE2E2] text-[#DC2626] border-[#FECACA]';
    dotColor = 'bg-[#DC2626]';
  } else if (
    norm.includes('draft') ||
    norm.includes('archiv')
  ) {
    colors = 'bg-slate-100 text-[#64748B] border-[#E2E8F0]';
    dotColor = 'bg-[#64748B]';
  } else if (
    norm.includes('duplic') ||
    norm.includes('warn') ||
    norm.includes('suspend')
  ) {
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
// 10. DataCard (Clean white card with subtle border and minimal shadow)
// ------------------------------------------------------------------------------
export interface DataCardProps {
  children: React.ReactNode;
  title?: string;
  action?: React.ReactNode;
  className?: string;
}

export const DataCard: React.FC<DataCardProps> = ({
  children,
  title,
  action,
  className = '',
}) => {
  return (
    <div className={`rounded-lg border border-[#E2E8F0] bg-white p-4 sm:p-5 shadow-xs ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
          {title && <h2 className="text-sm font-bold text-[#172033] tracking-tight">{title}</h2>}
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
};

// ------------------------------------------------------------------------------
// 11. EmptyState (Zero Fake Data Presentation)
// ------------------------------------------------------------------------------
export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}) => {
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white p-8 sm:p-12 text-center shadow-xs">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#EAF2FF] text-[#1565D8] mb-3">
        {icon || <AlertCircle className="h-6 w-6" />}
      </div>
      <h3 className="text-sm font-semibold text-[#172033]">{title}</h3>
      <p className="mt-1 text-xs text-[#64748B] max-w-sm mx-auto leading-relaxed">{description}</p>
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
// 12. ConfirmationDialog
// ------------------------------------------------------------------------------
export interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-2xs animate-in fade-in duration-150">
      <div className="w-full max-w-sm rounded-xl bg-white border border-[#E2E8F0] p-5 shadow-xl">
        <h3 className="text-base font-semibold text-[#172033]">{title}</h3>
        <p className="mt-2 text-xs text-[#64748B] leading-relaxed">{message}</p>
        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 px-4 text-xs font-semibold rounded-lg border border-[#E2E8F0] bg-white text-[#172033] hover:bg-slate-50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`h-10 px-4 text-xs font-semibold rounded-lg text-white transition-colors ${
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
// 13. LoadingState
// ------------------------------------------------------------------------------
export const LoadingState: React.FC<{ message?: string }> = ({
  message = 'Loading examination records...',
}) => {
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white p-12 text-center shadow-xs">
      <div className="mx-auto h-7 w-7 border-2 border-[#1565D8]/20 border-t-[#1565D8] rounded-full animate-spin mb-3" />
      <p className="text-xs font-semibold text-[#172033]">{message}</p>
    </div>
  );
};
