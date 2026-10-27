// ==============================================================================
// ExamScan — Manual Inward Entries Modal & Date Filter View
// Realtime inspection of public.manual_inward_data table
// Displays:
//   i. Scanned By
//   ii. Class ID
//   iii. Member ID
//   iv. Date and Time
// Supports Date Range Filtering (e.g. 1-10-26 to 5-10-26), Search, and Export
// ==============================================================================

import React, { useState, useMemo } from 'react';
import {
  X,
  Calendar,
  Search,
  Download,
  Filter,
  User,
  Hash,
  Clock,
  RotateCcw,
  CheckCircle,
  FileSpreadsheet,
} from 'lucide-react';
import { importedService, ManualInwardedRecord } from '../../services/importedService';

interface ManualInwardModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultStartDate?: string;
  defaultEndDate?: string;
}

export const ManualInwardModal: React.FC<ManualInwardModalProps> = ({
  isOpen,
  onClose,
  defaultStartDate = '',
  defaultEndDate = '',
}) => {
  const [startDate, setStartDate] = useState<string>(defaultStartDate);
  const [endDate, setEndDate] = useState<string>(defaultEndDate);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Pull records from importedService
  const records: ManualInwardedRecord[] = useMemo(() => {
    return importedService.getManualInwardRecords();
  }, [isOpen]);

  // Filter records by Date Range and Search Query
  const filteredRecords = useMemo(() => {
    let result = [...records];

    if (startDate) {
      const startMs = new Date(`${startDate}T00:00:00`).getTime();
      result = result.filter(r => {
        const time = new Date(r.scanned_at || r.created_at).getTime();
        return !isNaN(time) && time >= startMs;
      });
    }

    if (endDate) {
      const endMs = new Date(`${endDate}T23:59:59.999`).getTime();
      result = result.filter(r => {
        const time = new Date(r.scanned_at || r.created_at).getTime();
        return !isNaN(time) && time <= endMs;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(r => {
        const mid = (r.member_id || r.roll_number || '').toLowerCase();
        const cid = (r.class_id || '').toLowerCase();
        const by = (r.inwarded_by || '').toLowerCase();
        const barcode = (r.booklet_barcode || '').toLowerCase();
        return mid.includes(q) || cid.includes(q) || by.includes(q) || barcode.includes(q);
      });
    }

    result.sort((a, b) => {
      const timeA = new Date(a.scanned_at || a.created_at).getTime();
      const timeB = new Date(b.scanned_at || b.created_at).getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });

    return result;
  }, [records, startDate, endDate, searchQuery, sortOrder]);

  if (!isOpen) return null;

  // Format date helper
  const formatDateTime = (rawIso?: string) => {
    if (!rawIso) return '—';
    try {
      const d = new Date(rawIso);
      if (isNaN(d.getTime())) return rawIso;
      return d.toLocaleDateString('en-US', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    } catch {
      return rawIso;
    }
  };

  // Quick Preset Helper
  const applyPreset = (preset: 'all' | 'today' | 'oct_example') => {
    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'today') {
      const today = new Date().toISOString().split('T')[0];
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'oct_example') {
      setStartDate('2026-10-01');
      setEndDate('2026-10-05');
    }
  };

  // Export filtered manual records to CSV
  const exportToCSV = () => {
    if (filteredRecords.length === 0) return;
    const headers = ['Scanned By', 'Class ID', 'Member ID', 'Booklet Barcode', 'Date & Time', 'Status'];
    const rows = filteredRecords.map(r => [
      `"${r.inwarded_by || 'Manual Inward'}"`,
      `"${r.class_id}"`,
      `"${r.member_id || r.roll_number || ''}"`,
      `"${r.booklet_barcode || ''}"`,
      `"${r.scanned_at || r.created_at}"`,
      `"${r.status || 'inwarded'}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `manual_inward_records_${startDate || 'all'}_to_${endDate || 'all'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-[#CBD5E1] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* 1. Modal Header */}
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFC]">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#1565D8]">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[#172033] leading-tight">
                Manual Inward Records
              </h2>
              <p className="text-[11px] text-[#64748B] font-medium">
                Live entries synchronized from <code className="text-[#1565D8] font-bold">public.manual_inward_data</code>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportToCSV}
              disabled={filteredRecords.length === 0}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] text-[#172033] text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              title="Download CSV"
            >
              <Download className="h-3.5 w-3.5 text-[#1565D8]" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-lg bg-white border border-[#CBD5E1] hover:bg-slate-100 flex items-center justify-center text-[#64748B] hover:text-[#172033] transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 2. Controls & Date Sorting Filter Bar */}
        <div className="p-4 bg-white border-b border-[#E2E8F0] space-y-3">
          {/* Date Range Inputs & Presets */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-[#64748B] flex items-center gap-1 uppercase tracking-wider text-[10px]">
                <Filter className="h-3.5 w-3.5 text-[#1565D8]" />
                Date Range:
              </span>
              <div className="flex items-center gap-1 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-2 py-1">
                <span className="text-[11px] text-[#64748B] font-medium">From:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-[#172033] focus:outline-hidden"
                />
              </div>
              <div className="flex items-center gap-1 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-2 py-1">
                <span className="text-[11px] text-[#64748B] font-medium">To:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-[#172033] focus:outline-hidden"
                />
              </div>

              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-[#475569] text-[11px] font-semibold rounded-md flex items-center gap-1 transition-colors cursor-pointer"
                  title="Clear dates"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-[#64748B] font-medium">Presets:</span>
              <button
                type="button"
                onClick={() => applyPreset('today')}
                className="px-2 py-1 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#1E293B] font-bold rounded-md transition-colors cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => applyPreset('oct_example')}
                className="px-2 py-1 bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#1D4ED8] font-bold rounded-md transition-colors cursor-pointer"
                title="Example: 01-10-2026 to 05-10-2026"
              >
                1-10-26 to 5-10-26
              </button>
              <button
                type="button"
                onClick={() => applyPreset('all')}
                className="px-2 py-1 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#1E293B] font-bold rounded-md transition-colors cursor-pointer"
              >
                All Dates
              </button>
            </div>
          </div>

          {/* Search Box & Sort Toggle */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94A3B8]" />
              <input
                type="text"
                placeholder="Search Class ID, Member ID, or Operator..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-xs font-medium text-[#172033] placeholder:text-[#94A3B8] focus:bg-white focus:border-[#1565D8] focus:outline-hidden"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="text-xs text-[#64748B] font-medium font-tabular">
                Showing <strong className="text-[#172033] font-black">{filteredRecords.length}</strong> entries
              </div>
              <button
                type="button"
                onClick={() => setSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'))}
                className="px-2.5 py-1 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-xs font-semibold text-[#172033] hover:bg-slate-100 transition-colors flex items-center gap-1 cursor-pointer"
                title="Toggle Sort Order"
              >
                <Clock className="h-3.5 w-3.5 text-[#1565D8]" />
                <span>{sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* 3. Authoritative Manual Inward Table */}
        <div className="flex-1 overflow-y-auto">
          {filteredRecords.length === 0 ? (
            <div className="py-16 text-center px-4">
              <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                <FileSpreadsheet className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-[#172033]">No manual entries found</h3>
              <p className="text-xs text-[#64748B] mt-1 max-w-md mx-auto">
                {startDate || endDate || searchQuery
                  ? 'No records match the selected date range or search filter. Try clearing filters.'
                  : 'No manual inward records have been entered into public.manual_inward_data yet.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-[#F8FAFC] text-[11px] font-bold text-[#64748B] uppercase tracking-wider border-b border-[#E2E8F0] sticky top-0 z-10 shadow-2xs">
                <tr>
                  <th className="py-3 px-4">i. Scanned By</th>
                  <th className="py-3 px-4">ii. Class ID</th>
                  <th className="py-3 px-4">iii. Member ID</th>
                  <th className="py-3 px-4">iv. Date &amp; Time</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {filteredRecords.map((r, index) => (
                  <tr key={r.id || index} className="hover:bg-blue-50/40 transition-colors">
                    {/* i. Scanned By */}
                    <td className="py-3 px-4 font-semibold text-[#172033] whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[#1565D8] shrink-0">
                          <User className="h-3.5 w-3.5" />
                        </div>
                        <span className="font-bold">{r.inwarded_by || 'Manual Inward'}</span>
                      </div>
                    </td>

                    {/* ii. Class ID */}
                    <td className="py-3 px-4 font-mono font-black text-xs text-[#1565D8]">
                      {r.class_id}
                    </td>

                    {/* iii. Member ID */}
                    <td className="py-3 px-4 font-mono font-bold text-xs text-[#172033]">
                      {r.member_id || r.roll_number || '—'}
                    </td>

                    {/* iv. Date & Time */}
                    <td className="py-3 px-4 text-[#64748B] font-medium font-tabular whitespace-nowrap">
                      {formatDateTime(r.scanned_at || r.created_at)}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <CheckCircle className="h-3 w-3" />
                        <span>Manual Inward</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 4. Modal Footer */}
        <div className="px-5 py-3 border-t border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between text-xs">
          <div className="text-[#64748B]">
            Total Manual Inward Records: <strong className="text-[#172033]">{records.length}</strong>
            {records.length !== filteredRecords.length && (
              <span className="ml-1 text-[#1565D8]">({filteredRecords.length} filtered)</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[#172033] hover:bg-black text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
