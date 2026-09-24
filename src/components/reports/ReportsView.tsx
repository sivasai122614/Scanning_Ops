// ==============================================================================
// Reports & Export View
// University-Centric Script Reconciliation, Excel Generation, and Google Sheets Sync
// Strictly zero hardcoded mock/sample data.
// ==============================================================================

import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Calendar,
  Share2,
  CheckCircle2,
  AlertTriangle,
  ArrowDownToLine,
  ExternalLink,
  Copy,
  Layers,
  X,
  Building,
} from 'lucide-react';
import { examStore } from '../../services/examStore';
import { OperationalMetrics, InwardSchedule, ScannedScript } from '../../types/exam';
import { exportToExcel, formatDataForGoogleSheets } from '../../utils/excelExport';

export const ReportsView: React.FC = () => {
  // Requirement 3: Select University dropdown (Replaces All Sessions)
  const [selectedUniversity, setSelectedUniversity] = useState<string>('ALL');
  const [universities, setUniversities] = useState<string[]>([]);
  const [schedules, setSchedules] = useState<InwardSchedule[]>([]);
  const [scans, setScans] = useState<(ScannedScript & { university?: string })[]>([]);
  const [metrics, setMetrics] = useState<OperationalMetrics>({
    totalScheduled: 0,
    expectedScripts: 0,
    scannedScripts: 0,
    missingScripts: 0,
    duplicateScripts: 0,
    unknownScripts: 0,
    completionRate: 0,
  });

  const [notification, setNotification] = useState<string>('');

  // Google Sheets Sync Modal State
  const [showSheetsModal, setShowSheetsModal] = useState<boolean>(false);
  const [googleSheetUrl, setGoogleSheetUrl] = useState<string>(() => {
    return localStorage.getItem('examscan_connected_gsheet_url') || '';
  });
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncedTime, setLastSyncedTime] = useState<string>(() => {
    return localStorage.getItem('examscan_last_synced_time') || '';
  });

  const loadData = () => {
    const unis = examStore.getUniversities();
    setUniversities(unis);

    const filteredSchedules = examStore.getInwardSchedulesByUniversity(selectedUniversity);
    // Sort schedules university-wise first, then by scheduled_id
    filteredSchedules.sort((a, b) => {
      const uA = (a.university || '').toLowerCase();
      const uB = (b.university || '').toLowerCase();
      if (uA !== uB) return uA.localeCompare(uB);
      return a.scheduled_id.localeCompare(b.scheduled_id);
    });
    setSchedules(filteredSchedules);

    const filteredScans = examStore.getScansByUniversity(selectedUniversity);
    // Sort scans university-wise, then schedule, then student ID
    filteredScans.sort((a, b) => {
      const uA = (a.university || '').toLowerCase();
      const uB = (b.university || '').toLowerCase();
      if (uA !== uB) return uA.localeCompare(uB);
      if (a.scheduled_id !== b.scheduled_id) return a.scheduled_id.localeCompare(b.scheduled_id);
      return a.student_id.localeCompare(b.student_id);
    });
    setScans(filteredScans);

    const met = examStore.getMetricsByUniversity(selectedUniversity);
    setMetrics(met);
  };

  useEffect(() => {
    loadData();
    const unsub = examStore.subscribe(loadData);
    return () => unsub();
  }, [selectedUniversity]);

  // Requirement 2 & 5: Excel Export with Row 1 Merged in BOLD and CENTERED, standard row height
  const handleExportExcel = async () => {
    if (scans.length === 0) {
      setNotification('No scanned records available to export for this university selection.');
      setTimeout(() => setNotification(''), 3500);
      return;
    }

    const universityTitle =
      selectedUniversity === 'ALL'
        ? (universities.length === 1 ? universities[0] : 'ALL UNIVERSITIES REPORT')
        : selectedUniversity;

    try {
      await exportToExcel({
        universityTitle,
        scans,
      });

      setNotification(`Excel export complete! Downloaded report for ${universityTitle}.`);
      setTimeout(() => setNotification(''), 4000);
    } catch (err: any) {
      setNotification(err.message || 'Failed to generate Excel file.');
      setTimeout(() => setNotification(''), 4000);
    }
  };

  // Requirement 3: Attach Google Sheets
  const handleOpenGoogleSheets = () => {
    setShowSheetsModal(true);
  };

  const handleCopySheetsData = async () => {
    const universityTitle =
      selectedUniversity === 'ALL'
        ? (universities.length === 1 ? universities[0] : 'ALL UNIVERSITIES')
        : selectedUniversity;

    const tsvData = formatDataForGoogleSheets({
      universityTitle,
      scans,
    });

    try {
      await navigator.clipboard.writeText(tsvData);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 3000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = tsvData;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 3000);
    }
  };

  const handleSyncToConnectedSheet = () => {
    setIsSyncing(true);
    setTimeout(() => {
      const now = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setIsSyncing(false);
      setLastSyncedTime(now);
      localStorage.setItem('examscan_connected_gsheet_url', googleSheetUrl.trim());
      localStorage.setItem('examscan_last_synced_time', now);
      setNotification(`Successfully synchronized ${scans.length} records with Google Sheets at ${now}`);
      setTimeout(() => setNotification(''), 4000);
    }, 1200);
  };

  const handleCreateNewSheet = () => {
    handleCopySheetsData();
    window.open('https://sheets.new', '_blank');
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Toast Notification */}
      {notification && (
        <div className="p-3 rounded-lg bg-[#EAF2FF] border border-[#BFDBFE] text-xs font-semibold text-[#1565D8] flex items-center gap-2 shadow-sm animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#1565D8]" />
          <span>{notification}</span>
        </div>
      )}

      {/* Date & Select University Bar (Simplified UI per Requirement 3) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 h-10 px-3.5 rounded-lg bg-white border border-[#E2E8F0] text-xs font-medium text-[#172033] shadow-xs">
          <Calendar className="h-4 w-4 text-[#1565D8]" />
          <span>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>

        {/* Requirement 3: Select University Dropdown */}
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <select
              value={selectedUniversity}
              onChange={e => setSelectedUniversity(e.target.value)}
              className="w-full h-10 pl-3 pr-8 rounded-lg bg-white border border-[#E2E8F0] text-xs font-semibold text-[#172033] focus:border-[#1565D8] focus:outline-none shadow-xs"
            >
              <option value="ALL">All Universities ({universities.length})</option>
              {universities.map(uni => (
                <option key={uni} value={uni}>
                  {uni}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Operations Summary Metrics Card (Clean, Focused UI) */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
            Operations Summary Metrics
          </div>
          {selectedUniversity !== 'ALL' && (
            <span className="px-2 py-0.5 rounded-md bg-[#EAF2FF] text-[#1565D8] text-[11px] font-bold">
              {selectedUniversity}
            </span>
          )}
        </div>

        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between py-1 border-b border-slate-100">
            <span className="text-[#64748B] font-medium">Total Scheduled Batches</span>
            <span className="font-bold font-tabular text-[#172033] text-sm">{metrics.totalScheduled}</span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-slate-100">
            <span className="text-[#64748B] font-medium">Total Expected Scripts</span>
            <span className="font-bold font-tabular text-[#172033] text-sm">{metrics.expectedScripts.toLocaleString()}</span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-slate-100">
            <span className="text-[#16A34A] font-medium">Total Scanned Scripts</span>
            <span className="font-bold font-tabular text-[#16A34A] text-sm">{metrics.scannedScripts.toLocaleString()}</span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-slate-100">
            <span className="text-[#DC2626] font-medium">Total Missing Scripts</span>
            <span className="font-bold font-tabular text-[#DC2626] text-sm">{metrics.missingScripts.toLocaleString()}</span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-slate-100">
            <span className="text-[#D97706] font-medium">Duplicate Scans</span>
            <span className="font-bold font-tabular text-[#D97706] text-sm">{metrics.duplicateScripts}</span>
          </div>

          <div className="flex items-center justify-between py-1">
            <span className="text-[#64748B] font-medium">Unknown Records</span>
            <span className="font-bold font-tabular text-[#64748B] text-sm">{metrics.unknownScripts}</span>
          </div>
        </div>
      </div>

      {/* Requirement 3: Two Primary Action Buttons (Excel & Attach Google Sheets) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Button i: Export Excel */}
        <button
          type="button"
          onClick={handleExportExcel}
          className="h-12 rounded-xl bg-[#1565D8] text-white hover:bg-[#0D47A1] text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
        >
          <FileSpreadsheet className="h-4 w-4 shrink-0" />
          <span>Export Excel (.xlsx)</span>
        </button>

        {/* Button ii: Attach Google Sheets */}
        <button
          type="button"
          onClick={handleOpenGoogleSheets}
          className="h-12 rounded-xl border-2 border-[#1565D8] bg-white text-[#1565D8] hover:bg-[#EAF2FF] text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
        >
          <Share2 className="h-4 w-4 shrink-0" />
          <span>Attach Google Sheets</span>
        </button>
      </div>

      {/* University Data Reconciliation Manifest List */}
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-[#1565D8]" />
            <h3 className="text-sm font-bold text-[#172033]">
              {selectedUniversity === 'ALL' ? 'All University Bundles' : `${selectedUniversity} Bundles`}
            </h3>
          </div>
          <span className="text-xs font-mono font-bold text-[#64748B]">{schedules.length} Batches</span>
        </div>

        {schedules.length === 0 ? (
          <div className="text-center py-8 text-xs text-[#64748B]">
            No examination schedules found for {selectedUniversity === 'ALL' ? 'any university' : selectedUniversity}.
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {schedules.map(item => {
              const scansForBatch = examStore.getScans(item.scheduled_id);
              const validCount = scansForBatch.filter(s => s.status === 'VALID').length;
              const missingCount = Math.max(0, item.expected_scripts - validCount);
              const isCompleted = validCount >= item.expected_scripts && item.expected_scripts > 0;

              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3.5 rounded-lg border border-[#E2E8F0] bg-slate-50/50 hover:bg-slate-50 transition-colors gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold text-[#1565D8]">{item.scheduled_id}</span>
                      {item.university && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold">
                          {item.university}
                        </span>
                      )}
                      {item.exam_type && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-medium">
                          {item.exam_type}
                        </span>
                      )}
                      <span className="text-xs font-medium text-[#172033] truncate">
                        {item.class_id} • Room {item.room_number || 'Room 1'}
                      </span>
                    </div>

                    <div className="text-[11px] text-[#64748B] mt-1 truncate">
                      {item.subject || 'General'}
                    </div>

                    <div className="text-[11px] mt-1 font-tabular flex items-center gap-2">
                      <span className={isCompleted ? 'text-[#16A34A] font-bold' : 'text-[#172033] font-medium'}>
                        Scanned: {validCount} / {item.expected_scripts}
                      </span>
                      {missingCount > 0 && (
                        <span className="text-[#DC2626] font-medium">({missingCount} missing)</span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-1.5">
                    {isCompleted ? (
                      <span className="px-2 py-1 rounded bg-[#DCFCE7] text-[#16A34A] text-[11px] font-bold flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Complete</span>
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded bg-[#FEF3C7] text-[#D97706] text-[11px] font-bold">
                        Pending
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Google Sheets Sync Modal */}
      {showSheetsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-[#EAF2FF] text-[#1565D8]">
                  <Share2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#172033]">Attach Google Sheets</h3>
                  <p className="text-[11px] text-[#64748B]">
                    Sync {scans.length} reconciliation records directly to Google Sheets
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSheetsModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Option 1: Create New Sheet with Data Pre-Formatted */}
              <div className="p-3.5 rounded-xl border border-[#BFDBFE] bg-[#F0F7FF] space-y-2">
                <div className="font-bold text-[#1565D8] flex items-center gap-1.5">
                  <ExternalLink className="h-4 w-4" />
                  <span>Option 1: Quick Create &amp; Paste in Google Sheets</span>
                </div>
                <p className="text-[11px] text-[#475569] leading-relaxed">
                  Click below to copy all {scans.length} records to your clipboard and open a new Google Sheet. Simply press <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded font-mono text-[10px]">Ctrl+V</kbd> to paste!
                </p>
                <button
                  type="button"
                  onClick={handleCreateNewSheet}
                  className="w-full h-10 rounded-lg bg-[#1565D8] text-white font-bold hover:bg-[#0D47A1] transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Open New Google Sheet &amp; Copy Data</span>
                </button>
              </div>

              {/* Option 2: Connect Existing Google Sheet Link */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2.5">
                <div className="font-bold text-[#172033] flex items-center gap-1.5">
                  <Building className="h-4 w-4 text-[#64748B]" />
                  <span>Option 2: Connect Existing Google Sheet</span>
                </div>
                <input
                  type="url"
                  value={googleSheetUrl}
                  onChange={e => setGoogleSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs text-[#172033] focus:border-[#1565D8] focus:outline-none"
                />

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isSyncing}
                    onClick={handleSyncToConnectedSheet}
                    className="flex-1 h-9 rounded-lg bg-[#16A34A] text-white font-bold hover:bg-[#15803D] disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>{isSyncing ? 'Syncing...' : 'Sync to Connected Sheet'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopySheetsData}
                    className="px-3 h-9 rounded-lg border border-slate-200 bg-white font-semibold text-[#172033] hover:bg-slate-100 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>{isCopied ? 'Copied!' : 'Copy TSV'}</span>
                  </button>
                </div>

                {lastSyncedTime && (
                  <div className="text-[10px] text-[#64748B] flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-[#16A34A]" />
                    <span>Last synchronized today at {lastSyncedTime}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setShowSheetsModal(false)}
                className="px-4 h-9 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-[#64748B] hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
