// ==============================================================================
// Session Summary & Final Reconciliation View (Section 18 Recommendation)
// Provides a single final reconciliation screen before closing the session:
// Total Classes / Completed / Partial / Not Started / Total Expected / Total Received / Total Missing
// ==============================================================================

import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Scan,
  Download,
  X,
  Building,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import {
  importedService,
  SessionSummary,
  ClassBundle,
} from '../../services/importedService';

interface SessionSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectClass: (classId: string) => void;
}

export const SessionSummaryModal: React.FC<SessionSummaryModalProps> = ({
  isOpen,
  onClose,
  onSelectClass,
}) => {
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const loadData = () => {
    const s = importedService.getSessionSummary();
    setSummary(s);
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      const unsub = importedService.subscribe(loadData);
      return () => unsub();
    }
  }, [isOpen]);

  if (!isOpen || !summary) return null;

  const handleExport = () => {
    const res = importedService.exportClassWiseExcel();
    if (res.success) {
      setExportMessage(`Successfully exported ${res.filename} with reconciliation data!`);
      setTimeout(() => setExportMessage(null), 4000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-5 font-sans overflow-y-auto">
      <div className="w-full max-w-4xl bg-white border border-[#CBD5E1] shadow-2xl flex flex-col max-h-[94vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-[#1565D8] text-white">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-6 w-6" />
            <div>
              <div className="text-xs uppercase tracking-wider text-white/80 font-medium">
                Final Session Reconciliation
              </div>
              <h2 className="text-lg font-bold">Scanning Session Summary — {summary.universityName}</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-white/20 transition-colors text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 bg-[#F8FAFC]">
          {/* Export Notification */}
          {exportMessage && (
            <div className="p-3 bg-[#DCFCE7] border border-[#86EFAC] text-[#166534] text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{exportMessage}</span>
            </div>
          )}

          {/* Top KPI Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-3.5 border border-[#CBD5E1]">
              <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Total Classes</div>
              <div className="text-2xl font-black text-[#172033] font-tabular mt-1">{summary.totalClasses}</div>
              <div className="text-[11px] text-[#64748B] mt-0.5">
                {summary.completedClasses} Done • {summary.partialClasses} Partial • {summary.notStartedClasses} Unstarted
              </div>
            </div>

            <div className="bg-white p-3.5 border border-[#CBD5E1]">
              <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Total Expected</div>
              <div className="text-2xl font-black text-[#172033] font-tabular mt-1">{summary.totalExpected}</div>
              <div className="text-[11px] text-[#64748B] mt-0.5">Imported from Excel</div>
            </div>

            <div className="bg-white p-3.5 border border-[#BFDBFE]">
              <div className="text-[11px] font-bold text-[#1565D8] uppercase tracking-wider">Total Received</div>
              <div className="text-2xl font-black text-[#1565D8] font-tabular mt-1">{summary.totalReceived}</div>
              <div className="text-[11px] text-[#1565D8] mt-0.5 font-medium">Verified Inwarded</div>
            </div>

            <div className="bg-white p-3.5 border border-[#FECACA]">
              <div className="text-[11px] font-bold text-[#DC2626] uppercase tracking-wider">Total Missing</div>
              <div className="text-2xl font-black text-[#DC2626] font-tabular mt-1">{summary.totalMissing}</div>
              <div className="text-[11px] text-[#DC2626] mt-0.5 font-medium">Pending Reconciliation</div>
            </div>
          </div>

          {/* Overall Completion Progress */}
          <div className="bg-white p-4 border border-[#CBD5E1]">
            <div className="flex items-center justify-between text-xs font-bold mb-2">
              <span className="text-[#64748B] uppercase tracking-wider">Overall Session Completion</span>
              <span className="text-[#172033] font-black font-tabular text-sm">
                {summary.totalReceived} / {summary.totalExpected} Booklets ({summary.overallCompletion}%)
              </span>
            </div>
            <div className="h-3 w-full bg-slate-100 overflow-hidden border border-[#CBD5E1]">
              <div
                className={`h-full transition-all duration-300 ${
                  summary.overallCompletion === 100 ? 'bg-[#16A34A]' : 'bg-[#1565D8]'
                }`}
                style={{ width: `${Math.min(100, summary.overallCompletion)}%` }}
              />
            </div>
          </div>

          {/* Class-wise Reconciliation Table */}
          <div className="bg-white border border-[#CBD5E1] overflow-hidden">
            <div className="px-4 py-3 bg-[#F1F5F9] border-b border-[#E2E8F0] flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#172033]">
                Class-by-Class Reconciliation Status
              </span>
              <span className="text-[11px] text-[#64748B] font-medium font-tabular">
                {summary.bundles.length} Registered Classes
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] uppercase tracking-wider text-[#64748B]">
                    <th className="py-2.5 px-3 font-bold">Class ID</th>
                    <th className="py-2.5 px-3 font-bold">Expected</th>
                    <th className="py-2.5 px-3 font-bold">Received</th>
                    <th className="py-2.5 px-3 font-bold">Missing</th>
                    <th className="py-2.5 px-3 font-bold">Progress</th>
                    <th className="py-2.5 px-3 font-bold">Status</th>
                    <th className="py-2.5 px-3 font-bold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] text-xs">
                  {summary.bundles.map(b => (
                    <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-[#172033] font-mono">{b.classId}</td>
                      <td className="py-2.5 px-3 font-tabular text-[#64748B]">{b.expectedCount}</td>
                      <td className="py-2.5 px-3 font-tabular font-bold text-[#1565D8]">{b.receivedCount}</td>
                      <td className="py-2.5 px-3 font-tabular font-bold text-[#DC2626]">{b.missingCount}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full ${b.status === 'COMPLETED' ? 'bg-[#16A34A]' : 'bg-[#1565D8]'}`}
                              style={{ width: `${Math.min(100, b.progressPercentage)}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-tabular font-medium text-[#64748B]">
                            {b.progressPercentage}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        {b.status === 'COMPLETED' && (
                          <span className="px-2 py-0.5 bg-[#DCFCE7] text-[#166534] border border-[#86EFAC] text-[10px] font-bold uppercase tracking-wider">
                            COMPLETED
                          </span>
                        )}
                        {b.status === 'PARTIAL / SAVED' && (
                          <span className="px-2 py-0.5 bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] text-[10px] font-bold uppercase tracking-wider">
                            PARTIAL / SAVED
                          </span>
                        )}
                        {b.status === 'IN PROGRESS' && (
                          <span className="px-2 py-0.5 bg-[#EAF2FF] text-[#1565D8] border border-[#BFDBFE] text-[10px] font-bold uppercase tracking-wider">
                            IN PROGRESS
                          </span>
                        )}
                        {b.status === 'NOT STARTED' && (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-300 text-[10px] font-bold uppercase tracking-wider">
                            NOT STARTED
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onSelectClass(b.classId);
                          }}
                          className="px-2.5 py-1 bg-white border border-[#CBD5E1] text-[#1565D8] text-[11px] font-bold uppercase tracking-wider hover:bg-[#EAF2FF] transition-colors"
                        >
                          View Bundle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-white border-t border-[#CBD5E1] flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleExport}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-[#16A34A] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#15803D] transition-colors"
          >
            <Download className="h-4 w-4" />
            <span>Export Reconciliation Excel</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#0D47A1] transition-colors"
          >
            Close Summary
          </button>
        </div>
      </div>
    </div>
  );
};
