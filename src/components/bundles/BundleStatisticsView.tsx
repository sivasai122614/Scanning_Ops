// ==============================================================================
// Class Bundle Detail Screen (Sections 6, 7, 8, 9, 10, 11, 12, 15, 21, 22, 30)
// Header: ← Back | CLASS BUNDLE — {classId}
// Statistics Cards:
// 1. IMPORTED (Total records imported from Excel for this Class ID)
// 2. SCANNED (Total valid booklets/member IDs already scanned)
// 3. NOT SCANNED (Imported records which have not yet been scanned)
// Progress: X / Y (Z%) | Status: NOT STARTED / IN PROGRESS / COMPLETED / PARTIAL / SAVED
// Tabs: [ IMPORTED DATA ] | [ SCANNED ] | [ NOT SCANNED ]
// Camera strictly does NOT appear on this screen (Section 15)
// ==============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Check,
  Search,
  Users,
  FileSpreadsheet,
  Lock,
  Unlock,
  Save,
  ShieldCheck,
} from 'lucide-react';
import {
  importedService,
  ClassBundle,
  ImportedRecord,
} from '../../services/importedService';

interface BundleStatisticsViewProps {
  classId: string;
  onBackToDashboard: () => void;
  onSwitchClass?: (newClassId: string) => void;
}

