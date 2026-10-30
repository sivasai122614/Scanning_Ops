// ==============================================================================
// ExamScan — Import Data Screen (Sections 13, 14, 18, 19, 20)
// MANDATORY:
// - COLLEGE / UNIVERSITY NAME * is required before file selection / parsing / importing.
// - If empty, blocks with "COLLEGE / UNIVERSITY REQUIRED" and does not process file.
// - Pure string extraction for Class ID and Member ID (preserves leading zeros e.g. 0031).
// - Groups records into Class-Wise Cards with expected booklet counts.
// - Persists into Supabase table 1: import_inwarded_data.
// ==============================================================================

import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Building,
  Download,
  Layers,
  ArrowRight,
  FileCheck,
  Check,
  X,
  Eye,
  AlertOctagon,
  Users,
  LayoutGrid,
  List,
  Search,
  Copy,
  Trash2,
} from 'lucide-react';
import { importedService, ClassBundle } from '../../services/importedService';

interface ParsedRow {
  rowNumber: number;
  classId: string;
  memberId: string;
  barcode?: string;
  unqid: string;
  status: 'valid' | 'duplicate' | 'invalid';
  reason?: string;
  fileOrigin?: string;
}

interface ClassGroupPreview {
  classId: string;
  members: string[];
  count: number;
}

interface FileSummary {
  name: string;
  size: number;
  totalRows: number;
  validRows: number;
  classesCount: number;
}

interface ImportDataViewProps {
  onNavigateToScan: () => void;
  onNavigateToDashboard?: () => void;
  onNavigateToManualInward?: () => void;
}

