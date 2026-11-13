// ==============================================================================
// ExamScan — Class ID Member Breakdown & Not-Inwarded Inspector Modal
// Displays 100% real imported & inwarded Member IDs strictly scoped to the
// selected Class ID. Zero mock or placeholder records.
// ==============================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  Eye,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Copy,
  Check,
  FileSpreadsheet,
  User,
} from 'lucide-react';
import ExcelJS from 'exceljs';
import {
  importedService,
  ClassBundle,
  BundleRecordView,
  ExamDateFilter,
  formatExamDate,
  resolveOperatorName,
} from '../../services/importedService';

interface ClassMissingMembersModalProps {
  bundle: ClassBundle | null;
  dateFilter?: ExamDateFilter;
  onClose: () => void;
}

type MemberTabType = 'not_inwarded' | 'inwarded' | 'all';

export const ClassMissingMembersModal: React.FC<ClassMissingMembersModalProps> = ({
  bundle,
  dateFilter,
  onClose,
}) => {
  const [records, setRecords] = useState<BundleRecordView[]>([]);
  const [activeTab, setActiveTab] = useState<MemberTabType>('not_inwarded');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const loadClassRecords = useCallback(() => {
    if (!bundle) {
      setRecords([]);
      return;
    }
    const list = importedService.getStrictClassMemberBreakdown(bundle.classId, dateFilter);
    setRecords(list);
  }, [bundle, dateFilter]);

  const handleLiveSync = useCallback(async () => {
    if (!bundle) return;
    setIsSyncing(true);
    try {
      await importedService.refreshClassLiveDetails(bundle.classId);
      loadClassRecords();
    } catch (e) {
      console.warn('[ClassInspector] Live sync note:', e);
    } finally {
      setIsSyncing(false);
    }
  }, [bundle, loadClassRecords]);

  useEffect(() => {
    if (!bundle) return;
    setSearchQuery('');
    setActiveTab('not_inwarded');
    setCopiedSuccess(false);
    loadClassRecords();
    handleLiveSync();

    const unsub = importedService.subscribe(loadClassRecords);
    return () => unsub();
  }, [bundle, loadClassRecords, handleLiveSync]);

  const notInwardedRecords = useMemo(
    () => records.filter(r => r.scan_status === 'not_started'),
    [records]
  );

  const inwardedRecords = useMemo(
    () => records.filter(r => r.scan_status === 'saved' || r.scan_status === 'pending_save'),
    [records]
  );

  const displayedRecords = useMemo(() => {
    const base =
      activeTab === 'not_inwarded'
        ? notInwardedRecords
        : activeTab === 'inwarded'
        ? inwardedRecords
        : records;

    if (!searchQuery.trim()) return base;
    const q = searchQuery.trim().toLowerCase();
    return base.filter(
      r =>
        r.member_id.toLowerCase().includes(q) ||
        (r.barcode && r.barcode.toLowerCase().includes(q)) ||
        (r.scanned_by && r.scanned_by.toLowerCase().includes(q)) ||
        (r.saved_by && r.saved_by.toLowerCase().includes(q))
    );
  }, [activeTab, notInwardedRecords, inwardedRecords, records, searchQuery]);

  const handleCopyNotInwardedIds = async () => {
    if (notInwardedRecords.length === 0) return;
    const text = notInwardedRecords.map(r => r.member_id).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSuccess(true);
      setTimeout(() => setCopiedSuccess(false), 2000);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  const handleExportClassExcel = async () => {
    if (!bundle || displayedRecords.length === 0) return;
    setIsExporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(`Class_${bundle.classId}`);

      const tabLabel =
        activeTab === 'not_inwarded'
          ? 'NOT INWARDED (MISSING)'
          : activeTab === 'inwarded'
          ? 'INWARDED / VERIFIED'
          : 'ALL IMPORTED MEMBERS';

      const titleRow = ws.addRow([
        `CLASS ID: ${bundle.classId} — ${tabLabel} (${displayedRecords.length} RECORDS)`,
      ]);
      ws.mergeCells(1, 1, 1, 6);
      titleRow.font = { bold: true, size: 12 };
      titleRow.alignment = { horizontal: 'center', vertical: 'middle' };
      titleRow.height = 24;

      const headerRow = ws.addRow([
        '#',
        'Class ID',
        'Member ID',
        'Barcode',
        'Exam Date',
        'Status / Operator',
      ]);
      headerRow.font = { bold: true, size: 11 };
      headerRow.eachCell(c => {
        c.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE2E8F0' },
        };
      });

      displayedRecords.forEach((r, idx) => {
        const statusStr =
          r.scan_status === 'saved'
            ? `INWARDED (${resolveOperatorName(r.scanned_by || r.saved_by)})`
            : r.scan_status === 'pending_save'
            ? `PENDING SAVE (${resolveOperatorName(r.scanned_by)})`
            : 'NOT INWARDED';

        ws.addRow([
          idx + 1,
          r.class_id,
          r.member_id,
          r.barcode || '—',
          r.exam_date ? formatExamDate(r.exam_date) : '—',
          statusStr,
        ]);
      });

      ws.columns.forEach((col, i) => {
        col.width = i === 0 ? 8 : i === 5 ? 28 : 20;
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Class_${bundle.classId}_${activeTab}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Excel export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  if (!bundle) return null;

  const expectedCount = records.length > 0 ? records.length : bundle.expectedCount;
  const inwardedCount = records.length > 0 ? inwardedRecords.length : bundle.receivedCount;
  const missingCount = records.length > 0 ? notInwardedRecords.length : Math.max(0, bundle.expectedCount - bundle.receivedCount);

  let statusBadgeClass = 'bg-slate-100 text-slate-700 border-slate-300';
  if (bundle.status === 'COMPLETED') {
    statusBadgeClass = 'bg-[#DCFCE7] text-[#166534] border-[#86EFAC]';
  } else if (bundle.status === 'IN PROGRESS') {
    statusBadgeClass = 'bg-[#EFF6FF] text-[#1D4ED8] border-[#93C5FD]';
  } else if (bundle.status === 'PARTIAL / SAVED') {
    statusBadgeClass = 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]';
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-100 border border-blue-200 flex items-center justify-center text-[#1565D8] shrink-0">
              <Eye className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-black text-slate-900 tracking-tight font-mono">
                  CLASS ID: {bundle.classId}
                </h3>
                <span className={`px-2 py-0.5 border text-[10px] font-bold uppercase tracking-wider rounded-md ${statusBadgeClass}`}>
                  {bundle.status}
                </span>
                {isSyncing && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-[#1565D8] border border-blue-200 rounded-md text-[10px] font-bold">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    <span>Syncing Live Data...</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5 truncate">
                Exact real imported &amp; inwarded Member IDs for Class {bundle.classId} only.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleLiveSync}
              disabled={isSyncing}
              className="p-2 text-slate-500 hover:text-[#1565D8] hover:bg-blue-50 rounded-lg border border-transparent hover:border-blue-200 transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh live records from backend"
            >
              <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin text-[#1565D8]' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              title="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Summary Stats Strip */}
        <div className="grid grid-cols-3 gap-2.5 p-3.5 bg-white border-b border-slate-200">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Expected Booklets
            </div>
            <div className="text-xl font-black text-slate-900 font-tabular mt-0.5">
              {expectedCount}
            </div>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50/60 px-3.5 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#1565D8]">
              Inwarded / Verified
            </div>
            <div className="text-xl font-black text-[#1565D8] font-tabular mt-0.5">
              {inwardedCount}
            </div>
          </div>

          <div className="rounded-xl border border-red-200 bg-red-50/70 px-3.5 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#DC2626]">
              Not Inwarded (Pending)
            </div>
            <div className="text-xl font-black text-[#DC2626] font-tabular mt-0.5">
              {missingCount}
            </div>
          </div>
        </div>

        {/* Tabs, Search & Actions Toolbar */}
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTab('not_inwarded')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'not_inwarded'
                  ? 'bg-[#DC2626] text-white shadow-xs'
                  : 'bg-white border border-red-200 text-[#DC2626] hover:bg-red-50'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Not Inwarded ({notInwardedRecords.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('inwarded')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'inwarded'
                  ? 'bg-[#16A34A] text-white shadow-xs'
                  : 'bg-white border border-emerald-200 text-[#166534] hover:bg-emerald-50'
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Inwarded ({inwardedRecords.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-[#1565D8] text-white shadow-xs'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              All ({records.length})
            </button>
          </div>

          {/* Search + Copy + Export */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search Member ID..."
                className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:border-[#1565D8]"
              />
            </div>

            {notInwardedRecords.length > 0 && (
              <button
                type="button"
                onClick={handleCopyNotInwardedIds}
                className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                title="Copy all Not-Inwarded Member IDs"
              >
                {copiedSuccess ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[#16A34A]" />
                    <span className="text-[#16A34A]">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">Copy Missing</span>
                  </>
                )}
              </button>
            )}

            {displayedRecords.length > 0 && (
              <button
                type="button"
                onClick={handleExportClassExcel}
                disabled={isExporting}
                className="px-2.5 py-1.5 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors disabled:opacity-50"
                title="Download Excel for this Class ID view"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{isExporting ? 'Exporting...' : 'Excel'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Real Records Table */}
        <div className="flex-1 overflow-y-auto bg-white">
          {records.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              {isSyncing
                ? `Loading real imported Member IDs for Class ${bundle.classId}...`
                : `No imported member records found in backend for Class ID "${bundle.classId}".`}
            </div>
          ) : displayedRecords.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              {activeTab === 'not_inwarded' && !searchQuery.trim() ? (
                <>
                  <CheckCircle2 className="h-10 w-10 text-[#16A34A] mx-auto" />
                  <div className="text-sm font-bold text-[#166534]">
                    All Member IDs Inwarded for Class {bundle.classId}
                  </div>
                  <div className="text-xs text-slate-500">
                    There are 0 pending/missing booklets remaining in this Class ID.
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-500">
                  No Member IDs match "{searchQuery}" in this tab.
                </div>
              )}
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500 sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-4 w-12 text-center">#</th>
                  <th className="py-2.5 px-4">Class ID</th>
                  <th className="py-2.5 px-4">Member ID</th>
                  <th className="py-2.5 px-4">Barcode</th>
                  <th className="py-2.5 px-4">Exam Date</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Operator / Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedRecords.map((r, idx) => {
                  const isSaved = r.scan_status === 'saved';
                  const isPendingSave = r.scan_status === 'pending_save';
                  const opDisplay = resolveOperatorName(r.scanned_by || r.saved_by);
                  const timeStr = r.scanned_at || r.saved_at;

                  return (
                    <tr
                      key={r.id || `${r.class_id}_${r.member_id}_${idx}`}
                      className={`transition-colors ${
                        !isSaved && !isPendingSave
                          ? 'hover:bg-red-50/40'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2.5 px-4 text-center font-mono text-[11px] text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-semibold text-slate-600">
                        {r.class_id}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                        {r.member_id}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600">
                        {r.barcode || '—'}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600">
                        {r.exam_date ? formatExamDate(r.exam_date) : '—'}
                      </td>
                      <td className="py-2.5 px-4">
                        {isSaved ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#DCFCE7] border border-[#86EFAC] text-[#166534] text-[10px] font-bold uppercase tracking-wider rounded-md">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>Inwarded</span>
                          </span>
                        ) : isPendingSave ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#FEF3C7] border border-[#FDE68A] text-[#92400E] text-[10px] font-bold uppercase tracking-wider rounded-md">
                            <Clock className="h-3 w-3" />
                            <span>Pending Save</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#FEE2E2] border border-[#FECACA] text-[#DC2626] text-[10px] font-bold uppercase tracking-wider rounded-md">
                            <AlertTriangle className="h-3 w-3" />
                            <span>Not Inwarded</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right text-[11px] text-slate-600">
                        {isSaved || isPendingSave ? (
                          <div className="inline-flex flex-col items-end">
                            <span className="font-semibold text-slate-800 flex items-center gap-1">
                              <User className="h-3 w-3 text-[#1565D8]" />
                              {opDisplay !== '—' ? opDisplay : 'Operator'}
                            </span>
                            {timeStr && (
                              <span className="font-mono text-[10px] text-slate-400">
                                {new Date(timeStr).toLocaleString()}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-red-500/80 font-medium">Yet to be inwarded</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing <strong>{displayedRecords.length}</strong> real records for Class{' '}
            <strong className="font-mono text-slate-800">{bundle.classId}</strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[#1565D8] hover:bg-[#0D47A1] text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
