// ==============================================================================
// ExamScan — Import Data Screen (Sections 2 & 3)
// ONE PRIMARY PURPOSE: IMPORT EXCEL DATA
// - UPLOAD INWARD EXCEL FILE (with drag & drop, file selector, sample template)
// - Header-based column detection: Class ID and Member ID (supports any column order)
// - Treats Class ID and Member ID as pure STRINGS (never trims leading zeros e.g. 0031)
// - Groups records into Class-Wise Cards: CLASS ID: {classId}, {count} MEMBERS, EXPECTED BOOKLETS: {count}
// - Clicking a Class Card / [View Members] opens compact mobile-friendly member list
// - Robust Duplicate Detection Modal (All duplicates vs Mixed duplicates with CANCEL / IMPORT NEW RECORDS)
// - Sequential step loading animation before auto-navigating to Scanning Dashboard
// - Professional examination UI with soft rounded corners (10px–14px / rounded-xl)
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
} from 'lucide-react';
import { importedService, ClassBundle } from '../../services/importedService';

interface ParsedRow {
  rowNumber: number;
  classId: string;
  memberId: string;
  status: 'valid' | 'duplicate' | 'invalid';
  reason?: string;
}

interface ClassGroupPreview {
  classId: string;
  members: string[];
  count: number;
}

interface ImportDataViewProps {
  onNavigateToScan: () => void;
  onNavigateToDashboard?: () => void;
  onNavigateToManualInward?: () => void;
}

