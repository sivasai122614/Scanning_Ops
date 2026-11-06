// ==============================================================================
// ExamScan Dashboard View — Informational Monitoring & Overview Screen
// Production Features:
// - Realtime Dashboard Analysis (auto-subscribing & auto-syncing with Supabase)
// - Date Range Sorting (X to Y, e.g. 1-10-26 to 5-10-26, Today, All Time)
// - Dedicated "Today's Manual Progress" Card (syncs with public.manual_inward_data)
// - Separate Manual Inward Table Modal with Scanned By, Class ID, Member ID, Date & Time
// - Zero duplicate buttons (clean header without redundant Import buttons)
// ==============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Calendar as CalendarIcon,
  Building,
  CheckCircle2,
  Clock,
  Layers,
  Activity,
  LayoutGrid,
  List,
  Search,
  X,
  Filter,
  ArrowUpDown,
  FileSpreadsheet,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  importedService,
  ClassBundle,
  SessionSummary,
  ManualInwardedRecord,
  formatExamDate,
  normalizeExamDate,
  ExamDateFilter,
} from '../../services/importedService';
import { ManualInwardModal } from './ManualInwardModal';
import { AdminInwardRollbackModal } from './AdminInwardRollbackModal';
import { exportScanningStatusOverviewToExcel } from '../../utils/excelExport';

interface DashboardViewProps {
  onNavigateToSessions?: () => void;
  onNavigateToScan?: () => void;
  onNavigateToCreateSession?: () => void;
  onNavigateToExceptions?: () => void;
  onNavigateToImport?: () => void;
}

export type StatusFilterType = 'ALL' | 'COMPLETED' | 'IN_PROGRESS' | 'PARTIAL' | 'NOT_STARTED';
export type SortByType =
  | 'default'
  | 'completed_first'
  | 'started_first'
  | 'not_started_first'
  | 'scanned_desc'
  | 'scanned_asc'
  | 'pending_desc'
  | 'progress_desc'
  | 'class_asc'
  | 'class_desc';

/**
 * Auto-hyphenation mask for DD-MM-YYYY inputs:
 * Automatically appends hyphens after day (2 digits) and month (2 digits).
 * Allows clean backspacing when editing.
 */
