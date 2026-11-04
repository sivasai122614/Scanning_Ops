// ==============================================================================
// ExamScan — Admin Inward Rollback & Saved Records Management Modal
// Exclusive Administrator Interface:
// 1. App never deletes/reverts records automatically.
// 2. Only when an Admin explicitly confirms revert here, the script moves from
//    saved_scanned_data back into yet_to_be_inward (Pending).
// 3. The master record in imported_inward_data remains intact (never deleted).
// 4. Live counts update: Inwarded -1, Pending +1.
// ==============================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  Search,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Filter,
  Layers,
  Calendar,
  User,
  ShieldAlert,
  ArrowRight,
  Database,
  RefreshCw,
} from 'lucide-react';
import {
  importedService,
  SavedScannedRecord,
  formatExamDate,
  resolveOperatorName,
  getCurrentUser,
} from '../../services/importedService';

interface AdminInwardRollbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialClassId?: string;
}

export const AdminInwardRollbackModal: React.FC<AdminInwardRollbackModalProps> = ({
  isOpen,
  onClose,
  initialClassId = '',
}) => {
  const [records, setRecords] = useState<SavedScannedRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedClassId, setSelectedClassId] = useState<string>(initialClassId);
  const [revertingTarget, setRevertingTarget] = useState<SavedScannedRecord | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sync initialClassId if provided
  useEffect(() => {
    if (initialClassId) {
      setSelectedClassId(initialClassId);
    }
  }, [initialClassId]);

  const [isSyncingPending, setIsSyncingPending] = useState<boolean>(false);

  const handleSyncYetToBeInward = async () => {
    setIsSyncingPending(true);
    setFeedbackMessage(null);
    try {
      const res = await importedService.syncPendingToYetToBeInward();
      setFeedbackMessage({
        type: 'success',
        text: `✓ Synchronized ${res.count} pending records into Supabase 'public.yet_to_be_inward'.`,
      });
    } catch (e: any) {
      setFeedbackMessage({
        type: 'error',
        text: `Failed to sync yet_to_be_inward: ${e?.message || e}`,
      });
    } finally {
      setIsSyncingPending(false);
    }
  };

  const loadSavedRecords = useCallback(() => {
    const all = importedService.getSavedScannedRecords();
    setRecords(all);
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadSavedRecords();
      const unsub = importedService.subscribe(loadSavedRecords);
      return () => unsub();
    }
  }, [isOpen, loadSavedRecords]);

  // List of distinct class IDs in saved data
  const availableClassIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of records) {
      if (r.class_id) set.add(r.class_id);
    }
    return Array.from(set).sort();
  }, [records]);

  // Filtered list
  const filteredRecords = useMemo(() => {
    let list = [...records];

    if (selectedClassId && selectedClassId !== 'ALL') {
      const target = selectedClassId.trim().toLowerCase();
      list = list.filter(r => (r.class_id || '').trim().toLowerCase() === target);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(r =>
        (r.member_id || '').toLowerCase().includes(q) ||
        (r.class_id || '').toLowerCase().includes(q) ||
        (r.barcode || '').toLowerCase().includes(q) ||
        (r.scanned_by || '').toLowerCase().includes(q) ||
        (r.saved_by || '').toLowerCase().includes(q)
      );
    }

    // Sort newest inward first
    list.sort((a, b) => {
      const tA = new Date(a.scanned_at || a.saved_at || 0).getTime();
      const tB = new Date(b.scanned_at || b.saved_at || 0).getTime();
      return tB - tA;
    });

    return list;
  }, [records, selectedClassId, searchQuery]);

  const handleConfirmRevert = async () => {
    if (!revertingTarget) return;
    setIsProcessing(true);
    setFeedbackMessage(null);

    const currentUser = getCurrentUser();
    try {
      const result = await importedService.adminRevertInward(
        revertingTarget.class_id,
        revertingTarget.member_id,
        { name: currentUser.name, email: currentUser.email }
      );

      if (result.success) {
        setFeedbackMessage({
          type: 'success',
          text: `✓ Reverted Member ${revertingTarget.member_id} in Class ${revertingTarget.class_id}. Record restored to Yet to Be Inward (Pending).`,
        });
        setRevertingTarget(null);
        loadSavedRecords();
      } else {
        setFeedbackMessage({
          type: 'error',
          text: result.message || 'Failed to revert inward record.',
        });
      }
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err?.message || 'Error occurred while reverting record.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 border border-blue-200 flex items-center justify-center text-[#1565D8]">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900 tracking-tight">
                  Inward Records &amp; Rollback Station
                </h3>
                <span className="px-2 py-0.5 bg-amber-100 border border-amber-300 text-amber-900 text-[10px] font-black uppercase tracking-wider rounded-md">
                  ADMIN ONLY
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Safe Inward Rollback: Deleting here moves the record from <code>saved_scanned_data</code> back to <code>yet_to_be_inward</code> (Pending).
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Informational Policy Banner */}
        <div className="px-5 py-2.5 bg-blue-50/70 border-b border-blue-200 flex flex-wrap items-center justify-between text-xs text-blue-900 gap-2">
          <div className="flex items-center gap-2 font-medium">
            <ShieldAlert className="h-4 w-4 text-[#1565D8] shrink-0" />
            <span>
              <strong>Zero Automatic Deletion Policy:</strong> The system never deletes records automatically. Only explicit Admin rollbacks are allowed.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSyncingPending}
              onClick={handleSyncYetToBeInward}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-slate-100 border border-blue-300 text-[#1565D8] rounded-md text-[11px] font-bold shadow-2xs cursor-pointer disabled:opacity-50 transition-all"
              title="Populate yet_to_be_inward table with all pending/reverted scripts in Supabase"
            >
              <RefreshCw className={`h-3 w-3 ${isSyncingPending ? 'animate-spin text-[#1565D8]' : ''}`} />
              <span>{isSyncingPending ? 'Syncing...' : 'Sync Pending to Supabase'}</span>
            </button>
            <span className="font-bold font-tabular text-[#1565D8] shrink-0">
              {records.length} Scanned Records
            </span>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-white">
          <div className="flex items-center gap-2 flex-1 min-w-[260px]">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search Member ID, Class ID, Barcode, or Operator..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:bg-white focus:border-[#1565D8] focus:outline-hidden"
              />
            </div>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-xs text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
              <Filter className="h-3 w-3" />
              Class ID:
            </span>
            <select
              value={selectedClassId}
              onChange={e => setSelectedClassId(e.target.value)}
              className="py-1.5 px-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-hidden cursor-pointer"
            >
              <option value="">All Scanned Classes ({records.length})</option>
              {availableClassIds.map(cid => (
                <option key={cid} value={cid}>
                  Class {cid} ({records.filter(r => r.class_id === cid).length})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Feedback Alert Banner */}
        {feedbackMessage && (
          <div className={`mx-5 mt-3 p-3 rounded-xl border text-xs font-semibold flex items-center justify-between ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
              : 'bg-red-50 border-red-300 text-red-800'
          }`}>
            <span>{feedbackMessage.text}</span>
            <button
              type="button"
              onClick={() => setFeedbackMessage(null)}
              className="text-xs font-bold hover:underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Table of Inwarded Records */}
        <div className="flex-1 overflow-y-auto p-5">
          {filteredRecords.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              <Layers className="h-8 w-8 text-slate-400 mx-auto mb-2" />
              <div className="font-bold text-slate-700">No inwarded records match your filter.</div>
              <div className="mt-1 text-slate-400">All inwarded scripts for this campus are currently verified and stored in saved_scanned_data.</div>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left text-xs font-sans">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3.5">Member ID</th>
                    <th className="py-2.5 px-3">Class ID</th>
                    <th className="py-2.5 px-3">Barcode</th>
                    <th className="py-2.5 px-3">Exam Date</th>
                    <th className="py-2.5 px-3">Inwarded By</th>
                    <th className="py-2.5 px-3">Timestamp</th>
                    <th className="py-2.5 px-3 text-right">Admin Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {filteredRecords.map(rec => {
                    const formattedDate = rec.exam_date ? formatExamDate(rec.exam_date) : '—';
                    const timeStr = rec.scanned_at || rec.saved_at
                      ? new Date(rec.scanned_at || rec.saved_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : '—';
                    const operator = resolveOperatorName(rec.scanned_by || rec.saved_by);

                    return (
                      <tr key={rec.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-3.5 font-mono font-bold text-slate-900">
                          {rec.member_id}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-mono px-2 py-0.5 bg-blue-50 text-[#1565D8] border border-blue-200 rounded text-[11px] font-bold">
                            {rec.class_id}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                          {rec.barcode || '—'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700">
                          {formattedDate}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">
                          {operator}
                        </td>
                        <td className="py-2.5 px-3 font-tabular text-slate-500 text-[11px]">
                          {timeStr}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => setRevertingTarget(rec)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 rounded-lg text-xs font-bold transition-all shadow-2xs hover:shadow-xs active:scale-95 cursor-pointer"
                            title="Revert from Saved Scanned Data back to Yet to Be Inward"
                          >
                            <RotateCcw className="h-3 w-3 text-amber-700" />
                            <span>Revert to Pending</span>
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

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500 font-medium">
          <div>
            Showing <strong className="text-slate-800 font-bold">{filteredRecords.length}</strong> of{' '}
            <strong className="text-slate-800 font-bold">{records.length}</strong> total inwarded scripts
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg transition-colors cursor-pointer"
          >
            Close Station
          </button>
        </div>
      </div>

      {/* CONFIRMATION POPUP MODAL FOR ADMIN REVERT */}
      {revertingTarget && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 border border-slate-200 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-amber-700" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-black text-slate-900 leading-tight">
                  Confirm Admin Inward Rollback
                </h3>
                <p className="text-xs text-amber-800 font-semibold mt-0.5">
                  Exclusive Administrator Operation
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-tabular space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Member ID:</span>
                <span className="font-mono font-bold text-slate-900">{revertingTarget.member_id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Class ID:</span>
                <span className="font-mono font-bold text-[#1565D8]">{revertingTarget.class_id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Inwarded By:</span>
                <span className="font-semibold text-slate-800">{resolveOperatorName(revertingTarget.scanned_by || revertingTarget.saved_by)}</span>
              </div>
            </div>

            <div className="p-3 bg-blue-50/80 rounded-xl border border-blue-200 text-xs text-blue-900 space-y-1">
              <div className="font-bold">What will happen when you confirm:</div>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-blue-800">
                <li>Record will be removed from <code>saved_scanned_data</code>.</li>
                <li>Record will be restored back to <code>yet_to_be_inward</code> (Pending scripts).</li>
                <li>Master reference in <code>imported_inward_data</code> remains permanent and safe.</li>
                <li>Live counts will adjust: Inwarded (-1), Pending (+1).</li>
              </ul>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => setRevertingTarget(null)}
                className="flex-1 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleConfirmRevert}
                className="flex-1 py-2 text-xs font-black uppercase tracking-wider text-white bg-amber-600 hover:bg-amber-700 active:scale-98 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{isProcessing ? 'Reverting...' : 'Confirm Rollback'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
