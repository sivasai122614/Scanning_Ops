import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, AlertOctagon, ScanLine } from 'lucide-react';

export interface ScannerToastData {
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  subtitle?: string;
  id?: number | string;
  duration?: number;
}

interface ScannerTopToastProps {
  toast: ScannerToastData | null;
  onDismiss?: () => void;
  duration?: number;
}

export const ScannerTopToast: React.FC<ScannerTopToastProps> = ({
  toast,
  onDismiss,
  duration = 1200,
}) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!toast) {
      setVisible(false);
      return;
    }

    setVisible(true);
    const activeDuration = toast.duration ?? duration ?? 1200;
    const timer = setTimeout(() => {
      setVisible(false);
      if (onDismiss) onDismiss();
    }, activeDuration);

    return () => clearTimeout(timer);
  }, [toast, duration, onDismiss]);

  if (!toast || !visible) return null;

  const isSuccess = toast.type === 'success';
  const isWarning = toast.type === 'warning';
  const isError = toast.type === 'error';
  const isInfo = toast.type === 'info';

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-sm pointer-events-none transition-all duration-200 ease-out transform"
    >
      <div
        className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl shadow-lg border backdrop-blur-md text-left transition-all ${
          isSuccess
            ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-100 shadow-emerald-950/40'
            : isWarning
            ? 'bg-amber-950/90 border-amber-500/60 text-amber-100 shadow-amber-950/40'
            : isInfo
            ? 'bg-blue-950/90 border-blue-500/60 text-blue-100 shadow-blue-950/40'
            : 'bg-rose-950/90 border-rose-500/60 text-rose-100 shadow-rose-950/40'
        }`}
      >
        <div className="shrink-0">
          {isSuccess && (
            <div className="h-7 w-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-400/30">
              <CheckCircle2 className="h-4 w-4 stroke-[2.5]" />
            </div>
          )}
          {isWarning && (
            <div className="h-7 w-7 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-400/30">
              <AlertTriangle className="h-4 w-4 stroke-[2.5]" />
            </div>
          )}
          {isInfo && (
            <div className="h-7 w-7 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-400/30">
              <ScanLine className="h-4 w-4 stroke-[2.5]" />
            </div>
          )}
          {isError && (
            <div className="h-7 w-7 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-400/30">
              <AlertOctagon className="h-4 w-4 stroke-[2.5]" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 pr-1">
          <div
            className={`text-xs font-bold tracking-tight truncate ${
              isSuccess
                ? 'text-emerald-200'
                : isWarning
                ? 'text-amber-200'
                : isInfo
                ? 'text-blue-200'
                : 'text-rose-200'
            }`}
          >
            {toast.title}
          </div>
          {toast.subtitle && (
            <div className="text-[11px] font-mono font-semibold opacity-90 truncate mt-0.5 text-white">
              {toast.subtitle}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
