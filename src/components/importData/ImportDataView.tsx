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
  Sparkles,
  ChevronDown,
  ChevronUp,
  Calendar,
} from 'lucide-react';
import { importedService, ClassBundle, normalizeExamDate, formatExamDate, isRecordMatchingDateFilter, isDateLikeString } from '../../services/importedService';

interface ParsedRow {
  rowNumber: number;
  classId: string;
  memberId: string;
  barcode?: string;
  examDate: string; // Standardized YYYY-MM-DD
  displayDate: string; // Formatted DD-MM-YYYY
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
  const [detectedDates, setDetectedDates] = useState<{ date: string; displayDate: string; count: number; classesCount: number }[]>([]);
  const [showAllDetectedDates, setShowAllDetectedDates] = useState<boolean>(false);
  const [selectedFilterDate, setSelectedFilterDate] = useState<string | null>(null);
  const [classGroups, setClassGroups] = useState<ClassGroupPreview[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [classSearch, setClassSearch] = useState<string>('');
  const [visibleLimit, setVisibleLimit] = useState<number>(60);

  // Tab switch between Class Bundles and All Records (unqid preview)
  const [activeTab, setActiveTab] = useState<'classes' | 'unqid_records'>('classes');
  const [recordSearch, setRecordSearch] = useState<string>('');
  const [recordVisibleLimit, setRecordVisibleLimit] = useState<number>(100);

  // Filtered Class Groups respecting both Class search and selectedFilterDate
  const displayedClassGroups = React.useMemo(() => {
    // 1. Filter rows by selectedFilterDate and classSearch
    const matchingRows = parsedRows.filter(r => {
      if (r.status !== 'valid') return false;
      if (selectedFilterDate && !isRecordMatchingDateFilter(r.examDate, selectedFilterDate)) {
        return false;
      }
      if (classSearch.trim() && !r.classId.toLowerCase().includes(classSearch.trim().toLowerCase())) {
        return false;
      }
      return true;
    });

    // 2. Dynamically group into class cards with exact counts and member IDs strictly for the selected date
    const classMap = new Map<string, string[]>();
    for (const r of matchingRows) {
      if (!classMap.has(r.classId)) {
        classMap.set(r.classId, []);
      }
      classMap.get(r.classId)!.push(r.unqid);
    }

    return Array.from(classMap.entries())
      .map(([classId, members]) => ({
        classId,
        members,
        count: members.length,
      }))
      .sort((a, b) => a.classId.localeCompare(b.classId, undefined, { numeric: true, sensitivity: 'base' }));
  }, [parsedRows, selectedFilterDate, classSearch]);

  // Filtered Parsed Rows respecting both unqid/class search and selectedFilterDate
  const displayedParsedRows = React.useMemo(() => {
    return parsedRows.filter(r => {
      if (selectedFilterDate && !isRecordMatchingDateFilter(r.examDate, selectedFilterDate)) {
        return false;
      }
      if (!recordSearch.trim()) return true;
      const q = recordSearch.trim().toLowerCase();
      return (
        r.unqid.toLowerCase().includes(q) ||
        r.classId.toLowerCase().includes(q) ||
        (r.displayDate && r.displayDate.includes(q))
      );
    });
  }, [parsedRows, selectedFilterDate, recordSearch]);

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
  const [existingDateFilter, setExistingDateFilter] = useState<string | null>(null);

  const availableExistingDates = React.useMemo(() => {
    return importedService.getAvailableExamDates();
  }, [existingBundles]);

  const displayedExistingBundles = React.useMemo(() => {
    if (!existingDateFilter) return existingBundles;
    return existingBundles.filter(b => isRecordMatchingDateFilter(b.examDate, existingDateFilter));
  }, [existingBundles, existingDateFilter]);

  // View Members Modal for Class Card
  const setActiveMembersModalState = useState<{
    classId: string;
    members: string[];
  } | null>(null);
  const activeMembersModal = setActiveMembersModalState[0];
  const setActiveMembersModal = setActiveMembersModalState[1];

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
  const [importProgress, setImportProgress] = useState<{ processed: number; total: number; percentage: number } | null>(null);

  // Deletion modals state (Synchronized deletion of imported data and saved scan data)
  const [classToDelete, setClassToDelete] = useState<string | null>(null);
  const [showClearAllModal, setShowClearAllModal] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [replaceExistingData, setReplaceExistingData] = useState<boolean>(false);

  // Column Mapping state for uploaded Excel files
  const [detectedColumnMapping, setDetectedColumnMapping] = useState<{
    dateCol: number;
    classCol: number;
    memberCol: number;
    barcodeCol: number;
    headers: string[];
    dateColumns: number[];
  } | null>(null);

  const [isPurgingCorrupt, setIsPurgingCorrupt] = useState<boolean>(false);
  const corruptedDateClasses = React.useMemo(() => {
    return existingBundles.filter(b => isDateLikeString(b.classId));
  }, [existingBundles]);

  const handlePurgeCorruptedClasses = async () => {
    if (isPurgingCorrupt) return;
    setIsPurgingCorrupt(true);
    try {
      await importedService.purgeCorruptedDateClasses();
      const updated = importedService.getClassBundles();
      setExistingBundles(updated);
    } catch (err) {
      console.warn('Purge error:', err);
    } finally {
      setIsPurgingCorrupt(false);
    }
  };

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

  // Parse a single Excel file into rows with content-aware column detection
  const parseSingleExcelFile = (
    file: File,
    overrideMapping?: { dateCol: number; classCol: number; memberCol: number; barcodeCol: number }
  ): Promise<{
    fileName: string;
    fileSize: number;
    rows: ParsedRow[];
    headers: string[];
    mapping: { dateCol: number; classCol: number; memberCol: number; barcodeCol: number };
    dateColumns: number[];
  }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const bstr = evt.target?.result;
          const workbook = XLSX.read(bstr, { type: 'binary', cellDates: false });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          // raw: false ensures strings with leading zeros like "0031" are preserved as pure strings
          const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

          if (!rawJson || rawJson.length < 2) {
            throw new Error(`File "${file.name}" is empty or does not contain data rows.`);
          }

          // 1. Identify Header Row (scan first 6 rows)
          let headerRowIndex = 0;
          let bestHeaderScore = -1;

          for (let r = 0; r < Math.min(rawJson.length, 6); r++) {
            const row = rawJson[r];
            if (!row || !Array.isArray(row)) continue;
            let score = 0;
            for (const cell of row) {
              const text = String(cell || '').trim().toLowerCase();
              const clean = text.replace(/[^a-z0-9]/g, '');
              if (text.includes('date') || clean === 'dt' || clean === 'examdate') score += 5;
              if (text.includes('class') || clean === 'cls' || clean === 'batch' || clean === 'bundle' || clean === 'shid' || clean === 'sh') score += 5;
              if (text.includes('member') || clean === 'unqid' || text.includes('roll') || text.includes('student') || clean === 'regno') score += 5;
              if (text.includes('barcode') || clean === 'qr') score += 5;
            }
            if (score > bestHeaderScore) {
              bestHeaderScore = score;
              headerRowIndex = r;
            }
          }

          const rawHeaderRow: string[] = (rawJson[headerRowIndex] || []).map((h: any) => String(h || '').trim());
          const headerRow: string[] = rawHeaderRow.map((h: string) => h.toLowerCase());
          const numCols = headerRow.length;

          // 2. Sample data cells per column across first 35 data rows
          const dateColumns: number[] = [];
          const colAnalysis: Array<{
            index: number;
            header: string;
            dateRatio: number;
            isPrimarilyDates: boolean;
            dateScore: number;
            classScore: number;
            memberScore: number;
            barcodeScore: number;
          }> = [];

          for (let c = 0; c < numCols; c++) {
            const h = headerRow[c] || '';
            const clean = h.replace(/[^a-z0-9]/g, '');

            const sampleVals: string[] = [];
            for (let r = headerRowIndex + 1; r < Math.min(rawJson.length, headerRowIndex + 35); r++) {
              const val = rawJson[r]?.[c];
              if (val !== undefined && val !== null) {
                const s = String(val).trim();
                if (s) sampleVals.push(s);
              }
            }

            const dateMatchCount = sampleVals.filter(isDateLikeString).length;
            const dateRatio = sampleVals.length > 0 ? dateMatchCount / sampleVals.length : 0;
            const isPrimarilyDates = dateRatio >= 0.5;
            if (isPrimarilyDates) {
              dateColumns.push(c);
            }

            // Roll number / member ID regex: e.g. 24BAR0087, 25MMI0034, 24BCM0266, 23BMM0008
            const memberMatchCount = sampleVals.filter(s => /^[0-9]{2}[A-Za-z]{2,5}[0-9]{3,5}$/i.test(s) || /^[A-Za-z0-9]{7,18}$/.test(s)).length;
            const memberRatio = sampleVals.length > 0 ? memberMatchCount / sampleVals.length : 0;

            let dateScore = 0;
            let classScore = 0;
            let memberScore = 0;
            let barcodeScore = 0;

            // Date Scoring
            if (clean === 'date' || clean === 'examdate' || clean === 'sessiondate' || clean === 'testdate' || h === 'exam date' || h === 'date of exam') {
              dateScore += 100;
            } else if (h.includes('date') || clean === 'datetime' || clean === 'scheduledate') {
              dateScore += 50;
            } else if (clean === 'dt' || clean === 'examdt') {
              dateScore += 30;
            }
            if (isPrimarilyDates) {
              dateScore += 50;
            } else if (sampleVals.length > 0 && dateRatio < 0.1) {
              dateScore -= 100; // Cannot be a date column if content has no dates!
            }

            // Class ID Scoring
            // CRITICAL RULE: A column that contains DATES can NEVER be a Class ID!
            if (isPrimarilyDates) {
              classScore = -9999;
            } else {
              if (clean === 'class' || clean === 'classid' || clean === 'cls' || clean === 'clsid' || h === 'class id' || h === 'class_id' || h === 'class no' || h === 'class_no' || clean === 'classno') {
                classScore += 100;
              } else if (clean === 'shid' || clean === 'sh' || clean === 'schid' || clean === 'schoolid' || h === 'sh id' || h === 'sh_id' || h === 'school id') {
                classScore += 90;
              } else if (clean === 'batch' || clean === 'batchid' || h === 'batch id' || h === 'batch no' || clean === 'bundle' || clean === 'bundleid' || h === 'bundle id') {
                classScore += 80;
              } else if (h.includes('class') || h.includes('cls') || h.includes('batch') || h.includes('bundle') || h.includes('room') || h.includes('hall') || h.includes('section') || clean === 'sec' || clean === 'course' || clean === 'subject') {
                classScore += 50;
              } else if (!h.includes('member') && !h.includes('student') && !h.includes('roll') && !h.includes('unq') && !h.includes('barcode')) {
                // Short codes, not member, not barcode
                classScore += 15;
              }
            }

            // Member ID Scoring
            if (isPrimarilyDates) {
              memberScore = -9999;
            } else {
              if (clean === 'unqid' || clean === 'unq' || clean === 'memberid' || clean === 'member' || h === 'member id' || h === 'member_id' || h === 'unq id' || h === 'unq_id') {
                memberScore += 100;
              } else if (clean === 'rollno' || clean === 'roll' || clean === 'studentid' || clean === 'student' || h === 'roll no' || h === 'roll number' || h === 'student id' || h === 'reg no' || clean === 'regno' || clean === 'registrationno' || clean === 'hallticket') {
                memberScore += 90;
              } else if (h.includes('member') || h.includes('unq') || h.includes('student') || h.includes('roll') || h.includes('reg') || (h.includes('id') && !h.includes('class') && !h.includes('sh') && !h.includes('date'))) {
                memberScore += 50;
              }
              if (memberRatio > 0.4) {
                memberScore += 25;
              }
            }

            // Barcode Scoring
            if (h.includes('barcode') || h.includes('bar_code') || clean === 'barcode' || clean === 'qr' || clean === 'code') {
              barcodeScore += 60;
            }

            colAnalysis.push({
              index: c,
              header: rawHeaderRow[c] || `Column ${c + 1}`,
              dateRatio,
              isPrimarilyDates,
              dateScore,
              classScore,
              memberScore,
              barcodeScore,
            });
          }

          // 3. Resolve Column Indexes
          let dateColIdx = overrideMapping ? overrideMapping.dateCol : -1;
          let classColIdx = overrideMapping ? overrideMapping.classCol : -1;
          let memberColIdx = overrideMapping ? overrideMapping.memberCol : -1;
          let barcodeColIdx = overrideMapping ? overrideMapping.barcodeCol : -1;

          if (!overrideMapping) {
            // Auto-detect Date Column
            let bestDateScore = 0;
            for (const col of colAnalysis) {
              if (col.dateScore > bestDateScore) {
                bestDateScore = col.dateScore;
                dateColIdx = col.index;
              }
            }
            if (dateColIdx === -1) {
              const dateCol = colAnalysis.find(c => c.isPrimarilyDates);
              if (dateCol) dateColIdx = dateCol.index;
            }

            // Auto-detect Class ID Column (STRICT: Cannot be dateColIdx, and CANNOT contain dates!)
            let bestClassScore = 0;
            for (const col of colAnalysis) {
              if (col.index === dateColIdx) continue;
              if (col.isPrimarilyDates) continue;
              if (col.classScore > bestClassScore) {
                bestClassScore = col.classScore;
                classColIdx = col.index;
              }
            }

            // Auto-detect Member ID Column
            let bestMemberScore = 0;
            for (const col of colAnalysis) {
              if (col.index === dateColIdx || col.index === classColIdx) continue;
              if (col.isPrimarilyDates) continue;
              if (col.memberScore > bestMemberScore) {
                bestMemberScore = col.memberScore;
                memberColIdx = col.index;
              }
            }

            // Auto-detect Barcode Column
            let bestBarcodeScore = 0;
            for (const col of colAnalysis) {
              if (col.index === dateColIdx || col.index === classColIdx || col.index === memberColIdx) continue;
              if (col.barcodeScore > bestBarcodeScore) {
                bestBarcodeScore = col.barcodeScore;
                barcodeColIdx = col.index;
              }
            }

            // Fallback for remaining columns
            if (classColIdx === -1) {
              const availClass = colAnalysis.find(c => c.index !== dateColIdx && c.index !== memberColIdx && c.index !== barcodeColIdx && !c.isPrimarilyDates);
              if (availClass) classColIdx = availClass.index;
            }

            if (memberColIdx === -1) {
              const availMember = colAnalysis.find(c => c.index !== dateColIdx && c.index !== classColIdx && !c.isPrimarilyDates);
              if (availMember) memberColIdx = availMember.index;
            }

            // ABSOLUTE INTEGRITY CHECK:
            // Under NO condition can classColIdx ever be equal to dateColIdx or contain date values!
            if (classColIdx === dateColIdx || (classColIdx >= 0 && colAnalysis[classColIdx]?.isPrimarilyDates)) {
              console.warn(`[COLUMN DETECTION] classColIdx (${classColIdx}) collided with Date column or contains dates! Disconnecting classColIdx.`);
              classColIdx = -1;
              const nonDateCol = colAnalysis.find(c => c.index !== dateColIdx && !c.isPrimarilyDates);
              if (nonDateCol) classColIdx = nonDateCol.index;
            }
          }

          if (dateColIdx === -1) {
            throw new Error(`MANDATORY DATE COLUMN MISSING: The uploaded file "${file.name}" does not contain a recognizable Date column. Please ensure your Excel file contains a Date column (e.g. "Date" with values like 01-11-2026) and re-upload.`);
          }

          // 4. Parse rows
          const fileRows: ParsedRow[] = [];
          const seenInThisFile = new Set<string>();

          for (let i = headerRowIndex + 1; i < rawJson.length; i++) {
            const rowData = rawJson[i];
            if (!rowData || rowData.length === 0) continue;

            let rawClass = classColIdx >= 0 ? String(rowData[classColIdx] ?? '').trim() : '';
            let rawMember = memberColIdx >= 0 ? String(rowData[memberColIdx] ?? '').trim() : '';
            let rawBarcode = barcodeColIdx >= 0 ? String(rowData[barcodeColIdx] ?? '').trim() : '';
            let rawDate = dateColIdx >= 0 ? String(rowData[dateColIdx] ?? '').trim() : '';

            // CRITICAL SANITIZATION:
            // If rawClass is a date (e.g. "25-08-2026", "9/3/26"), REJECT it from being a Class ID!
            if (rawClass && isDateLikeString(rawClass)) {
              rawClass = '';
            }

            // Extract authoritative exam date directly from cell object or string
            let normDate = '';
            if (dateColIdx >= 0 && worksheet) {
              const cellAddress = XLSX.utils.encode_cell({ r: i, c: dateColIdx });
              const cell = worksheet[cellAddress];
              if (cell) {
                const textCandidate = (typeof cell.w === 'string' && cell.w.trim()) ||
                                      (typeof rawDate === 'string' && rawDate.trim()) ||
                                      (typeof cell.v === 'string' && cell.v.trim());
                if (textCandidate) {
                  normDate = normalizeExamDate(textCandidate);
                }
                if (!normDate && typeof cell.v === 'number' && cell.v > 30000 && cell.v < 75000) {
                  if ((XLSX as any).SSF && typeof (XLSX as any).SSF.parse_date_code === 'function') {
                    const parsed = (XLSX as any).SSF.parse_date_code(cell.v);
                    if (parsed && parsed.y && parsed.m && parsed.d) {
                      const y = parsed.y;
                      const m = String(parsed.m).padStart(2, '0');
                      const d = String(parsed.d).padStart(2, '0');
                      normDate = `${y}-${m}-${d}`;
                    }
                  }
                  if (!normDate) {
                    normDate = normalizeExamDate(cell.v);
                  }
                }
                if (!normDate && cell.v instanceof Date && !isNaN(cell.v.getTime())) {
                  normDate = normalizeExamDate(cell.v);
                }
              }
            }
            if (!normDate && rawDate) {
              normDate = normalizeExamDate(rawDate);
            }
            const dispDate = formatExamDate(normDate);

            // Rule: Split hyphenated barcodes if needed
            if (rawBarcode && rawBarcode.includes('-')) {
              const dashIdx = rawBarcode.indexOf('-');
              const partLeft = rawBarcode.substring(0, dashIdx).trim();
              const partRight = rawBarcode.substring(dashIdx + 1).trim();
              if (!rawClass && partLeft && !isDateLikeString(partLeft)) rawClass = partLeft;
              if (!rawMember && partRight) rawMember = partRight;
            }

            if (!rawClass && rawMember && rawMember.includes('-')) {
              const dashIdx = rawMember.indexOf('-');
              const partLeft = rawMember.substring(0, dashIdx).trim();
              const partRight = rawMember.substring(dashIdx + 1).trim();
              if (partLeft && partRight && !isDateLikeString(partLeft)) {
                if (!rawBarcode) rawBarcode = rawMember;
                rawClass = partLeft;
                rawMember = partRight;
              }
            }

            // Fallback: If rawClass is still missing (e.g. 2-column Excel with only Date and Member ID):
            // Derive Class ID from member ID prefix (e.g. "24BAR" from "24BAR0087"), NEVER A DATE!
            if (!rawClass && rawMember) {
              const prefixMatch = rawMember.match(/^([0-9]{2}[A-Za-z]{2,5})/i);
              if (prefixMatch) {
                rawClass = prefixMatch[1].toUpperCase();
              } else {
                rawClass = 'CLASS-01';
              }
            }

            const finalBarcode = rawBarcode || (rawClass && rawMember ? `${rawClass}-${rawMember}` : rawMember);

            if (!rawClass && !rawMember && !rawDate) continue;

            if (!normDate) {
              fileRows.push({
                rowNumber: i + 1,
                classId: rawClass || 'MISSING',
                memberId: rawMember || 'MISSING',
                barcode: finalBarcode || undefined,
                examDate: '',
                displayDate: 'MISSING/INVALID',
                unqid: rawMember || 'MISSING',
                status: 'invalid',
                reason: !rawDate ? 'Date / Exam Date is blank' : 'Date format invalid (expected DD-MM-YYYY or YYYY-MM-DD)',
                fileOrigin: file.name,
              });
              continue;
            }

            if (!rawClass || !rawMember) {
              fileRows.push({
                rowNumber: i + 1,
                classId: rawClass || 'MISSING',
                memberId: rawMember || 'MISSING',
                barcode: finalBarcode || undefined,
                examDate: normDate,
                displayDate: dispDate,
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
                examDate: normDate,
                displayDate: dispDate,
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
              examDate: normDate,
              displayDate: dispDate,
              unqid: rawMember,
              status: 'valid',
              fileOrigin: file.name,
            });
          }

          resolve({
            fileName: file.name,
            fileSize: file.size,
            rows: fileRows,
            headers: rawHeaderRow,
            mapping: {
              dateCol: dateColIdx,
              classCol: classColIdx,
              memberCol: memberColIdx,
              barcodeCol: barcodeColIdx,
            },
            dateColumns,
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
  const processExcelFiles = async (
    files: File[],
    appendToExisting: boolean = false,
    overrideMapping?: { dateCol: number; classCol: number; memberCol: number; barcodeCol: number }
  ) => {
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

      const parsedResults = await Promise.all(uniqueFiles.map(f => parseSingleExcelFile(f, overrideMapping)));

      if (parsedResults.length > 0 && parsedResults[0].headers) {
        setDetectedColumnMapping({
          dateCol: parsedResults[0].mapping.dateCol,
          classCol: parsedResults[0].mapping.classCol,
          memberCol: parsedResults[0].mapping.memberCol,
          barcodeCol: parsedResults[0].mapping.barcodeCol,
          headers: parsedResults[0].headers,
          dateColumns: parsedResults[0].dateColumns,
        });
      }

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

      // Compute unique dates summary with class counts
      const dateMap = new Map<string, { count: number; classes: Set<string> }>();
      for (const r of combinedRows) {
        if (r.status === 'valid' && r.examDate) {
          if (!dateMap.has(r.examDate)) {
            dateMap.set(r.examDate, { count: 0, classes: new Set() });
          }
          const entry = dateMap.get(r.examDate)!;
          entry.count++;
          if (r.classId) entry.classes.add(r.classId);
        }
      }
      const dateSummaries = Array.from(dateMap.entries()).map(([date, data]) => ({
        date,
        displayDate: formatExamDate(date),
        count: data.count,
        classesCount: data.classes.size,
      })).sort((a, b) => a.date.localeCompare(b.date));

      setSelectedFiles(uniqueFiles);
      setFileSummaries(summaries);
      setParsedRows(combinedRows);
      setClassGroups(groups);
      setDetectedDates(dateSummaries);
      setIsParsing(false);
    } catch (err: any) {
      console.warn('Excel parse error:', err);
      setParseError(err?.message || 'Failed to parse Excel file(s).');
      setIsParsing(false);
    }
  };

  const handleUpdateColumnMapping = async (
    field: 'dateCol' | 'classCol' | 'memberCol' | 'barcodeCol',
    colIdx: number
  ) => {
    if (!detectedColumnMapping || selectedFiles.length === 0) return;
    const newMapping = {
      dateCol: field === 'dateCol' ? colIdx : detectedColumnMapping.dateCol,
      classCol: field === 'classCol' ? colIdx : detectedColumnMapping.classCol,
      memberCol: field === 'memberCol' ? colIdx : detectedColumnMapping.memberCol,
      barcodeCol: field === 'barcodeCol' ? colIdx : detectedColumnMapping.barcodeCol,
    };
    setDetectedColumnMapping({
      ...detectedColumnMapping,
      ...newMapping,
    });
    await processExcelFiles(selectedFiles, false, newMapping);
  };

  const [isDragging, setIsDragging] = useState<boolean>(false);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const handleDropFiles = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (!universityName.trim()) {
      setUniversityRequiredError(true);
      return;
    }

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files).filter(file => {
        const ext = file.name.split('.').pop()?.toLowerCase();
        return ext === 'xlsx' || ext === 'xls' || ext === 'csv';
      });

      if (droppedFiles.length === 0) {
        setParseError('Please drop valid Excel (.xlsx, .xls) or CSV (.csv) files.');
        return;
      }

      processExcelFiles(droppedFiles, true);
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
      setDetectedDates([]);
      setDetectedColumnMapping(null);
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
      exam_date: r.examDate,
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

  const executeImport = async (itemsToInsert: { class_id: string; member_id: string; barcode?: string; exam_date?: string }[]) => {
    setDuplicateModalData(null);
    setIsProcessing(true);
    const totalCount = itemsToInsert.length;
    setImportProgress({ processed: 0, total: totalCount, percentage: 0 });

    try {
      // Mandatory Integrity Guard: Verify NO class_id is a Date
      const corruptedItems = itemsToInsert.filter(i => isDateLikeString(i.class_id));
      if (corruptedItems.length > 0) {
        throw new Error(
          `CRITICAL SAFETY STOP: Detected ${corruptedItems.length} records where Class ID is a Date (e.g. "${corruptedItems[0].class_id}"). Please verify that the "Class ID / SH ID" column dropdown is mapped to the actual Class column and NOT the Date column.`
        );
      }

      const fileNamesList = selectedFiles.map(f => f.name).join(', ') || 'bulk_import.xlsx';
      setProcessingStep(`PREPARING ${totalCount.toLocaleString()} CANDIDATE RECORDS...`);
      await new Promise(r => setTimeout(r, 200));

      const onProgress = (processed: number, total: number) => {
        const pct = Math.min(100, Math.round((processed / total) * 100));
        setImportProgress({ processed, total, percentage: pct });
        setProcessingStep(`SAVING TO DATABASE: ${processed.toLocaleString()} out of ${total.toLocaleString()} records (${pct}%)`);
      };

      const res = await importedService.bulkInsert(
        itemsToInsert,
        universityName.trim(),
        fileNamesList,
        onProgress,
        replaceExistingData
      );

      if (!res.success) {
        throw new Error(res.error || 'Failed to save imported records.');
      }

      setImportProgress({ processed: totalCount, total: totalCount, percentage: 100 });
      setProcessingStep(`SAVED ${totalCount.toLocaleString()} out of ${totalCount.toLocaleString()} RECORDS SUCCESSFULLY!`);
      await new Promise(r => setTimeout(r, 400));
      setProcessingStep('OPENING SCANNING DASHBOARD...');
      await new Promise(r => setTimeout(r, 300));

      // Automatically navigate to Scan screen!
      onNavigateToScan();
    } catch (err: any) {
      console.warn('Import execution error:', err);
      setParseError(err?.message || 'Error saving imported records.');
      setIsProcessing(false);
      setImportProgress(null);
    }
  };

  const handleDownloadSample = () => {
    // Mandatory Date Column with headers only (zero example rows filled)
    const ws = XLSX.utils.aoa_to_sheet([
      ['Date', 'Class ID', 'Member ID', 'Barcode Value']
    ]);
    ws['!cols'] = [
      { wch: 16 },
      { wch: 14 },
      { wch: 18 },
      { wch: 20 },
    ];
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

      {/* 1. Step-by-Step Processing Overlay with Live Record Count */}
      {isProcessing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white border border-[#CBD5E1] rounded-2xl shadow-2xl p-6 text-center">
            <div className="h-14 w-14 border-4 border-[#1565D8]/20 border-t-[#1565D8] rounded-full animate-spin mx-auto mb-4" />
            
            <div className="text-base font-black uppercase tracking-wide text-[#172033]">
              Importing Examination Dataset
            </div>
            
            {importProgress ? (
              <div className="mt-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-[#64748B]">
                  <span>Database Insertion Progress</span>
                  <span className="font-mono text-[#1565D8] font-black">
                    {importProgress.processed.toLocaleString()} / {importProgress.total.toLocaleString()}
                  </span>
                </div>
                
                {/* Visual Progress Bar */}
                <div className="h-3.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200 shadow-inner">
                  <div
                    className="h-full bg-gradient-to-r from-blue-600 via-[#1565D8] to-emerald-500 transition-all duration-200"
                    style={{ width: `${importProgress.percentage}%` }}
                  />
                </div>
                
                <div className="text-xs font-mono font-black text-[#1565D8] bg-blue-50 py-1.5 px-3 rounded-xl border border-blue-100">
                  {importProgress.processed.toLocaleString()} out of {importProgress.total.toLocaleString()} records saved ({importProgress.percentage}%)
                </div>
              </div>
            ) : (
              <div className="text-xs font-mono font-bold text-[#1565D8] mt-3">
                {processingStep}
              </div>
            )}

            <div className="text-[11px] text-[#64748B] mt-3 leading-relaxed font-medium">
              Writing directly to PostgreSQL tables. Zero browser freeze guaranteed.
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
            <div className="font-bold uppercase tracking-wider text-[11px] mb-1.5 flex items-center justify-between">
              <span>Required Baseline Columns (Mandatory):</span>
              <span className="text-[10px] bg-blue-200/60 text-blue-950 font-bold px-2 py-0.5 rounded-full">Date Partitioning Enabled</span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono font-semibold">
              <span className="bg-white px-3 py-1 border border-[#BFDBFE] rounded-lg shadow-2xs text-[#1565D8]">
                Date / Exam Date <strong className="text-red-500 font-black">*</strong>
              </span>
              <span className="text-[#64748B] font-sans">+</span>
              <span className="bg-white px-3 py-1 border border-[#BFDBFE] rounded-lg shadow-2xs text-[#172033]">
                Class ID <strong className="text-red-500 font-black">*</strong>
              </span>
              <span className="text-[#64748B] font-sans">+</span>
              <span className="bg-white px-3 py-1 border border-[#BFDBFE] rounded-lg shadow-2xs text-[#172033]">
                Member ID <strong className="text-red-500 font-black">*</strong>
              </span>
              <span className="text-[#64748B] font-sans text-[11px]">(Optional: Barcode)</span>
            </div>
            <div className="text-xs text-[#1E40AF]/90 mt-2 font-sans leading-relaxed">
              Accepts formats like <code className="bg-white px-1.5 py-0.5 rounded border border-blue-200 font-mono text-[11px]">01-11-2026</code>, <code className="bg-white px-1.5 py-0.5 rounded border border-blue-200 font-mono text-[11px]">2026-11-01</code> or <code className="bg-white px-1.5 py-0.5 rounded border border-blue-200 font-mono text-[11px]">1-11-26</code>. Allows dashboard & inward stations to smoothly fetch and inward by single-day targets (e.g. 15,000 count/day across 1,75,000 records).
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

          {/* Upload Drop Zone (Supports Drag-and-Drop and multiple bulk Excel files) */}
          <div
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDropFiles}
            onClick={() => {
              if (!universityName.trim()) {
                setUniversityRequiredError(true);
                return;
              }
              fileInputRef.current?.click();
            }}
            className={`border-2 border-dashed rounded-2xl p-7 text-center cursor-pointer transition-all duration-200 relative overflow-hidden select-none ${
              isDragging
                ? 'border-[#1565D8] bg-blue-50/90 ring-4 ring-blue-500/20 shadow-lg scale-[1.01]'
                : 'border-[#CBD5E1] hover:border-[#1565D8] bg-[#F8FAFC] hover:bg-blue-50/40'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              multiple
              className="hidden"
              onChange={handleFilesChange}
            />

            <div className={`transition-transform duration-200 ${isDragging ? 'scale-110 -translate-y-1' : ''}`}>
              <Upload className={`h-9 w-9 mx-auto mb-2.5 transition-colors ${isDragging ? 'text-[#1565D8] animate-bounce' : 'text-[#1565D8]'}`} />
              <div className="text-sm font-black text-[#172033] tracking-wide">
                {isDragging ? (
                  <span className="text-[#1565D8]">Drop your Excel file(s) here now!</span>
                ) : selectedFiles.length > 0 ? (
                  `${selectedFiles.length} Excel file(s) loaded — Click or Drag & Drop more to append`
                ) : (
                  'Drag & Drop your Inward Excel file(s) here, or Click to Browse'
                )}
              </div>
              <div className="text-xs text-[#64748B] mt-1.5 font-medium">
                Supports <span className="font-bold text-slate-700">.xlsx, .xls, .csv</span> • Drag single or multiple bulk day files at once
              </div>
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
              {/* Interactive Detected Column Mapping Bar */}
              {detectedColumnMapping && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5 shadow-2xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Layers className="h-4 w-4 text-[#1565D8]" />
                      <span className="text-xs font-black uppercase tracking-wider text-[#172033]">
                        Excel Column Mapping:
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <Check className="h-3 w-3" />
                        <span>Class ID Protected (Dates Isolated)</span>
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {/* Exam Date Column */}
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
                        📅 Exam Date Column
                      </label>
                      <select
                        value={detectedColumnMapping.dateCol}
                        onChange={e => handleUpdateColumnMapping('dateCol', Number(e.target.value))}
                        className="w-full text-xs font-bold text-[#172033] bg-slate-50 border border-slate-200 rounded-md p-1.5 focus:outline-none focus:border-[#1565D8] cursor-pointer"
                      >
                        {detectedColumnMapping.headers.map((h, idx) => (
                          <option key={idx} value={idx}>
                            Col {idx + 1}: {h || `Column ${idx + 1}`} {detectedColumnMapping.dateColumns.includes(idx) ? ' (Dates)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Class ID Column */}
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
                        🏫 Class ID / SH ID Column
                      </label>
                      <select
                        value={detectedColumnMapping.classCol}
                        onChange={e => handleUpdateColumnMapping('classCol', Number(e.target.value))}
                        className="w-full text-xs font-bold text-[#1565D8] bg-slate-50 border border-slate-200 rounded-md p-1.5 focus:outline-none focus:border-[#1565D8] cursor-pointer"
                      >
                        <option value="-1">Auto-Detect / Extract from Member ID</option>
                        {detectedColumnMapping.headers.map((h, idx) => (
                          <option
                            key={idx}
                            value={idx}
                            disabled={idx === detectedColumnMapping.dateCol}
                          >
                            Col {idx + 1}: {h || `Column ${idx + 1}`} {idx === detectedColumnMapping.dateCol ? ' (Selected as Date)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Member ID Column */}
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
                        👤 Member ID / unqid Column
                      </label>
                      <select
                        value={detectedColumnMapping.memberCol}
                        onChange={e => handleUpdateColumnMapping('memberCol', Number(e.target.value))}
                        className="w-full text-xs font-bold text-[#172033] bg-slate-50 border border-slate-200 rounded-md p-1.5 focus:outline-none focus:border-[#1565D8] cursor-pointer"
                      >
                        {detectedColumnMapping.headers.map((h, idx) => (
                          <option key={idx} value={idx}>
                            Col {idx + 1}: {h || `Column ${idx + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

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

              {/* Detected Dates Strip — Supports Expanding all dates & Date Filtering */}
              {detectedDates.length > 0 && (
                <div className="p-3.5 bg-blue-50/90 border border-blue-200 rounded-2xl shadow-2xs mb-4 transition-all">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center bg-[#1565D8] text-white rounded-xl shadow-xs shrink-0">
                        <Calendar className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-blue-950 uppercase tracking-wide">
                            Partitioned By Exam Date ({detectedDates.length} {detectedDates.length === 1 ? 'Date' : 'Dates'})
                          </span>
                          {selectedFilterDate && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#1565D8] text-white shadow-2xs">
                              Filtered: {formatExamDate(selectedFilterDate)}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-blue-700">
                          {selectedFilterDate
                            ? `Showing data filtered strictly for ${formatExamDate(selectedFilterDate)}. Click 'All' or card to reset.`
                            : 'Click any date to filter preview below, or press +more to view all dates and script counts.'}
                        </div>
                      </div>
                    </div>

                    {/* Compact Mode Pill Bar */}
                    {!showAllDetectedDates && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {/* All Dates pill */}
                        <button
                          type="button"
                          onClick={() => setSelectedFilterDate(null)}
                          className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                            !selectedFilterDate
                              ? 'bg-[#1565D8] text-white border-[#1565D8] shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          All
                        </button>

                        {/* Top 5 Date Pills */}
                        {detectedDates.slice(0, 5).map(d => {
                          const isSelected = selectedFilterDate === d.date;
                          return (
                            <button
                              key={d.date}
                              type="button"
                              onClick={() => setSelectedFilterDate(isSelected ? null : d.date)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer border ${
                                isSelected
                                  ? 'bg-[#1565D8] text-white border-[#1565D8] shadow-xs'
                                  : 'bg-white hover:bg-blue-50/80 text-slate-800 border-blue-200 shadow-2xs'
                              }`}
                              title={`Filter preview to ${d.displayDate}`}
                            >
                              <span className={`font-bold ${isSelected ? 'text-white' : 'text-[#1565D8]'}`}>
                                {d.displayDate}
                              </span>
                              <span className="text-slate-300 font-sans">|</span>
                              <span className={`font-semibold ${isSelected ? 'text-blue-100' : 'text-slate-600'}`}>
                                {d.count.toLocaleString()} scripts
                              </span>
                            </button>
                          );
                        })}

                        {/* Interactive "+N more dates" Button */}
                        {detectedDates.length > 5 && (
                          <button
                            type="button"
                            onClick={() => setShowAllDetectedDates(true)}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-[#1565D8] hover:bg-[#0D47A1] text-white text-xs font-bold rounded-lg transition-all cursor-pointer shadow-xs active:scale-95"
                            title="Click to view all exam dates and script counts"
                          >
                            <span>+{detectedDates.length - 5} more dates</span>
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}

                    {/* In Expanded Mode, Top Right Action */}
                    {showAllDetectedDates && (
                      <div className="flex items-center gap-2">
                        {selectedFilterDate && (
                          <button
                            type="button"
                            onClick={() => setSelectedFilterDate(null)}
                            className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                          >
                            Clear Filter (Show All)
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowAllDetectedDates(false)}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-2xs"
                        >
                          <span>Show Less</span>
                          <ChevronUp className="h-3.5 w-3.5 text-slate-500" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* EXPANDED FULL DATES BREAKDOWN MATRIX */}
                  {showAllDetectedDates && (
                    <div className="mt-3 pt-3 border-t border-blue-200/80 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-black uppercase tracking-wider text-blue-900">
                          Complete Exam Dates Breakdown ({detectedDates.length} Dates • {parsedRows.length.toLocaleString()} Total Scripts)
                        </span>
                        <span className="text-[11px] text-blue-700">
                          Click any date card to view only that date's data below
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-72 overflow-y-auto pr-1">
                        {/* All Dates Card */}
                        <button
                          type="button"
                          onClick={() => setSelectedFilterDate(null)}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                            !selectedFilterDate
                              ? 'bg-[#1565D8] text-white border-[#1565D8] shadow-sm ring-2 ring-blue-300'
                              : 'bg-white hover:bg-blue-50 text-slate-800 border-blue-200 shadow-2xs'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-black ${!selectedFilterDate ? 'text-white' : 'text-[#1565D8]'}`}>
                              ALL DATES
                            </span>
                            {!selectedFilterDate && <Check className="h-3.5 w-3.5 text-white" />}
                          </div>
                          <div className="mt-1 flex items-baseline justify-between text-[11px]">
                            <span className={`font-bold ${!selectedFilterDate ? 'text-blue-100' : 'text-slate-700'}`}>
                              {parsedRows.length.toLocaleString()} scripts
                            </span>
                            <span className={`text-[10px] ${!selectedFilterDate ? 'text-blue-200' : 'text-slate-400'}`}>
                              100%
                            </span>
                          </div>
                        </button>

                        {/* Each Date Card with exact count & classes */}
                        {detectedDates.map(d => {
                          const isSelected = selectedFilterDate === d.date;
                          const pct = ((d.count / (parsedRows.length || 1)) * 100).toFixed(1);
                          return (
                            <button
                              key={d.date}
                              type="button"
                              onClick={() => setSelectedFilterDate(isSelected ? null : d.date)}
                              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                                isSelected
                                  ? 'bg-[#1565D8] text-white border-[#1565D8] shadow-sm ring-2 ring-blue-300'
                                  : 'bg-white hover:bg-blue-50 text-slate-800 border-blue-200 shadow-2xs hover:border-blue-300'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className={`text-xs font-black font-mono ${isSelected ? 'text-white' : 'text-[#1565D8]'}`}>
                                  {d.displayDate}
                                </span>
                                {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                              </div>
                              <div className="mt-1 flex items-baseline justify-between text-[11px]">
                                <span className={`font-bold ${isSelected ? 'text-blue-100' : 'text-slate-800'}`}>
                                  {d.count.toLocaleString()} scripts
                                </span>
                                <span className={`text-[10px] font-semibold ${isSelected ? 'text-blue-200' : 'text-slate-400'}`}>
                                  {pct}%
                                </span>
                              </div>
                              {d.classesCount !== undefined && (
                                <div className={`text-[10px] mt-0.5 ${isSelected ? 'text-blue-200' : 'text-slate-500'}`}>
                                  {d.classesCount} Class IDs
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <div className="text-[10px] text-blue-700 mt-2 flex items-center justify-between">
                        <span>
                          {selectedFilterDate
                            ? `Currently filtered to ${formatExamDate(selectedFilterDate)} (${detectedDates.find(d => d.date === selectedFilterDate)?.count.toLocaleString()} scripts).`
                            : 'All dates are currently active in preview.'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowAllDetectedDates(false)}
                          className="font-bold text-[#1565D8] hover:underline cursor-pointer flex items-center gap-1"
                        >
                          <span>Collapse View</span>
                          <ChevronUp className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 1: CLASS ID BUNDLES */}
              {activeTab === 'classes' && (
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-[#172033] flex items-center gap-1.5">
                      <Layers className="h-4 w-4 text-[#1565D8]" />
                      <span>Class ID Wise Import Records:</span>
                      <span className="px-2 py-0.5 bg-blue-50 text-[#1565D8] border border-blue-200 rounded-full font-mono text-[10px]">
                        {displayedClassGroups.length} {selectedFilterDate ? `of ${classGroups.length}` : ''} Class IDs
                      </span>
                      {selectedFilterDate && (
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-full text-[10px] font-bold">
                          Date: {formatExamDate(selectedFilterDate)}
                        </span>
                      )}
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
                  {displayedClassGroups.length === 0 ? (
                    <div className="p-8 text-center bg-white border border-[#CBD5E1] rounded-xl text-xs text-[#64748B]">
                      No classes found {selectedFilterDate ? `for date ${formatExamDate(selectedFilterDate)}` : ''} matching "{classSearch}".
                    </div>
                  ) : viewMode === 'grid' ? (
                    /* 1. GRID VIEW */
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {displayedClassGroups
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
                            {displayedClassGroups
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
                  {displayedClassGroups.length > visibleLimit && (
                    <div className="mt-3 p-3 bg-white border border-[#CBD5E1] rounded-xl flex items-center justify-between text-xs">
                      <span className="text-[#64748B]">
                        Showing <strong className="text-[#172033]">{visibleLimit}</strong> of{' '}
                        <strong className="text-[#1565D8]">
                          {displayedClassGroups.length}
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
                          onClick={() => setVisibleLimit(displayedClassGroups.length)}
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
                          {displayedParsedRows.length} {selectedFilterDate ? `of ${parsedRows.length}` : ''} Records
                        </span>
                        {selectedFilterDate && (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-full text-[10px] font-bold">
                            Date: {formatExamDate(selectedFilterDate)}
                          </span>
                        )}
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
                            <th className="py-2.5 px-4">Exam Date</th>
                            <th className="py-2.5 px-4">Class ID</th>
                            <th className="py-2.5 px-4">Unique Member ID (unqid)</th>
                            <th className="py-2.5 px-4 text-center">Status</th>
                            <th className="py-2.5 px-4 text-right">Preview (unqid)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {displayedParsedRows
                            .slice(0, recordVisibleLimit)
                            .map(r => (
                              <tr key={`${r.rowNumber}-${r.classId}-${r.unqid}`} className="hover:bg-blue-50/30 transition-colors">
                                <td className="py-2.5 px-4 text-center font-mono text-[11px] text-[#64748B]">
                                  {r.rowNumber}
                                </td>
                                <td className="py-2.5 px-4">
                                  <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-[#1565D8] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                    {r.displayDate}
                                  </span>
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
                  {displayedParsedRows.length > recordVisibleLimit && (
                    <div className="p-3 bg-white border border-[#CBD5E1] rounded-xl flex items-center justify-between text-xs">
                      <span className="text-[#64748B]">
                        Showing <strong className="text-[#172033]">{recordVisibleLimit}</strong> of{' '}
                        <strong className="text-[#1565D8]">
                          {displayedParsedRows.length}
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
                          onClick={() => setRecordVisibleLimit(displayedParsedRows.length)}
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
                          : '✓ Append & Merge Mode (Default): Combines these Excel files with all previously imported Class IDs without deleting earlier batches or scans. All imported files automatically accumulate.'}
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

              {/* Corrupted Date Classes Alert Banner */}
              {corruptedDateClasses.length > 0 && (
                <div className="p-3.5 bg-amber-50 border-2 border-amber-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-black text-amber-900 uppercase tracking-wide">
                        Notice: {corruptedDateClasses.length} Corrupted Date Class IDs in Database
                      </div>
                      <div className="text-[11px] text-amber-700 mt-0.5">
                        Some records in Supabase were saved with dates as Class IDs (e.g.{' '}
                        <span className="font-mono font-bold">
                          {corruptedDateClasses.slice(0, 4).map(c => c.classId).join(', ')}
                        </span>
                        ). Click Clean to purge them so you can re-import cleanly.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handlePurgeCorruptedClasses}
                    disabled={isPurgingCorrupt}
                    className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0 flex items-center gap-1.5"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{isPurgingCorrupt ? 'Cleaning...' : `Clean ${corruptedDateClasses.length} Corrupted Classes`}</span>
                  </button>
                </div>
              )}

              {/* Date Filter for Existing Bundles */}
              {availableExistingDates.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 p-2.5 bg-blue-50/70 border border-blue-200 rounded-xl">
                  <span className="text-xs font-bold text-blue-900 flex items-center gap-1 mr-1">
                    <Calendar className="h-3.5 w-3.5 text-[#1565D8]" />
                    Filter by Exam Date:
                  </span>
                  <button
                    type="button"
                    onClick={() => setExistingDateFilter(null)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                      !existingDateFilter
                        ? 'bg-[#1565D8] text-white border-[#1565D8] shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    All Dates ({existingBundles.length} Classes)
                  </button>
                  {availableExistingDates.map(d => {
                    const isSelected = existingDateFilter === d.date;
                    const countForDate = existingBundles.filter(b => isRecordMatchingDateFilter(b.examDate, d.date)).length;
                    return (
                      <button
                        key={d.date}
                        type="button"
                        onClick={() => setExistingDateFilter(isSelected ? null : d.date)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-[#1565D8] text-white border-[#1565D8] shadow-xs'
                            : 'bg-white hover:bg-blue-50/80 text-slate-800 border-blue-200 shadow-2xs'
                        }`}
                      >
                        <span className={`font-bold ${isSelected ? 'text-white' : 'text-[#1565D8]'}`}>
                          {d.displayDate}
                        </span>
                        <span className="text-slate-300 font-sans">|</span>
                        <span className={`font-semibold ${isSelected ? 'text-blue-100' : 'text-slate-600'}`}>
                          {countForDate} Classes ({d.totalRecords.toLocaleString()} scripts)
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-4 sm:gap-5">
                {displayedExistingBundles.slice(0, 32).map(b => (
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


    </div>
  );
};