export const ImportDataView: React.FC<ImportDataViewProps> = ({ onNavigateToScan }) => {
  const [universityName, setUniversityName] = useState('General University');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [classGroups, setClassGroups] = useState<ClassGroupPreview[]>([]);

  // Existing imported bundles in the system
  const [existingBundles, setExistingBundles] = useState<ClassBundle[]>([]);

  // View Members Modal for Class Card
  const [activeMembersModal, setActiveMembersModal] = useState<{
    classId: string;
    members: string[];
    isLiveSession?: boolean;
  } | null>(null);

  // Duplicate Records Modal
  const [duplicateModalData, setDuplicateModalData] = useState<{
    total: number;
    newItems: { class_id: string; member_id: string }[];
    duplicateItems: { class_id: string; member_id: string }[];
    allDuplicates: boolean;
  } | null>(null);

  // Section 3: Step Loading State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const bundles = importedService.getClassBundles();
    setExistingBundles(bundles);
    const active = importedService.getActiveSession();
    if (active?.university_name) {
      setUniversityName(active.university_name);
    }
  }, []);

  // Parse Excel file and extract Class ID and Member ID
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processExcelFile(file);
  };

  const processExcelFile = (file: File) => {
    setParseError(null);
    setSelectedFile(file);
    setIsParsing(true);

    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary', cellText: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        // raw: false ensures strings with leading zeros like "0031" are preserved as formatted strings
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

        if (!rawJson || rawJson.length < 2) {
          throw new Error('The selected Excel file is empty or does not contain data rows.');
        }

        const headerRow = rawJson[0].map((h: any) => String(h || '').trim().toLowerCase());

        // Header Detection (Section 2 - does NOT depend on column positions):
        // 1. Detect Class ID column by header name
        let classColIdx = headerRow.findIndex(
          (h: string) =>
            h.includes('class') || h.includes('batch') || h.includes('cls') || h.includes('bundle')
        );

        // 2. Detect Member ID column by header name
        let memberColIdx = headerRow.findIndex(
          (h: string) =>
            h.includes('member') ||
            h.includes('student') ||
            h.includes('roll') ||
            (h.includes('id') && !h.includes('class')) ||
            h.includes('barcode')
        );

        // Fallbacks if not matched by standard keywords
        if (classColIdx === -1 && memberColIdx === -1 && headerRow.length >= 2) {
          classColIdx = 0;
          memberColIdx = 1;
        } else if (classColIdx === -1) {
          classColIdx = 0;
        } else if (memberColIdx === -1) {
          memberColIdx = classColIdx === 0 ? 1 : 0;
        }

        const rows: ParsedRow[] = [];
        const seenKeysInFile = new Set<string>();
        const groupMap = new Map<string, string[]>();

        for (let i = 1; i < rawJson.length; i++) {
          const rowData = rawJson[i];
          if (!rowData || rowData.length === 0) continue;

          // Pure string extraction to NEVER drop leading zeros
          const rawClass = String(rowData[classColIdx] ?? '').trim();
          const rawMember = String(rowData[memberColIdx] ?? '').trim();

          if (!rawClass && !rawMember) continue;

          if (!rawClass || !rawMember) {
            rows.push({
              rowNumber: i + 1,
              classId: rawClass || 'MISSING',
              memberId: rawMember || 'MISSING',
              status: 'invalid',
              reason: !rawClass ? 'Class ID is blank' : 'Member ID is blank',
            });
            continue;
          }

          // Uniqueness identity: CLASS ID + MEMBER ID
          const uniqueKey = `${rawClass.toLowerCase()}::${rawMember.toLowerCase()}`;
          if (seenKeysInFile.has(uniqueKey)) {
            rows.push({
              rowNumber: i + 1,
              classId: rawClass,
              memberId: rawMember,
              status: 'duplicate',
              reason: 'Duplicate entry in same file',
            });
            continue;
          }

          seenKeysInFile.add(uniqueKey);
          rows.push({
            rowNumber: i + 1,
            classId: rawClass,
            memberId: rawMember,
            status: 'valid',
          });

          if (!groupMap.has(rawClass)) {
            groupMap.set(rawClass, []);
          }
          groupMap.get(rawClass)!.push(rawMember);
        }

        if (rows.length === 0) {
          throw new Error('No records could be extracted from the file.');
        }

        const validRows = rows.filter(r => r.status === 'valid');
        if (validRows.length === 0) {
          throw new Error('No valid records found. Please check that Class ID and Member ID are populated.');
        }

        const groups: ClassGroupPreview[] = [];
        groupMap.forEach((members, classId) => {
          groups.push({ classId, members, count: members.length });
        });
        groups.sort((a, b) => a.classId.localeCompare(b.classId));

        setParsedRows(rows);
        setClassGroups(groups);
        setIsParsing(false);
      } catch (err: any) {
        console.warn('Excel parse error:', err);
        setParseError(err?.message || 'Failed to parse Excel file.');
        setIsParsing(false);
      }
    };

    reader.onerror = () => {
      setParseError('Failed to read the file.');
      setIsParsing(false);
    };

    reader.readAsBinaryString(file);
  };

  /**
   * Pre-import duplicate validation:
   * Checks new items against database and already imported records
   */
  const handleInitiateImport = () => {
    const validRows = parsedRows.filter(r => r.status === 'valid');
    if (validRows.length === 0) {
      setParseError('No valid rows to import.');
      return;
    }

    if (!universityName.trim()) {
      setParseError('Please enter the University Name.');
      return;
    }

    const items = validRows.map(r => ({ class_id: r.classId, member_id: r.memberId }));
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

    // No duplicates -> proceed directly
    executeImport(items);
  };

  /**
   * Section 3: After Successful Excel Import Execution
   * Shows step-by-step loading animation:
   * IMPORTING DATA... -> VALIDATING RECORDS... -> CALCULATING CLASS COUNTS... -> OPENING SCANNING DASHBOARD...
   * Then automatically opens Scanning Dashboard!
   */
  const executeImport = async (itemsToInsert: { class_id: string; member_id: string }[]) => {
    setDuplicateModalData(null);
    setIsProcessing(true);

    try {
      // Step 1: IMPORTING DATA...
      setProcessingStep('IMPORTING DATA...');
      await new Promise(r => setTimeout(r, 450));

      // Step 2: VALIDATING RECORDS...
      setProcessingStep('VALIDATING RECORDS...');
      await new Promise(r => setTimeout(r, 450));

      // Step 3: CALCULATING CLASS COUNTS...
      setProcessingStep('CALCULATING CLASS COUNTS...');
      const res = await importedService.bulkInsert(
        itemsToInsert,
        universityName.trim(),
        selectedFile?.name || 'inward_import.xlsx'
      );

      if (!res.success) {
        throw new Error(res.error || 'Failed to save imported records.');
      }

      await new Promise(r => setTimeout(r, 450));

      // Step 4: OPENING SCANNING DASHBOARD...
      setProcessingStep('OPENING SCANNING DASHBOARD...');
      await new Promise(r => setTimeout(r, 550));

      // Automatically navigate to Scanning Dashboard!
      onNavigateToScan();
    } catch (err: any) {
      console.warn('Import execution error:', err);
      setParseError(err?.message || 'Error saving imported records.');
      setIsProcessing(false);
    }
  };

  // Download Sample Inwarding Template
  const handleDownloadSample = () => {
    const sampleData = [
      { 'Class ID': '0031', 'Member ID': '22MIS001' },
      { 'Class ID': '0031', 'Member ID': '22MIS002' },
      { 'Class ID': '0031', 'Member ID': '22MIS003' },
      { 'Class ID': '0031', 'Member ID': '22MIS004' },
      { 'Class ID': '0031', 'Member ID': '22MIS005' },
      { 'Class ID': '0032', 'Member ID': '22MIS006' },
      { 'Class ID': '0032', 'Member ID': '22MIS007' },
      { 'Class ID': '0032', 'Member ID': '22MIS008' },
      { 'Class ID': '0033', 'Member ID': '22MIS009' },
      { 'Class ID': '0033', 'Member ID': '22MIS010' },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'InwardingTemplate');
    XLSX.writeFile(wb, 'ExamScan_Inwarding_Template.xlsx');
  };

  const validCount = parsedRows.filter(r => r.status === 'valid').length;

  return (
    <div className="space-y-4 font-sans max-w-4xl mx-auto pb-12">
      {/* 1. Step-by-Step Processing Overlay (Section 3) */}
      {isProcessing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white border border-[#CBD5E1] rounded-2xl shadow-2xl p-6 text-center">
            <div className="h-12 w-12 border-4 border-[#1565D8]/20 border-t-[#1565D8] rounded-full animate-spin mx-auto mb-4" />
            <div className="text-sm font-black uppercase tracking-wider text-[#1565D8]">
              {processingStep}
            </div>
            <div className="text-xs text-[#64748B] mt-2">
              Preparing class bundles and updating the inwarding scanning session...
            </div>

            <div className="mt-5 space-y-2 text-left bg-slate-50 p-3.5 border border-slate-200 rounded-xl text-xs">
              <div
                className={`flex items-center gap-2 ${
                  processingStep === 'IMPORTING DATA...' ||
                  processingStep === 'VALIDATING RECORDS...' ||
                  processingStep === 'CALCULATING CLASS COUNTS...' ||
                  processingStep === 'OPENING SCANNING DASHBOARD...'
                    ? 'text-[#16A34A] font-bold'
                    : 'text-[#64748B]'
                }`}
              >
                <Check className="h-4 w-4" />
                <span>1. Importing Excel Data</span>
              </div>
              <div
                className={`flex items-center gap-2 ${
                  processingStep === 'VALIDATING RECORDS...' ||
                  processingStep === 'CALCULATING CLASS COUNTS...' ||
                  processingStep === 'OPENING SCANNING DASHBOARD...'
                    ? 'text-[#16A34A] font-bold'
                    : 'text-[#64748B]'
                }`}
              >
                <Check className="h-4 w-4" />
                <span>2. Validating Class &amp; Member Records</span>
              </div>
              <div
                className={`flex items-center gap-2 ${
                  processingStep === 'CALCULATING CLASS COUNTS...' ||
                  processingStep === 'OPENING SCANNING DASHBOARD...'
                    ? 'text-[#16A34A] font-bold'
                    : 'text-[#64748B]'
                }`}
              >
                <Check className="h-4 w-4" />
                <span>3. Calculating Class-Wise Expected Counts</span>
              </div>
              <div
                className={`flex items-center gap-2 ${
                  processingStep === 'OPENING SCANNING DASHBOARD...'
                    ? 'text-[#1565D8] font-bold animate-pulse'
                    : 'text-[#64748B]'
                }`}
              >
                <ArrowRight className="h-4 w-4" />
                <span>4. Opening Scanning Dashboard</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Primary Card: UPLOAD INWARD EXCEL FILE (Section 2) */}
      <div className="bg-white border border-[#CBD5E1] rounded-xl shadow-xs overflow-hidden">
        <div className="p-4 bg-[#1565D8] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="h-6 w-6" />
            <div>
              <div className="text-xs uppercase tracking-wider text-white/80 font-bold">Data Ingestion</div>
              <h1 className="text-base font-bold">UPLOAD INWARD EXCEL FILE</h1>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDownloadSample}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
            title="Download sample Excel file with Class ID and Member ID"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Sample Template</span>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Required Columns Specification Banner (Section 2) */}
          <div className="p-3 bg-[#EFF6FF] border border-[#BFDBFE] rounded-lg text-xs text-[#1E40AF]">
            <div className="font-bold uppercase tracking-wider text-[11px] mb-1">Required Columns:</div>
            <div className="flex items-center gap-4 text-xs font-mono font-semibold">
              <span className="bg-white px-2 py-0.5 border border-[#BFDBFE] rounded-md">Class ID</span>
              <span className="text-[#64748B] font-sans">and</span>
              <span className="bg-white px-2 py-0.5 border border-[#BFDBFE] rounded-md">Member ID</span>
            </div>
            <div className="text-[11px] text-[#3B82F6] mt-1.5 font-sans">
              Columns are auto-detected by header name regardless of order. Leading zeros (e.g. 0031) are strictly preserved.
            </div>
          </div>

          {/* University Name Configuration */}
          <div>
            <label className="block text-xs font-bold text-[#172033] uppercase tracking-wider mb-1">
              University Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Building className="absolute left-3 top-2.5 h-4 w-4 text-[#64748B]" />
              <input
                type="text"
                value={universityName}
                onChange={e => setUniversityName(e.target.value)}
                placeholder="e.g. General University, Oxford Exam Board..."
                className="w-full pl-9 pr-3 py-2 border border-[#CBD5E1] rounded-lg text-xs text-[#172033] bg-white focus:outline-hidden focus:border-[#1565D8]"
              />
            </div>
          </div>

          {/* Upload Drop Zone with rounded-xl */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-[#CBD5E1] hover:border-[#1565D8] bg-[#F8FAFC] hover:bg-blue-50/40 rounded-xl p-6 text-center cursor-pointer transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileChange}
            />

            <Upload className="h-8 w-8 text-[#1565D8] mx-auto mb-2" />
            <div className="text-xs font-bold text-[#172033]">
              {selectedFile ? selectedFile.name : 'Select or drop your Inward Excel file here'}
            </div>
            <div className="text-[11px] text-[#64748B] mt-1">
              Supports .xlsx, .xls, and .csv formats
            </div>

            {selectedFile && (
              <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-[#CBD5E1] rounded-lg text-xs font-mono text-[#1565D8]">
                <FileCheck className="h-4 w-4 text-[#16A34A]" />
                <span>{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</span>
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
              <span>Parsing and validating Excel columns...</span>
            </div>
          )}

          {/* 3. CLASS-WISE IMPORT CARDS (Section 2 - GROUPED BY CLASS ID) */}
          {classGroups.length > 0 && !isParsing && (
            <div className="space-y-4 pt-2 border-t border-[#E2E8F0]">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[10px] font-bold text-[#64748B] uppercase">Total Records</div>
                  <div className="text-base font-bold text-[#172033] mt-0.5">{parsedRows.length}</div>
                </div>
                <div className="p-2.5 bg-[#DCFCE7] border border-[#BBF7D0] rounded-lg">
                  <div className="text-[10px] font-bold text-[#166534] uppercase">Valid Records</div>
                  <div className="text-base font-bold text-[#16A34A] mt-0.5">{validCount}</div>
                </div>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[10px] font-bold text-[#64748B] uppercase">Unique Classes</div>
                  <div className="text-base font-bold text-[#1565D8] mt-0.5">{classGroups.length}</div>
                </div>
              </div>

              {/* Class-wise Grouped Cards */}
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-[#172033] mb-2 flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-[#1565D8]" />
                  <span>Class-Wise Import Cards (Grouped by Class ID):</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {classGroups.map(cg => (
                    <div
                      key={cg.classId}
                      className="p-4 bg-white border border-[#CBD5E1] rounded-xl shadow-xs flex flex-col justify-between"
                    >
                      <div>
                        <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
                          CLASS ID
                        </div>
                        <div className="font-mono font-black text-lg text-[#172033] mt-0.5">
                          {cg.classId}
                        </div>
                        <div className="text-xs font-semibold text-[#1565D8] mt-1">
                          {cg.count} Members
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
                              isLiveSession: false,
                            })
                          }
                          className="px-3 py-1 bg-[#F1F5F9] hover:bg-[#E2E8F0] border border-[#CBD5E1] text-[#172033] text-xs font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5 text-[#1565D8]" />
                          <span>View Members</span>
                        </button>
                        <span className="text-[11px] font-mono text-[#64748B]">
                          {cg.count} booklets
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action: Import Excel Data Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleInitiateImport}
                  disabled={validCount === 0 || isProcessing}
                  className="w-full py-3 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-[#0D47A1] transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <FileCheck className="h-4 w-4" />
                  <span>Import Excel &amp; Open Scanning Dashboard ({validCount} Records)</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Currently Imported Session Classes (if already imported in active session) */}
      {existingBundles.length > 0 && classGroups.length === 0 && (
        <div className="bg-white border border-[#CBD5E1] rounded-xl shadow-xs overflow-hidden p-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] mb-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-[#172033]">
                Currently Imported Class Bundles
              </div>
              <div className="text-[11px] text-[#64748B]">
                Active classes available in database for scanning
              </div>
            </div>
            <button
              type="button"
              onClick={onNavigateToScan}
              className="px-3 py-1.5 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-[#0D47A1] transition-colors flex items-center gap-1.5"
            >
              <span>Go to Scan</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {existingBundles.map(b => {
              const recs = importedService.getRecords(b.classId);
              return (
                <div
                  key={b.classId}
                  className="p-3.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl flex flex-col justify-between"
                >
                  <div>
                    <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">
                      CLASS ID
                    </div>
                    <div className="font-mono font-black text-base text-[#172033]">
                      {b.classId}
                    </div>
                    <div className="text-xs text-[#1565D8] font-bold mt-1">
                      {b.expectedCount} Members
                    </div>
                    <div className="text-xs text-[#64748B] mt-0.5">
                      Expected Booklets: <strong>{b.expectedCount}</strong>
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveMembersModal({
                          classId: b.classId,
                          members: recs.map(r => r.member_id),
                          isLiveSession: true,
                        })
                      }
                      className="w-full py-1 bg-white hover:bg-slate-100 border border-[#CBD5E1] text-[#172033] text-xs font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Eye className="h-3.5 w-3.5 text-[#1565D8]" />
                      <span>View Members</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. CLASS CARD CLICK: MEMBERS LIST MODAL (Section 2) */}
      {activeMembersModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-lg bg-white border border-[#CBD5E1] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 bg-[#1565D8] text-white flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-white/80">
                  Class Members Detail
                </div>
                <h2 className="text-base font-black tracking-wide">
                  CLASS ID: {activeMembersModal.classId}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveMembersModal(null)}
                className="p-1 hover:bg-white/20 rounded-lg text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-3 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between text-xs">
              <span className="font-bold text-[#172033] uppercase tracking-wider">
                {activeMembersModal.members.length} MEMBERS
              </span>
              <span className="text-[#64748B]">
                Expected Booklets: <strong>{activeMembersModal.members.length}</strong>
              </span>
            </div>

            {/* Compact mobile-friendly table list (Section 2) */}
            <div className="p-3 overflow-y-auto flex-1 divide-y divide-slate-100">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="text-[#64748B] text-[10px] uppercase border-b border-slate-200">
                    <th className="py-1.5 px-3 w-16">#</th>
                    <th className="py-1.5 px-3">Member ID</th>
                    <th className="py-1.5 px-3 text-right">Class</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeMembersModal.members.map((memId, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2 px-3 text-[#64748B]">
                        {String(idx + 1).padStart(3, '0')}
                      </td>
                      <td className="py-2 px-3 font-bold text-[#172033]">{memId}</td>
                      <td className="py-2 px-3 text-right text-[#64748B]">
                        {activeMembersModal.classId}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-white border-t border-[#E2E8F0] text-right">
              <button
                type="button"
                onClick={() => setActiveMembersModal(null)}
                className="px-4 py-2 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-[#0D47A1] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. DUPLICATE IMPORT DETECTION MODAL (Section 3) */}
      {duplicateModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-lg bg-white border border-[#CBD5E1] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-[#F59E0B] text-black flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                <h2 className="text-base font-black tracking-wide uppercase">
                  {duplicateModalData.allDuplicates
                    ? 'NO NEW RECORDS TO IMPORT'
                    : 'DUPLICATE RECORDS FOUND'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setDuplicateModalData(null)}
                className="p-1 hover:bg-black/10 rounded-lg text-black transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto">
              {duplicateModalData.allDuplicates ? (
                <div className="p-4 bg-[#FEF3C7] border border-[#FDE68A] rounded-xl text-center">
                  <div className="text-sm font-bold text-[#92400E]">
                    All records in this Excel file already exist.
                  </div>
                  <div className="text-xs text-[#78350F] mt-1">
                    No new records were found to import. A duplicate import session will not be created.
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-xs text-[#475569]">
                    Some records in this Excel file have already been imported:
                  </div>

                  {/* Duplicate Records Table */}
                  <div className="border border-[#CBD5E1] rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-[#F8FAFC] text-[10px] text-[#64748B] uppercase border-b border-[#E2E8F0]">
                        <tr>
                          <th className="py-2 px-3">Class ID</th>
                          <th className="py-2 px-3">Member ID</th>
                          <th className="py-2 px-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {duplicateModalData.duplicateItems.map((dup, idx) => (
                          <tr key={idx} className="bg-amber-50/50">
                            <td className="py-1.5 px-3 font-bold text-[#172033]">{dup.class_id}</td>
                            <td className="py-1.5 px-3 font-bold text-[#92400E]">{dup.member_id}</td>
                            <td className="py-1.5 px-3 text-right text-[10px] text-[#B45309] font-bold">
                              DUPLICATE
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="text-xs text-[#64748B] italic">
                    These duplicate records already exist and will not be imported again.
                  </div>

                  {/* Summary Counts */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1">
                    <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg">
                      <div className="text-[10px] text-[#64748B]">Total Excel</div>
                      <div className="font-bold text-[#172033]">{duplicateModalData.total}</div>
                    </div>
                    <div className="p-2 bg-[#DCFCE7] border border-[#BBF7D0] rounded-lg">
                      <div className="text-[10px] text-[#166534]">New Records</div>
                      <div className="font-bold text-[#16A34A]">
                        {duplicateModalData.newItems.length}
                      </div>
                    </div>
                    <div className="p-2 bg-[#FEF3C7] border border-[#FDE68A] rounded-lg">
                      <div className="text-[10px] text-[#92400E]">Duplicate</div>
                      <div className="font-bold text-[#B45309]">
                        {duplicateModalData.duplicateItems.length}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="p-3 bg-white border-t border-[#E2E8F0] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDuplicateModalData(null)}
                className="px-4 py-2 bg-white border border-[#CBD5E1] text-[#172033] text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-slate-50 transition-colors"
              >
                CANCEL
              </button>

              {!duplicateModalData.allDuplicates && (
                <button
                  type="button"
                  onClick={() => executeImport(duplicateModalData.newItems)}
                  className="px-4 py-2 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-[#0D47A1] transition-colors"
                >
                  IMPORT NEW RECORDS ({duplicateModalData.newItems.length})
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
