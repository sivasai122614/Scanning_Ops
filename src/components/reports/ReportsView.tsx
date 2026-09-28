// ==============================================================================
// ExamScan — Reports & Export View (Sections 15, 16, 17, 35, 36)
// Requirements:
// 1. Mandatory University Selection before export.
// 2. Clear error state if no university is selected:
//    "SELECT UNIVERSITY - Please select a College/University before exporting the report."
// 3. Exact 3-Sheet Excel Export:
//    Sheet 1: Scanned Data (finalized records from saved_scanned_data)
//    Sheet 2: Not Scanned Data (import_inwarded_data MINUS saved_scanned_data)
//    Sheet 3: Class Wise Data (One row per Class ID with real progress)
// 4. Filename: ExamScan_{University_Name}_{YYYY-MM-DD}.xlsx (sanitized)
// ==============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  FileSpreadsheet,
  Download,
  Calendar,
  Building,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Layers,
  ArrowDownToLine,
  Check,
  Search,
} from 'lucide-react';
import { importedService } from '../../services/importedService';

export const ReportsView: React.FC = () => {
  const [universities, setUniversities] = useState<string[]>([]);
  // Default to active university if available, or empty string
  const [selectedUniversity, setSelectedUniversity] = useState<string>('');
  const [selectUniversityError, setSelectUniversityError] = useState<boolean>(false);
  const [exportNotification, setExportNotification] = useState<string | null>(null);

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
    if (currentUni) {
      const s = importedService.getDashboardStats(currentUni);
      setStats(s);
    }
  }, [selectedUniversity]);

  useEffect(() => {
    loadData();
    const unsub = importedService.subscribe(loadData);
    return () => unsub();
  }, [loadData]);

  // Handle Export Excel per Section 15 & 16
  const handleExportExcel = async () => {
    if (!selectedUniversity || selectedUniversity === '-- Select College / University --') {
      setSelectUniversityError(true);
      return;
    }

    setSelectUniversityError(false);

    try {
      const res = await importedService.exportUniversityExcel(selectedUniversity);
      if (res.success) {
        setExportNotification(`Exported 3-sheet report: ${res.filename} (${res.scannedCount} scanned, ${res.notScannedCount} not scanned)`);
        setTimeout(() => setExportNotification(null), 5000);
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to export report');
    }
  };

  const bundles = importedService.getClassBundles();

  return (
    <div className="space-y-4 font-sans max-w-5xl mx-auto pb-24">
      {/* Toast Notification */}
      {exportNotification && (
        <div className="p-3 bg-[#DCFCE7] border border-[#86EFAC] text-[#166534] text-xs font-bold rounded-xl flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#16A34A]" />
            <span>{exportNotification}</span>
          </div>
          <span className="text-[10px] uppercase font-bold text-[#15803D] bg-white px-2 py-0.5 rounded border border-[#86EFAC]">
            3 Sheets Generated
          </span>
        </div>
      )}

      {/* SECTION 15: MANDATORY UNIVERSITY SELECTION & EXPORT TOOLBAR */}
      <div className="bg-white border border-[#CBD5E1] rounded-xl shadow-xs p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center bg-[#1565D8]/10 text-[#1565D8] rounded-xl shrink-0">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
              Institutional Reconciliation
            </div>
            <h1 className="text-base font-bold text-[#172033]">
              AUDIT &amp; EXPORT REPORTS
            </h1>
          </div>
        </div>

        {/* SECTION 15: SELECT UNIVERSITY DROPDOWN & EXPORT BUTTON */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-bold text-[#64748B] uppercase tracking-wider whitespace-nowrap">
              SELECT UNIVERSITY:
            </label>
            <div className="relative">
              <select
                value={selectedUniversity}
                onChange={e => {
                  setSelectedUniversity(e.target.value);
                  if (e.target.value) setSelectUniversityError(false);
                }}
                className={`h-9 pl-3 pr-8 text-xs font-bold rounded-lg border bg-white text-[#172033] focus:outline-hidden focus:border-[#1565D8] ${
                  selectUniversityError ? 'border-[#EF4444] bg-red-50/20' : 'border-[#CBD5E1]'
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
          </div>

          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-black uppercase tracking-wider rounded-lg transition-colors shadow-xs cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span>EXPORT EXCEL</span>
          </button>
        </div>
      </div>

      {/* SECTION 15: NO UNIVERSITY SELECTED ERROR MODAL */}
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

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 border border-[#CBD5E1] rounded-xl shadow-xs">
          <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
            TOTAL CLASSES
          </div>
          <div className="text-2xl font-black text-[#172033] font-tabular mt-1">
            {stats.totalClasses}
          </div>
          <div className="text-[11px] text-[#64748B] mt-0.5">Classes in Scope</div>
        </div>

        <div className="bg-white p-3.5 border border-[#CBD5E1] rounded-xl shadow-xs">
          <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
            EXPECTED BOOKLETS
          </div>
          <div className="text-2xl font-black text-[#172033] font-tabular mt-1">
            {stats.expectedBooklets}
          </div>
          <div className="text-[11px] text-[#64748B] mt-0.5">from import_inwarded_data</div>
        </div>

        <div className="bg-white p-3.5 border border-[#BFDBFE] rounded-xl shadow-xs bg-[#F8FAFC]">
          <div className="text-[11px] font-bold text-[#1565D8] uppercase tracking-wider">
            SCANNED (SAVED)
          </div>
          <div className="text-2xl font-black text-[#1565D8] font-tabular mt-1">
            {stats.scannedBooklets}
          </div>
          <div className="text-[11px] text-[#1565D8] mt-0.5 font-medium">from saved_scanned_data</div>
        </div>

        <div className="bg-white p-3.5 border border-[#CBD5E1] rounded-xl shadow-xs">
          <div className="text-[11px] font-bold text-[#DC2626] uppercase tracking-wider">
            NOT SCANNED
          </div>
          <div className="text-2xl font-black text-[#DC2626] font-tabular mt-1">
            {stats.notScannedBooklets}
          </div>
          <div className="text-[11px] text-[#DC2626] mt-0.5 font-medium">Expected - Saved</div>
        </div>
      </div>

      {/* SECTION 16: THREE-SHEET ARCHITECTURE SPECIFICATION BANNER */}
      <div className="bg-white border border-[#CBD5E1] rounded-xl p-4 shadow-xs space-y-2">
        <div className="text-xs font-bold uppercase tracking-wider text-[#172033] flex items-center gap-2">
          <Check className="h-4 w-4 text-[#16A34A]" />
          <span>Excel Export Specification (3 Distinct Sheets):</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div className="p-2.5 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg">
            <div className="font-bold text-[#166534]">Sheet 1: Scanned Data</div>
            <div className="text-[11px] text-[#15803D] mt-0.5">
              Successfully saved scanned records with Class ID, Member ID, Scanned By, Scanned Time, Saved By, Saved Time.
            </div>
          </div>
          <div className="p-2.5 bg-[#FEF2F2] border border-[#FECACA] rounded-lg">
            <div className="font-bold text-[#991B1B]">Sheet 2: Not Scanned Data</div>
            <div className="text-[11px] text-[#B91C1C] mt-0.5">
              Imported expected records that have NOT been saved. Status: NOT SCANNED.
            </div>
          </div>
          <div className="p-2.5 bg-[#EFF6FF] border border-[#BFDBFE] rounded-lg">
            <div className="font-bold text-[#1E40AF]">Sheet 3: Class Wise Data</div>
            <div className="text-[11px] text-[#3B82F6] mt-0.5">
              One row per Class ID with Expected, Scanned, Not Scanned, Progress %, and Status.
            </div>
          </div>
        </div>
      </div>

      {/* Class Wise Live Summary Table (Matches Sheet 3) */}
      <div className="bg-white border border-[#CBD5E1] rounded-xl shadow-xs overflow-hidden">
        <div className="p-3.5 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-[#172033]">
            CLASS-WISE BREAKDOWN — {selectedUniversity || 'All Imported'}
          </h2>
          <span className="text-[10px] text-[#64748B] font-medium">
            Calculated from database records
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-tabular">
            <thead className="bg-slate-50 border-b border-slate-200 text-[#64748B] uppercase text-[10px] font-bold">
              <tr>
                <th className="py-2.5 px-4">Class ID</th>
                <th className="py-2.5 px-4 text-center">Expected</th>
                <th className="py-2.5 px-4 text-center">Scanned (Saved)</th>
                <th className="py-2.5 px-4 text-center">Not Scanned</th>
                <th className="py-2.5 px-4 text-center">Progress</th>
                <th className="py-2.5 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bundles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#64748B]">
                    No class records found. Please import your Excel data first.
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