export const BundleStatisticsView: React.FC<BundleStatisticsViewProps> = ({
  classId,
  onBackToDashboard,
}) => {
  const [bundle, setBundle] = useState<ClassBundle | null>(null);
  const [records, setRecords] = useState<ImportedRecord[]>([]);

  // Section 8: Three Tabs [ IMPORTED DATA ] | [ SCANNED ] | [ NOT SCANNED ]
  const [activeTab, setActiveTab] = useState<'all' | 'scanned' | 'not_scanned'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Partial Save Confirmation Modal
  const [showSaveConfirmModal, setShowSaveConfirmModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Reopen Confirmation Modal
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
      <div className="p-6 bg-white border border-[#CBD5E1] text-center font-sans max-w-4xl mx-auto my-6">
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

  const importedCount = bundle.expectedCount;
  const scannedCount = bundle.receivedCount;
  const notScannedCount = bundle.missingCount;
  const progressPercentage = bundle.progressPercentage;
  const is100Percent = importedCount > 0 && scannedCount >= importedCount;
  const isCompletedAndSaved = bundle.status === 'COMPLETED';

  // Section 8, 9, 10, 11: Member Data Lists
  // Scanned members
  const scannedRecords = records.filter(
    r => r.scan_status === 'started' || r.scan_status === 'completed'
  );

  // Not scanned members
  const notScannedRecords = records.filter(r => r.scan_status === 'not_started');

  // Filtered list based on active tab & search
  const displayedRecords = (
    activeTab === 'all'
      ? records
      : activeTab === 'scanned'
      ? scannedRecords
      : notScannedRecords
  ).filter(r => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      r.member_id.toLowerCase().includes(q) ||
      (r.barcode && r.barcode.toLowerCase().includes(q))
    );
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
            ? `Bundle for Class ${classId} marked as COMPLETED and saved in Supabase!`
            : `Bundle for Class ${classId} saved successfully with ${scannedCount} / ${importedCount} received.`
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
      {/* 1. Header (Section 7) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 border border-[#CBD5E1] shadow-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToDashboard}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#172033] text-xs font-bold transition-colors uppercase tracking-wider border border-[#CBD5E1]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </button>
          <div className="h-5 w-px bg-[#CBD5E1] hidden sm:block" />
          <div>
            <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
              {bundle.universityName}
            </div>
            <h1 className="text-xl font-black text-[#172033] tracking-tight">
              CLASS BUNDLE — {classId}
            </h1>
          </div>
        </div>

        {/* Status Badge & Actions */}
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
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#EFF6FF] border border-[#BFDBFE] text-[#1565D8] text-xs font-bold uppercase tracking-wider">
              IN PROGRESS
            </span>
          )}
          {bundle.status === 'NOT STARTED' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold uppercase tracking-wider">
              NOT STARTED
            </span>
          )}

          {/* Save Bundle Action Button */}
          {!isCompletedAndSaved && (
            <button
              type="button"
              onClick={() => setShowSaveConfirmModal(true)}
              className="px-3.5 py-1.5 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#0D47A1] transition-colors flex items-center gap-1.5"
            >
              <Save className="h-4 w-4" />
              <span>{is100Percent ? 'SAVE COMPLETE BUNDLE' : 'SAVE BUNDLE'}</span>
            </button>
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

      {/* SECTION 16: 100% COMPLETE BANNER */}
      {is100Percent && !isCompletedAndSaved && (
        <div className="p-4 bg-[#DCFCE7] border-2 border-[#16A34A] text-[#14532D] flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center bg-[#16A34A] text-white shrink-0">
              <Check className="h-6 w-6 stroke-[3]" />
            </div>
            <div>
              <div className="text-base font-extrabold uppercase tracking-wide">✓ BUNDLE COMPLETE</div>
              <div className="text-xs text-[#166534] font-medium">
                All {importedCount} of {importedCount} booklets have been received for Class {classId}.
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

      {/* SECTION 22: COMPLETED LOCKED BANNER */}
      {isCompletedAndSaved && (
        <div className="p-3.5 bg-white border border-[#CBD5E1] text-[#172033] flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <Lock className="h-5 w-5 text-[#64748B]" />
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-[#172033]">
                ✓ COMPLETED — Bundle Locked
              </div>
              <div className="text-[11px] text-[#64748B]">
                This class is locked from accidental modification. Saved in Supabase.
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

      {/* 2. THREE PRIMARY STATISTIC CARDS (Section 7) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* IMPORTED CARD */}
        <div className="bg-white p-4 border border-[#CBD5E1] shadow-xs">
          <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
            IMPORTED
          </div>
          <div className="text-3xl font-black text-[#172033] font-tabular mt-1">
            {importedCount}
          </div>
          <div className="text-[11px] text-[#64748B] mt-1">
            Total records imported from Excel for Class {classId}.
          </div>
        </div>

        {/* SCANNED CARD */}
        <div className="bg-white p-4 border border-[#BFDBFE] shadow-xs bg-[#F8FAFC]">
          <div className="text-[11px] font-bold text-[#1565D8] uppercase tracking-wider">
            SCANNED
          </div>
          <div className="text-3xl font-black text-[#1565D8] font-tabular mt-1">
            {scannedCount}
          </div>
          <div className="text-[11px] text-[#1565D8] mt-1">
            Total valid booklets/member IDs already scanned.
          </div>
        </div>

        {/* NOT SCANNED CARD */}
        <div className="bg-white p-4 border border-[#FECACA] shadow-xs">
          <div className="text-[11px] font-bold text-[#DC2626] uppercase tracking-wider">
            NOT SCANNED
          </div>
          <div className="text-3xl font-black text-[#DC2626] font-tabular mt-1">
            {notScannedCount}
          </div>
          <div className="text-[11px] text-[#DC2626] mt-1">
            Imported records which have not yet been scanned.
          </div>
        </div>
      </div>

      {/* Progress Bar Card */}
      <div className="bg-white p-4 border border-[#CBD5E1] shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[#172033]">
            Progress ({scannedCount} / {importedCount})
          </span>
          <span className="text-sm font-black font-tabular text-[#16A34A]">
            {progressPercentage}%
          </span>
        </div>

        <div className="mt-2 h-2.5 w-full bg-slate-100 overflow-hidden border border-[#CBD5E1]">
          <div
            className="h-full bg-[#16A34A] transition-all duration-300"
            style={{ width: `${Math.min(100, progressPercentage)}%` }}
          />
        </div>
      </div>

      {/* 3. MEMBER DATA SECTION WITH THREE TABS (Section 8, 9, 10, 11) */}
      <div className="bg-white border border-[#CBD5E1] shadow-xs overflow-hidden">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-[#CBD5E1] bg-[#F8FAFC] px-4 pt-2">
          <div className="flex items-center gap-1">
            {/* TAB 1: IMPORTED DATA */}
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
                activeTab === 'all'
                  ? 'border-[#1565D8] text-[#1565D8] bg-white'
                  : 'border-transparent text-[#64748B] hover:text-[#172033]'
              }`}
            >
              IMPORTED DATA ({importedCount})
            </button>

            {/* TAB 2: SCANNED */}
            <button
              type="button"
              onClick={() => setActiveTab('scanned')}
              className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
                activeTab === 'scanned'
                  ? 'border-[#16A34A] text-[#16A34A] bg-white'
                  : 'border-transparent text-[#64748B] hover:text-[#172033]'
              }`}
            >
              SCANNED ({scannedCount})
            </button>

            {/* TAB 3: NOT SCANNED */}
            <button
              type="button"
              onClick={() => setActiveTab('not_scanned')}
              className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
                activeTab === 'not_scanned'
                  ? 'border-[#DC2626] text-[#DC2626] bg-white'
                  : 'border-transparent text-[#64748B] hover:text-[#172033]'
              }`}
            >
              NOT SCANNED ({notScannedCount})
            </button>
          </div>

          {/* Search Input */}
          <div className="pb-2 w-48 hidden sm:block">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-[#64748B]" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search member..."
                className="w-full pl-8 pr-2 py-1 text-xs border border-[#CBD5E1] bg-white focus:outline-hidden focus:border-[#1565D8]"
              />
            </div>
          </div>
        </div>

        {/* Member Records List */}
        <div className="divide-y divide-[#E2E8F0] max-h-[460px] overflow-y-auto">
          {displayedRecords.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#64748B]">
              No members found matching the current filter.
            </div>
          ) : (
            displayedRecords.map((r, idx) => {
              const isScanned = r.scan_status === 'started' || r.scan_status === 'completed';

              return (
                <div
                  key={r.id || `${r.member_id}_${idx}`}
                  className="p-3 px-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-[#64748B] w-6">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <div className="font-mono font-bold text-xs text-[#172033]">
                        {r.member_id}
                      </div>
                      {r.barcode && (
                        <div className="font-mono text-[10px] text-[#64748B]">
                          Barcode: {r.barcode}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {r.scanned_at && (
                      <span className="text-[11px] text-[#64748B] font-mono hidden sm:inline">
                        {new Date(r.scanned_at).toLocaleTimeString()}
                      </span>
                    )}

                    {isScanned ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-[#DCFCE7] border border-[#86EFAC] text-[#166534] text-[10px] font-bold uppercase tracking-wider">
                        <Check className="h-3 w-3" />
                        SCANNED
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-[10px] font-bold uppercase tracking-wider">
                        NOT SCANNED
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Confirmation Modal for Partial / Complete Bundle Save */}
      {showSaveConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white border border-[#CBD5E1] shadow-2xl p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center bg-[#EAF2FF] text-[#1565D8] mx-auto mb-3">
              <Save className="h-6 w-6" />
            </div>

            <div className="text-base font-extrabold uppercase tracking-wide text-[#172033]">
              {is100Percent ? 'SAVE COMPLETE BUNDLE' : 'SAVE PARTIAL BUNDLE'}
            </div>

            <div className="text-xs text-[#475569] mt-2 mb-4 leading-relaxed">
              Save this bundle for Class <strong className="text-[#172033] font-bold">{classId}</strong> with{' '}
              <strong className="text-[#1565D8] font-bold">{scannedCount} / {importedCount}</strong> booklets received?
              {!is100Percent && (
                <span className="block text-[#DC2626] mt-1 font-semibold">
                  {notScannedCount} booklets remain un-scanned and will be marked as missing.
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowSaveConfirmModal(false)}
                disabled={isSaving}
                className="flex-1 py-2.5 bg-white border border-[#CBD5E1] text-[#172033] text-xs font-bold hover:bg-slate-50 transition-colors uppercase tracking-wider"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleSaveBundleConfirm}
                disabled={isSaving}
                className="flex-1 py-2.5 bg-[#1565D8] text-white text-xs font-bold hover:bg-[#0D47A1] transition-colors uppercase tracking-wider disabled:opacity-50"
              >
                {isSaving ? 'SAVING...' : 'SAVE BUNDLE'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reopen Bundle Confirmation Modal */}
      {showReopenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white border border-[#CBD5E1] shadow-2xl p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center bg-[#FEF3C7] text-[#D97706] mx-auto mb-3">
              <Unlock className="h-6 w-6" />
            </div>

            <div className="text-base font-extrabold uppercase tracking-wide text-[#172033]">
              REOPEN BUNDLE?
            </div>

            <div className="text-xs text-[#475569] mt-2 mb-4 leading-relaxed">
              Are you sure you want to reopen Class <strong className="text-[#172033] font-bold">{classId}</strong> for editing?
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowReopenModal(false)}
                disabled={isReopening}
                className="flex-1 py-2.5 bg-white border border-[#CBD5E1] text-[#172033] text-xs font-bold hover:bg-slate-50 transition-colors uppercase tracking-wider"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleReopenBundleConfirm}
                disabled={isReopening}
                className="flex-1 py-2.5 bg-[#D97706] text-white text-xs font-bold hover:bg-[#B45309] transition-colors uppercase tracking-wider disabled:opacity-50"
              >
                {isReopening ? 'REOPENING...' : 'CONFIRM REOPEN'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
