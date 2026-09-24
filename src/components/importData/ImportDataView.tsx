// ==============================================================================
// Import Data for Inwarding & Dedicated Barcode Scanning Workflow
// Full-page Excel ingestion, schema validation, Class ID grouping,
// Supabase 'imported' table integration & direct camera scanner
// ==============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Upload,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Scan,
  RefreshCw,
  Camera,
  CameraOff,
  Search,
  Database,
  Users,
  Check,
  ChevronRight,
  Download,
  Eye,
  X,
  Zap,
  RotateCcw,
  Sparkles,
  ArrowRight,
  Maximize2,
} from 'lucide-react';
import { importedService, ImportedRecord, ClassIdSummary, ImportedStats } from '../../services/importedService';
import { playScanSuccessSound, playScanWarningSound } from '../../utils/scannerSound';
import { BrowserMultiFormatReader } from '@zxing/browser';

interface ParsedRow {
  rowNumber: number;
  classId: string;
  memberId: string;
  status: 'valid' | 'duplicate' | 'invalid';
  reason?: string;
}

interface ClassGroup {
  classId: string;
  membersCount: number;
  members: string[];
}

export const ImportDataView: React.FC<{
  onNavigateToManualInward?: () => void;
}> = ({ onNavigateToManualInward }) => {
  // Navigation / Mode within Import Data screen
  const [activeTab, setActiveTab] = useState<'import' | 'scanner'>('import');

  // Excel parsing and preview state
  const [isParsing, setIsParsing] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<{ title: string; message: string } | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [classGroups, setClassGroups] = useState<ClassGroup[]>([]);
  const [summary, setSummary] = useState<{
    totalRecords: number;
    totalClassIds: number;
    validRecords: number;
    duplicateRecords: number;
    invalidRecords: number;
  } | null>(null);

  // Group Details Modal
  const [selectedGroupModal, setSelectedGroupModal] = useState<ClassGroup | null>(null);

  // Import All Execution state
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);

  // Live Database Statistics & Summaries
  const [dbStats, setDbStats] = useState<ImportedStats>({
    scan_started: 0,
    scan_not_started: 0,
    total_imported: 0,
    class_ids_count: 0,
  });
  const [classSummaries, setClassSummaries] = useState<ClassIdSummary[]>([]);
  const [recentScans, setRecentScans] = useState<ImportedRecord[]>([]);

  // Camera & Live Scanner State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const isProcessingRef = useRef<boolean>(false);
  const lastScannedCodeRef = useRef<string | null>(null);
  const lastScannedTimeRef = useRef<number>(0);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualBarcodeInput, setManualBarcodeInput] = useState('');
  const [scannerNotification, setScannerNotification] = useState<{
    type: 'success' | 'warning' | 'error';
    title: string;
    message: string;
  } | null>(null);
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');
  const [previewPage, setPreviewPage] = useState<number>(1);

  // Load Data on mount & subscribe
  const loadDatabaseData = useCallback(() => {
    const stats = importedService.getStats();
    const summaries = importedService.getClassIdSummaries();
    const allRecords = importedService.getRecords();
    const scannedOnes = allRecords
      .filter(r => r.scan_status === 'started' || r.scan_status === 'completed')
      .sort((a, b) => new Date(b.scanned_at || 0).getTime() - new Date(a.scanned_at || 0).getTime())
      .slice(0, 10);

    setDbStats(stats);
    setClassSummaries(summaries);
    setRecentScans(scannedOnes);

    // Auto-switch to scanner if data already exists and not in import preview
    if (stats.total_imported > 0 && !summary) {
      // User can still toggle freely
    }
  }, [summary]);

  useEffect(() => {
    loadDatabaseData();
    importedService.syncFromSupabase().then(() => {
      loadDatabaseData();
    });
    const unsubscribe = importedService.subscribe(loadDatabaseData);
    return () => unsubscribe();
  }, [loadDatabaseData]);

  // Handle Tab Change (Direct Camera Activation when entering Scanner tab)
  useEffect(() => {
    if (activeTab === 'scanner') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [activeTab]);

  // ----------------------------------------------------------------------------
  // EXCEL VALIDATION & LOCAL PARSING (Section 3, 4, 5)
  // ----------------------------------------------------------------------------
  const handleFileSelection = async (file: File) => {
    setValidationError(null);
    setSummary(null);
    setParsedRows([]);
    setClassGroups([]);
    setImportSuccessMessage(null);
    setPreviewPage(1);

    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const fileName = file.name.toLowerCase();
    const hasValidExt = validExtensions.some(ext => fileName.endsWith(ext));

    if (!hasValidExt) {
      setValidationError({
        title: 'Invalid File Format',
        message: 'Please upload an Excel spreadsheet (.xlsx, .xls) or CSV file.',
      });
      return;
    }

    setExcelFile(file);
    setIsParsing(true);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        setValidationError({
          title: 'Empty Excel File',
          message: 'The uploaded Excel file contains no worksheets.',
        });
        setIsParsing(false);
        return;
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (!rawData || rawData.length === 0) {
        setValidationError({
          title: 'Empty Excel File',
          message: 'The worksheet contains no data rows.',
        });
        setIsParsing(false);
        return;
      }

      // Check Header Row
      const headerRow = rawData[0] as string[];
      let classIdColIdx = -1;
      let memberIdColIdx = -1;

      headerRow.forEach((col, idx) => {
        if (!col) return;
        const normalized = String(col).trim().toLowerCase().replace(/[\s_-]/g, '');
        if (normalized === 'classid' || normalized === 'class') {
          classIdColIdx = idx;
        }
        if (normalized === 'memberid' || normalized === 'member' || normalized === 'rollno') {
          memberIdColIdx = idx;
        }
      });

      // Strict validation per Requirement 3:
      // "Class ID and Member ID are mandatory columns."
      if (classIdColIdx === -1 || memberIdColIdx === -1) {
        setValidationError({
          title: 'Invalid Excel File',
          message: 'Class ID and Member ID are mandatory columns. Please check your Excel header row.',
        });
        setIsParsing(false);
        return;
      }

      // Process rows
      const validRows: ParsedRow[] = [];
      const seenPairs = new Set<string>();
      let duplicateCount = 0;
      let invalidCount = 0;

      for (let i = 1; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || row.length === 0) continue;

        const rawClassId = row[classIdColIdx];
        const rawMemberId = row[memberIdColIdx];

        const classId = rawClassId !== undefined && rawClassId !== null ? String(rawClassId).trim() : '';
        const memberId = rawMemberId !== undefined && rawMemberId !== null ? String(rawMemberId).trim() : '';

        // Empty row check
        if (!classId && !memberId) {
          continue;
        }

        const rowNum = i + 1;

        if (!classId || !memberId) {
          invalidCount++;
          validRows.push({
            rowNumber: rowNum,
            classId: classId || '—',
            memberId: memberId || '—',
            status: 'invalid',
            reason: !classId ? 'Missing Class ID' : 'Missing Member ID',
          });
          continue;
        }

        const pairKey = `${classId.toLowerCase()}___${memberId.toLowerCase()}`;
        if (seenPairs.has(pairKey)) {
          duplicateCount++;
          validRows.push({
            rowNumber: rowNum,
            classId,
            memberId,
            status: 'duplicate',
            reason: 'Duplicate record in file',
          });
          continue;
        }

        seenPairs.add(pairKey);
        validRows.push({
          rowNumber: rowNum,
          classId,
          memberId,
          status: 'valid',
        });
      }

      const validList = validRows.filter(r => r.status === 'valid');
      const uniqueClassSet = new Set(validList.map(r => r.classId));

      // Group by Class ID (Section 5)
      const groupMap = new Map<string, string[]>();
      for (const row of validList) {
        if (!groupMap.has(row.classId)) {
          groupMap.set(row.classId, []);
        }
        groupMap.get(row.classId)!.push(row.memberId);
      }

      const groups: ClassGroup[] = Array.from(groupMap.entries())
        .map(([classId, members]) => ({
          classId,
          membersCount: members.length,
          members,
        }))
        .sort((a, b) => a.classId.localeCompare(b.classId));

      setParsedRows(validRows);
      setClassGroups(groups);
      setSummary({
        totalRecords: validRows.length,
        totalClassIds: uniqueClassSet.size,
        validRecords: validList.length,
        duplicateRecords: duplicateCount,
        invalidRecords: invalidCount,
      });
    } catch (err: any) {
      console.error('Excel processing error:', err);
      setValidationError({
        title: 'File Read Error',
        message: 'Could not read file. Ensure it is a valid, unencrypted Excel or CSV spreadsheet.',
      });
    } finally {
      setIsParsing(false);
    }
  };

  // ----------------------------------------------------------------------------
  // IMPORT ALL INTO SUPABASE (Section 6 & 7)
  // ----------------------------------------------------------------------------
  const handleImportAll = async () => {
    const validToImport = parsedRows
      .filter(r => r.status === 'valid')
      .map(r => ({
        class_id: r.classId,
        member_id: r.memberId,
      }));

    if (validToImport.length === 0) {
      setValidationError({
        title: 'No Valid Records',
        message: 'There are no valid records to import from the parsed file.',
      });
      return;
    }

    setIsImporting(true);
    setImportProgress({ current: 0, total: validToImport.length });

    try {
      const result = await importedService.bulkInsert(validToImport, (current, total) => {
        setImportProgress({ current, total });
      });

      if (result.success) {
        setImportSuccessMessage(
          `Successfully imported ${result.inserted.toLocaleString()} records across ${classGroups.length} Class IDs into Supabase.`
        );
        // Clear preview
        setParsedRows([]);
        setExcelFile(null);
        setSummary(null);
        setClassGroups([]);
        loadDatabaseData();

        // Section 10: "After data import, the application should move directly into the scanning workflow."
        setTimeout(() => {
          setActiveTab('scanner');
        }, 1200);
      } else {
        setValidationError({
          title: 'Import Failed',
          message: result.error || 'Failed to complete database import.',
        });
      }
    } catch (e: any) {
      setValidationError({
        title: 'Import Error',
        message: e?.message || 'An unexpected error occurred during database insert.',
      });
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  // ----------------------------------------------------------------------------
  // DOWNLOAD SAMPLE EXCEL TEMPLATE
  // ----------------------------------------------------------------------------
  const handleDownloadTemplate = () => {
    const templateData = [
      ['Class ID', 'Member ID'],
      ['0403', 'MIS0001'],
      ['0403', 'MIS0002'],
      ['0403', 'MIS0003'],
      ['0404', 'MIS0004'],
      ['0404', 'MIS0005'],
      ['0405', 'MIS0006'],
      ['0405', 'MIS0007'],
      ['0405', 'MIS0008'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'InwardData');
    XLSX.writeFile(wb, 'ExamScan_Inward_Sample_Template.xlsx');
  };

  // ----------------------------------------------------------------------------
  // CAMERA STREAM & ZXING BARCODE SCANNER (Section 10, 11, 12, 13, 14, 15, 20)
  // ----------------------------------------------------------------------------
  const startCamera = async () => {
    setCameraLoading(true);
    setCameraError(null);

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (zxingControlsRef.current) {
        zxingControlsRef.current.stop();
        zxingControlsRef.current = null;
      }

      // Constraints with high-definition resolution for sharp barcode recognition
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraActive(true);
      setCameraLoading(false);

      // Initialize ZXing Reader
      const codeReader = new BrowserMultiFormatReader();
      zxingReaderRef.current = codeReader;

      const controls = await codeReader.decodeFromVideoElement(
        videoRef.current!,
        (result, err) => {
          if (result) {
            const rawText = result.getText();
            if (rawText) {
              handleBarcodeScanned(rawText);
            }
          }
        }
      );
      zxingControlsRef.current = controls;
    } catch (err: any) {
      console.warn('Camera initialization error:', err);
      setCameraActive(false);
      setCameraLoading(false);
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Camera permission was denied. Please allow camera access in your browser settings.'
          : 'Unable to start camera. Please verify your camera device or use manual barcode input below.'
      );
    }
  };

  const stopCamera = () => {
    if (zxingControlsRef.current) {
      try {
        zxingControlsRef.current.stop();
      } catch (e) {}
      zxingControlsRef.current = null;
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => track.stop());
      } catch (e) {}
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCameraLoading(false);
  };

  // ----------------------------------------------------------------------------
  // BARCODE PROCESSING & MATCHING ENGINE (Section 12, 13, 14, 15, 20)
  // ----------------------------------------------------------------------------
  const handleBarcodeScanned = async (rawCode: string) => {
    const trimmed = rawCode.trim();
    if (!trimmed) return;

    const now = Date.now();
    // Debounce duplicate scans within 1.5 seconds if identical
    if (
      lastScannedCodeRef.current === trimmed &&
      now - lastScannedTimeRef.current < 1500
    ) {
      return;
    }

    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    lastScannedCodeRef.current = trimmed;
    lastScannedTimeRef.current = now;

    try {
      const result = await importedService.processBarcode(trimmed);

      if (result.success) {
        playScanSuccessSound();
        setScannerNotification({
          type: 'success',
          title: `Class ${result.class_id} • Verified`,
          message: `Scanned Barcode: ${trimmed} → Assigned to Member ${result.member_id}`,
        });
      } else {
        playScanWarningSound();
        if (result.isDuplicate) {
          setScannerNotification({
            type: 'warning',
            title: 'Duplicate Barcode Scanned',
            message: result.message,
          });
        } else if (result.isUnknownClass) {
          setScannerNotification({
            type: 'error',
            title: 'Unrecognized Class ID',
            message: result.message,
          });
        } else {
          setScannerNotification({
            type: 'warning',
            title: 'Scan Alert',
            message: result.message,
          });
        }
      }

      loadDatabaseData();
    } catch (e: any) {
      playScanWarningSound();
      setScannerNotification({
        type: 'error',
        title: 'Scanner Error',
        message: e?.message || 'Failed processing barcode',
      });
    } finally {
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 500);
    }
  };

  const handleManualBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualBarcodeInput.trim()) return;
    handleBarcodeScanned(manualBarcodeInput.trim());
    setManualBarcodeInput('');
  };

  // Filtered Class Summaries
  const filteredSummaries =
    selectedClassFilter === 'all'
      ? classSummaries
      : classSummaries.filter(s => s.class_id === selectedClassFilter);

  // Pagination for preview table
  const PAGE_SIZE = 15;
  const totalPreviewPages = Math.ceil(parsedRows.length / PAGE_SIZE) || 1;
  const displayedPreviewRows = parsedRows.slice((previewPage - 1) * PAGE_SIZE, previewPage * PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* 1. Header (Strictly as specified in Section 2) */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-[#EAF2FF] text-[#1565D8] rounded-lg">
                <FileSpreadsheet className="h-5 w-5" />
              </span>
              <h1 className="text-xl sm:text-2xl font-bold text-[#172033] tracking-tight">
                Import Data for Inwarding
              </h1>
            </div>
            <p className="text-sm text-[#64748B] mt-1 font-medium">
              Import Class ID and Member ID data from Excel
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center p-1 bg-[#F1F5F9] rounded-xl self-start sm:self-auto border border-[#E2E8F0]">
            <button
              type="button"
              onClick={() => setActiveTab('import')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'import'
                  ? 'bg-white text-[#1565D8] shadow-xs'
                  : 'text-[#64748B] hover:text-[#172033]'
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Import Excel</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('scanner')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'scanner'
                  ? 'bg-[#1565D8] text-white shadow-xs'
                  : 'text-[#64748B] hover:text-[#172033]'
              }`}
            >
              <Scan className="h-3.5 w-3.5" />
              <span>Scanning Dashboard ({dbStats.scan_started}/{dbStats.total_imported})</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Success Banner if just imported */}
      {importSuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-emerald-800 animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <p className="text-xs sm:text-sm font-semibold">{importSuccessMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('scanner')}
            className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors shadow-xs"
          >
            <span>Open Scanner</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 3. Validation Error Notification (Strictly as specified in Section 3) */}
      {validationError && (
        <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-xl flex items-start gap-3 text-rose-900 shadow-xs">
          <XCircle className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-bold text-rose-900">{validationError.title}</h3>
            <p className="text-xs text-rose-800 mt-1 leading-relaxed font-medium">
              {validationError.message}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setValidationError(null)}
            className="text-rose-500 hover:text-rose-800 p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ========================================================================
          TAB 1: EXCEL IMPORT & PREVIEW & GROUPING
          ======================================================================== */}
      {activeTab === 'import' && (
        <div className="space-y-6">
          {/* File Ingestion Dropzone */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-bold text-[#172033]">Upload Inward Excel File</h2>
                <p className="text-xs text-[#64748B]">
                  Columns required: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[#1565D8] font-mono font-bold">Class ID</code> and <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[#1565D8] font-mono font-bold">Member ID</code>
                </p>
              </div>

              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F1F5F9] text-[#1565D8] hover:bg-[#EAF2FF] border border-[#E2E8F0] rounded-lg text-xs font-semibold transition-colors self-start sm:self-auto"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download Sample Excel</span>
              </button>
            </div>

            <label className="relative border-2 border-dashed border-[#CBD5E1] hover:border-[#1565D8] rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-[#FAFCFF] group">
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                className="hidden"
                disabled={isParsing || isImporting}
                onChange={e => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelection(e.target.files[0]);
                  }
                }}
              />
              <div className="w-12 h-12 rounded-full bg-[#EAF2FF] text-[#1565D8] flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                {isParsing ? (
                  <RefreshCw className="h-6 w-6 animate-spin text-[#1565D8]" />
                ) : (
                  <Upload className="h-6 w-6" />
                )}
              </div>
              <p className="text-sm font-semibold text-[#172033]">
                {excelFile ? excelFile.name : 'Click to select or drag and drop Excel file'}
              </p>
              <p className="text-xs text-[#64748B] mt-1">
                Supports Microsoft Excel (.xlsx, .xls) and CSV up to 100,000+ rows
              </p>
            </label>
          </div>

          {/* Section 4: IMPORT PREVIEW & SUMMARY */}
          {summary && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div>
                <h3 className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">
                  Import Summary
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="bg-white p-3.5 rounded-xl border border-[#E2E8F0] shadow-xs">
                    <span className="text-[11px] font-semibold text-[#64748B] block">Total Records</span>
                    <span className="text-xl font-bold text-[#172033] mt-1 block">
                      {summary.totalRecords.toLocaleString()}
                    </span>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-[#E2E8F0] shadow-xs">
                    <span className="text-[11px] font-semibold text-[#64748B] block">Total Class IDs</span>
                    <span className="text-xl font-bold text-[#1565D8] mt-1 block">
                      {summary.totalClassIds}
                    </span>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/30 shadow-xs">
                    <span className="text-[11px] font-semibold text-emerald-800 block">Valid Records</span>
                    <span className="text-xl font-bold text-emerald-700 mt-1 block">
                      {summary.validRecords.toLocaleString()}
                    </span>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-amber-200 bg-amber-50/30 shadow-xs">
                    <span className="text-[11px] font-semibold text-amber-800 block">Duplicate Records</span>
                    <span className="text-xl font-bold text-amber-700 mt-1 block">
                      {summary.duplicateRecords.toLocaleString()}
                    </span>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-rose-200 bg-rose-50/30 shadow-xs">
                    <span className="text-[11px] font-semibold text-rose-800 block">Invalid Records</span>
                    <span className="text-xl font-bold text-rose-700 mt-1 block">
                      {summary.invalidRecords.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 5 & 6: CLASS ID WISE DATA GROUPING & CARDS */}
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-3">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[#172033]">
                      Class ID Wise Import Grouping ({classGroups.length} Groups)
                    </h3>
                    <p className="text-xs text-[#64748B]">
                      Records automatically separated by Class ID for inward verification
                    </p>
                  </div>

                  {/* Section 6: IMPORT ALL BUTTON */}
                  <button
                    type="button"
                    onClick={handleImportAll}
                    disabled={isImporting || summary.validRecords === 0}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[#1565D8] hover:bg-[#0D47A1] text-white rounded-xl font-bold text-xs sm:text-sm shadow-sm transition-all disabled:opacity-50"
                  >
                    {isImporting ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>
                          Importing ({importProgress?.current || 0}/{importProgress?.total || summary.validRecords})...
                        </span>
                      </>
                    ) : (
                      <>
                        <Database className="h-4 w-4" />
                        <span>Import All ({summary.validRecords.toLocaleString()} Records)</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Class ID Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {classGroups.map(group => (
                    <div
                      key={group.classId}
                      className="p-4 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] flex flex-col justify-between hover:border-[#1565D8] transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-[#64748B] font-semibold">Class ID:</span>
                            <span className="text-base font-bold text-[#172033] font-mono">
                              {group.classId}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-xs text-[#64748B] font-medium">Members:</span>
                            <span className="text-xs font-bold text-[#1565D8]">
                              {group.membersCount.toLocaleString()}
                            </span>
                          </div>
                        </div>

                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                          Ready to Import
                        </span>
                      </div>

                      <div className="mt-4 pt-3 border-t border-[#E2E8F0] flex items-center justify-between">
                        <span className="text-[11px] text-[#64748B]">
                          First: {group.members[0]}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedGroupModal(group)}
                          className="flex items-center gap-1 text-xs font-semibold text-[#1565D8] hover:underline"
                        >
                          <Eye className="h-3 w-3" />
                          <span>View Data</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Preview Table */}
              <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-xs">
                <div className="px-4 py-3 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between">
                  <span className="text-xs font-bold text-[#172033] uppercase tracking-wider">
                    Excel Preview Table (Showing {displayedPreviewRows.length} of {parsedRows.length})
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={previewPage <= 1}
                      onClick={() => setPreviewPage(p => Math.max(1, p - 1))}
                      className="px-2 py-1 text-xs font-semibold rounded bg-white border border-[#E2E8F0] disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <span className="text-xs text-[#64748B]">
                      Page {previewPage} of {totalPreviewPages}
                    </span>
                    <button
                      type="button"
                      disabled={previewPage >= totalPreviewPages}
                      onClick={() => setPreviewPage(p => Math.min(totalPreviewPages, p + 1))}
                      className="px-2 py-1 text-xs font-semibold rounded bg-white border border-[#E2E8F0] disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F1F5F9] text-[#64748B] font-semibold border-b border-[#E2E8F0]">
                      <tr>
                        <th className="px-4 py-2.5">Row</th>
                        <th className="px-4 py-2.5">Class ID</th>
                        <th className="px-4 py-2.5">Member ID</th>
                        <th className="px-4 py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {displayedPreviewRows.map(row => (
                        <tr key={row.rowNumber} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-2 font-mono text-[#64748B]">{row.rowNumber}</td>
                          <td className="px-4 py-2 font-bold font-mono text-[#172033]">{row.classId}</td>
                          <td className="px-4 py-2 font-mono text-[#1565D8]">{row.memberId}</td>
                          <td className="px-4 py-2">
                            {row.status === 'valid' && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                                <Check className="h-3 w-3" /> Valid
                              </span>
                            )}
                            {row.status === 'duplicate' && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                                Duplicate
                              </span>
                            )}
                            {row.status === 'invalid' && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded">
                                Invalid ({row.reason})
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Quick Stats banner of existing database data */}
          {dbStats.total_imported > 0 && !summary && (
            <div className="p-4 bg-white rounded-xl border border-[#E2E8F0] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#EAF2FF] text-[#1565D8] flex items-center justify-center font-bold">
                  {dbStats.class_ids_count}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#172033]">
                    {dbStats.total_imported.toLocaleString()} Imported Records Active
                  </h4>
                  <p className="text-xs text-[#64748B]">
                    {dbStats.scan_started.toLocaleString()} Scanned • {dbStats.scan_not_started.toLocaleString()} Remaining
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('scanner')}
                  className="flex items-center gap-2 px-4 py-2 bg-[#1565D8] text-white rounded-xl font-bold text-xs shadow-xs hover:bg-[#0D47A1] transition-colors"
                >
                  <Scan className="h-4 w-4" />
                  <span>Open Barcode Scanner</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================
          TAB 2: POST-IMPORT SCANNING DASHBOARD & DIRECT CAMERA SCANNER
          (Sections 9, 10, 11, 12, 13, 14, 15, 16, 20)
          ======================================================================== */}
      {activeTab === 'scanner' && (
        <div className="space-y-6">
          {/* Section 9: 4 MAIN STATISTICS */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold text-[#64748B] uppercase tracking-wider">
                Scanning Operational Dashboard
              </h2>
              <button
                type="button"
                onClick={loadDatabaseData}
                className="flex items-center gap-1 text-xs text-[#1565D8] font-semibold hover:underline"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Refresh Counts</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* 1. Scan Started */}
              <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                    Scan Started
                  </span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-emerald-700 mt-2">
                  {dbStats.scan_started.toLocaleString()}
                </div>
                <p className="text-[10px] text-emerald-800/80 font-medium mt-1">
                  Booklets successfully matched
                </p>
              </div>

              {/* 2. Scan Not Started */}
              <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                    Scan Not Started
                  </span>
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-amber-700 mt-2">
                  {dbStats.scan_not_started.toLocaleString()}
                </div>
                <p className="text-[10px] text-amber-800/80 font-medium mt-1">
                  Total Users - Scan Started
                </p>
              </div>

              {/* 3. Imported Users */}
              <div className="bg-white p-4 rounded-xl border border-[#CBD5E1] shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                    Imported Users
                  </span>
                  <Users className="h-4 w-4 text-[#1565D8]" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-[#172033] mt-2">
                  {dbStats.total_imported.toLocaleString()}
                </div>
                <p className="text-[10px] text-[#64748B] font-medium mt-1">
                  Valid imported records
                </p>
              </div>

              {/* 4. Class ID Count */}
              <div className="bg-white p-4 rounded-xl border border-[#CBD5E1] shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                    Class ID Count
                  </span>
                  <Database className="h-4 w-4 text-[#64748B]" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-[#172033] mt-2">
                  {dbStats.class_ids_count}
                </div>
                <p className="text-[10px] text-[#64748B] font-medium mt-1">
                  Unique Class groups
                </p>
              </div>
            </div>
          </div>

          {/* Section 10 & 11: DIRECT CAMERA SCANNER VIEW */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-xs">
            <div className="px-4 py-3 bg-[#172033] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scan className="h-4 w-4 text-[#1565D8]" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Live Barcode Camera Scanner (Auto Class ID Detection)
                </span>
              </div>

              <div className="flex items-center gap-2">
                {cameraActive ? (
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="flex items-center gap-1 px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded text-[11px] font-semibold text-slate-200"
                  >
                    <CameraOff className="h-3 w-3" />
                    <span>Pause</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startCamera}
                    className="flex items-center gap-1 px-2.5 py-1 bg-[#1565D8] hover:bg-[#0D47A1] rounded text-[11px] font-semibold text-white"
                  >
                    <Camera className="h-3 w-3" />
                    <span>Start Camera</span>
                  </button>
                )}
              </div>
            </div>

            {/* Notification Banner */}
            {scannerNotification && (
              <div
                className={`p-3.5 border-b flex items-start justify-between gap-3 text-xs font-semibold ${
                  scannerNotification.type === 'success'
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                    : scannerNotification.type === 'warning'
                    ? 'bg-amber-50 text-amber-900 border-amber-200'
                    : 'bg-rose-50 text-rose-900 border-rose-200'
                }`}
              >
                <div className="flex items-start gap-2">
                  {scannerNotification.type === 'success' && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                  )}
                  {scannerNotification.type === 'warning' && (
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  )}
                  {scannerNotification.type === 'error' && (
                    <XCircle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
                  )}
                  <div>
                    <div className="font-bold">{scannerNotification.title}</div>
                    <div className="text-[11px] font-normal mt-0.5">{scannerNotification.message}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setScannerNotification(null)}
                  className="opacity-70 hover:opacity-100 p-0.5"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Camera Viewport */}
            <div className="relative w-full bg-black min-h-[360px] sm:min-h-[420px] flex items-center justify-center overflow-hidden">
              <video
                ref={videoRef}
                className="w-full h-full object-cover min-h-[360px] sm:min-h-[420px]"
                playsInline
                muted
                autoPlay
              />

              {/* Viewfinder Target Guide Overlay */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="relative w-72 sm:w-96 h-40 sm:h-52 border-2 border-emerald-400/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
                  {/* Four Corner Accents */}
                  <div className="absolute -top-1.5 -left-1.5 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
                  <div className="absolute -top-1.5 -right-1.5 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
                  <div className="absolute -bottom-1.5 -left-1.5 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
                  <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />

                  {/* Pulsing Red Laser Line */}
                  <div className="absolute left-2 right-2 top-1/2 -translate-y-1/2 h-0.5 bg-rose-500 shadow-[0_0_10px_#f43f5e] animate-pulse" />

                  {/* Instructions Badge */}
                  <div className="absolute -bottom-9 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-xs text-white text-[11px] font-bold px-3 py-1 rounded-full whitespace-nowrap border border-white/20">
                    Align Barcode (e.g. 040322MIS0089)
                  </div>
                </div>
              </div>

              {/* Camera Loading Overlay */}
              {cameraLoading && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white z-20">
                  <RefreshCw className="h-8 w-8 animate-spin text-[#1565D8] mb-2" />
                  <p className="text-xs font-semibold">Initializing Device Camera...</p>
                </div>
              )}

              {/* Camera Error Message */}
              {cameraError && !cameraLoading && (
                <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center text-center p-6 text-white z-20">
                  <CameraOff className="h-10 w-10 text-rose-400 mb-3" />
                  <h4 className="text-sm font-bold text-rose-200">Camera Feed Unavailable</h4>
                  <p className="text-xs text-slate-300 max-w-sm mt-1">{cameraError}</p>
                  <button
                    type="button"
                    onClick={startCamera}
                    className="mt-4 px-4 py-2 bg-[#1565D8] hover:bg-[#0D47A1] text-white rounded-lg text-xs font-bold transition-colors"
                  >
                    Retry Camera
                  </button>
                </div>
              )}
            </div>

            {/* Quick Barcode Scanner Input (USB Gun / Manual Entry) */}
            <div className="p-4 bg-[#F8FAFC] border-t border-[#E2E8F0]">
              <form onSubmit={handleManualBarcodeSubmit} className="flex gap-2">
                <div className="relative flex-1">
                  <Scan className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
                  <input
                    type="text"
                    value={manualBarcodeInput}
                    onChange={e => setManualBarcodeInput(e.target.value)}
                    placeholder="Enter or scan barcode (e.g. 040322MIS0089)..."
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-[#CBD5E1] bg-white font-mono focus:outline-none focus:ring-2 focus:ring-[#1565D8]"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#1565D8] hover:bg-[#0D47A1] text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
                >
                  Verify Barcode
                </button>
              </form>
              <div className="flex items-center justify-between text-[11px] text-[#64748B] mt-2">
                <span>First 4 characters automatically detect Class ID (Section 12)</span>
                <span>Auto-updates database</span>
              </div>
            </div>
          </div>

          {/* Section 16: CLASS ID-WISE SCAN PROGRESS TABLE */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#172033]">
                  Class ID Wise Scanning Progress
                </h3>
                <p className="text-xs text-[#64748B]">
                  Real-time status calculated from Supabase <code className="font-mono text-[#1565D8]">imported</code> table
                </p>
              </div>

              {/* Class Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#64748B] font-medium">Filter Class:</span>
                <select
                  value={selectedClassFilter}
                  onChange={e => setSelectedClassFilter(e.target.value)}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-[#CBD5E1] bg-white text-[#172033] font-mono focus:outline-none"
                >
                  <option value="all">All Classes ({classSummaries.length})</option>
                  {classSummaries.map(s => (
                    <option key={s.class_id} value={s.class_id}>
                      Class {s.class_id}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Table */}
            {filteredSummaries.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#64748B]">
                No imported Class data found. Please import an Excel file to begin scanning.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F1F5F9] text-[#64748B] font-semibold border-b border-[#E2E8F0]">
                    <tr>
                      <th className="px-4 py-2.5">Class ID</th>
                      <th className="px-4 py-2.5">Imported</th>
                      <th className="px-4 py-2.5">Scanned</th>
                      <th className="px-4 py-2.5">Remaining</th>
                      <th className="px-4 py-2.5">Progress</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {filteredSummaries.map(summary => {
                      const percent =
                        summary.total_imported > 0
                          ? Math.round((summary.scanned_count / summary.total_imported) * 100)
                          : 0;

                      return (
                        <tr key={summary.class_id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-2.5 font-bold font-mono text-[#172033] text-sm">
                            {summary.class_id}
                          </td>
                          <td className="px-4 py-2.5 font-semibold text-[#172033]">
                            {summary.total_imported.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 font-bold text-emerald-700">
                            {summary.scanned_count.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 font-bold text-amber-700">
                            {summary.remaining_count.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 min-w-[140px]">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-600 transition-all duration-300"
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                              <span className="text-[11px] font-mono font-bold text-[#64748B] w-9 text-right">
                                {percent}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent Scans Activity Log */}
          {recentScans.length > 0 && (
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 shadow-xs">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#64748B] mb-2">
                Recent Scans Live Feed
              </h4>
              <div className="divide-y divide-[#E2E8F0]">
                {recentScans.map(scan => (
                  <div key={scan.id} className="py-2 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="font-mono font-bold text-[#172033]">
                        Class {scan.class_id}
                      </span>
                      <span className="text-[#64748B]">•</span>
                      <span className="font-mono text-[#1565D8]">Member {scan.member_id}</span>
                      <span className="text-[#64748B]">•</span>
                      <span className="font-mono text-[11px] text-[#64748B]">{scan.barcode}</span>
                    </div>
                    <span className="text-[11px] text-[#64748B]">
                      {scan.scanned_at ? new Date(scan.scanned_at).toLocaleTimeString() : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------------
          MODAL: VIEW CLASS GROUP DATA
          ------------------------------------------------------------------------ */}
      {selectedGroupModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-xl border border-[#E2E8F0] max-w-md w-full p-5 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3 mb-3">
              <div>
                <h3 className="text-base font-bold text-[#172033]">
                  Class ID: {selectedGroupModal.classId}
                </h3>
                <p className="text-xs text-[#64748B]">
                  {selectedGroupModal.membersCount.toLocaleString()} Total Members Parsed
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedGroupModal(null)}
                className="text-[#64748B] hover:text-[#172033] p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {selectedGroupModal.members.map((member, idx) => (
                <div
                  key={idx}
                  className="px-3 py-1.5 rounded bg-slate-50 border border-slate-100 flex items-center justify-between text-xs"
                >
                  <span className="text-[#64748B] font-mono">#{idx + 1}</span>
                  <span className="font-mono font-bold text-[#1565D8]">{member}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-[#E2E8F0] flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedGroupModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-[#172033] rounded-lg text-xs font-semibold"
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