export const ImportDataView: React.FC<ImportDataViewProps> = ({ onNavigateToScan }) => {
  const [universityName, setUniversityName] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileSummaries, setFileSummaries] = useState<FileSummary[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [universityRequiredError, setUniversityRequiredError] = useState<boolean>(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [classGroups, setClassGroups] = useState<ClassGroupPreview[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [classSearch, setClassSearch] = useState<string>('');
  const [visibleLimit, setVisibleLimit] = useState<number>(60);

  // Tab switch between Class Bundles and All Records (unqid preview)
  const [activeTab, setActiveTab] = useState<'classes' | 'unqid_records'>('classes');
  const [recordSearch, setRecordSearch] = useState<string>('');
  const [recordVisibleLimit, setRecordVisibleLimit] = useState<number>(100);

  // Preview Modal for individual unqid (Unique Member ID)
  const [selectedUnqPreview, setSelectedUnqPreview] = useState<{
    unqid: string;
    classId: string;
    rowNumber?: number;
    university?: string;
    status?: string;
  } | null>(null);
  const [copiedUnqId, setCopiedUnqId] = useState<boolean>(false);

  // Helper to generate barcode visualization bars for unqid preview
  const getBarcodeBars = (code: string) => {
    const bars: { isBlack: boolean; width: number }[] = [];
    bars.push({ isBlack: true, width: 2 }, { isBlack: false, width: 1 }, { isBlack: true, width: 1 }, { isBlack: false, width: 2 });
    for (let i = 0; i < code.length; i++) {
      const charCode = code.charCodeAt(i);
      const w1 = (charCode % 3) + 1;
      const w2 = ((charCode >> 1) % 2) + 1;
      const w3 = ((charCode >> 2) % 3) + 1;
      bars.push(
        { isBlack: true, width: w1 },
        { isBlack: false, width: w2 },
        { isBlack: true, width: w3 },
        { isBlack: false, width: 1 }
      );
    }
    bars.push({ isBlack: true, width: 2 }, { isBlack: false, width: 1 }, { isBlack: true, width: 2 });
    return bars;
  };

  // Existing imported bundles in the system
  const [existingBundles, setExistingBundles] = useState<ClassBundle[]>([]);

  // View Members Modal for Class Card
  const [activeMembersModal, setActiveMembersModal] = useState<{
    classId: string;
    members: string[];
  } | null>(null);

  // Duplicate Records Modal
  const [duplicateModalData, setDuplicateModalData] = useState<{
    total: number;
    newItems: { class_id: string; member_id: string }[];
    duplicateItems: { class_id: string; member_id: string }[];
    allDuplicates: boolean;
  } | null>(null);

  // Step Loading State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>('');

  // Deletion modals state (Synchronized deletion of imported data and saved scan data)
  const [classToDelete, setClassToDelete] = useState<string | null>(null);
  const [showClearAllModal, setShowClearAllModal] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  // Option to replace existing data or append: DEFAULT IS FALSE (Append / accumulate bulk excels)
  const [replaceExistingData, setReplaceExistingData] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const updateFromService = () => {
      const bundles = importedService.getClassBundles();
      setExistingBundles(bundles);
      const activeUni = importedService.getActiveUniversity();
      if (activeUni) {
        setUniversityName(activeUni);
      }
    };

    updateFromService();
    const unsub = importedService.subscribe(updateFromService);
    return () => {
      unsub();
    };
  }, []);

  // Parse a single Excel file into rows
  const parseSingleExcelFile = (file: File): Promise<{ fileName: string; fileSize: number; rows: ParsedRow[] }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const bstr = evt.target?.result;
          const workbook = XLSX.read(bstr, { type: 'binary', cellText: true });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          // raw: false ensures strings with leading zeros like "0031" are preserved as pure strings
          const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

          if (!rawJson || rawJson.length < 2) {
            throw new Error(`File "${file.name}" is empty or does not contain data rows.`);
          }

          const headerRow = rawJson[0].map((h: any) => String(h || '').trim().toLowerCase());

          // Header Detection for Class ID / SH ID:
          let classColIdx = headerRow.findIndex(
            (h: string) => {
              const clean = h.replace(/[^a-z0-9]/g, '');
              return (
                h.includes('class') ||
                h.includes('batch') ||
                h.includes('cls') ||
                h.includes('bundle') ||
                clean === 'sh' ||
                clean === 'shid' ||
                clean === 'clsid' ||
                clean === 'schoolid' ||
                clean === 'scheduleid' ||
                clean === 'schedule' ||
                h.includes('schedule') ||
                h.includes('sh id') ||
                h.includes('sh_id') ||
                h.includes('school id')
              );
            }
          );

          let barcodeColIdx = headerRow.findIndex(
            (h: string, idx: number) =>
              idx !== classColIdx &&
              (h.includes('barcode') ||
               h.includes('bar_code') ||
               h.includes('bar code') ||
               h.includes('barcode value') ||
               h.includes('barcode_value') ||
               h.includes('qr') ||
               h.includes('code'))
          );

          let memberColIdx = headerRow.findIndex(
            (h: string, idx: number) =>
              idx !== classColIdx &&
              idx !== barcodeColIdx &&
              (h.includes('unqid') ||
               h.includes('unq') ||
               h.includes('member') ||
               h.includes('student') ||
               h.includes('roll') ||
               (h.includes('id') && !h.includes('class') && !h.includes('barcode') && !h.includes('sh')))
          );

          if (classColIdx === -1 && memberColIdx === -1 && barcodeColIdx === -1 && headerRow.length >= 2) {
            classColIdx = 0;
            memberColIdx = 1;
            if (headerRow.length >= 3) {
              barcodeColIdx = 2;
            }
          } else if (classColIdx === -1 && memberColIdx === -1 && barcodeColIdx >= 0) {
            // Barcode only column: Class and Member will be extracted from hyphenated values
          } else if (classColIdx === -1 && memberColIdx !== -1) {
            classColIdx = memberColIdx === 0 ? 1 : 0;
          } else if (memberColIdx === -1 && classColIdx !== -1) {
            memberColIdx = classColIdx === 0 ? 1 : 0;
          }

          const fileRows: ParsedRow[] = [];
          const seenInThisFile = new Set<string>();

          for (let i = 1; i < rawJson.length; i++) {
            const rowData = rawJson[i];
            if (!rowData || rowData.length === 0) continue;

            // Pure string extraction to preserve leading zeros e.g. 0020
            let rawClass = classColIdx >= 0 ? String(rowData[classColIdx] ?? '').trim() : '';
            let rawMember = memberColIdx >= 0 ? String(rowData[memberColIdx] ?? '').trim() : '';
            let rawBarcode = barcodeColIdx >= 0 ? String(rowData[barcodeColIdx] ?? '').trim() : '';

            // Rule: Split hyphenated barcodes if needed
            if (rawBarcode && rawBarcode.includes('-')) {
              const dashIdx = rawBarcode.indexOf('-');
              const partLeft = rawBarcode.substring(0, dashIdx).trim();
              const partRight = rawBarcode.substring(dashIdx + 1).trim();
              if (!rawClass && partLeft) rawClass = partLeft;
              if (!rawMember && partRight) rawMember = partRight;
            }

            if (!rawClass && rawMember && rawMember.includes('-')) {
              const dashIdx = rawMember.indexOf('-');
              const partLeft = rawMember.substring(0, dashIdx).trim();
              const partRight = rawMember.substring(dashIdx + 1).trim();
              if (partLeft && partRight) {
                if (!rawBarcode) rawBarcode = rawMember;
                rawClass = partLeft;
                rawMember = partRight;
              }
            }

            if (rawClass && !rawMember && rawClass.includes('-')) {
              const dashIdx = rawClass.indexOf('-');
              const partLeft = rawClass.substring(0, dashIdx).trim();
              const partRight = rawClass.substring(dashIdx + 1).trim();
              if (partLeft && partRight) {
                if (!rawBarcode) rawBarcode = rawClass;
                rawClass = partLeft;
                rawMember = partRight;
              }
            }

            const finalBarcode = rawBarcode || (rawClass && rawMember ? `${rawClass}-${rawMember}` : rawMember);

            if (!rawClass && !rawMember) continue;

            if (!rawClass || !rawMember) {
              fileRows.push({
                rowNumber: i + 1,
                classId: rawClass || 'MISSING',
                memberId: rawMember || 'MISSING',
                barcode: finalBarcode || undefined,
                unqid: rawMember || 'MISSING',
                status: 'invalid',
                reason: !rawClass ? 'Class ID / SH ID is blank' : 'Member ID / unqid is blank',
                fileOrigin: file.name,
              });
              continue;
            }

            const uniqueKey = `${rawClass.toLowerCase()}::${rawMember.toLowerCase()}`;
            if (seenInThisFile.has(uniqueKey)) {
              fileRows.push({
                rowNumber: i + 1,
                classId: rawClass,
                memberId: rawMember,
                barcode: finalBarcode,
                unqid: rawMember,
                status: 'duplicate',
                reason: `Duplicate in ${file.name}`,
                fileOrigin: file.name,
              });
              continue;
            }

            seenInThisFile.add(uniqueKey);
            fileRows.push({
              rowNumber: i + 1,
              classId: rawClass,
              memberId: rawMember,
              barcode: finalBarcode,
              unqid: rawMember,
              status: 'valid',
              fileOrigin: file.name,
            });
          }

          resolve({
            fileName: file.name,
            fileSize: file.size,
            rows: fileRows,
          });
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => reject(new Error(`Failed to read "${file.name}".`));
      reader.readAsBinaryString(file);
    });
  };

  // Process multiple Excel files simultaneously or append to existing list
  const processExcelFiles = async (files: File[], appendToExisting: boolean = false) => {
    // SECTION 13: COLLEGE / UNIVERSITY REQUIRED CHECK BEFORE PARSING/IMPORTING
    if (!universityName.trim()) {
      setUniversityRequiredError(true);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUniversityRequiredError(false);
    setParseError(null);
    setIsParsing(true);

    try {
      const targetFiles = appendToExisting ? [...selectedFiles, ...files] : files;
      // Deduplicate file objects by name + size
      const uniqueFiles = targetFiles.filter(
        (f, idx, arr) => arr.findIndex(x => x.name === f.name && x.size === f.size) === idx
      );

      const parsedResults = await Promise.all(uniqueFiles.map(f => parseSingleExcelFile(f)));

      const combinedRows: ParsedRow[] = [];
      const summaries: FileSummary[] = [];
      const globalSeen = new Set<string>();
      const groupMap = new Map<string, string[]>();
      let runningRowIndex = 1;

      for (const res of parsedResults) {
        let fileValidCount = 0;
        const fileClassSet = new Set<string>();

        for (const r of res.rows) {
          const uniqueKey = `${r.classId.toLowerCase()}::${r.memberId.toLowerCase()}`;
          const isDup = globalSeen.has(uniqueKey);

          if (!isDup && r.status === 'valid') {
            globalSeen.add(uniqueKey);
            fileValidCount++;
            fileClassSet.add(r.classId);
            if (!groupMap.has(r.classId)) {
              groupMap.set(r.classId, []);
            }
            groupMap.get(r.classId)!.push(r.memberId);

            combinedRows.push({
              ...r,
              rowNumber: runningRowIndex++,
              fileOrigin: res.fileName,
            });
          } else if (isDup && r.status === 'valid') {
            combinedRows.push({
              ...r,
              rowNumber: runningRowIndex++,
              fileOrigin: res.fileName,
              status: 'duplicate',
              reason: `Already present from earlier row/file in batch`,
            });
          } else {
            combinedRows.push({
              ...r,
              rowNumber: runningRowIndex++,
              fileOrigin: res.fileName,
            });
          }
        }

        summaries.push({
          name: res.fileName,
          size: res.fileSize,
          totalRows: res.rows.length,
          validRows: fileValidCount,
          classesCount: fileClassSet.size,
        });
      }

      if (combinedRows.length === 0) {
        throw new Error('No records could be extracted from the selected Excel files.');
      }

      const groups: ClassGroupPreview[] = [];
      groupMap.forEach((members, classId) => {
        groups.push({ classId, members, count: members.length });
      });
      groups.sort((a, b) => a.classId.localeCompare(b.classId, undefined, { numeric: true, sensitivity: 'base' }));

      setSelectedFiles(uniqueFiles);
      setFileSummaries(summaries);
      setParsedRows(combinedRows);
      setClassGroups(groups);
      setIsParsing(false);
    } catch (err: any) {
      console.warn('Excel parse error:', err);
      setParseError(err?.message || 'Failed to parse Excel file(s).');
      setIsParsing(false);
    }
  };

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filesList = e.target.files;
    if (!filesList || filesList.length === 0) return;
    const files = Array.from(filesList);
    processExcelFiles(files, true);
  };

  const removeSelectedFile = (indexToRemove: number) => {
    const updated = selectedFiles.filter((_, idx) => idx !== indexToRemove);
    if (updated.length === 0) {
      setSelectedFiles([]);
      setFileSummaries([]);
      setParsedRows([]);
      setClassGroups([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } else {
      processExcelFiles(updated, false);
    }
  };

  /**
   * Pre-import duplicate validation
   */
  const handleInitiateImport = () => {
    // SECTION 13: Mandatory College/University check
    if (!universityName.trim()) {
      setUniversityRequiredError(true);
      return;
    }

    const validRows = parsedRows.filter(r => r.status === 'valid');
    if (validRows.length === 0) {
      setParseError('No valid rows to import.');
      return;
    }

    const items = validRows.map(r => ({
      class_id: r.classId,
      member_id: r.memberId,
      barcode: r.barcode || r.memberId,
    }));

    // If append mode, check against database to notify if some already exist
    if (!replaceExistingData) {
      const dupCheck = importedService.checkDuplicates(items);
      if (dupCheck.hasDuplicates) {
        setDuplicateModalData({
          total: items.length,
          newItems: dupCheck.newItems,
          duplicateItems: dupCheck.duplicateItems,
          allDuplicates: dupCheck.allDuplicates,
        });
        return;
      }
    }

    executeImport(items);
  };

  const handleConfirmDeleteClass = async () => {
    if (!classToDelete) return;
    setIsDeleting(true);
    try {
      await importedService.deleteClassBundle(classToDelete);
      setClassToDelete(null);
    } catch (e) {
      console.warn('Delete class error:', e);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmClearAll = async () => {
    setIsDeleting(true);
    try {
      await importedService.clearAllImportedAndScannedData();
      setShowClearAllModal(false);
    } catch (e) {
      console.warn('Clear all error:', e);
    } finally {
      setIsDeleting(false);
    }
  };

  const executeImport = async (itemsToInsert: { class_id: string; member_id: string; barcode?: string }[]) => {
    setDuplicateModalData(null);
    setIsProcessing(true);

    try {
      const fileNamesList = selectedFiles.map(f => f.name).join(', ') || 'bulk_import.xlsx';
      setProcessingStep(`IMPORTING ${itemsToInsert.length} CANDIDATES FROM ${selectedFiles.length || 1} EXCEL FILE(S)...`);
      await new Promise(r => setTimeout(r, 350));

      setProcessingStep('VALIDATING CLASS IDs & MEMBER BOOKLETS...');
      await new Promise(r => setTimeout(r, 350));

      setProcessingStep('SAVING TO DATABASE & CALCULATING CLASS ID COUNTS...');
      const res = await importedService.bulkInsert(
        itemsToInsert,
        universityName.trim(),
        fileNamesList,
        undefined,
        replaceExistingData
      );

      if (!res.success) {
        throw new Error(res.error || 'Failed to save imported records.');
      }

      await new Promise(r => setTimeout(r, 350));
      setProcessingStep('OPENING SCANNING DASHBOARD...');
      await new Promise(r => setTimeout(r, 350));

      // Automatically navigate to Scan screen!
      onNavigateToScan();
    } catch (err: any) {
      console.warn('Import execution error:', err);
      setParseError(err?.message || 'Error saving imported records.');
      setIsProcessing(false);
    }
  };

  const handleDownloadSample = () => {
    const sampleData = [
      { 'Class ID': '0020', 'Member ID': '002024EMBA1308', 'Barcode': '002024EMBA1308' },
      { 'Class ID': '0020', 'Member ID': '002024EMBA1309', 'Barcode': '002024EMBA1309' },
      { 'Class ID': '0021', 'Member ID': '002124EMBA1601', 'Barcode': '002124EMBA1601' },
      { 'Class ID': '0021', 'Member ID': '002124EMBA1602', 'Barcode': '002124EMBA1602' },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'InwardingTemplate');
    XLSX.writeFile(wb, 'InwardScan_Template.xlsx');
  };

  const validCount = parsedRows.filter(r => r.status === 'valid').length;

  return (
    <div className="space-y-6 font-sans w-full pb-16">
      {/* Embedded High-Performance Wave Animation Keyframes */}
      <style>{`
        @keyframes import-sine-1 {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes import-sine-2 {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
        .anim-import-sine-1 {
          animation: import-sine-1 14s linear infinite;
        }
        .anim-import-sine-2 {
          animation: import-sine-2 20s linear infinite;
        }
      `}</style>

      {/* 1. Step-by-Step Processing Overlay */}
      {isProcessing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white border border-[#CBD5E1] rounded-2xl shadow-2xl p-6 text-center">
            <div className="h-12 w-12 border-4 border-[#1565D8]/20 border-t-[#1565D8] rounded-full animate-spin mx-auto mb-4" />
            <div className="text-sm font-black uppercase tracking-wider text-[#1565D8]">
              {processingStep}
            </div>
            <div className="text-xs text-[#64748B] mt-2">
              Preparing class bundles and synchronizing database records...
            </div>
          </div>
        </div>
      )}

      {/* SECTION 13: COLLEGE / UNIVERSITY REQUIRED ERROR MODAL */}
      {universityRequiredError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-md bg-white border border-[#FECACA] rounded-2xl shadow-2xl p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center bg-[#EF4444] text-white rounded-xl mx-auto mb-3">
              <AlertOctagon className="h-7 w-7" />
            </div>

            <div className="text-base font-extrabold tracking-wide uppercase text-[#991B1B]">
              COLLEGE / UNIVERSITY REQUIRED
            </div>

            <p className="text-xs text-[#7F1D1D] mt-3 mb-5 leading-relaxed font-semibold">
              Please enter/select the College/University name before importing the Excel file.
            </p>

            <button
              type="button"
              onClick={() => setUniversityRequiredError(false)}
              className="w-full py-2.5 bg-[#1565D8] hover:bg-[#0D47A1] text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
            >
              ENTER UNIVERSITY NAME
            </button>
          </div>
        </div>
      )}

      {/* Hero Data Ingestion Wave Banner (Full Width) */}
      <div className="relative overflow-hidden rounded-2xl border border-[#CBD5E1] bg-gradient-to-r from-blue-900 via-[#1565D8] to-indigo-900 p-5 sm:p-6 text-white shadow-md">
        <div className="absolute inset-0 pointer-events-none opacity-25 overflow-hidden">
          <svg className="absolute w-[200%] h-full anim-import-sine-1" preserveAspectRatio="none" viewBox="0 0 1200 120">
            <path
              d="M0,40 C150,90 350,0 500,45 C650,90 850,10 1000,50 C1150,90 1200,40 1200,40 L1200,120 L0,120 Z"
              fill="rgba(56, 189, 248, 0.4)"
            />
          </svg>
          <svg className="absolute w-[200%] h-full anim-import-sine-2" preserveAspectRatio="none" viewBox="0 0 1200 120">
            <path
              d="M0,60 C200,10 400,80 600,40 C800,0 1000,70 1200,50 L1200,120 L0,120 Z"
              fill="rgba(129, 140, 248, 0.35)"
            />
          </svg>
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-cyan-400/20 border border-cyan-300/40 text-cyan-200 text-[10px] font-black uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 animate-pulse" />
              <span>EXAMINATION SCRIPT BASELINE DATASET INGESTION</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-1">
              Import Class Bundles &amp; Candidate Baseline
            </h2>
            <p className="text-xs text-blue-100 max-w-2xl mt-0.5">
              Upload institutional Excel dataset (.xlsx, .csv). Classes and expected booklet totals are structured into live inward bundles across all operator stations.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            <button
              type="button"
              onClick={handleDownloadSample}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/15 hover:bg-white/25 border border-white/25 rounded-xl text-xs font-black uppercase tracking-wider text-white backdrop-blur-md shadow-xs transition-all active:scale-95 cursor-pointer"
            >
              <Download className="h-4 w-4" />
              <span>Sample Template</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Primary Card: UPLOAD INWARD EXCEL FILE (Full Width) */}
      <div className="bg-white border border-[#CBD5E1] rounded-2xl shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 bg-gradient-to-r from-[#1565D8] to-[#0D47A1] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center bg-white/15 rounded-xl">
              <FileSpreadsheet className="h-6 w-6 text-white" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-white/80 font-bold">Data Ingestion Engine</div>
              <h1 className="text-base sm:text-lg font-bold">UPLOAD INWARD EXCEL FILE</h1>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-5">
          {/* Required Columns Specification Banner */}
          <div className="p-4 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl text-xs text-[#1E40AF]">
            <div className="font-bold uppercase tracking-wider text-[11px] mb-1.5">Required Baseline Columns:</div>
            <div className="flex items-center gap-3 text-xs font-mono font-semibold">
              <span className="bg-white px-3 py-1 border border-[#BFDBFE] rounded-lg shadow-2xs">Class ID</span>
              <span className="text-[#64748B] font-sans">and</span>
              <span className="bg-white px-3 py-1 border border-[#BFDBFE] rounded-lg shadow-2xs">Member ID</span>
            </div>
            <div className="text-xs text-[#3B82F6] mt-2 font-sans">
              Columns are auto-detected by header name. Leading zeros (e.g. 0031) are strictly preserved as text.
            </div>
          </div>

          {/* SECTION 13: MANDATORY COLLEGE / UNIVERSITY NAME */}
          <div>
            <label className="block text-xs font-bold text-[#172033] uppercase tracking-wider mb-1">
              COLLEGE / UNIVERSITY NAME <span className="text-red-500 font-black">*</span>
            </label>
            <div className="relative">
              <Building className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
              <input
                type="text"
                value={universityName}
                onChange={e => {
                  setUniversityName(e.target.value);
                  if (e.target.value.trim()) setUniversityRequiredError(false);
                }}
                placeholder="Enter College / University Name (e.g. Osmania, JNTU, Andhra University...)"
                className={`w-full pl-9 pr-3 py-2 border rounded-lg text-xs text-[#172033] bg-white focus:outline-hidden focus:border-[#1565D8] ${
                  !universityName.trim() ? 'border-[#EF4444] bg-red-50/20' : 'border-[#CBD5E1]'
                }`}
              />
            </div>
            {!universityName.trim() && (
              <span className="text-[11px] text-[#DC2626] font-semibold mt-1 block">
                College / University name is mandatory before selecting an Excel file.
              </span>
            )}
          </div>

          {/* Upload Drop Zone (Supports multiple bulk Excel files) */}
          <div
            onClick={() => {
              if (!universityName.trim()) {
                setUniversityRequiredError(true);
                return;
              }
              fileInputRef.current?.click();
            }}
            className="border-2 border-dashed border-[#CBD5E1] hover:border-[#1565D8] bg-[#F8FAFC] hover:bg-blue-50/40 rounded-xl p-6 text-center cursor-pointer transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              multiple
              className="hidden"
              onChange={handleFilesChange}
            />

            <Upload className="h-8 w-8 text-[#1565D8] mx-auto mb-2" />
            <div className="text-xs font-bold text-[#172033]">
              {selectedFiles.length > 0
                ? `${selectedFiles.length} Excel file(s) selected — Click or drop more to append`
                : 'Select or drop your Inward Excel file(s) here (Supports multiple bulk Excels at once)'}
            </div>
            <div className="text-[11px] text-[#64748B] mt-1">
              Supports .xlsx, .xls, and .csv formats • Select single or multiple files together
            </div>

            {/* List of uploaded files with individual badges */}
            {fileSummaries.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-200 flex flex-wrap items-center justify-center gap-2">
                {fileSummaries.map((f, idx) => (
                  <div
                    key={f.name + idx}
                    onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-xl text-xs text-[#1565D8] shadow-2xs"
                  >
                    <FileCheck className="h-4 w-4 text-[#16A34A] shrink-0" />
                    <span className="font-mono font-bold">{f.name}</span>
                    <span className="text-[10px] text-slate-500 font-tabular">
                      ({(f.size / 1024).toFixed(1)} KB • {f.validRows} records • {f.classesCount} Class IDs)
                    </span>
                    <button
                      type="button"
                      onClick={() => removeSelectedFile(idx)}
                      className="p-0.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                      title={`Remove ${f.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#1565D8] border border-blue-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  <span>+ Add More Excels</span>
                </button>
              </div>
            )}
          </div>

          {/* Error Message */}
          {parseError && (
            <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-xs text-[#991B1B] flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-[#EF4444]" />
              <span>{parseError}</span>
            </div>
          )}

          {/* Parsing Spinner */}
          {isParsing && (
            <div className="p-4 text-center text-xs text-[#64748B]">
              <div className="h-6 w-6 border-2 border-[#1565D8] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <span>Parsing and validating Excel columns across files...</span>
            </div>
          )}

          {/* 3. CLASS ID WISE IMPORT CARDS */}
          {classGroups.length > 0 && !isParsing && (
            <div className="space-y-4 pt-2 border-t border-[#E2E8F0]">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[10px] font-bold text-[#64748B] uppercase">Total Files</div>
                  <div className="text-base font-bold text-[#172033] mt-0.5">{selectedFiles.length}</div>
                </div>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[10px] font-bold text-[#64748B] uppercase">Total Records</div>
                  <div className="text-base font-bold text-[#172033] mt-0.5">{parsedRows.length}</div>
                </div>
                <div className="p-2.5 bg-[#DCFCE7] border border-[#BBF7D0] rounded-lg">
                  <div className="text-[10px] font-bold text-[#166534] uppercase">Valid Records</div>
                  <div className="text-base font-bold text-[#16A34A] mt-0.5">{validCount}</div>
                </div>
                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="text-[10px] font-bold text-[#1565D8] uppercase">Unique Class IDs</div>
                  <div className="text-base font-bold text-[#1565D8] mt-0.5">{classGroups.length}</div>
                </div>
              </div>

              {/* View Section Switcher Tabs: Class ID Bundles vs Records Preview (unqid) */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] pb-3">
                <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setActiveTab('classes')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                      activeTab === 'classes'
                        ? 'bg-white text-[#1565D8] shadow-xs'
                        : 'text-[#64748B] hover:text-[#172033]'
                    }`}
                  >
                    <Layers className="h-3.5 w-3.5" />
                    <span>Class ID Bundles ({classGroups.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('unqid_records')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                      activeTab === 'unqid_records'
                        ? 'bg-white text-[#1565D8] shadow-xs'
                        : 'text-[#64748B] hover:text-[#172033]'
                    }`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>All Records / unqid Preview ({validCount})</span>
                  </button>
                </div>

                <div className="text-[11px] text-[#64748B] flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5 text-[#1565D8]" />
                  <span>Click any <strong className="text-[#172033]">Eye icon</strong> to preview unique member ID (unqid)</span>
                </div>
              </div>

              {/* TAB 1: CLASS ID BUNDLES */}
              {activeTab === 'classes' && (
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-[#172033] flex items-center gap-1.5">
                      <Layers className="h-4 w-4 text-[#1565D8]" />
                      <span>Class ID Wise Import Records:</span>
                      <span className="px-2 py-0.5 bg-blue-50 text-[#1565D8] border border-blue-200 rounded-full font-mono text-[10px]">
                        {classGroups.length} Class IDs
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Quick Class Search */}
                      <div className="relative">
                        <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#64748B]" />
                        <input
                          type="text"
                          value={classSearch}
                          onChange={e => {
                            setClassSearch(e.target.value);
                            setVisibleLimit(60);
                          }}
                          placeholder="Filter Class ID..."
                          className="pl-8 pr-2.5 py-1 text-xs border border-[#CBD5E1] rounded-lg bg-white focus:outline-none focus:border-[#1565D8] w-36 sm:w-44 text-[#172033]"
                        />
                        {classSearch && (
                          <button
                            type="button"
                            onClick={() => setClassSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#172033]"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      {/* View Mode Toggle: Grid vs List */}
                      <div className="flex items-center border border-[#CBD5E1] rounded-lg p-0.5 bg-slate-100 shrink-0">
                        <button
                          type="button"
                          onClick={() => setViewMode('grid')}
                          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                            viewMode === 'grid'
                              ? 'bg-white text-[#1565D8] shadow-xs'
                              : 'text-[#64748B] hover:text-[#172033]'
                          }`}
                          title="Grid View"
                        >
                          <LayoutGrid className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Grid</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMode('list')}
                          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                            viewMode === 'list'
                              ? 'bg-white text-[#1565D8] shadow-xs'
                              : 'text-[#64748B] hover:text-[#172033]'
                          }`}
                          title="List View"
                        >
                          <List className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">List</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Filter Empty State */}
                  {classGroups.filter(cg => !classSearch.trim() || cg.classId.toLowerCase().includes(classSearch.trim().toLowerCase())).length === 0 ? (
                    <div className="p-8 text-center bg-white border border-[#CBD5E1] rounded-xl text-xs text-[#64748B]">
                      No classes found matching "{classSearch}".
                    </div>
                  ) : viewMode === 'grid' ? (
                    /* 1. GRID VIEW */
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {classGroups
                        .filter(cg => !classSearch.trim() || cg.classId.toLowerCase().includes(classSearch.trim().toLowerCase()))
                        .slice(0, visibleLimit)
                        .map(cg => (
                          <div
                            key={cg.classId}
                            className="p-4 bg-white border border-[#CBD5E1] hover:border-[#1565D8] rounded-xl shadow-xs flex flex-col justify-between transition-colors"
                          >
                            <div>
                              <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                                CLASS ID
                              </div>
                              <div className="font-mono font-black text-lg text-[#172033] mt-0.5">
                                {cg.classId}
                              </div>
                              <div className="text-xs font-semibold text-[#1565D8] mt-1">
                                {cg.count} Members (unqid)
                              </div>
                              <div className="text-xs text-[#64748B] mt-0.5">
                                Expected Booklets: <strong className="text-[#172033] font-bold">{cg.count}</strong>
                              </div>
                            </div>

                            <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between">
                              <button
                                type="button"
                                onClick={() =>
                                  setActiveMembersModal({
                                    classId: cg.classId,
                                    members: cg.members,
                                  })
                                }
                                className="px-2.5 py-1 text-xs font-bold text-[#1565D8] hover:bg-blue-50 rounded-lg border border-[#BFDBFE] transition-colors flex items-center gap-1.5 cursor-pointer"
                                title="Click to view & preview all unq member IDs for this class"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span>Preview unqid ({cg.count})</span>
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    /* 2. LIST VIEW */
                    <div className="bg-white border border-[#CBD5E1] rounded-xl shadow-xs overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] uppercase tracking-wider text-[#64748B] font-bold">
                            <tr>
                              <th className="py-2.5 px-4 w-12 text-center">#</th>
                              <th className="py-2.5 px-4">Class ID / SH ID</th>
                              <th className="py-2.5 px-4 text-center">Members (unqid)</th>
                              <th className="py-2.5 px-4 text-center">Expected Booklets</th>
                              <th className="py-2.5 px-4 text-center">Status</th>
                              <th className="py-2.5 px-4 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {classGroups
                              .filter(cg => !classSearch.trim() || cg.classId.toLowerCase().includes(classSearch.trim().toLowerCase()))
                              .slice(0, visibleLimit)
                              .map((cg, idx) => (
                                <tr key={cg.classId} className="hover:bg-blue-50/30 transition-colors">
                                  <td className="py-2.5 px-4 text-center font-mono text-[11px] text-[#64748B]">
                                    {idx + 1}
                                  </td>
                                  <td className="py-2.5 px-4">
                                    <span className="font-mono font-bold text-sm text-[#172033] bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                                      {cg.classId}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-4 text-center font-semibold text-[#1565D8]">
                                    {cg.count}
                                  </td>
                                  <td className="py-2.5 px-4 text-center font-bold text-[#172033]">
                                    {cg.count}
                                  </td>
                                  <td className="py-2.5 px-4 text-center">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[#DCFCE7] text-[#166534] border border-[#BBF7D0]">
                                      Ready to Inward
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-4 text-right">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setActiveMembersModal({
                                          classId: cg.classId,
                                          members: cg.members,
                                        })
                                      }
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-[#1565D8] hover:bg-blue-50 rounded-lg border border-[#BFDBFE] transition-colors cursor-pointer"
                                      title="Preview unqid for this class"
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                      <span>Preview unqid ({cg.count})</span>
                                    </button>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Pagination / Load More if large dataset */}
                  {classGroups.filter(cg => !classSearch.trim() || cg.classId.toLowerCase().includes(classSearch.trim().toLowerCase())).length > visibleLimit && (
                    <div className="mt-3 p-3 bg-white border border-[#CBD5E1] rounded-xl flex items-center justify-between text-xs">
                      <span className="text-[#64748B]">
                        Showing <strong className="text-[#172033]">{visibleLimit}</strong> of{' '}
                        <strong className="text-[#1565D8]">
                          {classGroups.filter(cg => !classSearch.trim() || cg.classId.toLowerCase().includes(classSearch.trim().toLowerCase())).length}
                        </strong>{' '}
                        classes
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setVisibleLimit(prev => prev + 60)}
                          className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-[#172033] font-bold rounded-lg border border-slate-300 transition-colors cursor-pointer"
                        >
                          Load Next 60
                        </button>
                        <button
                          type="button"
                          onClick={() => setVisibleLimit(classGroups.length)}
                          className="px-3 py-1 bg-[#1565D8] hover:bg-[#0D47A1] text-white font-bold rounded-lg transition-colors cursor-pointer"
                        >
                          Show All
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: ALL RECORDS / UNQID PREVIEW (With Eye symbol per record) */}
              {activeTab === 'unqid_records' && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-[#172033] flex items-center gap-1.5">
                        <Eye className="h-4 w-4 text-[#1565D8]" />
                        <span>All Inward Records Preview (unqid):</span>
                        <span className="px-2 py-0.5 bg-blue-50 text-[#1565D8] border border-blue-200 rounded-full font-mono text-[10px]">
                          {parsedRows.length} Records
                        </span>
                      </div>
                      <div className="text-[11px] text-[#64748B] mt-0.5">
                        Click the <strong className="text-[#1565D8]">Eye icon</strong> on any row to open the detailed Unique Member ID preview.
                      </div>
                    </div>

                    {/* Search unqid or Class */}
                    <div className="relative">
                      <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#64748B]" />
                      <input
                        type="text"
                        value={recordSearch}
                        onChange={e => {
                          setRecordSearch(e.target.value);
                          setRecordVisibleLimit(100);
                        }}
                        placeholder="Search unqid or Class ID..."
                        className="pl-8 pr-2.5 py-1 text-xs border border-[#CBD5E1] rounded-lg bg-white focus:outline-none focus:border-[#1565D8] w-48 sm:w-60 text-[#172033]"
                      />
                      {recordSearch && (
                        <button
                          type="button"
                          onClick={() => setRecordSearch('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#172033]"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Records Table */}
                  <div className="bg-white border border-[#CBD5E1] rounded-xl shadow-xs overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] uppercase tracking-wider text-[#64748B] font-bold">
                          <tr>
                            <th className="py-2.5 px-4 w-12 text-center">Row #</th>
                            <th className="py-2.5 px-4">Class ID</th>
                            <th className="py-2.5 px-4">Unique Member ID (unqid)</th>
                            <th className="py-2.5 px-4 text-center">Status</th>
                            <th className="py-2.5 px-4 text-right">Preview (unqid)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {parsedRows
                            .filter(r => {
                              if (!recordSearch.trim()) return true;
                              const q = recordSearch.trim().toLowerCase();
                              return r.unqid.toLowerCase().includes(q) || r.classId.toLowerCase().includes(q);
                            })
                            .slice(0, recordVisibleLimit)
                            .map(r => (
                              <tr key={`${r.rowNumber}-${r.classId}-${r.unqid}`} className="hover:bg-blue-50/30 transition-colors">
                                <td className="py-2.5 px-4 text-center font-mono text-[11px] text-[#64748B]">
                                  {r.rowNumber}
                                </td>
                                <td className="py-2.5 px-4">
                                  <span className="font-mono font-bold text-xs text-[#172033] bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                    {r.classId}
                                  </span>
                                </td>
                                <td className="py-2.5 px-4 font-mono font-bold text-xs text-[#1565D8]">
                                  {r.unqid}
                                </td>
                                <td className="py-2.5 px-4 text-center">
                                  {r.status === 'valid' ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[#DCFCE7] text-[#166534] border border-[#BBF7D0]">
                                      VALID
                                    </span>
                                  ) : r.status === 'duplicate' ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                                      DUPLICATE
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[#FEE2E2] text-[#991B1B] border border-[#FECACA]">
                                      INVALID
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-4 text-right">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSelectedUnqPreview({
                                        unqid: r.unqid,
                                        classId: r.classId,
                                        rowNumber: r.rowNumber,
                                        university: universityName,
                                        status: r.status,
                                      })
                                    }
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-[#1565D8] hover:bg-blue-50 rounded-lg border border-[#BFDBFE] transition-colors cursor-pointer"
                                    title={`Preview unqid: ${r.unqid}`}
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                    <span>Preview unqid</span>
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Load more records pagination */}
                  {parsedRows.filter(r => {
                    if (!recordSearch.trim()) return true;
                    const q = recordSearch.trim().toLowerCase();
                    return r.unqid.toLowerCase().includes(q) || r.classId.toLowerCase().includes(q);
                  }).length > recordVisibleLimit && (
                    <div className="p-3 bg-white border border-[#CBD5E1] rounded-xl flex items-center justify-between text-xs">
                      <span className="text-[#64748B]">
                        Showing <strong className="text-[#172033]">{recordVisibleLimit}</strong> of{' '}
                        <strong className="text-[#1565D8]">
                          {parsedRows.filter(r => {
                            if (!recordSearch.trim()) return true;
                            const q = recordSearch.trim().toLowerCase();
                            return r.unqid.toLowerCase().includes(q) || r.classId.toLowerCase().includes(q);
                          }).length}
                        </strong>{' '}
                        records
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setRecordVisibleLimit(prev => prev + 100)}
                          className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-[#172033] font-bold rounded-lg border border-slate-300 transition-colors cursor-pointer"
                        >
                          Load Next 100
                        </button>
                        <button
                          type="button"
                          onClick={() => setRecordVisibleLimit(parsedRows.length)}
                          className="px-3 py-1 bg-[#1565D8] hover:bg-[#0D47A1] text-white font-bold rounded-lg transition-colors cursor-pointer"
                        >
                          Show All
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Import Mode Options (Append is default, allows bulk multi-excel accumulation) */}
              <div className="pt-3 pb-2 border-t border-[#E2E8F0] space-y-2">
                <div className="p-3.5 rounded-xl border transition-colors bg-slate-50 border-slate-200">
                  <label className="flex items-start gap-2.5 cursor-pointer text-xs font-bold text-[#172033]">
                    <input
                      type="checkbox"
                      checked={replaceExistingData}
                      onChange={e => setReplaceExistingData(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#1565D8] focus:ring-[#1565D8]"
                    />
                    <div>
                      <span>Fresh Start: Wipe previous Class IDs &amp; reset scan records</span>
                      <p className="text-[11px] text-slate-500 font-normal mt-0.5 leading-relaxed">
                        {replaceExistingData
                          ? '⚠️ Overwrite Mode: Will wipe existing Class IDs and scans to start fresh with this import.'
                          : '✓ Append & Merge Mode (Default): Combines these Excel files with all previously imported Class IDs without deleting earlier batches or scans. Yenni Excels import chesina automatic ga accumulate aipothayi.'}
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Action Button: Import & Save to Database */}
              <div className="pt-3 border-t border-[#E2E8F0] flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs text-[#64748B]">
                  Ready to ingest <strong className="text-[#172033]">{validCount}</strong> expected records across <strong className="text-[#1565D8]">{classGroups.length} Class IDs</strong> from <strong className="text-[#1565D8]">{selectedFiles.length || 1} Excel file(s)</strong> for <strong className="text-[#1565D8]">{universityName}</strong>.
                </div>
                <button
                  type="button"
                  onClick={handleInitiateImport}
                  className="w-full sm:w-auto px-6 py-2.5 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-black uppercase tracking-wider rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Check className="h-4 w-4 stroke-[3]" />
                  <span>Import {classGroups.length} Class IDs &amp; Open Scanner</span>
                </button>
              </div>
            </div>
          )}

          {/* Active Inward Database Overview when no new file is currently parsed */}
          {classGroups.length === 0 && !isParsing && existingBundles.length > 0 && (
            <div className="pt-4 border-t border-[#E2E8F0] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-[#172033] flex items-center gap-1.5">
                    <Building className="h-4 w-4 text-[#1565D8]" />
                    <span>Active Inward System Data ({existingBundles.length} Class IDs):</span>
                  </div>
                  <div className="text-[11px] text-[#64748B] mt-0.5">
                    Deleting a Class ID strictly purges its imported records AND saved scan data.
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setShowClearAllModal(true)}
                    className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-300 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                    title="Clear all imported classes and wipe saved scan data"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Clear All Inward Data</span>
                  </button>
                  {onNavigateToScan && (
                    <button
                      type="button"
                      onClick={onNavigateToScan}
                      className="px-3.5 py-1.5 bg-[#1565D8] hover:bg-[#0D47A1] text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Open Scan Dashboard</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-4 sm:gap-5">
                {existingBundles.slice(0, 16).map(b => (
                  <div
                    key={b.classId}
                    className="p-5 bg-white border border-[#CBD5E1] rounded-2xl shadow-xs hover:border-[#1565D8] hover:shadow-md transition-all duration-200 flex flex-col justify-between hover:-translate-y-0.5"
                  >
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-bold text-[#64748B] uppercase">
                        <span>CLASS / SH ID</span>
                        <span className="text-[#1565D8] font-mono font-bold bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">{b.expectedCount} Expected</span>
                      </div>
                      <div className="font-mono font-black text-xl text-[#172033] mt-1.5">
                        {b.classId}
                      </div>
                      <div className="text-xs text-[#64748B] mt-2 flex items-center gap-2">
                        <span>Scanned: <strong className="text-[#16A34A] font-tabular">{b.savedCount}</strong></span>
                        <span>•</span>
                        <span>Pending: <strong className="text-[#D97706] font-tabular">{b.pendingCount}</strong></span>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const records = importedService.getBundleRecordViews(b.classId);
                          setActiveMembersModal({
                            classId: b.classId,
                            members: records.map(r => r.member_id),
                          });
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#1565D8] hover:bg-blue-50 rounded-xl border border-[#BFDBFE] transition-colors cursor-pointer"
                        title="Preview unqid for this class"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Preview ({b.expectedCount})</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setClassToDelete(b.classId)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl border border-red-200 transition-colors cursor-pointer"
                        title={`Delete Class / SH ID ${b.classId} and all its saved scans`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Duplicate Check Modal */}
      {duplicateModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-md bg-white border border-[#FDE68A] rounded-2xl shadow-2xl p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center bg-[#F59E0B] text-white rounded-xl mx-auto mb-3">
              <AlertTriangle className="h-7 w-7" />
            </div>

            <div className="text-base font-extrabold uppercase tracking-wide text-[#B45309]">
              DUPLICATE RECORDS DETECTED
            </div>

            <div className="text-xs text-[#78350F] mt-2 mb-4 leading-relaxed">
              Found <strong className="font-bold">{duplicateModalData.duplicateItems.length}</strong> duplicate
              records that already exist in this import session.
              {duplicateModalData.allDuplicates ? (
                <div className="mt-2 text-red-600 font-bold">
                  All records in this file already exist in the system.
                </div>
              ) : (
                <div className="mt-2 text-[#166534] font-semibold">
                  You can proceed by importing only the {duplicateModalData.newItems.length} new records.
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDuplicateModalData(null)}
                className="flex-1 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                CANCEL
              </button>
              {!duplicateModalData.allDuplicates && (
                <button
                  type="button"
                  onClick={() => executeImport(duplicateModalData.newItems)}
                  className="flex-1 py-2 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer"
                >
                  IMPORT NEW ({duplicateModalData.newItems.length})
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* View Members Modal */}
      {activeMembersModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-md bg-white border border-[#CBD5E1] rounded-2xl shadow-2xl p-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
              <div>
                <div className="text-xs font-bold uppercase text-[#64748B]">Class Members Preview</div>
                <h3 className="font-mono font-bold text-sm text-[#172033]">
                  CLASS {activeMembersModal.classId} ({activeMembersModal.members.length} Expected)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveMembersModal(null)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="py-3 max-h-64 overflow-y-auto divide-y divide-slate-100 font-mono text-xs">
              {activeMembersModal.members.map((m, idx) => (
                <div key={idx} className="py-2 px-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-slate-400 text-[11px] w-6 text-right shrink-0">{idx + 1}.</span>
                    <span className="font-bold text-[#172033] truncate">{m}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      EXPECTED
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedUnqPreview({
                          unqid: m,
                          classId: activeMembersModal.classId,
                          university: universityName,
                        })
                      }
                      className="p-1 text-[#1565D8] hover:bg-blue-50 rounded border border-[#BFDBFE] transition-colors flex items-center gap-1 cursor-pointer"
                      title={`Preview unique member ID: ${m}`}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span className="text-[10px] font-bold hidden sm:inline">Preview</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setActiveMembersModal(null)}
              className="w-full mt-3 py-2 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-[#0D47A1] cursor-pointer"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}

      {/* SECTION: UNIQUE MEMBER ID (unqid) PREVIEW MODAL */}
      {selectedUnqPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 font-sans animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white border border-[#CBD5E1] rounded-2xl shadow-2xl p-5 overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 text-[#1565D8] rounded-xl border border-blue-200">
                  <Eye className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-[#64748B]">
                    BOOKLET RECORD PREVIEW
                  </div>
                  <h3 className="font-black text-sm text-[#172033]">
                    Unique Member ID (unqid)
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUnqPreview(null)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 cursor-pointer"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Prominent UNQ MEMBER ID Card */}
            <div className="mt-4 p-4 bg-[#F8FAFC] border-2 border-[#BFDBFE] rounded-xl text-center relative overflow-hidden">
              <div className="text-[10px] font-black uppercase tracking-wider text-[#1565D8] mb-1">
                UNQ MEMBER ID (unqid)
              </div>
              <div className="font-mono font-black text-2xl tracking-wider text-[#172033] select-all py-1">
                {selectedUnqPreview.unqid}
              </div>

              {/* Copy button */}
              <div className="mt-2 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(selectedUnqPreview.unqid);
                    setCopiedUnqId(true);
                    setTimeout(() => setCopiedUnqId(false), 2000);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-slate-50 border border-[#CBD5E1] rounded-lg text-xs font-semibold text-[#172033] transition-colors shadow-2xs cursor-pointer"
                >
                  {copiedUnqId ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-[#16A34A]" />
                      <span className="text-[#16A34A]">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-[#64748B]" />
                      <span>Copy unqid</span>
                    </>
                  )}
                </button>
              </div>

              {/* Scannable Barcode visualization of unqid */}
              <div className="mt-4 pt-3 border-t border-slate-200">
                <div className="bg-white p-2.5 rounded-lg border border-slate-200 inline-block shadow-2xs">
                  <div className="flex items-center justify-center gap-[2px] h-10 px-2 overflow-hidden">
                    {getBarcodeBars(selectedUnqPreview.unqid).map((bar, idx) => (
                      <div
                        key={idx}
                        className={`h-full ${bar.isBlack ? 'bg-black' : 'bg-transparent'}`}
                        style={{ width: `${bar.width}px` }}
                      />
                    ))}
                  </div>
                  <div className="font-mono text-[10px] text-slate-600 tracking-widest mt-1">
                    *{selectedUnqPreview.unqid}*
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed Metadata Grid */}
            <div className="mt-4 space-y-2 text-xs font-sans">
              <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[#64748B] font-semibold">Class ID:</span>
                <span className="font-mono font-bold text-sm text-[#172033] bg-white px-2.5 py-0.5 rounded border border-slate-200">
                  {selectedUnqPreview.classId}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[#64748B] font-semibold">College / University:</span>
                <span className="font-semibold text-[#172033] text-right truncate max-w-[220px]">
                  {selectedUnqPreview.university || universityName}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[#64748B] font-semibold">Expected Status:</span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-[#DCFCE7] border border-[#BBF7D0] text-[#166534] font-bold text-[10px] rounded uppercase">
                  <Check className="h-3 w-3 stroke-[3]" />
                  READY TO SCAN
                </span>
              </div>

              {selectedUnqPreview.rowNumber && (
                <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-[#64748B] font-semibold">Excel Row:</span>
                  <span className="font-mono font-bold text-[#64748B]">Row #{selectedUnqPreview.rowNumber}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSelectedUnqPreview(null)}
              className="w-full mt-4 py-2.5 bg-[#1565D8] hover:bg-[#0D47A1] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
            >
              Close Preview
            </button>
          </div>
        </div>
      )}

      {/* Delete Class Confirmation Modal */}
      {classToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-md bg-white border border-red-200 rounded-2xl shadow-2xl p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center bg-red-100 text-red-600 rounded-xl mx-auto mb-3">
              <Trash2 className="h-6 w-6" />
            </div>
            <h3 className="text-base font-black uppercase text-[#172033]">
              Delete Class / SH ID {classToDelete}?
            </h3>
            <p className="text-xs text-[#64748B] mt-2 mb-4 leading-relaxed">
              This will remove class <strong className="text-[#172033] font-mono">{classToDelete}</strong> from imported data and strictly delete all corresponding saved scan records and session history from the database.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setClassToDelete(null)}
                className="flex-1 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold uppercase rounded-xl hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDeleteClass}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase rounded-xl cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Inward Data Confirmation Modal */}
      {showClearAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-md bg-white border border-red-200 rounded-2xl shadow-2xl p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center bg-red-100 text-red-600 rounded-xl mx-auto mb-3">
              <Trash2 className="h-6 w-6" />
            </div>
            <h3 className="text-base font-black uppercase text-[#172033]">
              Clear All Inward Data?
            </h3>
            <p className="text-xs text-[#64748B] mt-2 mb-4 leading-relaxed">
              Are you sure you want to permanently clear all imported classes? This will reset all expected booklet records and purge all saved scans so you can start with a fresh batch.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowClearAllModal(false)}
                className="flex-1 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold uppercase rounded-xl hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmClearAll}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase rounded-xl cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? 'Clearing...' : 'Clear Everything'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
