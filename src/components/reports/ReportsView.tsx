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
    <div className="space-y-6 font-sans w-full pb-20">
      {/* Embedded High-Performance Wave Animation Keyframes */}
      <style>{`
        @keyframes report-sine-1 {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes report-sine-2 {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
        @keyframes report-wave-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes report-pulse-ring {
          0% { transform: scale(0.8); opacity: 0.85; }
          100% { transform: scale(2.6); opacity: 0; }
        }
        .anim-report-sine-1 {
          animation: report-sine-1 14s linear infinite;
        }
        .anim-report-sine-2 {
          animation: report-sine-2 20s linear infinite;
        }
        .anim-report-liquid {
          background-size: 250% 250%;
          animation: report-wave-shift 4s ease infinite;
        }
        .anim-report-pulse {
          animation: report-pulse-ring 2.4s cubic-bezier(0.15, 0.85, 0.35, 1) infinite;
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

      {/* SECTION 15: BREATHTAKING HERO SINE WAVE AUDIT & EXPORT BANNER */}
      <div className="relative overflow-hidden rounded-2xl border border-[#CBD5E1] bg-gradient-to-r from-blue-900 via-[#1565D8] to-indigo-900 p-5 sm:p-7 text-white shadow-md">
        {/* Animated Background Sine Wave Layers */}
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
              Comprehensive campus reconciliation report containing 3 distinct sheets: Scanned (Saved), Not Scanned (Missing), and Class-Wise intake progress.
            </p>
          </div>

          {/* Controls: Select University & Export Excel */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/20 shadow-inner">
            <div className="flex items-center gap-2">
              <Building className="h-4 w-4 text-cyan-300 shrink-0" />
              <select
                value={selectedUniversity}
                onChange={e => {
                  setSelectedUniversity(e.target.value);
                  if (e.target.value) setSelectUniversityError(false);
                }}
                className={`h-10 pl-3 pr-8 text-xs font-bold rounded-xl border bg-white text-[#172033] focus:outline-hidden focus:ring-2 focus:ring-cyan-300 shadow-sm ${
                  selectUniversityError ? 'border-red-400 bg-red-50 text-red-900' : 'border-white/40'
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

            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer"
            >
              <Download className="h-4 w-4" />
              <span>EXPORT 3-SHEET EXCEL</span>
            </button>
          </div>
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

      {/* Enlarged Statistics KPI Cards Grid (Generous Padding to Fill Screen) */}
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
          <div className="absolute top-3 right-3 flex h-3 w-3">
            <span className="anim-report-pulse absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-[#1565D8]" />
          </div>
          <div className="text-xs font-bold text-[#1565D8] uppercase tracking-wider">
            SCANNED (SAVED)
          </div>
          <div className="text-4xl sm:text-5xl font-black text-[#1565D8] font-tabular mt-2.5">
            {stats.scannedBooklets}
          </div>
          <div className="text-xs text-[#1565D8] mt-1.5 font-semibold">Saved &amp; Finalized</div>
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

      {/* Today's Overall Progress Card with Liquid Wave */}
      <div className="bg-white p-6 sm:p-7 border border-[#CBD5E1] rounded-2xl shadow-xs hover:shadow-sm transition-all duration-200 w-full">
        <div className="flex items-center justify-between">
          <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#172033]">
            Campus Inward Completion Rate
          </span>
          <span className="text-lg sm:text-xl font-black font-tabular text-[#16A34A]">{stats.completionPercentage}%</span>
        </div>

        <div className="mt-3.5 h-4 sm:h-5 w-full bg-slate-100 overflow-hidden rounded-full border border-slate-200 relative p-0.5 shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-blue-600 via-cyan-400 via-blue-500 to-emerald-500 anim-report-liquid transition-all duration-500 ease-out rounded-full shadow-xs"
            style={{ width: `${Math.max(stats.completionPercentage > 0 ? 4 : 0, Math.min(100, stats.completionPercentage))}%` }}
          />
        </div>

        <div className="mt-3 text-xs font-tabular text-[#64748B] flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong className="text-[#172033] font-black text-sm">{stats.scannedBooklets}</strong> / {stats.expectedBooklets} total scripts inwarded
          </span>
          <span className="text-xs font-bold text-[#1565D8]">
            {stats.totalClasses} classes registered for {stats.universityName || 'campus'}
          </span>
        </div>
      </div>

      {/* SECTION 16: THREE-SHEET ARCHITECTURE SPECIFICATION BANNER */}
      <div className="bg-white border border-[#CBD5E1] rounded-2xl p-5 sm:p-6 shadow-xs space-y-3">
        <div className="text-xs font-black uppercase tracking-wider text-[#172033] flex items-center gap-2">
          <Check className="h-4 w-4 text-[#16A34A] stroke-[3]" />
          <span>Excel Export Specification (3 Distinct Institutional Sheets):</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl">
            <div className="font-bold text-[#166534] text-xs">Sheet 1: Scanned Data</div>
            <div className="text-xs text-[#15803D] mt-1 leading-relaxed">
              Successfully saved and verified inward records with Class ID, Member ID, Scanned By, Scanned Time, Saved By, Saved Time.
            </div>
          </div>
          <div className="p-3.5 bg-[#FEF2F2] border border-[#FECACA] rounded-xl">
            <div className="font-bold text-[#991B1B] text-xs">Sheet 2: Not Scanned Data</div>
            <div className="text-xs text-[#B91C1C] mt-1 leading-relaxed">
              Imported baseline records that have NOT been saved during scanning sessions. Status: NOT SCANNED.
            </div>
          </div>
          <div className="p-3.5 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl">
            <div className="font-bold text-[#1E40AF] text-xs">Sheet 3: Class Wise Data</div>
            <div className="text-xs text-[#3B82F6] mt-1 leading-relaxed">
              Consolidated per-class intake totals with Expected, Scanned, Not Scanned, Progress %, and Completion Status.
            </div>
          </div>
        </div>
      </div>

      {/* Class Wise Live Summary Table (Matches Sheet 3) */}
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