function formatDdMmYyyyInput(val: string, prevVal: string = ''): string {
  // If user is backspacing/deleting, permit direct editing without forcing hyphens back
  if (prevVal && val.length < prevVal.length) {
    return val;
  }
  const digits = val.replace(/\D/g, '').slice(0, 8);
  if (!digits) return '';

  if (digits.length <= 2) {
    return digits.length === 2 ? `${digits}-` : digits;
  }
  if (digits.length <= 4) {
    const d = digits.slice(0, 2);
    const m = digits.slice(2);
    return m.length === 2 ? `${d}-${m}-` : `${d}-${m}`;
  }
  const d = digits.slice(0, 2);
  const m = digits.slice(2, 4);
  const y = digits.slice(4);
  return `${d}-${m}-${y}`;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface CalendarDropdownProps {
  currentValue: string;
  onSelect: (dateStr: string) => void;
  onClose: () => void;
  availableDates?: { date: string; displayDate: string; totalRecords: number }[];
}

const CalendarDropdown: React.FC<CalendarDropdownProps> = ({
  currentValue,
  onSelect,
  onClose,
  availableDates = [],
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Parse initial view from currentValue (DD-MM-YYYY) or default to available date / Nov 2026
  const initialDate = useMemo(() => {
    if (currentValue && /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.test(currentValue.trim())) {
      const parts = currentValue.trim().split(/[-/.]/);
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const y = parseInt(parts[2], 10);
      return { year: y, month: m, day: d };
    }
    if (availableDates.length > 0 && availableDates[0].displayDate) {
      const parts = availableDates[0].displayDate.split(/[-/.]/);
      if (parts.length === 3) {
        return {
          year: parseInt(parts[2], 10),
          month: parseInt(parts[1], 10) - 1,
          day: parseInt(parts[0], 10),
        };
      }
    }
    return { year: 2026, month: 10, day: 1 };
  }, [currentValue, availableDates]);

  const [viewYear, setViewYear] = useState<number>(initialDate.year);
  const [viewMonth, setViewMonth] = useState<number>(initialDate.month);

  const availableMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of availableDates) {
      if (d.displayDate) map.set(d.displayDate, d.totalRecords);
    }
    return map;
  }, [availableDates]);

  // Click outside to close
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const daysGrid: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    daysGrid.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    daysGrid.push(i);
  }

  return (
    <div
      ref={containerRef}
      className="absolute top-full left-0 mt-2 z-50 w-72 bg-white rounded-2xl border border-[#CBD5E1] shadow-xl p-3.5"
    >
      {/* Month & Year Navigation */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#F1F5F9]">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="p-1 rounded-lg text-[#64748B] hover:text-[#172033] hover:bg-[#F1F5F9] transition-colors cursor-pointer"
          title="Previous Month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-xs font-black text-[#172033] tracking-wide">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </div>
        <button
          type="button"
          onClick={handleNextMonth}
          className="p-1 rounded-lg text-[#64748B] hover:text-[#172033] hover:bg-[#F1F5F9] transition-colors cursor-pointer"
          title="Next Month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(w => (
          <span key={w} className="text-[10px] font-bold text-[#94A3B8]">
            {w}
          </span>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-1">
        {daysGrid.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="h-8 w-8" />;
          }

          const dd = String(day).padStart(2, '0');
          const mm = String(viewMonth + 1).padStart(2, '0');
          const dateStr = `${dd}-${mm}-${viewYear}`;
          const isSelected = currentValue === dateStr;
          const recordsCount = availableMap.get(dateStr);
          const hasRecords = recordsCount !== undefined && recordsCount > 0;

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => {
                onSelect(dateStr);
                onClose();
              }}
              title={hasRecords ? `${dateStr}: ${recordsCount} scripts in database` : dateStr}
              className={`relative h-8 w-8 rounded-xl flex flex-col items-center justify-center text-xs font-semibold transition-all cursor-pointer ${
                isSelected
                  ? 'bg-[#1565D8] text-white font-bold shadow-xs'
                  : hasRecords
                  ? 'bg-blue-50 text-[#1565D8] font-bold hover:bg-blue-100 border border-blue-200'
                  : 'text-[#172033] hover:bg-[#F1F5F9]'
              }`}
            >
              <span>{day}</span>
              {hasRecords && !isSelected && (
                <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-[#1565D8]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Quick Footer */}
      <div className="mt-3 pt-2 border-t border-[#F1F5F9] flex items-center justify-between text-[11px]">
        <button
          type="button"
          onClick={() => {
            const today = new Date();
            const td = String(today.getDate()).padStart(2, '0');
            const tm = String(today.getMonth() + 1).padStart(2, '0');
            const ty = today.getFullYear();
            onSelect(`${td}-${tm}-${ty}`);
            onClose();
          }}
          className="text-[#1565D8] hover:underline font-bold cursor-pointer"
        >
          Today
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-[#64748B] hover:text-[#172033] font-semibold cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>
  );
};

export const DashboardView: React.FC<DashboardViewProps> = () => {
  const [bundles, setBundles] = useState<ClassBundle[]>([]);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Status Filter & Sorting for Live Monitoring (Requirement 4)
function getTodayDdMmYyyy(): string {
  const today = new Date();
  const d = String(today.getDate()).padStart(2, '0');
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const y = today.getFullYear();
  return `${d}-${m}-${y}`;
}

function getTomorrowDdMmYyyy(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const d = String(tomorrow.getDate()).padStart(2, '0');
  const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const y = tomorrow.getFullYear();
  return `${d}-${m}-${y}`;
}

  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('ALL');
  const [sortBy, setSortBy] = useState<SortByType>('default');

  // Top Date Range Inputs: Default From Date = Today (DD-MM-YYYY) and To Date = Tomorrow (DD-MM-YYYY)
  const [filterStartDate, setFilterStartDate] = useState<string>(() => {
    return getTodayDdMmYyyy();
  });
  const [filterEndDate, setFilterEndDate] = useState<string>(() => {
    return getTomorrowDdMmYyyy();
  });
  const [openPickerType, setOpenPickerType] = useState<'from' | 'to' | null>(null);

  const handleFromDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatDdMmYyyyInput(e.target.value, filterStartDate);
    setFilterStartDate(formatted);
  };

  const handleToDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatDdMmYyyyInput(e.target.value, filterEndDate);
    setFilterEndDate(formatted);
  };

  // Track if user has fetched date data (Initializes true for today-tomorrow range)
  const [hasFetchedData, setHasFetchedData] = useState<boolean>(true);
  const [fetchedRange, setFetchedRange] = useState<{ startDate: string; endDate: string } | null>(() => {
    const sIso = normalizeExamDate(getTodayDdMmYyyy()) || getTodayDdMmYyyy();
    const eIso = normalizeExamDate(getTomorrowDdMmYyyy()) || getTomorrowDdMmYyyy();
    return { startDate: sIso, endDate: eIso };
  });
  const [isFetching, setIsFetching] = useState<boolean>(false);

  // Manual Inward Modal State (Requirement 5 & 6)
  const [isManualModalOpen, setIsManualModalOpen] = useState<boolean>(false);
  const [manualRecords, setManualRecords] = useState<ManualInwardedRecord[]>([]);

  // Admin Inward Rollback Modal State (Safe Revert from saved_scanned_data back to yet_to_be_inward)
  const [isRollbackModalOpen, setIsRollbackModalOpen] = useState<boolean>(false);
  const [rollbackTargetClassId, setRollbackTargetClassId] = useState<string>('');
  const [rollbackTargetExamDate, setRollbackTargetExamDate] = useState<string>('');

  // Status Overview Excel Export
  const [isExportingOverview, setIsExportingOverview] = useState<boolean>(false);

  // Available Exam Dates in imported baseline
  const availableExamDates = useMemo(() => {
    return importedService.getAvailableExamDates();
  }, [bundles, sessionSummary]);

  const handleExportStatusOverviewExcel = async () => {
    if (bundles.length === 0) return;
    setIsExportingOverview(true);
    try {
      await exportScanningStatusOverviewToExcel(bundles, universityName, sessionSummary || undefined);
    } catch (err) {
      console.error('Failed to export status overview to Excel:', err);
    } finally {
      setIsExportingOverview(false);
    }
  };

  const initialStartIso = normalizeExamDate(getTodayDdMmYyyy()) || getTodayDdMmYyyy();
  const initialEndIso = normalizeExamDate(getTomorrowDdMmYyyy()) || getTomorrowDdMmYyyy();
  const activeFilterRef = useRef<ExamDateFilter>({ startDate: initialStartIso, endDate: initialEndIso });
  const hasFetchedDataRef = useRef<boolean>(true);

  // Load and subscribe to live data scoped to fetched date range
  const loadData = useCallback((explicitFilter?: ExamDateFilter) => {
    const filterToUse = explicitFilter !== undefined ? explicitFilter : activeFilterRef.current;
    const isFetched = hasFetchedDataRef.current || (filterToUse !== null && filterToUse !== undefined && filterToUse !== '');

    if (!isFetched) {
      setBundles([]);
      setSessionSummary(null);
      setManualRecords([]);
      return;
    }

    const bList = importedService.getClassBundles(filterToUse || undefined);
    const sum = importedService.getSessionSummary(filterToUse || undefined);
    const manList = importedService.getManualInwardRecords();
    setBundles(bList);
    setSessionSummary(sum);
    setManualRecords(manList);
  }, []);

  const handleFetchData = (customStart?: string, customEnd?: string) => {
    const s = customStart !== undefined ? customStart : filterStartDate;
    const e = customEnd !== undefined ? customEnd : (filterEndDate || filterStartDate);

    if (!s && !e) {
      if (availableExamDates.length > 0) {
        const first = availableExamDates[0].date;
        const firstDisplay = availableExamDates[0].displayDate;
        setFilterStartDate(firstDisplay);
        setFilterEndDate(firstDisplay);
        setFetchedRange({ startDate: first, endDate: first });
        hasFetchedDataRef.current = true;
        setHasFetchedData(true);
        activeFilterRef.current = first;
        importedService.setActiveExamDate(first);
        loadData(first);
      }
      return;
    }

    const startIso = normalizeExamDate(s) || s;
    const endIso = normalizeExamDate(e) || e || startIso;
    const startDisplay = formatExamDate(startIso);
    const endDisplay = formatExamDate(endIso);

    setFilterStartDate(startDisplay);
    setFilterEndDate(endDisplay);
    setFetchedRange({ startDate: startIso, endDate: endIso });
    hasFetchedDataRef.current = true;
    setHasFetchedData(true);
    setIsFetching(true);

    const filterToUse: ExamDateFilter = startIso === endIso
      ? startIso
      : { startDate: startIso, endDate: endIso };

    activeFilterRef.current = filterToUse;
    // Always sync active station exam date so inward operations stay synchronized
    importedService.setActiveExamDate(startIso);
    loadData(filterToUse);
    setIsFetching(false);
  };

  const handleClearDateFilter = () => {
    const today = getTodayDdMmYyyy();
    const tomorrow = getTomorrowDdMmYyyy();
    setFilterStartDate(today);
    setFilterEndDate(tomorrow);
    handleFetchData(today, tomorrow);
  };

  useEffect(() => {
    // Auto-fetch data for initial today-to-tomorrow range on mount
    handleFetchData(getTodayDdMmYyyy(), getTomorrowDdMmYyyy());

    const unsub = importedService.subscribe(() => {
      loadData();
    });
    return () => {
      unsub();
    };
  }, []);

  // Realtime periodic background auto-refresh & Supabase synchronization (every 5 seconds)
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        await importedService.syncFromSupabase();
      } catch (err) {
        console.warn('[REALTIME AUTO-REFRESH] Background sync error:', err);
      }
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Today's formatted date
  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const universityName = sessionSummary?.universityName || importedService.getActiveUniversity() || '';

  // Base counts
  const totalClasses = sessionSummary?.totalClasses || bundles.length;
  const totalExpected = sessionSummary?.totalExpected || 0;
  const baseTotalReceived = sessionSummary?.totalReceived || 0;

  // Filtered Manual Inward records based on selected date range (normalized dates)
  const filteredManualRecords = useMemo(() => {
    if (!filterStartDate && !filterEndDate) return manualRecords;
    const sIso = normalizeExamDate(filterStartDate);
    const eIso = normalizeExamDate(filterEndDate) || sIso;

    const matched = manualRecords.filter(r => {
      const recNorm = r.exam_date ? normalizeExamDate(r.exam_date) : '';
      if (recNorm) {
        if (sIso && recNorm < sIso) return false;
        if (eIso && recNorm > eIso) return false;
        return true;
      }
      const tStr = r.scanned_at || r.created_at || '';
      if (tStr) {
        const datePrefix = tStr.slice(0, 10);
        if (sIso && datePrefix < sIso) return false;
        if (eIso && datePrefix > eIso) return false;
        return true;
      }
      return true;
    });
    return matched;
  }, [manualRecords, filterStartDate, filterEndDate]);

  // Today's manual records (for today's manual progress card)
  const todayDateStr = new Date().toISOString().split('T')[0];
  const todayManualCount = useMemo(() => {
    return manualRecords.filter(r => {
      const recIso = r.exam_date ? normalizeExamDate(r.exam_date) : '';
      if (recIso && recIso === todayDateStr) return true;
      const tStr = r.scanned_at || r.created_at || '';
      return tStr.startsWith(todayDateStr);
    }).length;
  }, [manualRecords, todayDateStr]);

  // Active manual count: use filtered count if entries match, or fallback to full manualRecords so it never drops to 0 erroneously
  const activeManualCount = useMemo(() => {
    if (filteredManualRecords.length > 0) return filteredManualRecords.length;
    if (todayManualCount > 0) return todayManualCount;
    return manualRecords.length;
  }, [filteredManualRecords, todayManualCount, manualRecords]);

  const totalReceived = baseTotalReceived;
  const totalPending = sessionSummary?.totalPending !== undefined ? sessionSummary.totalPending : Math.max(0, totalExpected - totalReceived);
  const completionRate = totalExpected > 0 ? Math.round((totalReceived / totalExpected) * 100) : 0;

  // Manual Progress Percentage compared to Total Received or Baseline
  const manualPercentage = useMemo(() => {
    if (activeManualCount <= 0) return 0;
    if (totalReceived > 0) {
      return Math.round((activeManualCount / totalReceived) * 100);
    }
    if (totalExpected > 0) {
      return Math.round((activeManualCount / totalExpected) * 100);
    }
    return 100;
  }, [activeManualCount, totalReceived, totalExpected]);

  // Status breakdown counts
  const completedCount = bundles.filter(b => b.status === 'COMPLETED').length;
  const inProgressCount = bundles.filter(b => b.status === 'IN PROGRESS').length;
  const partialSavedCount = bundles.filter(b => b.status === 'PARTIAL / SAVED').length;
  const notStartedCount = bundles.filter(b => b.status === 'NOT STARTED').length;

  // Requirement 4: Filter & Sort Scanned Bundles by Status (Completed, Started/In Progress, Not Started) and Counts
  const filteredAndSortedBundles = useMemo(() => {
    let result = [...bundles];

    // 1. Text Search Filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(b => b.classId.toLowerCase().includes(q));
    }

    // 2. Status Filter
    if (statusFilter !== 'ALL') {
      result = result.filter(b => {
        if (statusFilter === 'COMPLETED') return b.status === 'COMPLETED';
        if (statusFilter === 'IN_PROGRESS') return b.status === 'IN PROGRESS';
        if (statusFilter === 'PARTIAL') return b.status === 'PARTIAL / SAVED';
        if (statusFilter === 'NOT_STARTED') return b.status === 'NOT STARTED';
        return true;
      });
    }

    // 3. Sorting (Completed, Started/In Progress, Not Started, Scanned Count, Pending Count, etc.)
    result.sort((a, b) => {
      if (sortBy === 'completed_first') {
        const rank = (s: string) => (s === 'COMPLETED' ? 0 : s === 'IN PROGRESS' ? 1 : s === 'PARTIAL / SAVED' ? 2 : 3);
        const diff = rank(a.status) - rank(b.status);
        if (diff !== 0) return diff;
      } else if (sortBy === 'started_first') {
        const rank = (s: string) => (s === 'IN PROGRESS' ? 0 : s === 'PARTIAL / SAVED' ? 1 : s === 'COMPLETED' ? 2 : 3);
        const diff = rank(a.status) - rank(b.status);
        if (diff !== 0) return diff;
      } else if (sortBy === 'not_started_first') {
        const rank = (s: string) => (s === 'NOT STARTED' ? 0 : s === 'IN PROGRESS' ? 1 : s === 'PARTIAL / SAVED' ? 2 : 3);
        const diff = rank(a.status) - rank(b.status);
        if (diff !== 0) return diff;
      } else if (sortBy === 'scanned_desc') {
        const diff = b.receivedCount - a.receivedCount;
        if (diff !== 0) return diff;
      } else if (sortBy === 'scanned_asc') {
        const diff = a.receivedCount - b.receivedCount;
        if (diff !== 0) return diff;
      } else if (sortBy === 'pending_desc') {
        const pA = Math.max(0, a.expectedCount - a.receivedCount);
        const pB = Math.max(0, b.expectedCount - b.receivedCount);
        const diff = pB - pA;
        if (diff !== 0) return diff;
      } else if (sortBy === 'progress_desc') {
        const diff = b.progressPercentage - a.progressPercentage;
        if (diff !== 0) return diff;
      } else if (sortBy === 'class_asc') {
        return a.classId.localeCompare(b.classId, undefined, { numeric: true, sensitivity: 'base' });
      } else if (sortBy === 'class_desc') {
        return b.classId.localeCompare(a.classId, undefined, { numeric: true, sensitivity: 'base' });
      }

      // Default: retain original sequence (classOrder)
      return 0;
    });

    return result;
  }, [bundles, searchQuery, statusFilter, sortBy]);

  const hasScanningStarted = totalReceived > 0 || inProgressCount > 0 || partialSavedCount > 0 || completedCount > 0;

  // Quick Preset Helper for Date Range
  const setDatePreset = (preset: 'all' | 'today' | 'yesterday' | 'oct_example') => {
    let s = '';
    let e = '';
    if (preset === 'all') {
      s = '';
      e = '';
    } else if (preset === 'today') {
      s = todayDateStr;
      e = todayDateStr;
    } else if (preset === 'yesterday') {
      const yDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      s = yDate;
      e = yDate;
    } else if (preset === 'oct_example') {
      s = '2026-10-01';
      e = '2026-10-05';
    }
    setFilterStartDate(s);
    setFilterEndDate(e);
    if (s && e) {
      handleFetchData(s, e);
    } else {
      handleClearDateFilter();
    }
  };

  const isDateFiltered = Boolean(filterStartDate || filterEndDate);

  return (
    <div className="space-y-6 font-sans w-full pb-16">
      {/* Embedded High-Performance Wave Animation Keyframes */}
      <style>{`
        @keyframes dashboard-wave {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 0.85; }
          100% { transform: scale(2.6); opacity: 0; }
        }
        @keyframes sine-flow-1 {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes sine-flow-2 {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
        @keyframes eq-bar {
          0%, 100% { transform: scaleY(0.2); }
          50% { transform: scaleY(1); }
        }
        .anim-wave-liquid {
          background-size: 250% 250%;
          animation: dashboard-wave 4s ease infinite;
        }
        .anim-radar-wave {
          animation: pulse-ring 2.4s cubic-bezier(0.15, 0.85, 0.35, 1) infinite;
        }
        .anim-sine-1 {
          animation: sine-flow-1 12s linear infinite;
        }
        .anim-sine-2 {
          animation: sine-flow-2 18s linear infinite;
        }
        .anim-eq-1 { animation: eq-bar 1.1s ease-in-out infinite 0.1s; transform-origin: bottom; }
        .anim-eq-2 { animation: eq-bar 1.3s ease-in-out infinite 0.3s; transform-origin: bottom; }
        .anim-eq-3 { animation: eq-bar 0.9s ease-in-out infinite 0.5s; transform-origin: bottom; }
        .anim-eq-4 { animation: eq-bar 1.4s ease-in-out infinite 0.2s; transform-origin: bottom; }
        .anim-eq-5 { animation: eq-bar 1.2s ease-in-out infinite 0.4s; transform-origin: bottom; }
        .anim-eq-6 { animation: eq-bar 1.0s ease-in-out infinite 0.6s; transform-origin: bottom; }
        @keyframes gentle-nudge {
          0%, 100% {
            transform: translateY(0);
            box-shadow: 0 4px 6px -1px rgba(21, 101, 216, 0.25), 0 2px 4px -2px rgba(21, 101, 216, 0.2);
          }
          50% {
            transform: translateY(-3px) scale(1.02);
            box-shadow: 0 10px 18px -3px rgba(21, 101, 216, 0.45), 0 4px 6px -4px rgba(21, 101, 216, 0.25);
          }
        }
        .anim-gentle-nudge {
          animation: gentle-nudge 2s ease-in-out infinite;
        }
      `}</style>

      {/* 1. Header Toolbar with Direct Date Range Fetcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 border border-[#CBD5E1] rounded-2xl shadow-xs">
        {/* Left: From Date, To Date & Fetch Button */}
        <div className="flex flex-wrap items-center gap-3">
          {/* FROM DATE */}
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#172033]">
            <span className="text-[#64748B] uppercase tracking-wider text-[11px]">From:</span>
            <div className="relative flex items-center">
              <input
                type="text"
                placeholder="DD-MM-YYYY"
                value={filterStartDate}
                onChange={handleFromDateChange}
                onKeyDown={e => { if (e.key === 'Enter') handleFetchData(); }}
                className="h-9 w-32 pl-2.5 pr-8 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-xs font-semibold text-[#172033] font-mono focus:outline-none focus:border-[#1565D8] shadow-2xs"
                title="Enter From Date (DD-MM-YYYY, e.g. 04-11-2026)"
              />
              <button
                type="button"
                onClick={() => setOpenPickerType(prev => prev === 'from' ? null : 'from')}
                className={`absolute right-1.5 p-1 rounded-lg transition-colors cursor-pointer ${
                  openPickerType === 'from' ? 'text-[#1565D8] bg-blue-100' : 'text-[#64748B] hover:text-[#1565D8] hover:bg-slate-100'
                }`}
                title="Click to open calendar"
              >
                <CalendarIcon className="h-3.5 w-3.5" />
              </button>

              {openPickerType === 'from' && (
                <CalendarDropdown
                  currentValue={filterStartDate}
                  onSelect={val => {
                    setFilterStartDate(val);
                    setOpenPickerType(null);
                  }}
                  onClose={() => setOpenPickerType(null)}
                  availableDates={availableExamDates}
                />
              )}
            </div>
          </div>

          {/* TO DATE */}
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#172033]">
            <span className="text-[#64748B] uppercase tracking-wider text-[11px]">To:</span>
            <div className="relative flex items-center">
              <input
                type="text"
                placeholder="DD-MM-YYYY"
                value={filterEndDate}
                onChange={handleToDateChange}
                onKeyDown={e => { if (e.key === 'Enter') handleFetchData(); }}
                className="h-9 w-32 pl-2.5 pr-8 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-xs font-semibold text-[#172033] font-mono focus:outline-none focus:border-[#1565D8] shadow-2xs"
                title="Enter To Date (DD-MM-YYYY, e.g. 04-11-2026)"
              />
              <button
                type="button"
                onClick={() => setOpenPickerType(prev => prev === 'to' ? null : 'to')}
                className={`absolute right-1.5 p-1 rounded-lg transition-colors cursor-pointer ${
                  openPickerType === 'to' ? 'text-[#1565D8] bg-blue-100' : 'text-[#64748B] hover:text-[#1565D8] hover:bg-slate-100'
                }`}
                title="Click to open calendar"
              >
                <CalendarIcon className="h-3.5 w-3.5" />
              </button>

              {openPickerType === 'to' && (
                <CalendarDropdown
                  currentValue={filterEndDate}
                  onSelect={val => {
                    setFilterEndDate(val);
                    setOpenPickerType(null);
                  }}
                  onClose={() => setOpenPickerType(null)}
                  availableDates={availableExamDates}
                />
              )}
            </div>
          </div>

          {/* FETCH DATA BUTTON */}
          <button
            type="button"
            onClick={() => handleFetchData()}
            disabled={isFetching}
            className="flex items-center gap-2 h-9 px-4 bg-[#1565D8] hover:bg-[#0D47A1] active:scale-95 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            {isFetching ? (
              <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            <span>Fetch Data</span>
          </button>

          {/* Clear / Reset Date */}
          {hasFetchedData && (
            <button
              type="button"
              onClick={handleClearDateFilter}
              className="flex items-center gap-1.5 h-9 px-3 bg-[#F8FAFC] hover:bg-red-50 hover:text-red-600 border border-[#CBD5E1] hover:border-red-200 rounded-xl text-xs font-semibold text-[#64748B] transition-colors cursor-pointer"
              title="Clear date filter"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Clear</span>
            </button>
          )}

          {universityName ? (
            <div className="hidden xl:flex items-center gap-2 text-xs text-[#64748B] font-medium border-l border-[#CBD5E1] pl-3">
              <Building className="h-4 w-4 text-[#64748B]" />
              <span className="font-bold text-[#172033]">{universityName}</span>
            </div>
          ) : null}
        </div>

        {/* Right: Active Date Status & Realtime Live Status */}
        <div className="flex items-center gap-2.5 shrink-0">
          {hasFetchedData && fetchedRange && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-xl text-[#1565D8] text-xs font-bold">
              <span>ACTIVE:</span>
              <span className="font-mono">
                {fetchedRange.startDate === fetchedRange.endDate
                  ? formatExamDate(fetchedRange.startDate)
                  : `${formatExamDate(fetchedRange.startDate)} → ${formatExamDate(fetchedRange.endDate)}`}
              </span>
            </span>
          )}

          <span className="relative inline-flex items-center gap-2 px-3.5 py-1.5 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-800 text-xs font-black uppercase tracking-wider shadow-2xs overflow-hidden">
            <span className="relative flex h-3 w-3">
              <span className="anim-radar-wave absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
            <span>Realtime Live</span>
          </span>
        </div>
      </div>

      {!hasFetchedData ? (
        <div className="bg-white border border-[#CBD5E1] rounded-2xl p-8 sm:p-12 text-center shadow-xs">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 border border-blue-200 text-[#1565D8] mb-4 shadow-xs">
            <CalendarIcon className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-black text-[#172033] tracking-tight">
            Select Exam Date Range & Click "Fetch Data"
          </h3>
          <p className="text-xs sm:text-sm text-[#64748B] max-w-lg mx-auto mt-2 leading-relaxed">
            Exam valuation datasets with up to 200,000 scripts are partitioned by exam date.
            Select your <strong>From Date</strong> and <strong>To Date</strong> above and click <strong>"Fetch Data"</strong> to display the dashboard telemetry with zero browser freeze.
          </p>

          {availableExamDates.length > 0 && (
            <div className="mt-6 pt-6 border-t border-[#E2E8F0] max-w-2xl mx-auto">
              <span className="text-[11px] font-black uppercase tracking-wider text-[#64748B] block mb-3">
                Detected Exam Dates in Database (Click to Fetch):
              </span>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {availableExamDates.map(d => (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => {
                      setFilterStartDate(d.displayDate);
                      setFilterEndDate(d.displayDate);
                      handleFetchData(d.displayDate, d.displayDate);
                    }}
                    className="flex items-center gap-2 px-3.5 py-2 bg-[#F8FAFC] hover:bg-[#EFF6FF] hover:border-[#1565D8] border border-[#CBD5E1] rounded-xl text-xs font-semibold text-[#172033] transition-all cursor-pointer shadow-2xs group"
                  >
                    <span className="font-mono font-bold text-[#1565D8]">{d.displayDate}</span>
                    <span className="px-1.5 py-0.5 rounded bg-blue-100 text-[#1565D8] text-[10px] font-bold group-hover:bg-[#1565D8] group-hover:text-white transition-colors">
                      {d.totalRecords.toLocaleString()} scripts
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>

      {/* 2. BREATHTAKING HERO SINE WAVE LIVE MONITORING BANNER */}
      <div className="relative overflow-hidden rounded-2xl border border-[#CBD5E1] bg-gradient-to-r from-blue-900 via-[#1565D8] to-indigo-900 p-5 sm:p-6 text-white shadow-md">
        {/* Animated Background Sine Wave Layers */}
        <div className="absolute inset-0 pointer-events-none opacity-25 overflow-hidden">
          <svg className="absolute w-[200%] h-full anim-sine-1" preserveAspectRatio="none" viewBox="0 0 1200 120">
            <path
              d="M0,40 C150,90 350,0 500,45 C650,90 850,10 1000,50 C1150,90 1200,40 1200,40 L1200,120 L0,120 Z"
              fill="rgba(56, 189, 248, 0.4)"
            />
          </svg>
          <svg className="absolute w-[200%] h-full anim-sine-2" preserveAspectRatio="none" viewBox="0 0 1200 120">
            <path
              d="M0,60 C200,10 400,80 600,40 C800,0 1000,70 1200,50 L1200,120 L0,120 Z"
              fill="rgba(129, 140, 248, 0.35)"
            />
          </svg>
        </div>

        {/* Content over Wave */}
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-cyan-400/20 border border-cyan-300/40 text-cyan-200 text-[10px] font-black uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 animate-pulse" />
              <span>LIVE VALUATION CAMP WAVE TELEMETRY</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight drop-shadow-xs">
              Campus Script Intake &amp; Inward Operations
            </h2>
            <p className="text-xs text-blue-100 max-w-xl">
              Continuous live intake stream synchronized with valuation centers. Zero-click hardware barcode gun ready.
            </p>
          </div>

          {/* Right Equalizer Frequency Visualizer Wave */}
          <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md px-4 py-3 rounded-xl border border-white/20 self-start md:self-auto shadow-inner">
            <div className="flex items-end gap-1 h-7">
              <div className="w-1.5 h-6 bg-cyan-300 rounded-full anim-eq-1" />
              <div className="w-1.5 h-6 bg-cyan-400 rounded-full anim-eq-2" />
              <div className="w-1.5 h-6 bg-blue-300 rounded-full anim-eq-3" />
              <div className="w-1.5 h-6 bg-emerald-300 rounded-full anim-eq-4" />
              <div className="w-1.5 h-6 bg-cyan-300 rounded-full anim-eq-5" />
              <div className="w-1.5 h-6 bg-indigo-300 rounded-full anim-eq-6" />
              <div className="w-1.5 h-6 bg-cyan-400 rounded-full anim-eq-2" />
              <div className="w-1.5 h-6 bg-emerald-400 rounded-full anim-eq-4" />
            </div>
            <div className="text-right border-l border-white/20 pl-3">
              <div className="text-xs font-black uppercase text-cyan-200">System Flow</div>
              <div className="text-sm font-black font-tabular text-white">{completionRate}% Synced</div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Statistics KPI Cards Grid (Responsive 2-column on mobile, 4-column on desktop) */}
      {/* 3. Statistics KPI Cards Grid with Unified Smooth Hover & Wave Animation */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 w-full">
        <div className="group rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-6 shadow-2xs hover:-translate-y-1 hover:shadow-lg hover:border-blue-200 transition-all duration-300 ease-out cursor-default relative overflow-hidden">
          <div className="absolute top-0 right-0 w-28 h-28 bg-blue-50/50 rounded-full blur-xl group-hover:scale-125 transition-transform duration-500 pointer-events-none" />
          <div className="text-[10px] sm:text-xs font-bold text-[#64748B] uppercase tracking-wider group-hover:text-[#1565D8] transition-colors">TOTAL CLASS IDs</div>
          <div className="text-2xl sm:text-4xl lg:text-5xl font-black text-[#172033] font-tabular mt-1.5 sm:mt-2.5 group-hover:text-[#1565D8] transition-colors">{totalClasses}</div>
          <div className="text-[10px] sm:text-xs text-[#64748B] mt-1 sm:mt-1.5 font-medium truncate">Imported Sessions</div>
        </div>

        <div className="group rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-6 shadow-2xs hover:-translate-y-1 hover:shadow-lg hover:border-blue-200 transition-all duration-300 ease-out cursor-default relative overflow-hidden">
          <div className="absolute top-0 right-0 w-28 h-28 bg-blue-50/50 rounded-full blur-xl group-hover:scale-125 transition-transform duration-500 pointer-events-none" />
          <div className="text-[10px] sm:text-xs font-bold text-[#64748B] uppercase tracking-wider group-hover:text-[#1565D8] transition-colors">EXPECTED BOOKLETS</div>
          <div className="text-2xl sm:text-4xl lg:text-5xl font-black text-[#172033] font-tabular mt-1.5 sm:mt-2.5 group-hover:text-[#1565D8] transition-colors">{totalExpected}</div>
          <div className="text-[10px] sm:text-xs text-[#64748B] mt-1 sm:mt-1.5 font-medium truncate">Baseline from Excel</div>
        </div>

        <div className="group rounded-2xl border-2 border-blue-400/80 bg-white p-3.5 sm:p-6 shadow-sm hover:-translate-y-1 hover:shadow-lg hover:border-blue-500 transition-all duration-300 ease-out cursor-default relative overflow-hidden bg-gradient-to-br from-white via-blue-50/30 to-blue-50/60">
          <div className="absolute top-0 right-0 w-28 h-28 bg-blue-100/60 rounded-full blur-xl group-hover:scale-125 transition-transform duration-500 pointer-events-none" />
          <div className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 flex h-2.5 w-2.5 sm:h-3 sm:w-3">
            <span className="anim-radar-wave absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 sm:h-3 sm:w-3 bg-[#1565D8]" />
          </div>
          <div className="text-[10px] sm:text-xs font-bold text-[#1565D8] uppercase tracking-wider">RECEIVED BOOKLETS</div>
          <div className="text-2xl sm:text-4xl lg:text-5xl font-black text-[#1565D8] font-tabular mt-1.5 sm:mt-2.5">{totalReceived}</div>
          <div className="text-[10px] sm:text-xs text-[#1565D8] mt-1 sm:mt-1.5 font-semibold truncate">Verified &amp; Inwarded</div>
        </div>

        <div className="group rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-6 shadow-2xs hover:-translate-y-1 hover:shadow-lg hover:border-rose-200 transition-all duration-300 ease-out cursor-default relative overflow-hidden">
          <div className="absolute top-0 right-0 w-28 h-28 bg-rose-50/50 rounded-full blur-xl group-hover:scale-125 transition-transform duration-500 pointer-events-none" />
          <div className="text-[10px] sm:text-xs font-bold text-[#64748B] uppercase tracking-wider group-hover:text-rose-600 transition-colors">PENDING BOOKLETS</div>
          <div className="text-2xl sm:text-4xl lg:text-5xl font-black text-[#DC2626] font-tabular mt-1.5 sm:mt-2.5">{totalPending}</div>
          <div className="text-[10px] sm:text-xs text-[#DC2626] mt-1 sm:mt-1.5 font-medium truncate">Remaining Required</div>
        </div>
      </div>

      {/* 4. Today's Progress Card with Vivid Liquid Ocean Wave */}
      <div className="bg-white p-6 sm:p-7 border border-[#CBD5E1] rounded-2xl shadow-xs hover:shadow-sm transition-all duration-200 w-full">
        <div className="flex items-center justify-between">
          <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#172033]">
            Today's Overall Inward Progress
          </span>
          <span className="text-lg sm:text-xl font-black font-tabular text-[#16A34A]">{completionRate}%</span>
        </div>

        <div className="mt-3.5 h-4 sm:h-5 w-full bg-slate-100 overflow-hidden rounded-full border border-slate-200 relative p-0.5 shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-blue-600 via-cyan-400 via-blue-500 to-emerald-500 anim-wave-liquid transition-all duration-500 ease-out rounded-full shadow-xs"
            style={{ width: `${Math.max(completionRate > 0 ? 4 : 0, Math.min(100, completionRate))}%` }}
          />
        </div>

        <div className="mt-3 text-xs font-tabular text-[#64748B] flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong className="text-[#172033] font-black text-sm">{totalReceived}</strong> / {totalExpected} booklets inwarded
          </span>
          <span className="text-xs font-bold text-[#1565D8]">
            {completedCount} of {totalClasses} Class IDs completed ({sessionSummary?.partialClasses || 0} in progress)
          </span>
        </div>
      </div>

      {/* 5. TODAY'S MANUAL PROGRESS CARD */}
      <div className="bg-white p-5 sm:p-6 border border-[#CBD5E1] hover:border-[#1565D8] rounded-2xl shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#172033]">
                Today's Manual Progress
              </span>
              <span className="px-2 py-0.5 bg-[#EFF6FF] border border-[#BFDBFE] text-[#1565D8] text-[10px] font-black uppercase tracking-wider rounded-md">
                manual_inward_data
              </span>
            </div>
            <div className="text-xs text-[#64748B] mt-1 font-medium">
              Synchronized directly with backend <code className="text-[#1565D8] font-bold">manual_inward_data</code> table
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => { setRollbackTargetClassId(''); setIsRollbackModalOpen(true); }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-2xs cursor-pointer active:scale-95"
              title="Admin Inward Rollback & Safe Revert Station"
            >
              <RotateCcw className="h-3.5 w-3.5 text-amber-700" />
              <span>Inward Rollback Station</span>
            </button>

            <button
              type="button"
              onClick={() => setIsManualModalOpen(true)}
              className={`relative flex items-center gap-2 px-3.5 py-2 bg-[#1565D8] hover:bg-[#0D47A1] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer active:scale-95 ${
                manualRecords.length > 0 ? 'anim-gentle-nudge ring-2 ring-blue-400 ring-offset-1' : ''
              }`}
              title="Open Dedicated Manual Inward Table"
            >
              {manualRecords.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5">
                  <span className="anim-radar-wave absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-cyan-500 text-[9px] font-black text-white items-center justify-center">
                    {manualRecords.length}
                  </span>
                </span>
              )}
              <FileSpreadsheet className="h-4 w-4" />
              <span>Open Manual Table ({manualRecords.length})</span>
            </button>
          </div>
        </div>

        {/* Progress Bar for Manual Entries vs Total Inwards (Working & Animated) */}
        <div className="mt-3.5 h-3.5 sm:h-4 w-full bg-slate-100 overflow-hidden rounded-full border border-slate-200 relative p-0.5 shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500 anim-wave-liquid transition-all duration-500 ease-out rounded-full shadow-xs flex items-center justify-end pr-1.5 text-[9px] font-black text-white"
            style={{ width: `${Math.min(100, Math.max(activeManualCount > 0 ? 8 : 0, manualPercentage))}%` }}
          >
            {activeManualCount > 0 && <span className="drop-shadow-xs">{manualPercentage}%</span>}
          </div>
        </div>

        <div className="mt-2 text-xs font-tabular text-[#64748B] flex flex-wrap items-center justify-between gap-2">
          <span>
            Today: <strong className="text-[#172033] font-black">{todayManualCount}</strong> manual entries recorded today
          </span>
          <span className="text-[11px] font-semibold text-[#1565D8]">
            {activeManualCount} total manual entries ({manualPercentage}% of all verified inward scripts)
          </span>
        </div>
      </div>

      {/* 5. Scanning Status Overview Grid */}
      <div className="bg-white p-4 border border-[#CBD5E1] rounded-xl shadow-xs">
        <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs font-bold uppercase tracking-wider text-[#172033] flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-[#1565D8]" />
            <span>Scanning Status Overview</span>
          </div>

          <button
            type="button"
            onClick={handleExportStatusOverviewExcel}
            disabled={isExportingOverview || bundles.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold rounded-lg transition-all shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            title="Export complete Scanning Status Overview to Excel (.xlsx)"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-white" />
            <span>{isExportingOverview ? 'Exporting...' : 'Export to Excel'}</span>
          </button>
        </div>

        {!hasScanningStarted ? (
          /* Neutral State Before Scanning Starts */
          <div className="p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-center">
            <Clock className="h-5 w-5 text-[#64748B] mx-auto mb-1.5" />
            <div className="text-xs font-bold text-[#172033]">
              Scanning has not started yet.
            </div>
            <div className="text-[11px] text-[#64748B] mt-0.5">
              Start scanning a booklet to begin live monitoring.
            </div>
          </div>
        ) : (
          /* Active State After First Valid Booklet */
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 sm:gap-4">
            <button
              type="button"
              onClick={() => setStatusFilter(prev => prev === 'NOT_STARTED' ? 'ALL' : 'NOT_STARTED')}
              className={`p-4 sm:p-5 border-2 rounded-xl sm:rounded-2xl text-left transition-all cursor-pointer shadow-xs hover:shadow-md active:scale-[0.99] ${
                statusFilter === 'NOT_STARTED'
                  ? 'bg-slate-100 border-[#64748B] ring-2 ring-slate-400'
                  : 'bg-[#F8FAFC] border-[#CBD5E1] hover:bg-slate-100/70'
              }`}
              title="Click to filter by Not Started classes"
            >
              <div className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#64748B] flex items-center justify-between">
                <span>Not Started</span>
                {statusFilter === 'NOT_STARTED' && (
                  <span className="text-[10px] bg-[#64748B] text-white px-2 py-0.5 rounded font-sans font-bold">ACTIVE</span>
                )}
              </div>
              <div className="text-2xl sm:text-4xl lg:text-5xl font-black font-tabular text-[#475569] mt-2 sm:mt-2.5">{notStartedCount}</div>
              <div className="text-xs text-[#64748B] mt-1 font-semibold">Classes pending intake</div>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter(prev => prev === 'IN_PROGRESS' ? 'ALL' : 'IN_PROGRESS')}
              className={`p-4 sm:p-5 border-2 rounded-xl sm:rounded-2xl text-left transition-all cursor-pointer shadow-xs hover:shadow-md active:scale-[0.99] ${
                statusFilter === 'IN_PROGRESS'
                  ? 'bg-[#EFF6FF] border-[#1D4ED8] ring-2 ring-[#93C5FD]'
                  : 'bg-[#EFF6FF] border-[#BFDBFE] hover:bg-[#DBEAFE]/70'
              }`}
              title="Click to filter by In Progress classes"
            >
              <div className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#1D4ED8] flex items-center justify-between">
                <span>In Progress</span>
                {statusFilter === 'IN_PROGRESS' && (
                  <span className="text-[10px] bg-[#1D4ED8] text-white px-2 py-0.5 rounded font-sans font-bold">ACTIVE</span>
                )}
              </div>
              <div className="text-2xl sm:text-4xl lg:text-5xl font-black font-tabular text-[#1565D8] mt-2 sm:mt-2.5">{inProgressCount}</div>
              <div className="text-xs text-[#1E40AF] mt-1 font-semibold">Currently inwarding</div>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter(prev => prev === 'PARTIAL' ? 'ALL' : 'PARTIAL')}
              className={`p-4 sm:p-5 border-2 rounded-xl sm:rounded-2xl text-left transition-all cursor-pointer shadow-xs hover:shadow-md active:scale-[0.99] ${
                statusFilter === 'PARTIAL'
                  ? 'bg-[#FEF3C7] border-[#B45309] ring-2 ring-[#FDE68A]'
                  : 'bg-[#FEF3C7] border-[#FDE68A] hover:bg-[#FDE68A]/70'
              }`}
              title="Click to filter by Partial / Saved classes"
            >
              <div className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#B45309] flex items-center justify-between">
                <span>Partial / Saved</span>
                {statusFilter === 'PARTIAL' && (
                  <span className="text-[10px] bg-[#B45309] text-white px-2 py-0.5 rounded font-sans font-bold">ACTIVE</span>
                )}
              </div>
              <div className="text-2xl sm:text-4xl lg:text-5xl font-black font-tabular text-[#B45309] mt-2 sm:mt-2.5">{partialSavedCount}</div>
              <div className="text-xs text-[#92400E] mt-1 font-semibold">Inwarded with pending</div>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter(prev => prev === 'COMPLETED' ? 'ALL' : 'COMPLETED')}
              className={`p-4 sm:p-5 border-2 rounded-xl sm:rounded-2xl text-left transition-all cursor-pointer shadow-xs hover:shadow-md active:scale-[0.99] ${
                statusFilter === 'COMPLETED'
                  ? 'bg-[#DCFCE7] border-[#15803D] ring-2 ring-[#BBF7D0]'
                  : 'bg-[#DCFCE7] border-[#BBF7D0] hover:bg-[#BBF7D0]/70'
              }`}
              title="Click to filter by Completed classes"
            >
              <div className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#15803D] flex items-center justify-between">
                <span>Completed</span>
                {statusFilter === 'COMPLETED' && (
                  <span className="text-[10px] bg-[#15803D] text-white px-2 py-0.5 rounded font-sans font-bold">ACTIVE</span>
                )}
              </div>
              <div className="text-2xl sm:text-4xl lg:text-5xl font-black font-tabular text-[#16A34A] mt-2 sm:mt-2.5">{completedCount}</div>
              <div className="text-xs text-[#166534] mt-1 font-semibold">All booklets verified</div>
            </button>
          </div>
        )}
      </div>

      {/* 6. Class-Wise Realtime Monitoring List with Status Sorting (Requirement 4) */}
      <div className="bg-white border border-[#CBD5E1] rounded-xl shadow-xs overflow-hidden">
        {/* Top Header & Search/View Bar */}
        <div className="p-4 border-b border-[#E2E8F0] flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="text-xs font-bold uppercase tracking-wider text-[#172033]">
              Class ID / SH ID Live Monitoring
            </div>
            <span className="px-2 py-0.5 bg-[#F1F5F9] text-[#475569] text-[10px] font-black rounded-md font-tabular">
              {filteredAndSortedBundles.length} of {bundles.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Box */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94A3B8]" />
              <input
                type="text"
                placeholder="Search Class ID / SH ID..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-xs font-medium text-[#172033] focus:bg-white focus:border-[#1565D8] focus:outline-hidden"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Sort Selector Dropdown (Requirement 4: completed, started, not started sort) */}
            <div className="flex items-center gap-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-2 py-1">
              <ArrowUpDown className="h-3.5 w-3.5 text-[#1565D8] shrink-0" />
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortByType)}
                className="bg-transparent text-xs font-semibold text-[#172033] focus:outline-hidden cursor-pointer"
                title="Sort scanned classes"
              >
                <option value="default">Sort: Default Order</option>
                <option value="completed_first">Sort: Completed First</option>
                <option value="started_first">Sort: Started / In Progress First</option>
                <option value="not_started_first">Sort: Not Started First</option>
                <option value="scanned_desc">Sort: Most Scanned First</option>
                <option value="scanned_asc">Sort: Least Scanned First</option>
                <option value="pending_desc">Sort: Most Pending First</option>
                <option value="progress_desc">Sort: Highest Progress %</option>
                <option value="class_asc">Sort: Class ID (A → Z)</option>
                <option value="class_desc">Sort: Class ID (Z → A)</option>
              </select>
            </div>

            {/* Grid / List View Toggle */}
            <div className="flex items-center bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-1 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white shadow-xs text-[#1565D8]' : 'text-slate-400 hover:text-slate-600'}`}
                title="Grid View"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-1 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white shadow-xs text-[#1565D8]' : 'text-slate-400 hover:text-slate-600'}`}
                title="List View"
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Status Filter Tab Pills (Requirement 4: Quick Status Categorization) */}
        <div className="px-4 py-2 bg-[#F8FAFC] border-b border-[#E2E8F0] flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] mr-1">Status:</span>
          
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-2.5 py-1 rounded-md font-bold text-xs transition-colors cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-[#1565D8] text-white shadow-xs'
                : 'bg-white border border-[#CBD5E1] text-[#475569] hover:bg-slate-100'
            }`}
          >
            All ({bundles.length})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('COMPLETED')}
            className={`px-2.5 py-1 rounded-md font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'COMPLETED'
                ? 'bg-[#16A34A] text-white shadow-xs'
                : 'bg-white border border-[#86EFAC] text-[#166534] hover:bg-emerald-50'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>Completed ({completedCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('IN_PROGRESS')}
            className={`px-2.5 py-1 rounded-md font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'IN_PROGRESS'
                ? 'bg-[#1D4ED8] text-white shadow-xs'
                : 'bg-white border border-[#93C5FD] text-[#1D4ED8] hover:bg-blue-50'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            <span>In Progress / Started ({inProgressCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('PARTIAL')}
            className={`px-2.5 py-1 rounded-md font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'PARTIAL'
                ? 'bg-[#B45309] text-white shadow-xs'
                : 'bg-white border border-[#FDE68A] text-[#92400E] hover:bg-amber-50'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            <span>Partial / Saved ({partialSavedCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('NOT_STARTED')}
            className={`px-2.5 py-1 rounded-md font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'NOT_STARTED'
                ? 'bg-[#475569] text-white shadow-xs'
                : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
            <span>Not Started ({notStartedCount})</span>
          </button>

          {statusFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className="text-[11px] text-[#DC2626] hover:underline font-semibold ml-auto flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset Status Filter</span>
            </button>
          )}
        </div>

        {/* Content View: Grid vs List */}
        {bundles.length === 0 ? (
          <div className="p-8 text-center text-[#64748B] text-xs">
            No Class IDs imported yet. Import examination data to view live monitoring.
          </div>
        ) : filteredAndSortedBundles.length === 0 ? (
          <div className="p-8 text-center text-[#64748B] text-xs space-y-2">
            <div>No Class IDs match status filter <strong>"{statusFilter}"</strong> {searchQuery && `or search "${searchQuery}"`}.</div>
            <button
              type="button"
              onClick={() => { setStatusFilter('ALL'); setSearchQuery(''); }}
              className="px-3 py-1 bg-[#1565D8] text-white font-bold text-xs rounded-lg cursor-pointer hover:bg-[#0D47A1]"
            >
              Show All Class IDs
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          /* GRID VIEW */
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
            {filteredAndSortedBundles.map(b => {
              let badgeColor = 'bg-slate-100 text-slate-700 border-slate-300';
              if (b.status === 'COMPLETED') {
                badgeColor = 'bg-[#DCFCE7] text-[#166534] border-[#86EFAC]';
              } else if (b.status === 'IN PROGRESS') {
                badgeColor = 'bg-[#EFF6FF] text-[#1D4ED8] border-[#93C5FD]';
              } else if (b.status === 'PARTIAL / SAVED') {
                badgeColor = 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]';
              }

              const classPending = Math.max(0, b.expectedCount - b.receivedCount);

              return (
                <div
                  key={b.classId}
                  className="bg-white border border-[#CBD5E1] hover:border-[#1565D8] rounded-xl p-3.5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
                    <span className="font-mono font-black text-sm text-[#172033]">CLASS ID: {b.classId}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`px-2 py-0.5 border text-[10px] font-bold uppercase tracking-wider rounded-md ${badgeColor}`}>
                        {b.status}
                      </span>
                      {b.receivedCount > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setRollbackTargetClassId(b.classId);
                            setRollbackTargetExamDate(b.examDate || (fetchedRange ? fetchedRange.startDate : ''));
                            setIsRollbackModalOpen(true);
                          }}
                          className="p-1 text-slate-400 hover:text-amber-700 hover:bg-amber-50 rounded transition-colors cursor-pointer"
                          title={`Manage & Revert Inwarded Scripts for Class ID ${b.classId}`}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="py-2.5 space-y-1.5 text-xs font-tabular">
                    <div className="flex items-center justify-between text-[#64748B]">
                      <span>Expected Booklets</span>
                      <span className="font-bold text-[#172033]">{b.expectedCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-[#1565D8]">
                      <span>Scanned / Verified</span>
                      <span className="font-bold">{b.receivedCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-[#DC2626]">
                      <span>Pending to Inward</span>
                      <span className="font-bold">{classPending}</span>
                    </div>
                    <div className="flex items-start justify-between text-[#64748B] gap-2 pt-0.5">
                      <span className="shrink-0">Operator</span>
                      <span className="font-semibold text-[#172033] text-[11px] text-right break-words leading-tight max-w-[190px]" title={b.operatorText || '—'}>
                        {b.operatorText || '—'}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#E2E8F0]">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-[#64748B] font-bold">Progress</span>
                      <span className="font-bold font-tabular text-[#16A34A]">{b.progressPercentage}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                      <div
                        className="h-full bg-[#16A34A] rounded-full transition-all"
                        style={{ width: `${Math.min(100, b.progressPercentage)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* LIST VIEW */
          <div className="divide-y divide-[#E2E8F0] overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-[#F8FAFC] text-[11px] font-bold text-[#64748B] uppercase tracking-wider border-b border-[#E2E8F0]">
                <tr>
                  <th className="py-2.5 px-3">Class ID / SH ID</th>
                  <th className="py-2.5 px-3">Expected</th>
                  <th className="py-2.5 px-3">Scanned</th>
                  <th className="py-2.5 px-3">Pending</th>
                  <th className="py-2.5 px-3">Progress</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Operator</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {filteredAndSortedBundles.map(b => {
                  let badgeColor = 'bg-slate-100 text-slate-700 border-slate-300';
                  if (b.status === 'COMPLETED') {
                    badgeColor = 'bg-[#DCFCE7] text-[#166534] border-[#86EFAC]';
                  } else if (b.status === 'IN PROGRESS') {
                    badgeColor = 'bg-[#EFF6FF] text-[#1D4ED8] border-[#93C5FD]';
                  } else if (b.status === 'PARTIAL / SAVED') {
                    badgeColor = 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]';
                  }

                  const classPending = Math.max(0, b.expectedCount - b.receivedCount);

                  return (
                    <tr key={b.classId} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-[#172033]">
                        {b.classId}
                      </td>
                      <td className="py-2.5 px-3 font-tabular font-medium text-[#172033]">
                        {b.expectedCount}
                      </td>
                      <td className="py-2.5 px-3 font-tabular font-bold text-[#1565D8]">
                        {b.receivedCount}
                      </td>
                      <td className="py-2.5 px-3 font-tabular font-bold text-[#DC2626]">
                        {classPending}
                      </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 bg-slate-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#16A34A] rounded-full"
                                style={{ width: `${Math.min(100, b.progressPercentage)}%` }}
                              />
                            </div>
                            <span className="font-tabular font-bold text-[11px] text-[#475569]">
                              {b.progressPercentage}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-block px-2 py-0.5 border rounded-md text-[10px] font-bold uppercase tracking-wider ${badgeColor}`}
                          >
                            {b.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[#172033] font-medium text-xs">
                          <span className="inline-block max-w-[280px] leading-snug break-words" title={b.operatorText || '—'}>
                            {b.operatorText || '—'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {b.receivedCount > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRollbackTargetClassId(b.classId);
                                  setRollbackTargetExamDate(b.examDate || (fetchedRange ? fetchedRange.startDate : ''));
                                  setIsRollbackModalOpen(true);
                                }}
                                className="p-1.5 text-slate-400 hover:text-amber-700 hover:bg-amber-50 rounded transition-colors cursor-pointer"
                                title={`Manage & Revert Inwarded Scripts for Class ID ${b.classId}`}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}

      {/* 7. Dedicated Manual Inward Table Modal (Requirement 6 & 7) */}
      <ManualInwardModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
      />

      {/* 8. Dedicated Admin Inward Rollback & Saved Records Management Modal */}
      <AdminInwardRollbackModal
        isOpen={isRollbackModalOpen}
        onClose={() => setIsRollbackModalOpen(false)}
        initialClassId={rollbackTargetClassId}
        initialExamDate={rollbackTargetExamDate || (fetchedRange ? fetchedRange.startDate : '')}
      />
    </div>
  );
};
