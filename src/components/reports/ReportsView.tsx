// ==============================================================================
// ExamScan — Reports & Export View
// Institutional Audit & Reconciliation Module:
// 1. Mandatory University Selection before export.
// 2. Interactive Date Range / Date Selection (From, To, Calendar popover, auto-hyphenation mask).
// 3. Pre-Download Live Preview Table of saved scanned records (strictly from saved_scanned_data).
// 4. Exact 3-Sheet Excel Export filtered by date & university:
//    Sheet 1: Scanned Data (finalized records from saved_scanned_data with Exam Date)
//    Sheet 2: Not Scanned Data (expected records MINUS saved_scanned_data)
//    Sheet 3: Class Wise Data (One row per Class ID with real progress)
// ==============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  FileSpreadsheet,
  Download,
  Calendar as CalendarIcon,
  Building,
  CheckCircle2,
  AlertOctagon,
  Check,
  Search,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  Layers,
  ArrowDownToLine,
} from 'lucide-react';
import {
  importedService,
  SavedScannedRecord,
  formatExamDate,
  normalizeExamDate,
  ExamDateFilter,
  ClassBundle,
} from '../../services/importedService';

/**
 * Auto-hyphenation mask for DD-MM-YYYY inputs.
 * Appends hyphens after day and month digits while permitting clean backspacing.
 */
