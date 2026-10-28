// ==============================================================================
// ExamScan Dashboard View — Informational Monitoring & Overview Screen
// Production Features:
// - Realtime Dashboard Analysis (auto-subscribing & auto-syncing with Supabase)
// - Date Range Sorting (X to Y, e.g. 1-10-26 to 5-10-26, Today, All Time)
// - Dedicated "Today's Manual Progress" Card (syncs with public.manual_inward_data)
// - Separate Manual Inward Table Modal with Scanned By, Class ID, Member ID, Date & Time
// - Zero duplicate buttons (clean header without redundant Import buttons)
// ==============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  FileSpreadsheet,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  importedService,
  ClassBundle,
  SessionSummary,
  ManualInwardedRecord,
} from '../../services/importedService';
import { ManualInwardModal } from './ManualInwardModal';

interface DashboardViewProps {
  onNavigateToSessions?: () => void;
  onNavigateToScan?: () => void;
  onNavigateToCreateSession?: () => void;
  onNavigateToExceptions?: () => void;
  onNavigateToImport?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = () => {
  const [bundles, setBundles] = useState<ClassBundle[]>([]);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Date Range Filter States (Requirement 7 & 10: X to Y date sorting for bulk data)
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);

  // Manual Inward Modal State (Requirement 5 & 6)
  const [isManualModalOpen, setIsManualModalOpen] = useState<boolean>(false);
  const [manualRecords, setManualRecords] = useState<ManualInwardedRecord[]>([]);

