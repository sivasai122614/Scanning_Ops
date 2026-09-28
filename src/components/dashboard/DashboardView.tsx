// ==============================================================================
// ExamScan Dashboard View — Informational Monitoring & Overview Screen (Section 1)
// Purely a MONITORING screen:
// - Shows Date, University, Total Classes, Expected, Received, Missing
// - Shows Today's Progress (% and counts)
// - Shows Scanning Status breakdown (Not Started, In Progress, Completed)
// - Shows Class-wise monitoring status
// - Strictly NO scan buttons, NO camera, NO operational scanning controls
// ==============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  Building,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Layers,
  Activity,
  FileSpreadsheet,
  LayoutGrid,
  List,
  Search,
  X,
} from 'lucide-react';
import {
  importedService,
  ClassBundle,
  SessionSummary,
} from '../../services/importedService';

interface DashboardViewProps {
  onNavigateToSessions?: () => void;
  onNavigateToScan?: () => void;
  onNavigateToCreateSession?: () => void;
  onNavigateToExceptions?: () => void;
  onNavigateToImport?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigateToImport }) => {
  const [bundles, setBundles] = useState<ClassBundle[]>([]);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const loadData = useCallback(() => {
    const bList = importedService.getClassBundles();
    const sum = importedService.getSessionSummary();
    setBundles(bList);
    setSessionSummary(sum);
  }, []);

  useEffect(() => {
    loadData();
    const unsub = importedService.subscribe(loadData);
    return () => unsub();
  }, [loadData]);

  // Today's formatted date
  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const totalClasses = sessionSummary?.totalClasses || bundles.length;
  const totalExpected = sessionSummary?.totalExpected || 0;
  const totalReceived = sessionSummary?.totalReceived || 0;
  const totalPending = Math.max(0, totalExpected - totalReceived);
  const completionRate = totalExpected > 0 ? Math.round((totalReceived / totalExpected) * 100) : 0;
  const universityName = sessionSummary?.universityName || '';

  // Status breakdown counts
  const completedCount = bundles.filter(b => b.status === 'COMPLETED').length;
  const inProgressCount = bundles.filter(b => b.status === 'IN PROGRESS').length;
  const partialSavedCount = bundles.filter(b => b.status === 'PARTIAL / SAVED').length;
  const notStartedCount = bundles.filter(b => b.status === 'NOT STARTED').length;

  const hasScanningStarted = totalReceived > 0;

  return (
    <div className="space-y-4 font-sans max-w-5xl mx-auto pb-12">
      {/* 1. Header Toolbar (Informational Only - No Operational Scan Buttons) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 border border-[#CBD5E1] rounded-xl shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 h-9 px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-xs font-semibold text-[#172033]">
            <CalendarIcon className="h-4 w-4 text-[#1565D8]" />
            <span>{todayStr}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#64748B] font-medium border-l border-[#CBD5E1] pl-3">
            <Building className="h-4 w-4 text-[#64748B]" />
            <span className="font-bold text-[#172033]">{universityName}</span>
          </div>
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-2">
          {onNavigateToImport && (
            <button
              type="button"
              onClick={onNavigateToImport}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1565D8] hover:bg-[#0D47A1] text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors shadow-xs cursor-pointer"
              title="Import Excel Data"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>Import Data</span>
            </button>
          )}
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F1F5F9] border border-[#CBD5E1] rounded-lg text-[#475569] text-xs font-bold uppercase tracking-wider">
            <Activity className="h-3.5 w-3.5 text-[#1565D8]" />
            <span>Monitoring Overview</span>
          </span>
        </div>
      </div>

      {/* 2. Statistics KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 border border-[#CBD5E1] rounded-xl shadow-xs">
          <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">TOTAL CLASSES</div>
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
            {completedCount} of {totalClasses} classes completed
          </span>
        </div>
      </div>

      {/* 4. Scanning Status Overview Grid (Section 1) */}
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
              <div className="text-[10px] text-[#166534] mt-0.5">100% Verified &amp; Saved</div>
            </div>
          </div>
        )}
      </div>

      {/* 5. Class-Wise Monitoring Table / Grid (Read-Only Overview) */}
      <div className="bg-white border border-[#CBD5E1] rounded-xl shadow-xs overflow-hidden">
        <div className="p-3.5 bg-[#F1F5F9] border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-black uppercase tracking-wider text-[#172033]">
              CLASS-WISE MONITORING OVERVIEW
            </h2>
            <div className="text-[11px] text-[#64748B]">
              Real-time status of all imported class bundles in the current inwarding session
            </div>
          </div>

          {bundles.length > 0 && (
            <div className="flex items-center gap-2">
              {/* Search Class ID */}
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#64748B]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Filter Class..."
                  className="pl-8 pr-2.5 py-1 text-xs border border-[#CBD5E1] rounded-lg bg-white focus:outline-none focus:border-[#1565D8] w-32 sm:w-40 text-[#172033]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#172033]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Grid / List Mode Toggle */}
              <div className="flex items-center border border-[#CBD5E1] rounded-lg p-0.5 bg-slate-200/60 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                    viewMode === 'grid'
                      ? 'bg-white text-[#1565D8] shadow-xs'
                      : 'text-[#64748B] hover:text-[#172033]'
                  }`}
                  title="Grid View"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Grid</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-white text-[#1565D8] shadow-xs'
                      : 'text-[#64748B] hover:text-[#172033]'
                  }`}
                  title="List View"
                >
                  <List className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">List</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {bundles.length === 0 ? (
          <div className="p-8 text-center">
            <div className="flex h-10 w-10 items-center justify-center bg-[#EAF2FF] text-[#1565D8] rounded-xl mx-auto mb-2">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <h3 className="text-xs font-bold text-[#172033]">NO IMPORTED DATA</h3>
            <p className="text-[11px] text-[#64748B] max-w-sm mx-auto mt-1">
              Import an Excel file containing Class ID and Member ID to begin.
            </p>
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
                      <span className="font-mono font-black text-sm text-[#172033]">CLASS {b.classId}</span>
                      <span className={`px-2 py-0.5 border text-[10px] font-bold uppercase tracking-wider rounded-md ${badgeColor}`}>
                        {b.status}
                      </span>
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
                  <th className="py-2.5 px-3">Class ID</th>
                  <th className="py-2.5 px-3">Expected</th>
                  <th className="py-2.5 px-3">Scanned</th>
                  <th className="py-2.5 px-3">Pending</th>
                  <th className="py-2.5 px-3">Progress</th>
                  <th className="py-2.5 px-3">Status</th>
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
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
