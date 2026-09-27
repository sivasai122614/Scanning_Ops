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
  const [universityRequiredError, setUniversityRequiredError] = useState<boolean>(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [classGroups, setClassGroups] = useState<ClassGroupPreview[]>([]);

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

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const bundles = importedService.getClassBundles();
    setExistingBundles(bundles);
    const activeUni = importedService.getActiveUniversity();
    if (activeUni) {
      setUniversityName(activeUni);
    }
  }, []);

  // Parse Excel file and extract Class ID and Member ID
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // SECTION 13: COLLEGE / UNIVERSITY REQUIRED CHECK BEFORE PARSING/IMPORTING
    if (!universityName.trim()) {
      setUniversityRequiredError(true);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUniversityRequiredError(false);
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
        // raw: false ensures strings with leading zeros like "0031" are preserved as pure strings
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

        if (!rawJson || rawJson.length < 2) {
          throw new Error('The selected Excel file is empty or does not contain data rows.');
        }

        const headerRow = rawJson[0].map((h: any) => String(h || '').trim().toLowerCase());

        // Header Detection:
        let classColIdx = headerRow.findIndex(
          (h: string) =>
            h.includes('class') || h.includes('batch') || h.includes('cls') || h.includes('bundle')
        );

        let memberColIdx = headerRow.findIndex(
          (h: string) =>
            h.includes('member') ||
            h.includes('student') ||
            h.includes('roll') ||
            (h.includes('id') && !h.includes('class')) ||
            h.includes('barcode')
        );

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

          // Pure string extraction to preserve leading zeros e.g. 0031
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

    executeImport(items);
  };

  const executeImport = async (itemsToInsert: { class_id: string; member_id: string }[]) => {
    setDuplicateModalData(null);
    setIsProcessing(true);

    try {
      setProcessingStep('IMPORTING DATA...');
      await new Promise(r => setTimeout(r, 400));

      setProcessingStep('VALIDATING RECORDS...');
      await new Promise(r => setTimeout(r, 400));

      setProcessingStep('SAVING TO DATABASE & CALCULATING CLASS COUNTS...');
      const res = await importedService.bulkInsert(
        itemsToInsert,
        universityName.trim(),
        selectedFile?.name || 'inward_import.xlsx'
      );

      if (!res.success) {
        throw new Error(res.error || 'Failed to save imported records.');
      }

      await new Promise(r => setTimeout(r, 400));
      setProcessingStep('OPENING SCANNING DASHBOARD...');
      await new Promise(r => setTimeout(r, 400));

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

      {/* 2. Primary Card: UPLOAD INWARD EXCEL FILE */}
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
          {/* Required Columns Specification Banner */}
          <div className="p-3 bg-[#EFF6FF] border border-[#BFDBFE] rounded-lg text-xs text-[#1E40AF]">
            <div className="font-bold uppercase tracking-wider text-[11px] mb-1">Required Columns:</div>
            <div className="flex items-center gap-4 text-xs font-mono font-semibold">
              <span className="bg-white px-2 py-0.5 border border-[#BFDBFE] rounded-md">Class ID</span>
              <span className="text-[#64748B] font-sans">and</span>
              <span className="bg-white px-2 py-0.5 border border-[#BFDBFE] rounded-md">Member ID</span>
            </div>
            <div className="text-[11px] text-[#3B82F6] mt-1.5 font-sans">
              Columns are auto-detected by header name. Leading zeros (e.g. 0031) are strictly preserved.
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
                placeholder="e.g. General University, VIT-AP University..."
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

          {/* Upload Drop Zone */}
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

          {/* 3. CLASS-WISE IMPORT CARDS */}
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
                            })
                          }
                          className="px-2.5 py-1 text-xs font-bold text-[#1565D8] hover:bg-blue-50 rounded-lg border border-[#BFDBFE] transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>View Members ({cg.count})</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Button: Import & Save to Database */}
              <div className="pt-3 border-t border-[#E2E8F0] flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs text-[#64748B]">
                  Ready to ingest <strong className="text-[#172033]">{validCount}</strong> expected records for <strong className="text-[#1565D8]">{universityName}</strong>.
                </div>
                <button
                  type="button"
                  onClick={handleInitiateImport}
                  className="w-full sm:w-auto px-6 py-2.5 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-black uppercase tracking-wider rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Check className="h-4 w-4 stroke-[3]" />
                  <span>Import &amp; Open Scanning Dashboard</span>
                </button>
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

            <div className="py-3 max-h-60 overflow-y-auto divide-y divide-slate-100 font-mono text-xs">
              {activeMembersModal.members.map((m, idx) => (
                <div key={idx} className="py-2 px-1 flex items-center justify-between">
                  <span className="text-slate-400 text-[11px]">{idx + 1}.</span>
                  <span className="font-bold text-[#172033]">{m}</span>
                  <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    EXPECTED
                  </span>
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
    </div>
  );
};
