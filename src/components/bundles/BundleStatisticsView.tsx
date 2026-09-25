// ==============================================================================
// Bundle Statistics View (Sections 4, 5, 7, 8, 9, 13)
// Completely separate screen from the camera.
// Displays Class ID, Expected, Received, Remaining, Completion %, and Member status.
// ==============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Scan,
  Save,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RotateCcw,
  Check,
  Search,
  Filter,
  Users,
  FileSpreadsheet,
  Lock,
  Unlock,
} from 'lucide-react';
import {
  importedService,
  ClassBundle,
  ImportedRecord,
  ScanResult,
} from '../../services/importedService';
import { BundleScannerModal } from './BundleScannerModal';

interface BundleStatisticsViewProps {
  classId: string;
  onBackToDashboard: () => void;
  onSwitchClass?: (newClassId: string) => void;
}

export const BundleStatisticsView: React.FC<BundleStatisticsViewProps> = ({
  classId,
  onBackToDashboard,
  onSwitchClass,
}) => {
  const [bundle, setBundle] = useState<ClassBundle | null>(null);
  const [records, setRecords] = useState<ImportedRecord[]>([]);
  const [filterMode, setFilterMode] = useState<'all' | 'received' | 'pending'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Scanner modal state (camera exists ONLY when this modal is explicitly opened)
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Partial save confirmation modal
  const [showSaveConfirmModal, setShowSaveConfirmModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Reopen confirmation modal
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [isReopening, setIsReopening] = useState(false);

  const loadData = useCallback(() => {
    const b = importedService.getClassBundle(classId);
    const recs = importedService.getRecords(classId);
    setBundle(b);
    setRecords(recs);
  }, [classId]);

  useEffect(() => {
    loadData();
    const unsub = importedService.subscribe(loadData);
    return () => unsub();
  }, [loadData]);

  if (!bundle) {
    return (
      <div className="p-6 bg-white border border-[#CBD5E1] text-center font-sans">
        <AlertTriangle className="h-10 w-10 text-[#F59E0B] mx-auto mb-2" />
        <h2 className="text-base font-bold text-[#172033]">Class Bundle Not Found</h2>
        <p className="text-xs text-[#64748B] mt-1 mb-4">
          No records or bundle data found for Class ID "{classId}".
        </p>
        <button
          type="button"
          onClick={onBackToDashboard}
          className="px-4 py-2 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#0D47A1]"
        >
          ← Back to Scanning Dashboard
        </button>
      </div>
    );
  }

  const expectedCount = bundle.expectedCount;
  const receivedCount = bundle.receivedCount;
  const remainingCount = bundle.missingCount;
  const completionPercentage = bundle.progressPercentage;
  const is100Percent = expectedCount > 0 && receivedCount >= expectedCount;
  const isCompletedAndSaved = bundle.status === 'COMPLETED';
  const isPartialSaved = bundle.status === 'PARTIAL / SAVED';

  // Filter records
  const filteredRecords = records.filter(r => {
    const isReceived = r.scan_status === 'started' || r.scan_status === 'completed';
    if (filterMode === 'received' && !isReceived) return false;
    if (filterMode === 'pending' && isReceived) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        r.member_id.toLowerCase().includes(q) ||
        (r.barcode && r.barcode.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Handle Save Bundle
  const handleSaveBundleConfirm = async () => {
    setIsSaving(true);
    try {
      const res = await importedService.saveBundle(classId, is100Percent);
      if (res.success && res.bundle) {
        setBundle(res.bundle);
        setSaveSuccessMessage(
          is100Percent
            ? `Bundle for Class ${classId} marked as COMPLETED and securely locked!`
            : `Bundle for Class ${classId} saved successfully with ${receivedCount} / ${expectedCount} received.`
        );
        setTimeout(() => setSaveSuccessMessage(null), 4000);
      }
    } catch (e) {
      console.warn('Save error:', e);
    } finally {
      setIsSaving(false);
      setShowSaveConfirmModal(false);
    }
  };

  // Handle Reopen Bundle
  const handleReopenBundleConfirm = async () => {
    setIsReopening(true);
    try {
      const res = await importedService.reopenBundle(classId);
      if (res.success && res.bundle) {
        setBundle(res.bundle);
        setSaveSuccessMessage(`Bundle for Class ${classId} has been reopened for editing.`);
        setTimeout(() => setSaveSuccessMessage(null), 3500);
      }
    } catch (e) {
      console.warn('Reopen error:', e);
    } finally {
      setIsReopening(false);
      setShowReopenModal(false);
    }
  };

  return (
    <div className="space-y-4 font-sans max-w-4xl mx-auto pb-12">
      {/* 1. Header with Back Button (Section 4 & 5) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 border border-[#CBD5E1] shadow-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToDashboard}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#172033] text-xs font-bold transition-colors uppercase tracking-wider border border-[#CBD5E1]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>← Back to Scanning Dashboard</span>
          </button>
          <div className="h-5 w-px bg-[#CBD5E1] hidden sm:block" />
          <div>
            <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
              {bundle.universityName}
            </div>
            <h1 className="text-xl font-extrabold text-[#172033] tracking-tight">
              Bundle — Class {classId}
            </h1>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2">
          {bundle.status === 'COMPLETED' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#DCFCE7] border border-[#86EFAC] text-[#166534] text-xs font-bold uppercase tracking-wider">
              <CheckCircle2 className="h-4 w-4" />
              COMPLETED
            </span>
          )}
          {bundle.status === 'PARTIAL / SAVED' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#FEF3C7] border border-[#FDE68A] text-[#92400E] text-xs font-bold uppercase tracking-wider">
              <Clock className="h-4 w-4" />
              PARTIAL / SAVED
            </span>
          )}
          {bundle.status === 'IN PROGRESS' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#EAF2FF] border border-[#BFDBFE] text-[#1565D8] text-xs font-bold uppercase tracking-wider">
              <Scan className="h-4 w-4" />
              IN PROGRESS
            </span>
          )}
          {bundle.status === 'NOT STARTED' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold uppercase tracking-wider">
              NOT STARTED
            </span>
          )}
        </div>
      </div>

      {/* Notifications / Alerts */}
      {saveSuccessMessage && (
        <div className="p-3 bg-[#DCFCE7] border border-[#86EFAC] text-[#166534] text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{saveSuccessMessage}</span>
        </div>
      )}

      {/* SECTION 8: 100% COMPLETE BANNER */}
      {is100Percent && !isCompletedAndSaved && (
        <div className="p-4 bg-[#DCFCE7] border-2 border-[#16A34A] text-[#14532D] flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center bg-[#16A34A] text-white shrink-0">
              <Check className="h-6 w-6 stroke-[3]" />
            </div>
            <div>
              <div className="text-base font-extrabold uppercase tracking-wide">✓ BUNDLE COMPLETE</div>
              <div className="text-xs text-[#166534] font-medium">
                All {expectedCount} of {expectedCount} booklets have been verified for Class {classId}. Ready to save.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowSaveConfirmModal(true)}
            className="w-full sm:w-auto px-5 py-2.5 bg-[#16A34A] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#15803D] transition-colors shadow-xs"
          >
            SAVE COMPLETE BUNDLE
          </button>
        </div>
      )}

      {/* SECTION 13: COMPLETED LOCKED BANNER */}
      {isCompletedAndSaved && (
        <div className="p-3.5 bg-white border border-[#CBD5E1] text-[#172033] flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <Lock className="h-5 w-5 text-[#64748B]" />
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-[#172033]">
                ✓ COMPLETED — Bundle Locked
              </div>
              <div className="text-[11px] text-[#64748B]">
                This class is locked from accidental modification. Saved at{' '}
                {bundle.savedAt ? new Date(bundle.savedAt).toLocaleTimeString() : 'record creation'}.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowReopenModal(true)}
            className="px-3.5 py-1.5 bg-white border border-[#CBD5E1] text-[#172033] text-xs font-bold hover:bg-slate-50 transition-colors uppercase tracking-wider flex items-center gap-1.5"
          >
            <Unlock className="h-3.5 w-3.5 text-[#64748B]" />
            <span>REOPEN BUNDLE</span>
          </button>
        </div>
      )}

      {/* 2. Key Metrics Card (Section 4) */}
      <div className="bg-white p-5 border border-[#CBD5E1] shadow-xs space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0]">
            <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Expected Booklets</div>
            <div className="text-2xl font-black text-[#172033] font-tabular mt-1">{expectedCount}</div>
          </div>

          <div className="p-3 bg-[#EAF2FF] border border-[#BFDBFE]">
            <div className="text-[11px] font-bold text-[#1565D8] uppercase tracking-wider">Received Booklets</div>
            <div className="text-2xl font-black text-[#1565D8] font-tabular mt-1">{receivedCount}</div>
          </div>

          <div className="p-3 bg-[#FEE2E2] border border-[#FECACA]">
            <div className="text-[11px] font-bold text-[#DC2626] uppercase tracking-wider">Remaining / Missing</div>
            <div className="text-2xl font-black text-[#DC2626] font-tabular mt-1">{remainingCount}</div>
          </div>

          <div className="p-3 bg-[#DCFCE7] border border-[#BBF7D0]">
            <div className="text-[11px] font-bold text-[#166534] uppercase tracking-wider">Completion Rate</div>
            <div className="text-2xl font-black text-[#166534] font-tabular mt-1">{completionPercentage}%</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div>
          <div className="flex items-center justify-between text-xs font-bold mb-1.5">
            <span className="text-[#64748B] uppercase tracking-wider text-[11px]">Bundle Progress</span>
            <span className="font-tabular text-[#172033]">
              {receivedCount} / {expectedCount} Booklets ({completionPercentage}%)
            </span>
          </div>
          <div className="h-3 w-full bg-slate-100 overflow-hidden border border-[#CBD5E1]">
            <div
              className={`h-full transition-all duration-300 ${
                completionPercentage === 100 ? 'bg-[#16A34A]' : 'bg-[#1565D8]'
              }`}
              style={{ width: `${Math.min(100, completionPercentage)}%` }}
            />
          </div>
        </div>

        {/* Operational Actions (Scan & Save) */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-[#E2E8F0]">
          {!isCompletedAndSaved && (
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="flex-1 min-w-[200px] flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#0D47A1] transition-colors shadow-xs"
            >
              <Scan className="h-4 w-4" />
              <span>Continue Scanning (Camera)</span>
            </button>
          )}

          {!isCompletedAndSaved && !is100Percent && receivedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowSaveConfirmModal(true)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-[#CBD5E1] text-[#172033] text-xs font-bold uppercase tracking-wider hover:bg-slate-50 transition-colors"
            >
              <Save className="h-4 w-4 text-[#1565D8]" />
              <span>Save Bundle (Partial)</span>
            </button>
          )}

          {is100Percent && !isCompletedAndSaved && (
            <button
              type="button"
              onClick={() => setShowSaveConfirmModal(true)}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#16A34A] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#15803D] transition-colors shadow-xs"
            >
              <Check className="h-4 w-4" />
              <span>SAVE COMPLETE BUNDLE</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Member / Booklet Level List (Section 4) */}
      <div className="bg-white border border-[#CBD5E1] shadow-xs overflow-hidden">
        {/* Filter bar */}
        <div className="p-3.5 bg-[#F8FAFC] border-b border-[#E2E8F0] flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors border ${
                filterMode === 'all'
                  ? 'bg-[#1565D8] text-white border-[#1565D8]'
                  : 'bg-white text-[#64748B] border-[#CBD5E1] hover:text-[#172033]'
              }`}
            >
              All ({records.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('received')}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors border ${
                filterMode === 'received'
                  ? 'bg-[#16A34A] text-white border-[#16A34A]'
                  : 'bg-white text-[#64748B] border-[#CBD5E1] hover:text-[#172033]'
              }`}
            >
              Received ({receivedCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('pending')}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors border ${
                filterMode === 'pending'
                  ? 'bg-[#DC2626] text-white border-[#DC2626]'
                  : 'bg-white text-[#64748B] border-[#CBD5E1] hover:text-[#172033]'
              }`}
            >
              Missing / Pending ({remainingCount})
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94A3B8]" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search Member ID..."
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#CBD5E1] text-xs text-[#172033] focus:outline-hidden focus:border-[#1565D8]"
            />
          </div>
        </div>

        {/* Member Table */}
        <div className="divide-y divide-[#E2E8F0]">
          {filteredRecords.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#64748B]">
              No booklet records match the current filter.
            </div>
          ) : (
            filteredRecords.map((r, index) => {
              const isReceived = r.scan_status === 'started' || r.scan_status === 'completed';
              const sequenceNum = String(index + 1).padStart(2, '0');

              return (
                <div
                  key={r.id}
                  className={`flex items-center justify-between p-3 transition-colors ${
                    isReceived ? 'bg-white hover:bg-slate-50' : 'bg-[#FFFBEB]/40 hover:bg-[#FFFBEB]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-[#64748B] w-6">
                      {sequenceNum}
                    </span>
                    <div className="h-4 w-px bg-[#CBD5E1]" />
                    <div>
                      <div className="text-xs font-extrabold text-[#172033] tracking-wide font-mono">
                        {r.member_id}
                      </div>
                      <div className="text-[11px] text-[#64748B]">
                        Class: {r.class_id}
                        {r.barcode ? ` • Barcode: ${r.barcode}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {isReceived ? (
                      <div className="flex items-center gap-2">
                        <div className="text-right hidden sm:block">
                          <div className="text-[10px] text-[#64748B]">
                            {r.scanned_at ? new Date(r.scanned_at).toLocaleTimeString() : 'Scanned'}
                          </div>
                        </div>
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#DCFCE7] border border-[#86EFAC] text-[#166534] text-[11px] font-black uppercase tracking-wider">
                          <Check className="h-3 w-3 stroke-[3]" />
                          RECEIVED
                        </span>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#FEE2E2] border border-[#FCA5A5] text-[#991B1B] text-[11px] font-black uppercase tracking-wider">
                        PENDING
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 4. Partial Save Confirmation Modal (Section 7) */}
      {showSaveConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white border-2 border-[#CBD5E1] shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center bg-[#EAF2FF] text-[#1565D8]">
                <Save className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold uppercase text-[#172033] tracking-wide">
                  {is100Percent ? 'Save Complete Bundle' : 'Save Partial Bundle'}
                </h3>
                <p className="text-xs text-[#64748B]">Class {classId} Bundle Confirmation</p>
              </div>
            </div>

            <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#172033] space-y-1">
              <p className="font-semibold">
                Save this bundle with{' '}
                <span className="text-[#1565D8] font-bold">
                  {receivedCount} / {expectedCount}
                </span>{' '}
                booklets received?
              </p>
              {remainingCount > 0 ? (
                <p className="text-[#DC2626] font-medium text-[11px]">
                  ⚠ {remainingCount} booklet(s) are currently marked missing. Missing member IDs will remain available in the bundle and in Excel export.
                </p>
              ) : (
                <p className="text-[#16A34A] font-medium text-[11px]">
                  ✓ All booklets are verified. The bundle will be saved as COMPLETED.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSaveConfirmModal(false)}
                disabled={isSaving}
                className="px-4 py-2 bg-white border border-[#CBD5E1] text-[#172033] text-xs font-bold uppercase tracking-wider hover:bg-slate-50 transition-colors"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleSaveBundleConfirm}
                disabled={isSaving}
                className="px-4 py-2 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#0D47A1] transition-colors flex items-center gap-1.5"
              >
                {isSaving ? (
                  <>
                    <div className="h-3.5 w-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>SAVE BUNDLE</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Reopen Bundle Confirmation Modal (Section 13) */}
      {showReopenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white border-2 border-[#CBD5E1] shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center bg-[#FEF3C7] text-[#D97706]">
                <Unlock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold uppercase text-[#172033] tracking-wide">
                  Reopen Class {classId} Bundle?
                </h3>
                <p className="text-xs text-[#64748B]">Confirmation Required</p>
              </div>
            </div>

            <p className="text-xs text-[#475569]">
              Reopening this bundle will unlock it for scanning additional booklets or modifying records. The bundle status will change back from COMPLETED to IN PROGRESS.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowReopenModal(false)}
                disabled={isReopening}
                className="px-4 py-2 bg-white border border-[#CBD5E1] text-[#172033] text-xs font-bold uppercase tracking-wider hover:bg-slate-50 transition-colors"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleReopenBundleConfirm}
                disabled={isReopening}
                className="px-4 py-2 bg-[#D97706] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#B45309] transition-colors"
              >
                {isReopening ? 'Reopening...' : 'CONFIRM REOPEN'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Bundle Scanner Modal (Opens ONLY when operator clicks Continue Scanning) */}
      <BundleScannerModal
        isOpen={isScannerOpen}
        classId={classId}
        onClose={() => {
          setIsScannerOpen(false);
          loadData();
        }}
        onScanSuccess={res => {
          loadData();
        }}
        onSwitchClass={newCid => {
          setIsScannerOpen(false);
          if (onSwitchClass) {
            onSwitchClass(newCid);
          }
        }}
      />
    </div>
  );
};
