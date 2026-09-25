// ==============================================================================
// ExamScan Dashboard View — Class-Wise Bundle Workflow (Sections 2, 6, 12, 14)
// Shows each Class ID with Expected, Received, Remaining, Progress, and Status.
// Fully integrated with Supabase and Excel Import source of truth.
// ==============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Clock,
  Scan,
  Plus,
  ChevronRight,
  Download,
  Building,
  Upload,
  ShieldCheck,
  RotateCcw,
  Check,
  Lock,
} from 'lucide-react';
import {
  importedService,
  ClassBundle,
  SessionSummary,
} from '../../services/importedService';
import { BundleStatisticsView } from '../bundles/BundleStatisticsView';
import { FirstBookletScannerModal } from '../bundles/FirstBookletScannerModal';
import { SessionSummaryModal } from '../bundles/SessionSummaryModal';

interface DashboardViewProps {
  onNavigateToSessions?: () => void;
  onNavigateToScan?: () => void;
  onNavigateToCreateSession?: () => void;
  onNavigateToExceptions?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigateToSessions,
  onNavigateToScan,
}) => {
  const [bundles, setBundles] = useState<ClassBundle[]>([]);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);

  // Active Bundle View state (null = show dashboard list; string = show BundleStatisticsView)
  const [activeBundleClassId, setActiveBundleClassId] = useState<string | null>(null);

  // Modals
  const [isFirstBookletScannerOpen, setIsFirstBookletScannerOpen] = useState(false);
  const [isSessionSummaryOpen, setIsSessionSummaryOpen] = useState(false);
  const [exportNotification, setExportNotification] = useState<string | null>(null);

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

  const handleExportExcel = () => {
    const res = importedService.exportClassWiseExcel();
    if (res.success) {
      setExportNotification(`Exported ${res.filename} with live database records!`);
      setTimeout(() => setExportNotification(null), 4000);
    }
  };

  // If operator has drilled down into a specific Class Bundle, render dedicated screen (Section 4 & 5)
  if (activeBundleClassId) {
    return (
      <BundleStatisticsView
        classId={activeBundleClassId}
        onBackToDashboard={() => setActiveBundleClassId(null)}
        onSwitchClass={newCid => setActiveBundleClassId(newCid)}
      />
    );
  }

  const totalClasses = sessionSummary?.totalClasses || bundles.length;
  const totalExpected = sessionSummary?.totalExpected || 0;
  const totalReceived = sessionSummary?.totalReceived || 0;
  const totalMissing = sessionSummary?.totalMissing || 0;
  const completionRate = sessionSummary?.overallCompletion || 0;
  const universityName = sessionSummary?.universityName || 'General University';

  return (
    <div className="space-y-4 font-sans max-w-5xl mx-auto pb-12">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 border border-[#CBD5E1] shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 h-9 px-3 bg-[#F8FAFC] border border-[#E2E8F0] text-xs font-semibold text-[#172033]">
            <CalendarIcon className="h-4 w-4 text-[#1565D8]" />
            <span>{todayStr}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#64748B] font-medium border-l border-[#CBD5E1] pl-3">
            <Building className="h-4 w-4 text-[#64748B]" />
            <span className="font-bold text-[#172033]">{universityName}</span>
          </div>
        </div>

        {/* Global Toolbar Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsFirstBookletScannerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#0D47A1] transition-colors shadow-xs"
          >
            <Scan className="h-4 w-4" />
            <span>Scan First Booklet</span>
          </button>

          <button
            type="button"
            onClick={() => setIsSessionSummaryOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#CBD5E1] text-[#172033] text-xs font-bold uppercase tracking-wider hover:bg-slate-50 transition-colors"
          >
            <ShieldCheck className="h-4 w-4 text-[#1565D8]" />
            <span className="hidden sm:inline">Session Summary</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#16A34A] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#15803D] transition-colors"
          >
            <Download className="h-4 w-4" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Export Alert */}
      {exportNotification && (
        <div className="p-3 bg-[#DCFCE7] border border-[#86EFAC] text-[#166534] text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{exportNotification}</span>
        </div>
      )}

      {/* 2. KPI Cards Grid (Section 2) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 border border-[#CBD5E1] shadow-xs">
          <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Total Classes</div>
          <div className="text-2xl font-black text-[#172033] font-tabular mt-1">{totalClasses}</div>
          <div className="text-[11px] text-[#64748B] mt-0.5">Imported Class Bundles</div>
        </div>

        <div className="bg-white p-3.5 border border-[#CBD5E1] shadow-xs">
          <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Expected Booklets</div>
          <div className="text-2xl font-black text-[#172033] font-tabular mt-1">{totalExpected}</div>
          <div className="text-[11px] text-[#64748B] mt-0.5">Calculated from Excel</div>
        </div>

        <div className="bg-white p-3.5 border border-[#BFDBFE] shadow-xs bg-[#F8FAFC]">
          <div className="text-[11px] font-bold text-[#1565D8] uppercase tracking-wider">Received Booklets</div>
          <div className="text-2xl font-black text-[#1565D8] font-tabular mt-1">{totalReceived}</div>
          <div className="text-[11px] text-[#1565D8] mt-0.5 font-medium">Inwarded / Verified</div>
        </div>

        <div className="bg-white p-3.5 border border-[#FECACA] shadow-xs">
          <div className="text-[11px] font-bold text-[#DC2626] uppercase tracking-wider">Missing Booklets</div>
          <div className="text-2xl font-black text-[#DC2626] font-tabular mt-1">{totalMissing}</div>
          <div className="text-[11px] text-[#DC2626] mt-0.5 font-medium">Remaining to Inward</div>
        </div>
      </div>

      {/* 3. Session Progress Card */}
      <div className="bg-white p-4 border border-[#CBD5E1] shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[#172033]">Today's Progress</span>
          <span className="text-sm font-black font-tabular text-[#16A34A]">{completionRate}%</span>
        </div>

        <div className="mt-2 h-2.5 w-full bg-slate-100 overflow-hidden border border-[#CBD5E1]">
          <div
            className="h-full bg-[#16A34A] transition-all duration-300"
            style={{ width: `${Math.min(100, completionRate)}%` }}
          />
        </div>

        <div className="mt-2 text-xs font-tabular text-[#64748B] flex items-center justify-between">
          <span>
            <strong className="text-[#172033] font-black">{totalReceived}</strong> / {totalExpected} scanned
          </span>
          <span className="text-[11px] font-semibold text-[#64748B]">
            {bundles.filter(b => b.status === 'COMPLETED').length} of {bundles.length} Classes Completed
          </span>
        </div>
      </div>

      {/* 4. CLASS-WISE BUNDLE LIST (Section 2, 6, 12, 14) */}
      <div className="bg-white border border-[#CBD5E1] shadow-xs overflow-hidden">
        {/* Table / List Header */}
        <div className="p-3.5 bg-[#F1F5F9] border-b border-[#E2E8F0] flex items-center justify-between">
          <div>
            <h2 className="text-xs font-black uppercase tracking-wider text-[#172033]">
              Scanning Dashboard — Class-Wise Bundles
            </h2>
            <div className="text-[11px] text-[#64748B]">
              Class ID | Expected | Received | Remaining | Progress | Status
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsFirstBookletScannerOpen(true)}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#0D47A1] transition-colors"
          >
            <Scan className="h-3.5 w-3.5" />
            <span>Open Scanner</span>
          </button>
        </div>

        {/* Empty State */}
        {bundles.length === 0 ? (
          <div className="p-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center bg-[#EAF2FF] text-[#1565D8] mx-auto mb-3">
              <FileText className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-bold text-[#172033]">No Imported Classes Yet</h3>
            <p className="text-xs text-[#64748B] max-w-md mx-auto mt-1 mb-4">
              Import bulk Excel data with Class ID and Member ID to automatically generate class-wise expected counts and begin inwarding.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (onNavigateToSessions) onNavigateToSessions();
                }}
                className="px-4 py-2 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#0D47A1] transition-colors"
              >
                Go to Import Data
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#E2E8F0]">
            {bundles.map(b => {
              const isStarted = b.status === 'IN PROGRESS' || b.status === 'PARTIAL / SAVED';
              const isCompleted = b.status === 'COMPLETED';
              const isNotStarted = b.status === 'NOT STARTED';

              return (
                <div
                  key={b.id}
                  className="p-4 hover:bg-[#F8FAFC] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  {/* Left info: Class ID & Counts */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-base font-black text-[#172033] tracking-wide">
                        Class {b.classId}
                      </span>

                      {/* Status Badges (Section 14) */}
                      {isCompleted && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-[#DCFCE7] text-[#166534] border border-[#86EFAC] text-[10px] font-black uppercase tracking-wider">
                          <Check className="h-3 w-3 stroke-[3]" />
                          COMPLETED
                        </span>
                      )}
                      {b.status === 'PARTIAL / SAVED' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-[10px] font-black uppercase tracking-wider">
                          <Clock className="h-3 w-3" />
                          PARTIAL / SAVED
                        </span>
                      )}
                      {b.status === 'IN PROGRESS' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-[#EAF2FF] text-[#1565D8] border border-[#BFDBFE] text-[10px] font-black uppercase tracking-wider">
                          <Scan className="h-3 w-3" />
                          IN PROGRESS
                        </span>
                      )}
                      {isNotStarted && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-100 text-slate-700 border border-slate-300 text-[10px] font-black uppercase tracking-wider">
                          NOT STARTED
                        </span>
                      )}
                    </div>

                    {/* Progress numbers */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#64748B] font-tabular">
                      <span>
                        Expected: <strong className="text-[#172033] font-bold">{b.expectedCount}</strong>
                      </span>
                      <span>
                        Received: <strong className="text-[#1565D8] font-bold">{b.receivedCount}</strong>
                      </span>
                      <span>
                        Remaining:{' '}
                        <strong className={b.missingCount > 0 ? 'text-[#DC2626] font-bold' : 'text-[#166534] font-bold'}>
                          {b.missingCount}
                        </strong>
                      </span>
                      <span>
                        Progress: <strong className="text-[#172033] font-bold">{b.progressPercentage}%</strong>
                      </span>
                    </div>

                    {/* Mini progress bar */}
                    <div className="mt-2 h-1.5 w-full max-w-md bg-slate-100 overflow-hidden border border-[#E2E8F0]">
                      <div
                        className={`h-full ${b.status === 'COMPLETED' ? 'bg-[#16A34A]' : 'bg-[#1565D8]'}`}
                        style={{ width: `${Math.min(100, b.progressPercentage)}%` }}
                      />
                    </div>

                    {/* SECTION 6 & 12: In-progress banner */}
                    {isStarted && (
                      <div className="mt-2 text-[11px] text-[#1565D8] font-semibold flex items-center gap-1">
                        <span>SCANNING STARTED:</span>
                        <span className="text-[#64748B]">
                          {b.receivedCount} / {b.expectedCount} Received • Scanning is already in progress.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Right Action Buttons (Sections 6, 12, 13) */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* SECTION 6: For an already started class, NEVER show camera as fresh scanning action! */}
                    {isStarted && (
                      <button
                        type="button"
                        onClick={() => setActiveBundleClassId(b.classId)}
                        className="px-4 py-2 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#0D47A1] transition-colors flex items-center gap-1.5 shadow-xs"
                      >
                        <span>CONTINUE SCANNING</span>
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    )}

                    {isNotStarted && (
                      <button
                        type="button"
                        onClick={() => {
                          // Opens first booklet scanner to detect and open class
                          setIsFirstBookletScannerOpen(true);
                        }}
                        className="px-4 py-2 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#0D47A1] transition-colors flex items-center gap-1.5 shadow-xs"
                      >
                        <Scan className="h-4 w-4" />
                        <span>START SCANNING</span>
                      </button>
                    )}

                    {isCompleted && (
                      <button
                        type="button"
                        onClick={() => setActiveBundleClassId(b.classId)}
                        className="px-3.5 py-2 bg-white border border-[#CBD5E1] text-[#172033] text-xs font-bold uppercase tracking-wider hover:bg-slate-50 transition-colors flex items-center gap-1.5"
                      >
                        <Lock className="h-3.5 w-3.5 text-[#64748B]" />
                        <span>VIEW BUNDLE</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. First Booklet Scanner Modal (Section 3) */}
      <FirstBookletScannerModal
        isOpen={isFirstBookletScannerOpen}
        onClose={() => setIsFirstBookletScannerOpen(false)}
        onClassDetected={detectedClassId => {
          setIsFirstBookletScannerOpen(false);
          setActiveBundleClassId(detectedClassId);
        }}
      />

      {/* 6. Session Summary & Final Reconciliation Modal (Section 18) */}
      <SessionSummaryModal
        isOpen={isSessionSummaryOpen}
        onClose={() => setIsSessionSummaryOpen(false)}
        onSelectClass={cid => {
          setIsSessionSummaryOpen(false);
          setActiveBundleClassId(cid);
        }}
      />
    </div>
  );
};