  // Delete Class State
  const [classToDelete, setClassToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Load and subscribe to live data
  const loadData = useCallback(() => {
    const bList = importedService.getClassBundles();
    const sum = importedService.getSessionSummary();
    const manList = importedService.getManualInwardRecords();
    setBundles(bList);
    setSessionSummary(sum);
    setManualRecords(manList);
  }, []);

  useEffect(() => {
    loadData();
    const unsub = importedService.subscribe(loadData);

    // Requirement 4: Real-time background sync poller (every 2.5 seconds) to guarantee live analysis
    const interval = setInterval(() => {
      importedService.syncFromSupabase();
    }, 2500);

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [loadData]);

  const handleConfirmDeleteClass = async () => {
    if (!classToDelete) return;
    setIsDeleting(true);
    try {
      await importedService.deleteClassBundle(classToDelete);
      setClassToDelete(null);
      loadData();
    } catch (err) {
      console.warn('Delete class error:', err);
    } finally {
      setIsDeleting(false);
    }
  };

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

  // Filtered Manual Inward records based on selected date range (Requirement 5 & 7)
  const filteredManualRecords = useMemo(() => {
    let list = [...manualRecords];
    if (filterStartDate) {
      const sMs = new Date(`${filterStartDate}T00:00:00`).getTime();
      list = list.filter(r => {
        const t = new Date(r.scanned_at || r.created_at).getTime();
        return !isNaN(t) && t >= sMs;
      });
    }
    if (filterEndDate) {
      const eMs = new Date(`${filterEndDate}T23:59:59.999`).getTime();
      list = list.filter(r => {
        const t = new Date(r.scanned_at || r.created_at).getTime();
        return !isNaN(t) && t <= eMs;
      });
    }
    return list;
  }, [manualRecords, filterStartDate, filterEndDate]);

  // Today's manual records (for today's manual progress card)
  const todayDateStr = new Date().toISOString().split('T')[0];
  const todayManualCount = useMemo(() => {
    const sMs = new Date(`${todayDateStr}T00:00:00`).getTime();
    const eMs = new Date(`${todayDateStr}T23:59:59.999`).getTime();
    return manualRecords.filter(r => {
      const t = new Date(r.scanned_at || r.created_at).getTime();
      return !isNaN(t) && t >= sMs && t <= eMs;
    }).length;
  }, [manualRecords, todayDateStr]);

  const activeManualCount = filterStartDate || filterEndDate ? filteredManualRecords.length : manualRecords.length;

  const totalReceived = baseTotalReceived;
  const totalPending = Math.max(0, totalExpected - totalReceived);
  const completionRate = totalExpected > 0 ? Math.round((totalReceived / totalExpected) * 100) : 0;

  // Manual Progress Percentage compared to Total Received
  const manualPercentage = totalReceived > 0 ? Math.round((activeManualCount / totalReceived) * 100) : 0;

  // Status breakdown counts
  const completedCount = bundles.filter(b => b.status === 'COMPLETED').length;
  const inProgressCount = bundles.filter(b => b.status === 'IN PROGRESS').length;
  const partialSavedCount = bundles.filter(b => b.status === 'PARTIAL / SAVED').length;
  const notStartedCount = bundles.filter(b => b.status === 'NOT STARTED').length;

  const hasScanningStarted = totalReceived > 0;

  // Quick Preset Helper for Date Range
  const setDatePreset = (preset: 'all' | 'today' | 'yesterday' | 'oct_example') => {
    if (preset === 'all') {
      setFilterStartDate('');
      setFilterEndDate('');
    } else if (preset === 'today') {
      setFilterStartDate(todayDateStr);
      setFilterEndDate(todayDateStr);
    } else if (preset === 'yesterday') {
      const yDate = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      setFilterStartDate(yDate);
      setFilterEndDate(yDate);
    } else if (preset === 'oct_example') {
      setFilterStartDate('2026-10-01');
      setFilterEndDate('2026-10-05');
    }
    setShowDatePicker(false);
  };

  const isDateFiltered = Boolean(filterStartDate || filterEndDate);

  return (
    <div className="space-y-4 font-sans max-w-5xl mx-auto pb-16">
      {/* 1. Header Toolbar (Requirement 8 & 9: Cleaned of Duplicate Import buttons) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 border border-[#CBD5E1] rounded-xl shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Interactive Date Range Filter Button (Requirement 10: X to Y Date Sorting) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowDatePicker(prev => !prev)}
              className={`flex items-center gap-2 h-9 px-3 border rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                isDateFiltered
                  ? 'bg-[#EFF6FF] border-[#93C5FD] text-[#1565D8]'
                  : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#172033] hover:bg-slate-100'
              }`}
              title="Filter by Date Range"
            >
              <CalendarIcon className="h-4 w-4 text-[#1565D8]" />
              <span>
                {isDateFiltered
                  ? `${filterStartDate || 'Start'} → ${filterEndDate || 'End'}`
                  : todayStr}
              </span>
              <Filter className="h-3 w-3 text-[#64748B] ml-0.5" />
            </button>

            {/* Date Range Dropdown / Popover */}
            {showDatePicker && (
              <div className="absolute left-0 top-11 z-30 w-72 sm:w-80 bg-white border border-[#CBD5E1] rounded-xl shadow-xl p-3 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0] text-xs font-bold text-[#172033]">
                  <span>Filter Date Range (X to Y)</span>
                  <button
                    type="button"
                    onClick={() => setShowDatePicker(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Quick Presets */}
                <div className="grid grid-cols-2 gap-1.5 pt-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setDatePreset('today')}
                    className="px-2 py-1 bg-[#F1F5F9] hover:bg-[#E2E8F0] rounded font-semibold text-[#1E293B] transition-colors"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => setDatePreset('oct_example')}
                    className="px-2 py-1 bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#1D4ED8] rounded font-bold transition-colors"
                  >
                    1-10-26 to 5-10-26
                  </button>
                  <button
                    type="button"
                    onClick={() => setDatePreset('yesterday')}
                    className="px-2 py-1 bg-[#F1F5F9] hover:bg-[#E2E8F0] rounded font-semibold text-[#1E293B] transition-colors"
                  >
                    Yesterday
                  </button>
                  <button
                    type="button"
                    onClick={() => setDatePreset('all')}
                    className="px-2 py-1 bg-[#F1F5F9] hover:bg-[#E2E8F0] rounded font-semibold text-[#1E293B] transition-colors"
                  >
                    All Time
                  </button>
                </div>

                {/* Custom Inputs */}
                <div className="pt-2.5 space-y-2 text-xs">
                  <div>
                    <label className="text-[10px] font-bold text-[#64748B] uppercase">From Date (X):</label>
                    <input
                      type="date"
                      value={filterStartDate}
                      onChange={e => setFilterStartDate(e.target.value)}
                      className="w-full mt-0.5 px-2 py-1 bg-[#F8FAFC] border border-[#CBD5E1] rounded text-xs font-semibold text-[#172033]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-[#64748B] uppercase">To Date (Y):</label>
                    <input
                      type="date"
                      value={filterEndDate}
                      onChange={e => setFilterEndDate(e.target.value)}
                      className="w-full mt-0.5 px-2 py-1 bg-[#F8FAFC] border border-[#CBD5E1] rounded text-xs font-semibold text-[#172033]"
                    />
                  </div>
                </div>

                <div className="pt-3 flex items-center justify-between border-t border-[#E2E8F0] mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFilterStartDate('');
                      setFilterEndDate('');
                      setShowDatePicker(false);
                    }}
                    className="text-[11px] font-semibold text-[#64748B] hover:text-[#DC2626] flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Clear Filter</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDatePicker(false)}
                    className="px-3 py-1 bg-[#1565D8] hover:bg-[#0D47A1] text-white text-xs font-bold rounded-md transition-colors cursor-pointer"
                  >
                    Apply Filter
                  </button>
                </div>
              </div>
            )}
          </div>

          {universityName ? (
            <div className="flex items-center gap-2 text-xs text-[#64748B] font-medium border-l border-[#CBD5E1] pl-3">
              <Building className="h-4 w-4 text-[#64748B]" />
              <span className="font-bold text-[#172033]">{universityName}</span>
            </div>
          ) : null}
        </div>

        {/* Realtime Live Analysis Badge & Monitoring Indicator */}
        <div className="flex items-center gap-2">
          {/* Requirement 4: Real-time Live Indicator */}
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-[11px] font-bold uppercase tracking-wider">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Realtime Live</span>
          </span>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#F1F5F9] border border-[#CBD5E1] rounded-lg text-[#475569] text-xs font-bold uppercase tracking-wider">
            <Activity className="h-3.5 w-3.5 text-[#1565D8]" />
            <span>Monitoring Overview</span>
          </span>
        </div>
      </div>

      {/* 2. Statistics KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 border border-[#CBD5E1] rounded-xl shadow-xs">
          <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">TOTAL CLASSES / SH IDs</div>
          <div className="text-2xl font-black text-[#172033] font-tabular mt-1">{totalClasses}</div>
          <div className="text-[11px] text-[#64748B] mt-0.5">Imported Sessions</div>
        </div>

        <div className="bg-white p-3.5 border border-[#CBD5E1] rounded-xl shadow-xs">
          <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">EXPECTED BOOKLETS</div>
          <div className="text-2xl font-black text-[#172033] font-tabular mt-1">{totalExpected}</div>
          <div className="text-[11px] text-[#64748B] mt-0.5">Source from Excel</div>
        </div>

        <div className="bg-white p-3.5 border border-[#BFDBFE] rounded-xl shadow-xs bg-[#F8FAFC]">
          <div className="text-[11px] font-bold text-[#1565D8] uppercase tracking-wider">RECEIVED BOOKLETS</div>
          <div className="text-2xl font-black text-[#1565D8] font-tabular mt-1">{totalReceived}</div>
          <div className="text-[11px] text-[#1565D8] mt-0.5 font-medium">Inwarded / Verified</div>
        </div>

        <div className="bg-white p-3.5 border border-[#CBD5E1] rounded-xl shadow-xs">
          <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">PENDING BOOKLETS</div>
          <div className="text-2xl font-black text-[#172033] font-tabular mt-1">{totalPending}</div>
          <div className="text-[11px] text-[#64748B] mt-0.5 font-medium">Expected - Received</div>
        </div>
      </div>

      {/* 3. Today's Progress Card */}
      <div className="bg-white p-4 border border-[#CBD5E1] rounded-xl shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[#172033]">Today's Progress</span>
          <span className="text-sm font-black font-tabular text-[#16A34A]">{completionRate}%</span>
        </div>

        <div className="mt-2 h-2.5 w-full bg-slate-100 overflow-hidden rounded-full border border-[#CBD5E1]">
          <div
            className="h-full bg-[#16A34A] transition-all duration-300 rounded-full"
            style={{ width: `${Math.min(100, completionRate)}%` }}
          />
        </div>

        <div className="mt-2 text-xs font-tabular text-[#64748B] flex items-center justify-between">
          <span>
            <strong className="text-[#172033] font-black">{totalReceived}</strong> / {totalExpected} scanned
          </span>
          <span className="text-[11px] font-semibold text-[#64748B]">
            {completedCount} of {totalClasses} completed
          </span>
        </div>
      </div>

      {/* 4. TODAY'S MANUAL PROGRESS CARD (Requirement 5, 6 & 7) */}
      <div className="bg-white p-4 border border-[#CBD5E1] hover:border-[#1565D8] rounded-xl shadow-xs transition-colors">
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

          {/* Action button to open separate table */}
          <button
            type="button"
            onClick={() => setIsManualModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#1565D8] hover:bg-[#0D47A1] text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-all shadow-xs cursor-pointer self-start sm:self-auto"
            title="Open Dedicated Manual Inward Table"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Open Manual Table ({manualRecords.length})</span>
          </button>
        </div>

        {/* Progress Bar for Manual Entries vs Total Inwards */}
        <div className="mt-3 h-2 w-full bg-slate-100 overflow-hidden rounded-full border border-[#CBD5E1]">
          <div
            className="h-full bg-[#1565D8] transition-all duration-300 rounded-full"
            style={{ width: `${Math.min(100, manualPercentage)}%` }}
          />
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
        <div className="text-xs font-bold uppercase tracking-wider text-[#172033] mb-3 flex items-center gap-1.5">
          <Layers className="h-4 w-4 text-[#1565D8]" />
          <span>Scanning Status Overview</span>
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">Not Started</div>
              <div className="text-xl font-bold font-tabular text-[#475569] mt-0.5">{notStartedCount}</div>
              <div className="text-[10px] text-[#64748B] mt-0.5">Classes pending intake</div>
            </div>

            <div className="p-3 bg-[#EFF6FF] border border-[#BFDBFE] rounded-lg">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#1D4ED8]">In Progress</div>
              <div className="text-xl font-bold font-tabular text-[#1565D8] mt-0.5">{inProgressCount}</div>
              <div className="text-[10px] text-[#1E40AF] mt-0.5">Currently inwarding</div>
            </div>

            <div className="p-3 bg-[#FEF3C7] border border-[#FDE68A] rounded-lg">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#B45309]">Partial / Saved</div>
              <div className="text-xl font-bold font-tabular text-[#B45309] mt-0.5">{partialSavedCount}</div>
              <div className="text-[10px] text-[#92400E] mt-0.5">Inwarded with pending</div>
            </div>

            <div className="p-3 bg-[#DCFCE7] border border-[#BBF7D0] rounded-lg">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#15803D]">Completed</div>
              <div className="text-xl font-bold font-tabular text-[#16A34A] mt-0.5">{completedCount}</div>
              <div className="text-[10px] text-[#166534] mt-0.5">All booklets verified</div>
            </div>
          </div>
        )}
      </div>

