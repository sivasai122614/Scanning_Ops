// ==============================================================================
// Excel Date Mapper - Complete Client-Side 4-Step Module
// Matches Step 0 (Target) GROUP NAMES against Step 1 (Reference) Participant Group Names
// Extracts calendar dates without UTC shift, handles duplicates/conflicts, and generates
// downloadable step_0_with_dates.xlsx + Issues Report.
// 100% Client-side: Zero Supabase writes, Zero external API calls.
// ==============================================================================

import React, { useState, useRef, useMemo, useCallback } from 'react';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  RotateCcw,
  RefreshCw,
  Search,
  Filter,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Layers,
  FileCheck,
  AlertCircle,
  ShieldCheck,
  Calendar,
  X,
  FileText,
  HelpCircle,
} from 'lucide-react';
import {
  matchExcelDateRecords,
  generateUpdatedStep0Workbook,
  generateIssuesReportExcel,
  getWorkbookSheetNames,
  DateMapperResult,
  MatchedRowResult,
  Step1GroupRecord,
} from '../../utils/dateMapperEngine';

export const ExcelDateMapperView: React.FC = () => {
  // Step 0 File State
  const [step0File, setStep0File] = useState<File | null>(null);
  const [step0Sheets, setStep0Sheets] = useState<string[]>([]);
  const [step0SelectedSheet, setStep0SelectedSheet] = useState<string>('');
  const [isStep0Dragging, setIsStep0Dragging] = useState<boolean>(false);
  const step0InputRef = useRef<HTMLInputElement | null>(null);

  // Step 1 File State
  const [step1File, setStep1File] = useState<File | null>(null);
  const [step1Sheets, setStep1Sheets] = useState<string[]>([]);
  const [step1SelectedSheet, setStep1SelectedSheet] = useState<string>('');
  const [isStep1Dragging, setIsStep1Dragging] = useState<boolean>(false);
  const step1InputRef = useRef<HTMLInputElement | null>(null);

  // Processing & Matching State
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [processingStatusText, setProcessingStatusText] = useState<string>('');
  const [matchResult, setMatchResult] = useState<DateMapperResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Overwrite Modal State for Existing DATE Column in Step 0
  const [showOverwriteModal, setShowOverwriteModal] = useState<boolean>(false);
  const [overwriteExistingDate, setOverwriteExistingDate] = useState<boolean>(false);

  // Download States
  const [isDownloadingUpdated, setIsDownloadingUpdated] = useState<boolean>(false);
  const [isDownloadingIssues, setIsDownloadingIssues] = useState<boolean>(false);
  const [downloadSuccessToast, setDownloadSuccessToast] = useState<string | null>(null);

  // Preview Filter & Pagination State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'MATCHED' | 'UNMATCHED' | 'CONFLICT' | 'INVALID_DATE'>('ALL');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Conflict Details Modal State
  const [inspectingConflict, setInspectingConflict] = useState<Step1GroupRecord | null>(null);

  // Helper to format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  // --------------------------------------------------------------------------
  // File Upload Handlers with Duplicate File Prevention
  // --------------------------------------------------------------------------
  const handleStep0FileSelected = async (file: File) => {
    setErrorMessage(null);
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setErrorMessage(`Invalid file format for "${file.name}". Please upload an Excel workbook (.xlsx or .xls).`);
      return;
    }

    // Check if the exact same file is selected as Step 1
    if (step1File && step1File.name === file.name && step1File.size === file.size && step1File.lastModified === file.lastModified) {
      setErrorMessage(
        `DUPLICATE FILE DETECTED: You cannot upload the exact same file for both Step 0 and Step 1. "${file.name}" is already selected as Step 1 Reference File.`
      );
      return;
    }

    try {
      const sheets = await getWorkbookSheetNames(file);
      setStep0File(file);
      setStep0Sheets(sheets);
      setStep0SelectedSheet(sheets[0] || 'Sheet1');
      setMatchResult(null); // Reset previous match if file changed
    } catch (err: any) {
      setErrorMessage(`Failed to read "${file.name}": ${err?.message || 'Invalid or corrupted Excel file.'}`);
    }
  };

  const handleStep1FileSelected = async (file: File) => {
    setErrorMessage(null);
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setErrorMessage(`Invalid file format for "${file.name}". Please upload an Excel workbook (.xlsx or .xls).`);
      return;
    }

    // Check if the exact same file is selected as Step 0
    if (step0File && step0File.name === file.name && step0File.size === file.size && step0File.lastModified === file.lastModified) {
      setErrorMessage(
        `DUPLICATE FILE DETECTED: You cannot upload the exact same file for both Step 0 and Step 1. "${file.name}" is already selected as Step 0 Target File.`
      );
      return;
    }

    try {
      const sheets = await getWorkbookSheetNames(file);
      setStep1File(file);
      setStep1Sheets(sheets);
      setStep1SelectedSheet(sheets[0] || 'Sheet1');
      setMatchResult(null);
    } catch (err: any) {
      setErrorMessage(`Failed to read "${file.name}": ${err?.message || 'Invalid or corrupted Excel file.'}`);
    }
  };

  // --------------------------------------------------------------------------
  // Execute Validation & Matching
  // --------------------------------------------------------------------------
  const handleValidateAndMatch = async () => {
    if (!step0File || !step1File) {
      setErrorMessage('Please upload both Step 0 Target File and Step 1 Reference File before matching.');
      return;
    }

    setErrorMessage(null);
    setIsProcessing(true);
    setProcessingProgress(5);
    setProcessingStatusText('Initializing Excel Data Engine...');

    try {
      const result = await matchExcelDateRecords(step0File, step1File, {
        step0Sheet: step0SelectedSheet,
        step1Sheet: step1SelectedSheet,
        onProgress: (percent, message) => {
          setProcessingProgress(percent);
          setProcessingStatusText(message);
        },
      });

      setMatchResult(result);
      setCurrentPage(1);

      // Check if Step 0 already contains a DATE column
      if (result.step0Analysis.hasExistingDateColumn) {
        setShowOverwriteModal(true);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'An error occurred during Excel matching.');
    } finally {
      setIsProcessing(false);
    }
  };

  // --------------------------------------------------------------------------
  // Reset All State
  // --------------------------------------------------------------------------
  const handleResetAll = () => {
    setStep0File(null);
    setStep0Sheets([]);
    setStep0SelectedSheet('');
    setStep1File(null);
    setStep1Sheets([]);
    setStep1SelectedSheet('');
    setMatchResult(null);
    setErrorMessage(null);
    setShowOverwriteModal(false);
    setOverwriteExistingDate(false);
    setSearchQuery('');
    setStatusFilter('ALL');
    setCurrentPage(1);
    if (step0InputRef.current) step0InputRef.current.value = '';
    if (step1InputRef.current) step1InputRef.current.value = '';
  };

  // --------------------------------------------------------------------------
  // Download Updated Step 0 Excel (`step_0_with_dates.xlsx`)
  // --------------------------------------------------------------------------
  const handleDownloadUpdatedExcel = async () => {
    if (!step0File || !matchResult) return;
    setIsDownloadingUpdated(true);

    try {
      const blob = await generateUpdatedStep0Workbook(step0File, matchResult, {
        overwriteExistingDate,
        step0Sheet: step0SelectedSheet,
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'step_0_with_dates.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setDownloadSuccessToast('Successfully downloaded "step_0_with_dates.xlsx" with accurate dates!');
      setTimeout(() => setDownloadSuccessToast(null), 5000);
    } catch (err: any) {
      setErrorMessage(`Export failed: ${err?.message || err}`);
    } finally {
      setIsDownloadingUpdated(false);
    }
  };

  // --------------------------------------------------------------------------
  // Download Issues Report (`date_mapper_issues_report.xlsx`)
  // --------------------------------------------------------------------------
  const handleDownloadIssuesReport = async () => {
    if (!matchResult) return;
    setIsDownloadingIssues(true);

    try {
      const blob = await generateIssuesReportExcel(matchResult);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'date_mapper_issues_report.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setDownloadSuccessToast('Successfully downloaded "date_mapper_issues_report.xlsx"!');
      setTimeout(() => setDownloadSuccessToast(null), 5000);
    } catch (err: any) {
      setErrorMessage(`Failed to export Issues Report: ${err?.message || err}`);
    } finally {
      setIsDownloadingIssues(false);
    }
  };

  // --------------------------------------------------------------------------
  // Filtered & Paginated Rows for Preview Table
  // --------------------------------------------------------------------------
  const filteredRows = useMemo(() => {
    if (!matchResult) return [];
    let list = matchResult.matchedRows;

    // Filter by status tab
    if (statusFilter !== 'ALL') {
      list = list.filter(r => r.status === statusFilter);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(r => {
        if (r.groupName.toLowerCase().includes(q)) return true;
        if (r.date.toLowerCase().includes(q)) return true;
        if (r.reason && r.reason.toLowerCase().includes(q)) return true;
        return Object.values(r.originalRowData).some(val => String(val || '').toLowerCase().includes(q));
      });
    }

    return list;
  }, [matchResult, statusFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  // Headers to display in preview table
  const previewHeaders = useMemo(() => {
    if (!matchResult) return [];
    return matchResult.step0Analysis.headers;
  }, [matchResult]);

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header Banner */}
      <div className="bg-white rounded-2xl p-6 sm:p-7 border border-slate-200/90 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-blue-500/10 via-indigo-500/5 to-transparent rounded-full -mr-20 -mt-20 pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1565D8] text-white shadow-md shadow-blue-500/20">
                <FileSpreadsheet className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Excel Date Mapper
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                  Upload two Excel files, automatically match group records, and generate an updated Excel with accurate dates.
                </p>
              </div>
            </div>
          </div>

          {/* Privacy & Reset Badge */}
          <div className="flex items-center gap-2.5">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200/80 text-emerald-700 text-xs font-semibold">
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>100% Client-Side Privacy (Zero DB Writes)</span>
            </div>

            {(step0File || step1File || matchResult) && (
              <button
                type="button"
                onClick={handleResetAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                title="Reset all uploaded files and clear memory"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset All</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Success Toast Notification */}
      {downloadSuccessToast && (
        <div className="p-4 bg-emerald-50 border-2 border-emerald-300 rounded-xl text-xs sm:text-sm text-emerald-900 flex items-center justify-between gap-3 shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <span className="font-bold">{downloadSuccessToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setDownloadSuccessToast(null)}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 3. Error Alert Banner */}
      {errorMessage && (
        <div className="p-4 bg-red-50 border-2 border-red-300 rounded-xl text-xs sm:text-sm text-red-900 flex items-start justify-between gap-3 shadow-sm animate-in fade-in duration-200">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-black uppercase tracking-wider text-xs text-red-700">Validation Notice</div>
              <div className="font-medium mt-0.5">{errorMessage}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-red-700 hover:text-red-900 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 4. The 4-Step Interactive Flow */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* STEP 1: Upload Step 0 Excel (Target File) */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-black">
                  1
                </span>
                <span className="text-sm font-black text-slate-900 uppercase tracking-wide">
                  Step 0 — Target File
                </span>
              </div>
              <span className="px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-bold rounded-md">
                Requires: GROUP NAMES
              </span>
            </div>

            <p className="text-xs text-slate-500 mt-2">
              The original Excel file that needs to be updated with dates. The newly extracted <span className="font-mono font-bold text-slate-800">DATE</span> column will be added here.
            </p>

            <div className="mt-4">
              {!step0File ? (
                <div
                  onDragOver={e => {
                    e.preventDefault();
                    setIsStep0Dragging(true);
                  }}
                  onDragLeave={() => setIsStep0Dragging(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setIsStep0Dragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleStep0FileSelected(e.dataTransfer.files[0]);
                    }
                  }}
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
                    isStep0Dragging
                      ? 'border-[#1565D8] bg-blue-50/70 scale-[0.99]'
                      : 'border-slate-300 hover:border-[#1565D8] hover:bg-slate-50/70'
                  }`}
                  onClick={() => step0InputRef.current?.click()}
                >
                  <input
                    ref={step0InputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) {
                        handleStep0FileSelected(e.target.files[0]);
                      }
                    }}
                  />
                  <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl bg-blue-50 text-[#1565D8] mb-3">
                    <Upload className="h-6 w-6" />
                  </div>
                  <div className="text-sm font-bold text-slate-800">
                    Drag & Drop Step 0 Target Excel
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    or click to browse (.xlsx, .xls)
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#1565D8] text-white shrink-0">
                        <FileSpreadsheet className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate" title={step0File.name}>
                          {step0File.name}
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium">
                          {formatFileSize(step0File.size)} • Target File Ready
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setStep0File(null);
                        setStep0Sheets([]);
                        setStep0SelectedSheet('');
                        if (step0InputRef.current) step0InputRef.current.value = '';
                      }}
                      className="text-slate-400 hover:text-red-600 transition-colors p-1 cursor-pointer"
                      title="Remove file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Multiple Sheets Selector */}
                  {step0Sheets.length > 1 && (
                    <div className="flex items-center gap-2 pt-2 border-t border-blue-200/60">
                      <Layers className="h-3.5 w-3.5 text-blue-700 shrink-0" />
                      <label htmlFor="step0-sheet-select" className="text-xs font-bold text-slate-700 shrink-0">
                        Worksheet:
                      </label>
                      <select
                        id="step0-sheet-select"
                        value={step0SelectedSheet}
                        onChange={e => setStep0SelectedSheet(e.target.value)}
                        className="w-full text-xs bg-white border border-blue-300 rounded-lg px-2.5 py-1 font-semibold text-slate-800 focus:outline-blue-500"
                      >
                        {step0Sheets.map(s => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => step0InputRef.current?.click()}
                      className="text-[11px] font-bold text-[#1565D8] hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Replace File
                    </button>
                    <input
                      ref={step0InputRef}
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={e => {
                        if (e.target.files && e.target.files[0]) {
                          handleStep0FileSelected(e.target.files[0]);
                        }
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* STEP 2: Upload Step 1 Excel (Reference File) */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-black">
                  2
                </span>
                <span className="text-sm font-black text-slate-900 uppercase tracking-wide">
                  Step 1 — Reference File
                </span>
              </div>
              <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold rounded-md">
                Requires: Participant Group Names + Test Start Time
              </span>
            </div>

            <p className="text-xs text-slate-500 mt-2">
              The reference file containing calendar timestamps. Calendar dates will be extracted from <span className="font-mono font-bold text-slate-800">Test Start Time</span> without UTC shifting.
            </p>

            <div className="mt-4">
              {!step1File ? (
                <div
                  onDragOver={e => {
                    e.preventDefault();
                    setIsStep1Dragging(true);
                  }}
                  onDragLeave={() => setIsStep1Dragging(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setIsStep1Dragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleStep1FileSelected(e.dataTransfer.files[0]);
                    }
                  }}
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
                    isStep1Dragging
                      ? 'border-emerald-600 bg-emerald-50/70 scale-[0.99]'
                      : 'border-slate-300 hover:border-emerald-600 hover:bg-slate-50/70'
                  }`}
                  onClick={() => step1InputRef.current?.click()}
                >
                  <input
                    ref={step1InputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) {
                        handleStep1FileSelected(e.target.files[0]);
                      }
                    }}
                  />
                  <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 mb-3">
                    <Upload className="h-6 w-6" />
                  </div>
                  <div className="text-sm font-bold text-slate-800">
                    Drag & Drop Step 1 Reference Excel
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    or click to browse (.xlsx, .xls)
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-white shrink-0">
                        <FileCheck className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate" title={step1File.name}>
                          {step1File.name}
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium">
                          {formatFileSize(step1File.size)} • Reference File Ready
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setStep1File(null);
                        setStep1Sheets([]);
                        setStep1SelectedSheet('');
                        if (step1InputRef.current) step1InputRef.current.value = '';
                      }}
                      className="text-slate-400 hover:text-red-600 transition-colors p-1 cursor-pointer"
                      title="Remove file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Multiple Sheets Selector */}
                  {step1Sheets.length > 1 && (
                    <div className="flex items-center gap-2 pt-2 border-t border-emerald-200/60">
                      <Layers className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                      <label htmlFor="step1-sheet-select" className="text-xs font-bold text-slate-700 shrink-0">
                        Worksheet:
                      </label>
                      <select
                        id="step1-sheet-select"
                        value={step1SelectedSheet}
                        onChange={e => setStep1SelectedSheet(e.target.value)}
                        className="w-full text-xs bg-white border border-emerald-300 rounded-lg px-2.5 py-1 font-semibold text-slate-800 focus:outline-emerald-500"
                      >
                        {step1Sheets.map(s => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => step1InputRef.current?.click()}
                      className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Replace File
                    </button>
                    <input
                      ref={step1InputRef}
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={e => {
                        if (e.target.files && e.target.files[0]) {
                          handleStep1FileSelected(e.target.files[0]);
                        }
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* STEP 3: Action Trigger & Processing Progress */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center space-y-4">
        <div className="max-w-xl">
          <h3 className="text-base font-bold text-slate-900">
            Step 3 — Validate & Match Records
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Builds an in-memory O(N + M) index matching <span className="font-semibold text-slate-700">GROUP NAMES</span> against <span className="font-semibold text-slate-700">Participant Group Names</span>, extracts unambiguous calendar dates, and resolves duplicates.
          </p>
        </div>

        {isProcessing && (
          <div className="w-full max-w-md space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span>{processingStatusText}</span>
              <span>{processingProgress}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
              <div
                className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-300 rounded-full"
                style={{ width: `${processingProgress}%` }}
              />
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleValidateAndMatch}
          disabled={!step0File || !step1File || isProcessing}
          className={`flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-bold text-white shadow-md transition-all cursor-pointer ${
            !step0File || !step1File || isProcessing
              ? 'bg-slate-300 cursor-not-allowed shadow-none'
              : 'bg-[#1565D8] hover:bg-blue-700 active:scale-95 shadow-blue-500/25'
          }`}
        >
          {isProcessing ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Matching Records...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              <span>Validate & Match Records</span>
            </>
          )}
        </button>
      </div>

      {/* STEP 4: Results, Metrics & Preview */}
      {matchResult && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Summary Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            {/* 1. Step 0 Records */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Step 0 Records</div>
              <div className="text-xl font-black text-slate-900 mt-1">
                {matchResult.metrics.totalStep0Records.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-400 font-medium">Target file rows</div>
            </div>

            {/* 2. Step 1 Records */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Step 1 Records</div>
              <div className="text-xl font-black text-slate-900 mt-1">
                {matchResult.metrics.totalStep1Records.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-400 font-medium">Reference rows</div>
            </div>

            {/* 3. Matched Records */}
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="text-[11px] font-bold text-emerald-700 uppercase">Matched</div>
              <div className="text-xl font-black text-emerald-800 mt-1">
                {matchResult.metrics.matchedCount.toLocaleString()}
              </div>
              <div className="text-[10px] text-emerald-600 font-medium">
                {matchResult.metrics.totalStep0Records > 0
                  ? `${Math.round((matchResult.metrics.matchedCount / matchResult.metrics.totalStep0Records) * 100)}% Matched`
                  : '0%'}
              </div>
            </div>

            {/* 4. Unmatched Records */}
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
              <div className="text-[11px] font-bold text-amber-700 uppercase">Unmatched</div>
              <div className="text-xl font-black text-amber-800 mt-1">
                {matchResult.metrics.unmatchedCount.toLocaleString()}
              </div>
              <div className="text-[10px] text-amber-600 font-medium">Dates left blank</div>
            </div>

            {/* 5. Duplicate Groups */}
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
              <div className="text-[11px] font-bold text-blue-700 uppercase">Duplicate Groups</div>
              <div className="text-xl font-black text-blue-800 mt-1">
                {matchResult.metrics.duplicateGroupsCount.toLocaleString()}
              </div>
              <div className="text-[10px] text-blue-600 font-medium">Consistent dates resolved</div>
            </div>

            {/* 6. Date Conflicts */}
            <div className="p-4 rounded-xl bg-red-50 border border-red-200">
              <div className="text-[11px] font-bold text-red-700 uppercase">Date Conflicts</div>
              <div className="text-xl font-black text-red-800 mt-1">
                {matchResult.metrics.conflictCount.toLocaleString()}
              </div>
              <div className="text-[10px] text-red-600 font-medium">Conflicting dates</div>
            </div>

            {/* 7. Invalid Dates */}
            <div className="p-4 rounded-xl bg-purple-50 border border-purple-200">
              <div className="text-[11px] font-bold text-purple-700 uppercase">Invalid Dates</div>
              <div className="text-xl font-black text-purple-800 mt-1">
                {matchResult.metrics.invalidDateCount + matchResult.metrics.ambiguousDateCount}
              </div>
              <div className="text-[10px] text-purple-600 font-medium">Requires review</div>
            </div>
          </div>

          {/* Conflict Alert Table Banner if conflicts exist */}
          {matchResult.conflicts.length > 0 && (
            <div className="p-4 bg-red-50 border-2 border-red-300 rounded-2xl shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-red-900 font-bold text-sm">
                  <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
                  <span>
                    Detected {matchResult.conflicts.length} Date Conflict {matchResult.conflicts.length === 1 ? 'Group' : 'Groups'} in Step 1
                  </span>
                </div>
                <span className="text-xs text-red-700 font-semibold">
                  Dates left blank in Step 0 for safety
                </span>
              </div>
              <div className="text-xs text-red-800">
                The following groups appear multiple times in Step 1 with different calendar dates. They have not been guessed:
              </div>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-red-200 bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-red-100/70 text-red-900 font-bold sticky top-0">
                    <tr>
                      <th className="p-2.5">Group Name</th>
                      <th className="p-2.5">Step 1 Row Numbers</th>
                      <th className="p-2.5">Conflicting Dates</th>
                      <th className="p-2.5">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-100">
                    {matchResult.conflicts.map(conf => (
                      <tr key={conf.groupName} className="hover:bg-red-50/50">
                        <td className="p-2.5 font-bold font-mono text-slate-800">{conf.groupName}</td>
                        <td className="p-2.5 font-mono text-slate-600">{conf.rows.join(', ')}</td>
                        <td className="p-2.5 text-red-700 font-semibold">{conf.dates.join(' vs ')}</td>
                        <td className="p-2.5">
                          <button
                            type="button"
                            onClick={() => setInspectingConflict(conf)}
                            className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[11px] font-bold cursor-pointer"
                          >
                            Inspect Rows
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Action Toolbar: Download Buttons */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="text-sm font-bold text-slate-900">
                Ready to Export Updated Excel
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Target file with newly appended <span className="font-mono font-bold text-[#1565D8]">DATE</span> column (formatted as DD-MM-YYYY).
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              {/* Issues Report Download */}
              <button
                type="button"
                onClick={handleDownloadIssuesReport}
                disabled={isDownloadingIssues}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 active:scale-95 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                title="Download full report of unmatched, conflicting, and invalid records"
              >
                {isDownloadingIssues ? (
                  <RefreshCw className="h-4 w-4 animate-spin text-slate-600" />
                ) : (
                  <FileText className="h-4 w-4 text-slate-600" />
                )}
                <span>Download Issues Report</span>
              </button>

              {/* Primary Download: step_0_with_dates.xlsx */}
              <button
                type="button"
                onClick={handleDownloadUpdatedExcel}
                disabled={isDownloadingUpdated}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#1565D8] hover:bg-blue-700 active:scale-95 text-white text-xs font-bold transition-all shadow-md shadow-blue-500/20 cursor-pointer"
              >
                {isDownloadingUpdated ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Generating Excel...</span>
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    <span>Download Updated Excel</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Preview Table Header & Search Filter */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('ALL');
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    statusFilter === 'ALL'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({matchResult.metrics.totalStep0Records})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('MATCHED');
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    statusFilter === 'MATCHED'
                      ? 'bg-white text-emerald-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Matched ({matchResult.metrics.matchedCount})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('UNMATCHED');
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    statusFilter === 'UNMATCHED'
                      ? 'bg-white text-amber-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Unmatched ({matchResult.metrics.unmatchedCount})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('CONFLICT');
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    statusFilter === 'CONFLICT'
                      ? 'bg-white text-red-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Conflicts ({matchResult.metrics.conflictCount})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('INVALID_DATE');
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    statusFilter === 'INVALID_DATE'
                      ? 'bg-white text-purple-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Invalid ({matchResult.metrics.invalidDateCount + matchResult.metrics.ambiguousDateCount})
                </button>
              </div>

              {/* Search Bar & Page Size */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-64">
                  <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Search by Group Name or value..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-blue-500 focus:bg-white"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                <select
                  value={pageSize}
                  onChange={e => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-semibold text-slate-700 focus:outline-blue-500"
                >
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                  <option value={100}>100 / page</option>
                </select>
              </div>
            </div>

            {/* Scrollable Table Viewport */}
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="p-3 w-16 text-center">Row #</th>
                    <th className="p-3 w-28 text-center bg-blue-100/70 text-blue-950 font-black">
                      Status (Preview)
                    </th>
                    <th className="p-3 w-36 text-center bg-emerald-100/70 text-emerald-950 font-black">
                      DATE (New)
                    </th>
                    {previewHeaders.map((header, idx) => {
                      const isGroupCol = idx === matchResult.step0Analysis.groupColIdx;
                      return (
                        <th
                          key={header + idx}
                          className={`p-3 whitespace-nowrap ${
                            isGroupCol ? 'bg-amber-100/70 text-amber-950 font-black' : ''
                          }`}
                        >
                          {header}
                          {isGroupCol && <span className="ml-1 text-[10px] text-amber-700 font-bold">(Key)</span>}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={previewHeaders.length + 3} className="p-8 text-center text-slate-400 font-medium">
                        No records match the current filter or search criteria.
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map(row => {
                      return (
                        <tr key={row.step0RowNumber} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3 text-center font-mono text-slate-500">{row.step0RowNumber}</td>

                          {/* Status Badge */}
                          <td className="p-3 text-center">
                            {row.status === 'MATCHED' && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">
                                MATCHED
                              </span>
                            )}
                            {row.status === 'UNMATCHED' && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black uppercase" title={row.reason}>
                                UNMATCHED
                              </span>
                            )}
                            {row.status === 'CONFLICT' && (
                              <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-black uppercase" title={row.reason}>
                                CONFLICT
                              </span>
                            )}
                            {row.status === 'INVALID_DATE' && (
                              <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-black uppercase" title={row.reason}>
                                INVALID
                              </span>
                            )}
                            {row.status === 'AMBIGUOUS' && (
                              <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 text-[10px] font-black uppercase" title={row.reason}>
                                AMBIGUOUS
                              </span>
                            )}
                          </td>

                          {/* Newly Populated DATE Column */}
                          <td className="p-3 text-center font-mono font-bold">
                            {row.date ? (
                              <span className="px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-900 rounded-md font-bold">
                                {row.date}
                              </span>
                            ) : (
                              <span className="text-slate-300 italic font-normal">—</span>
                            )}
                          </td>

                          {/* Original Step 0 Columns */}
                          {previewHeaders.map((header, idx) => {
                            const isGroupCol = idx === matchResult.step0Analysis.groupColIdx;
                            const cellVal = row.orderedCells[idx] ?? '';
                            return (
                              <td
                                key={header + idx}
                                className={`p-3 whitespace-nowrap ${
                                  isGroupCol ? 'font-mono font-bold text-slate-900 bg-amber-50/30' : 'text-slate-600'
                                }`}
                              >
                                {String(cellVal)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
              <div>
                Showing <strong className="text-slate-800">{filteredRows.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</strong> to{' '}
                <strong className="text-slate-800">
                  {Math.min(currentPage * pageSize, filteredRows.length)}
                </strong>{' '}
                of <strong className="text-slate-800">{filteredRows.length}</strong> filtered records
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-semibold cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Previous</span>
                </button>

                <span className="px-2 font-bold text-slate-800">
                  Page {currentPage} of {totalPages}
                </span>

                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-semibold cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Existing DATE Column Overwrite Prompt Modal */}
      {showOverwriteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700 shrink-0">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Existing DATE Column Detected
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  The uploaded Step 0 file already has a column named <span className="font-mono font-bold text-slate-800">DATE</span> (at column {matchResult?.step0Analysis.existingDateColIdx !== undefined ? matchResult.step0Analysis.existingDateColIdx + 1 : 1}).
                </p>
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
              How would you like to handle the DATE column?
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setOverwriteExistingDate(true);
                  setShowOverwriteModal(false);
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl border-2 border-[#1565D8] bg-blue-50/50 hover:bg-blue-50 text-left transition-all cursor-pointer"
              >
                <div>
                  <div className="text-xs font-bold text-[#1565D8]">
                    Overwrite Existing DATE Column
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Replace existing DATE values with newly matched dates.
                  </div>
                </div>
                <CheckCircle2 className="h-4 w-4 text-[#1565D8]" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setOverwriteExistingDate(false);
                  setShowOverwriteModal(false);
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-left transition-all cursor-pointer"
              >
                <div>
                  <div className="text-xs font-bold text-slate-800">
                    Append as New Column (DATE_2)
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Keep existing DATE values untouched and append a new DATE column at the end.
                  </div>
                </div>
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowOverwriteModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Conflict Inspection Modal */}
      {inspectingConflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-red-900 font-bold text-sm">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <span>Conflict Details: {inspectingConflict.groupName}</span>
              </div>
              <button
                type="button"
                onClick={() => setInspectingConflict(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="font-bold text-slate-700">Group Name:</span>{' '}
                <span className="font-mono font-bold text-slate-900">{inspectingConflict.groupName}</span>
              </div>
              <div>
                <span className="font-bold text-slate-700">Found in Step 1 Row Numbers:</span>{' '}
                <span className="font-mono text-slate-900">{inspectingConflict.rows.join(', ')}</span>
              </div>
              <div>
                <span className="font-bold text-slate-700">Conflicting Dates Extracted:</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {inspectingConflict.dates.map(d => (
                    <span key={d} className="px-2 py-0.5 bg-red-100 text-red-800 rounded font-mono font-bold">
                      {d}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <span className="font-bold text-slate-700">Raw Cell Values in Step 1:</span>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px] text-slate-800 max-h-32 overflow-y-auto mt-1">
                  {inspectingConflict.rawValues.map((v, idx) => (
                    <div key={idx} className="truncate">
                      Row {inspectingConflict.rows[idx]}: {String(v)}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setInspectingConflict(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer"
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