function formatDdMmYyyyInput(val: string, prevVal: string = ''): string {
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

      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(w => (
          <span key={w} className="text-[10px] font-bold text-[#94A3B8]">
            {w}
          </span>
        ))}
      </div>

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

      <div className="mt-3 pt-2 border-t border-[#F1F5F9] flex items-center justify-between text-[11px]">
        <button
          type="button"
          onClick={() => {
            const now = new Date();
            const dd = String(now.getDate()).padStart(2, '0');
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const yy = now.getFullYear();
            onSelect(`${dd}-${mm}-${yy}`);
            onClose();
          }}
          className="text-[#1565D8] font-bold hover:underline cursor-pointer"
        >
          Today
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-[#64748B] hover:text-[#172033] font-medium cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export const ReportsView: React.FC = () => {
  const [universities, setUniversities] = useState<string[]>([]);
  const [selectedUniversity, setSelectedUniversity] = useState<string>('');
  const [selectUniversityError, setSelectUniversityError] = useState<boolean>(false);
  const [exportNotification, setExportNotification] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Date Filtering State (Exact parity with Dashboard)
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [activeDateFilter, setActiveDateFilter] = useState<ExamDateFilter | undefined>(undefined);
  const [openPickerType, setOpenPickerType] = useState<'start' | 'end' | null>(null);
  const [previewSearch, setPreviewSearch] = useState<string>('');
  const [previewLimit, setPreviewLimit] = useState<number>(50);

  const [availableDates, setAvailableDates] = useState<
    { date: string; displayDate: string; totalRecords: number; totalClasses: number }[]
  >([]);

  const [stats, setStats] = useState<{
    totalClasses: number;
    expectedBooklets: number;
    scannedBooklets: number;
    notScannedBooklets: number;
    universityName: string;
    completionPercentage: number;
  }>({
    totalClasses: 0,
    expectedBooklets: 0,
    scannedBooklets: 0,
    notScannedBooklets: 0,
    universityName: '',
    completionPercentage: 0,
  });

  const [savedRecords, setSavedRecords] = useState<SavedScannedRecord[]>([]);
  const [bundles, setBundles] = useState<ClassBundle[]>([]);

  // Load Data
  const loadData = useCallback(() => {
    const unis = importedService.getUniversities();
    setUniversities(unis);

    const activeUni = importedService.getActiveUniversity();
    if (!selectedUniversity && unis.length > 0) {
      if (activeUni && unis.includes(activeUni)) {
        setSelectedUniversity(activeUni);
      } else {
        setSelectedUniversity(unis[0]);
      }
    }

    const currentUni = selectedUniversity || activeUni || (unis.length > 0 ? unis[0] : '');
    const dates = importedService.getAvailableExamDates();
    setAvailableDates(dates);

    // Initialize date filters from service if not set
    const currentActiveExamDate = importedService.getActiveExamDate();
    if (!filterStartDate && !filterEndDate && currentActiveExamDate) {
      const disp = formatExamDate(currentActiveExamDate);
      setFilterStartDate(disp);
      setFilterEndDate(disp);
      setActiveDateFilter(currentActiveExamDate);
    }

    if (currentUni) {
      const s = importedService.getDashboardStats(currentUni, activeDateFilter);
      setStats(s);

      // Load saved scanned records strictly from saved_scanned_data
      const recs = importedService.getSavedScannedRecords(currentUni, activeDateFilter);
      setSavedRecords(recs);

      const b = importedService.getClassBundles(activeDateFilter || null);
      setBundles(b);
    }
  }, [selectedUniversity, activeDateFilter, filterStartDate, filterEndDate]);

  useEffect(() => {
    loadData();
    const unsub = importedService.subscribe(loadData);
    return () => unsub();
  }, [loadData]);

  // Handle Fetch / Apply Date Filter
  const handleApplyDateFilter = () => {
    const sTrim = filterStartDate.trim();
    const eTrim = filterEndDate.trim();

    if (!sTrim && !eTrim) {
      setActiveDateFilter(undefined);
      return;
    }

    const sNorm = sTrim ? normalizeExamDate(sTrim) : '';
    const eNorm = eTrim ? normalizeExamDate(eTrim) : '';

    if (sNorm && eNorm) {
      if (sNorm === eNorm) {
        setActiveDateFilter(sNorm);
      } else {
        setActiveDateFilter({ startDate: sNorm, endDate: eNorm });
      }
    } else if (sNorm) {
      setActiveDateFilter(sNorm);
    } else if (eNorm) {
      setActiveDateFilter(eNorm);
    } else {
      setActiveDateFilter(undefined);
    }
  };

  const handleClearDateFilter = () => {
    setFilterStartDate('');
    setFilterEndDate('');
    setActiveDateFilter(undefined);
  };

  const handleSelectQuickDate = (d: { date: string; displayDate: string }) => {
    setFilterStartDate(d.displayDate);
    setFilterEndDate(d.displayDate);
    setActiveDateFilter(d.date);
  };

  // Export Excel Report strictly taken from saved_scanned_data
  const handleExportExcel = async () => {
    if (!selectedUniversity || selectedUniversity === '-- Select College / University --') {
      setSelectUniversityError(true);
      return;
    }

    setSelectUniversityError(false);
    setIsExporting(true);

    try {
      const res = await importedService.exportUniversityExcel(selectedUniversity, activeDateFilter);
      if (res.success) {
        setExportNotification(
          `Exported 3-sheet report: ${res.filename} (${res.scannedCount} saved records, ${res.notScannedCount} not scanned)`
        );
        setTimeout(() => setExportNotification(null), 6000);
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to export report');
    } finally {
      setIsExporting(false);
    }
  };

  // Filtered Preview Records for Pre-Download Inspection
  const filteredPreviewRecords = useMemo(() => {
    if (!previewSearch.trim()) return savedRecords;
    const q = previewSearch.trim().toLowerCase();
    return savedRecords.filter(r => {
      return (
        r.class_id.toLowerCase().includes(q) ||
        r.member_id.toLowerCase().includes(q) ||
        (r.barcode && r.barcode.toLowerCase().includes(q)) ||
        (r.scanned_by && r.scanned_by.toLowerCase().includes(q)) ||
        (r.saved_by && r.saved_by.toLowerCase().includes(q)) ||
        (r.exam_date && formatExamDate(r.exam_date).includes(q))
      );
    });
  }, [savedRecords, previewSearch]);

  const activeDateDisplay = useMemo(() => {
    if (!activeDateFilter || activeDateFilter === 'ALL') return null;
    if (typeof activeDateFilter === 'string') {
      return formatExamDate(activeDateFilter);
    }
    if (activeDateFilter.startDate && activeDateFilter.endDate) {
      if (activeDateFilter.startDate === activeDateFilter.endDate) {
        return formatExamDate(activeDateFilter.startDate);
      }
      return `${formatExamDate(activeDateFilter.startDate)} to ${formatExamDate(activeDateFilter.endDate)}`;
    }
    if (activeDateFilter.startDate) return formatExamDate(activeDateFilter.startDate);
    return null;
  }, [activeDateFilter]);

  return (
    <div className="space-y-6 font-sans w-full pb-20">
      {/* Animations */}
      <style>{`
        @keyframes report-sine-1 {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes report-sine-2 {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
        @keyframes report-liquid {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .anim-report-sine-1 {
          animation: report-sine-1 14s linear infinite;
        }
        .anim-report-sine-2 {
          animation: report-sine-2 20s linear infinite;
        }
        .anim-report-liquid {
          background-size: 250% 250%;
          animation: report-liquid 4s ease infinite;
        }
      `}</style>

      {/* Toast Notification */}
      {exportNotification && (
        <div className="p-4 bg-[#DCFCE7] border border-[#86EFAC] text-[#166534] text-xs font-bold rounded-2xl flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-[#16A34A]" />
            <span className="text-sm font-semibold">{exportNotification}</span>
          </div>
          <span className="text-xs uppercase font-black text-[#15803D] bg-white px-3 py-1 rounded-xl border border-[#86EFAC] shadow-2xs">
            3 Sheets Generated
          </span>
        </div>
      )}

      {/* Top Controls Bar: University Selector & Date Range Filter */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#CBD5E1] shadow-xs space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* University Dropdown */}
          <div className="flex items-center gap-2">
            <Building className="h-4 w-4 text-[#1565D8] shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
              Institution:
            </span>
            <select
              value={selectedUniversity}
              onChange={e => {
                setSelectedUniversity(e.target.value);
                if (e.target.value) setSelectUniversityError(false);
              }}
              className={`h-9 pl-3 pr-8 text-xs font-bold rounded-xl border bg-white text-[#172033] focus:outline-hidden focus:ring-2 focus:ring-[#1565D8] shadow-2xs ${
                selectUniversityError ? 'border-red-400 bg-red-50 text-red-900' : 'border-[#CBD5E1]'
              }`}
            >
              <option value="">-- Select College / University --</option>
              {universities.map(u => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Inputs: FROM & TO */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* FROM Input */}
            <div className="relative flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-blue-500 shadow-2xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                From:
              </span>
              <input
                type="text"
                value={filterStartDate}
                onChange={e => {
                  const masked = formatDdMmYyyyInput(e.target.value, filterStartDate);
                  setFilterStartDate(masked);
                }}
                placeholder="DD-MM-YYYY"
                maxLength={10}
                className="w-24 text-xs font-mono font-bold text-slate-800 bg-transparent focus:outline-hidden"
              />
              <button
                type="button"
                onClick={() => setOpenPickerType(openPickerType === 'start' ? null : 'start')}
                className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-slate-200 transition-colors cursor-pointer"
                title="Select from Calendar"
              >
                <CalendarIcon className="h-3.5 w-3.5" />
              </button>

              {openPickerType === 'start' && (
                <CalendarDropdown
                  currentValue={filterStartDate}
                  onSelect={dateStr => setFilterStartDate(dateStr)}
                  onClose={() => setOpenPickerType(null)}
                  availableDates={availableDates}
                />
              )}
            </div>

            {/* TO Input */}
            <div className="relative flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-blue-500 shadow-2xs">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                To:
              </span>
              <input
                type="text"
                value={filterEndDate}
                onChange={e => {
                  const masked = formatDdMmYyyyInput(e.target.value, filterEndDate);
                  setFilterEndDate(masked);
                }}
                placeholder="DD-MM-YYYY"
                maxLength={10}
                className="w-24 text-xs font-mono font-bold text-slate-800 bg-transparent focus:outline-hidden"
              />
              <button
                type="button"
                onClick={() => setOpenPickerType(openPickerType === 'end' ? null : 'end')}
                className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-slate-200 transition-colors cursor-pointer"
                title="Select to Calendar"
              >
                <CalendarIcon className="h-3.5 w-3.5" />
              </button>

              {openPickerType === 'end' && (
                <CalendarDropdown
                  currentValue={filterEndDate}
                  onSelect={dateStr => setFilterEndDate(dateStr)}
                  onClose={() => setOpenPickerType(null)}
                  availableDates={availableDates}
                />
              )}
            </div>

            {/* FETCH DATA Button */}
            <button
              type="button"
              onClick={handleApplyDateFilter}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#1565D8] hover:bg-[#0D47A1] text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-2xs cursor-pointer active:scale-95"
            >
              <Filter className="h-3.5 w-3.5" />
              <span>Fetch Data</span>
            </button>

            {/* Clear Button */}
            {(filterStartDate || filterEndDate || activeDateFilter) && (
              <button
                type="button"
                onClick={handleClearDateFilter}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                title="Clear date filter"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Clear</span>
              </button>
            )}

            {/* Active Date Indicator Badge */}
            {activeDateDisplay && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 border border-blue-200 text-[#1565D8] text-xs font-mono font-bold rounded-xl shadow-2xs">
                <span className="h-2 w-2 rounded-full bg-[#1565D8] animate-pulse" />
                ACTIVE: {activeDateDisplay}
              </span>
            )}
          </div>
        </div>

        {/* Quick Date Pills from Database */}
        {availableDates.length > 0 && (
          <div className="pt-2 border-t border-[#F1F5F9] flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
              Available Dates:
            </span>
            {availableDates.map(d => {
              const isSelected =
                activeDateFilter === d.date ||
                filterStartDate === d.displayDate ||
                activeDateDisplay === d.displayDate;
              return (
                <button
                  key={d.date}
                  type="button"
                  onClick={() => handleSelectQuickDate(d)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#1565D8] text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-[#1565D8] border border-slate-200'
                  }`}
                >
                  {d.displayDate} ({d.totalRecords})
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Hero Banner: Institutional Audit & Export Header */}
      <div className="relative overflow-hidden rounded-2xl border border-[#CBD5E1] bg-gradient-to-r from-blue-900 via-[#1565D8] to-indigo-900 p-5 sm:p-7 text-white shadow-md">
        <div className="absolute inset-0 pointer-events-none opacity-25 overflow-hidden">
          <svg className="absolute w-[200%] h-full anim-report-sine-1" preserveAspectRatio="none" viewBox="0 0 1200 120">
            <path
              d="M0,40 C150,90 350,0 500,45 C650,90 850,10 1000,50 C1150,90 1200,40 1200,40 L1200,120 L0,120 Z"
              fill="rgba(56, 189, 248, 0.4)"
            />
          </svg>
          <svg className="absolute w-[200%] h-full anim-report-sine-2" preserveAspectRatio="none" viewBox="0 0 1200 120">
            <path
              d="M0,60 C200,10 400,80 600,40 C800,0 1000,70 1200,50 L1200,120 L0,120 Z"
              fill="rgba(129, 140, 248, 0.35)"
            />
          </svg>
        </div>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-cyan-400/20 border border-cyan-300/40 text-cyan-200 text-[10px] font-black uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 animate-pulse" />
              <span>INSTITUTIONAL AUDIT &amp; MULTI-SHEET RECONCILIATION</span>
            </div>
            <h1 className="text-xl sm:text-3xl font-black text-white tracking-tight drop-shadow-xs">
              Audit &amp; Export Examination Reports
            </h1>
            <p className="text-xs sm:text-sm text-blue-100 max-w-2xl">
              Reports are strictly sourced from <strong className="text-white font-mono">saved_scanned_data</strong>. Generates a 3-sheet Excel workbook filtered by date and institution.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExporting}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              <span>{isExporting ? 'GENERATING EXCEL...' : 'EXPORT 3-SHEET EXCEL'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* NO UNIVERSITY SELECTED ERROR MODAL */}
      {selectUniversityError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-md bg-white border border-[#FECACA] rounded-2xl shadow-2xl p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center bg-[#EF4444] text-white rounded-xl mx-auto mb-3">
              <AlertOctagon className="h-7 w-7" />
            </div>

            <div className="text-base font-extrabold tracking-wide uppercase text-[#991B1B]">
              SELECT UNIVERSITY
            </div>

            <p className="text-xs text-[#7F1D1D] mt-3 mb-5 leading-relaxed font-semibold">
              Please select a College/University before exporting the report.
            </p>

            <button
              type="button"
              onClick={() => setSelectUniversityError(false)}
              className="w-full py-2.5 bg-[#1565D8] hover:bg-[#0D47A1] text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
            >
              OK, SELECT UNIVERSITY
            </button>
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6 w-full">
        <div className="bg-white p-6 sm:p-7 border border-[#CBD5E1] rounded-2xl shadow-xs hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
          <div className="text-xs font-bold text-[#64748B] uppercase tracking-wider">
            TOTAL CLASSES
          </div>
          <div className="text-4xl sm:text-5xl font-black text-[#172033] font-tabular mt-2.5">
            {stats.totalClasses}
          </div>
          <div className="text-xs text-[#64748B] mt-1.5 font-medium">Classes in Audit Scope</div>
        </div>

        <div className="bg-white p-6 sm:p-7 border border-[#CBD5E1] rounded-2xl shadow-xs hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
          <div className="text-xs font-bold text-[#64748B] uppercase tracking-wider">
            EXPECTED BOOKLETS
          </div>
          <div className="text-4xl sm:text-5xl font-black text-[#172033] font-tabular mt-2.5">
            {stats.expectedBooklets}
          </div>
          <div className="text-xs text-[#64748B] mt-1.5 font-medium">From import_inwarded_data</div>
        </div>

        <div className="bg-white p-6 sm:p-7 border-2 border-blue-400/80 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 bg-gradient-to-br from-white via-blue-50/30 to-blue-50/60 hover:-translate-y-0.5 relative overflow-hidden">
          <div className="text-xs font-bold text-[#1565D8] uppercase tracking-wider">
            SCANNED (SAVED)
          </div>
          <div className="text-4xl sm:text-5xl font-black text-[#1565D8] font-tabular mt-2.5">
            {stats.scannedBooklets}
          </div>
          <div className="text-xs text-[#1565D8] mt-1.5 font-semibold">Strictly in saved_scanned_data</div>
        </div>

        <div className="bg-white p-6 sm:p-7 border border-[#CBD5E1] rounded-2xl shadow-xs hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
          <div className="text-xs font-bold text-[#DC2626] uppercase tracking-wider">
            NOT SCANNED
          </div>
          <div className="text-4xl sm:text-5xl font-black text-[#DC2626] font-tabular mt-2.5">
            {stats.notScannedBooklets}
          </div>
          <div className="text-xs text-[#DC2626] mt-1.5 font-medium">Expected - Saved</div>
        </div>
      </div>

      {/* PRE-DOWNLOAD PREVIEW TABLE: Strictly from saved_scanned_data */}
      <div className="bg-white border border-[#CBD5E1] rounded-2xl shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-50 to-blue-50/40 border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-[#1565D8]" />
              <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#172033]">
                EXPORT PREVIEW — SAVED SCANNED RECORDS
              </h2>
            </div>
            <p className="text-xs text-[#64748B] mt-0.5 font-medium">
              Verified dataset from <span className="font-mono text-[#1565D8]">saved_scanned_data</span> ready for Excel export.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Search within preview */}
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={previewSearch}
                onChange={e => setPreviewSearch(e.target.value)}
                placeholder="Search preview..."
                className="h-8 pl-8 pr-3 text-xs rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-[#1565D8] w-48 sm:w-60"
              />
            </div>

            {/* Quick Export Button */}
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-2xs cursor-pointer disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download Excel</span>
            </button>
          </div>
        </div>

        {/* Live Count Bar */}
        <div className="px-5 py-2.5 bg-slate-50/60 border-b border-slate-100 flex items-center justify-between text-xs text-[#64748B]">
          <span>
            Showing <strong className="text-[#172033] font-black">{Math.min(filteredPreviewRecords.length, previewLimit)}</strong> of{' '}
            <strong className="text-[#172033] font-black">{filteredPreviewRecords.length}</strong> saved records
            {activeDateDisplay && <span> for date <strong className="text-[#1565D8]">{activeDateDisplay}</strong></span>}
          </span>
          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
            ✓ Strictly Verified from Database
          </span>
        </div>

        {/* Preview Table */}
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-left text-xs font-tabular">
            <thead className="bg-slate-100 border-b border-slate-200 text-[#64748B] uppercase text-[11px] font-bold sticky top-0 z-10">
              <tr>
                <th className="py-2.5 px-4">#</th>
                <th className="py-2.5 px-4">Exam Date</th>
                <th className="py-2.5 px-4">Class ID</th>
                <th className="py-2.5 px-4">Member ID</th>
                <th className="py-2.5 px-4">Barcode</th>
                <th className="py-2.5 px-4 text-center">Status</th>
                <th className="py-2.5 px-4">Scanned By</th>
                <th className="py-2.5 px-4">Scanned Time</th>
                <th className="py-2.5 px-4">Saved By</th>
                <th className="py-2.5 px-4">Saved Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPreviewRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-[#64748B]">
                    {savedRecords.length === 0
                      ? 'No saved scanned records found for this university or date filter.'
                      : 'No records matched your search query.'}
                  </td>
                </tr>
              ) : (
                filteredPreviewRecords.slice(0, previewLimit).map((rec, idx) => (
                  <tr key={rec.id || `rec-${idx}`} className="hover:bg-blue-50/40">
                    <td className="py-2.5 px-4 text-slate-400 font-mono text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-bold text-[#1565D8]">
                      {rec.exam_date ? formatExamDate(rec.exam_date) : '—'}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-bold text-[#172033]">
                      {rec.class_id}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-semibold text-[#172033]">
                      {rec.member_id}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-600">
                      {rec.barcode || rec.member_id}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <span className="px-2 py-0.5 bg-[#DCFCE7] text-[#166534] border border-[#86EFAC] text-[10px] font-black uppercase rounded-md">
                        SAVED
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-700">
                      {rec.scanned_by || 'Operator'}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500">
                      {rec.scanned_at ? new Date(rec.scanned_at).toLocaleString() : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-slate-700">
                      {rec.saved_by || 'Operator'}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500">
                      {rec.saved_at ? new Date(rec.saved_at).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Preview Footer */}
        {filteredPreviewRecords.length > previewLimit && (
          <div className="p-3 bg-slate-50 border-t border-slate-200 text-center">
            <button
              type="button"
              onClick={() => setPreviewLimit(l => l + 50)}
              className="text-xs font-bold text-[#1565D8] hover:underline cursor-pointer"
            >
              Show 50 more records ({filteredPreviewRecords.length - previewLimit} remaining)...
            </button>
          </div>
        )}
      </div>

      {/* Three-Sheet Architecture Specification Banner */}
      <div className="bg-white border border-[#CBD5E1] rounded-2xl p-5 sm:p-6 shadow-xs space-y-3">
        <div className="text-xs font-black uppercase tracking-wider text-[#172033] flex items-center gap-2">
          <Check className="h-4 w-4 text-[#16A34A] stroke-[3]" />
          <span>Excel Export Specification (3 Distinct Institutional Sheets):</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl">
            <div className="font-bold text-[#166534] text-xs">Sheet 1: Scanned Data</div>
            <div className="text-xs text-[#15803D] mt-1 leading-relaxed">
              Finalized records from <strong className="font-mono">saved_scanned_data</strong> including Exam Date, Class ID, Member ID, Barcode, Operator, and Timestamp.
            </div>
          </div>
          <div className="p-3.5 bg-[#FEF2F2] border border-[#FECACA] rounded-xl">
            <div className="font-bold text-[#991B1B] text-xs">Sheet 2: Not Scanned Data</div>
            <div className="text-xs text-[#B91C1C] mt-1 leading-relaxed">
              Expected imported records that have not yet been inwarded during scanning sessions.
            </div>
          </div>
          <div className="p-3.5 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl">
            <div className="font-bold text-[#1E40AF] text-xs">Sheet 3: Class Wise Data</div>
            <div className="text-xs text-[#3B82F6] mt-1 leading-relaxed">
              Consolidated per-class intake totals with Expected, Scanned, Not Scanned, Progress %, and Status.
            </div>
          </div>
        </div>
      </div>

      {/* Class Wise Reconciliation Table */}
      <div className="bg-white border border-[#CBD5E1] rounded-2xl shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-50 to-blue-50/40 border-b border-[#E2E8F0] flex items-center justify-between">
          <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#172033]">
            CLASS-WISE RECONCILIATION BREAKDOWN — {selectedUniversity || 'All Imported Sessions'}
          </h2>
          <span className="text-xs text-[#64748B] font-semibold">
            Live Synchronized Data ({bundles.length} Classes)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-tabular">
            <thead className="bg-slate-50 border-b border-slate-200 text-[#64748B] uppercase text-[11px] font-bold">
              <tr>
                <th className="py-3 px-5">Class ID</th>
                <th className="py-3 px-5 text-center">Expected</th>
                <th className="py-3 px-5 text-center">Scanned (Saved)</th>
                <th className="py-3 px-5 text-center">Not Scanned</th>
                <th className="py-3 px-5 text-center">Progress</th>
                <th className="py-3 px-5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bundles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#64748B]">
                    No class records found for the selected criteria.
                  </td>
                </tr>
              ) : (
                bundles.map(b => {
                  let statusBadge = 'bg-slate-100 text-slate-700 border-slate-300';
                  if (b.status === 'COMPLETED') statusBadge = 'bg-[#DCFCE7] text-[#166534] border-[#86EFAC]';
                  else if (b.status === 'IN PROGRESS') statusBadge = 'bg-[#EFF6FF] text-[#1D4ED8] border-[#93C5FD]';
                  else if (b.status === 'PARTIAL / SAVED') statusBadge = 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]';

                  return (
                    <tr key={b.classId} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono font-bold text-[#172033]">
                        {b.classId}
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-[#172033]">
                        {b.expectedCount}
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-[#16A34A]">
                        {b.savedCount}
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-[#DC2626]">
                        {b.missingCount}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <span className="font-bold text-[#16A34A]">{b.progressPercentage}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className={`px-2 py-0.5 border text-[10px] font-bold uppercase tracking-wider rounded-md ${statusBadge}`}>
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