      {/* 6. Class-Wise Realtime Monitoring List */}
      <div className="bg-white border border-[#CBD5E1] rounded-xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="text-xs font-bold uppercase tracking-wider text-[#172033]">
              Class ID / SH ID Live Monitoring
            </div>
            <span className="px-2 py-0.5 bg-[#F1F5F9] text-[#475569] text-[10px] font-black rounded-md font-tabular">
              {bundles.length} Bundles
            </span>
          </div>

          <div className="flex items-center gap-2">
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

        {/* Content View: Grid vs List */}
        {bundles.length === 0 ? (
          <div className="p-8 text-center text-[#64748B] text-xs">
            No classes or SH IDs imported yet. Import examination data to view live monitoring.
          </div>
        ) : viewMode === 'grid' ? (
          /* GRID VIEW */
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
            {bundles
              .filter(b => !searchQuery.trim() || b.classId.toLowerCase().includes(searchQuery.trim().toLowerCase()))
              .map(b => {
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
                      <span className="font-mono font-black text-sm text-[#172033]">CLASS / SH ID {b.classId}</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 border text-[10px] font-bold uppercase tracking-wider rounded-md ${badgeColor}`}>
                          {b.status}
                        </span>
                        <button
                          type="button"
                          onClick={() => setClassToDelete(b.classId)}
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                          title={`Delete Class / SH ID ${b.classId} and saved scan data`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
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
                      <div className="flex items-center justify-between text-[#64748B]">
                        <span>Operator</span>
                        <span className="font-semibold text-[#172033] text-[11px] truncate max-w-[150px]" title={b.operatorText || '—'}>
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
                {bundles
                  .filter(b => !searchQuery.trim() || b.classId.toLowerCase().includes(searchQuery.trim().toLowerCase()))
                  .map(b => {
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
                        <td className="py-2.5 px-3 text-[#172033] font-medium text-xs whitespace-nowrap">
                          {b.operatorText || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => setClassToDelete(b.classId)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                            title={`Delete Class / SH ID ${b.classId} and saved scan records`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 7. Dedicated Manual Inward Table Modal (Requirement 6 & 7) */}
      <ManualInwardModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        defaultStartDate={filterStartDate}
        defaultEndDate={filterEndDate}
      />

      {/* Delete Class Confirmation Modal */}
      {classToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-md bg-white border border-red-200 rounded-2xl shadow-2xl p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center bg-red-100 text-red-600 rounded-xl mx-auto mb-3">
              <Trash2 className="h-6 w-6" />
            </div>
            <h3 className="text-base font-black uppercase text-[#172033]">
              Delete Class / SH ID {classToDelete}?
            </h3>
            <p className="text-xs text-[#64748B] mt-2 mb-4 leading-relaxed">
              This will remove class <strong className="text-[#172033] font-mono">{classToDelete}</strong> from inward schedules and strictly delete all corresponding saved scan records and operational history from the database.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setClassToDelete(null)}
                className="flex-1 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold uppercase rounded-xl hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDeleteClass}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase rounded-xl cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
