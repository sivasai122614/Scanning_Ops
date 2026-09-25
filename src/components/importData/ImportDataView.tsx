// ==============================================================================
// Import Data Screen (Section 2 & 3)
// ONE PRIMARY PURPOSE: IMPORT EXCEL DATA
// - UPLOAD INWARD EXCEL FILE
// - Required columns: Class ID, Member ID
// - Validates records & calculates class-wise expected counts
// - Stores University Name
// - Short step-by-step loading animation:
//   "IMPORTING DATA..." -> "VALIDATING RECORDS..." -> "CALCULATING CLASS COUNTS..." -> "OPENING SCANNING DASHBOARD..."
// - Automatically navigates user to SCANNING DASHBOARD!
// ==============================================================================

import React, { useState, useRef } from 'react';
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
  RefreshCw,
  FileCheck,
  Check,
  X,
} from 'lucide-react';
import { importedService } from '../../services/importedService';

interface ParsedRow {
  rowNumber: number;
  classId: string;
  memberId: string;
  status: 'valid' | 'duplicate' | 'invalid';
  reason?: string;
}

interface ClassCountPreview {
  classId: string;
  count: number;
}

interface ImportDataViewProps {
  onNavigateToScan: () => void;
  onNavigateToDashboard?: () => void;
  onNavigateToManualInward?: () => void;
}

export const ImportDataView: React.FC<ImportDataViewProps> = ({
  onNavigateToScan,
}) => {
  const [universityName, setUniversityName] = useState('General University');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [classCounts, setClassCounts] = useState<ClassCountPreview[]>([]);

  // Section 3: Processing Step Loading State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (!rawJson || rawJson.length < 2) {
          throw new Error('The selected Excel file is empty or does not contain data rows.');
        }

        const headerRow = rawJson[0].map((h: any) => String(h || '').trim().toLowerCase());

        // Find Class ID column
        let classColIdx = headerRow.findIndex((h: string) =>
          h.includes('class') || h.includes('batch') || h.includes('cls') || h.includes('bundle')
        );

        // Find Member ID column
        let memberColIdx = headerRow.findIndex((h: string) =>
          h.includes('member') || h.includes('student') || h.includes('roll') || h.includes('id') || h.includes('barcode')
        );

        // Fallback to col 0 and 1 if standard 2-column format
        if (classColIdx === -1 && memberColIdx === -1 && headerRow.length >= 2) {
          classColIdx = 0;
          memberColIdx = 1;
        } else if (classColIdx === -1) {
          classColIdx = 0;
        } else if (memberColIdx === -1) {
          memberColIdx = classColIdx === 0 ? 1 : 0;
        }

        const rows: ParsedRow[] = [];
        const seenKeys = new Set<string>();
        const classMap = new Map<string, number>();

        for (let i = 1; i < rawJson.length; i++) {
          const rowData = rawJson[i];
          if (!rowData || rowData.length === 0) continue;

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

          const uniqueKey = `${rawClass.toLowerCase()}_${rawMember.toLowerCase()}`;
          if (seenKeys.has(uniqueKey)) {
            rows.push({
              rowNumber: i + 1,
              classId: rawClass,
              memberId: rawMember,
              status: 'duplicate',
              reason: 'Duplicate entry in file',
            });
            continue;
          }

          seenKeys.add(uniqueKey);
          rows.push({
            rowNumber: i + 1,
            classId: rawClass,
            memberId: rawMember,
            status: 'valid',
          });

          classMap.set(rawClass, (classMap.get(rawClass) || 0) + 1);
        }

        if (rows.length === 0) {
          throw new Error('No records could be extracted from the file.');
        }

        const validRows = rows.filter(r => r.status === 'valid');
        if (validRows.length === 0) {
          throw new Error('No valid records found. Please check that Class ID and Member ID are populated.');
        }

        const counts: ClassCountPreview[] = [];
        classMap.forEach((count, classId) => {
          counts.push({ classId, count });
        });
        counts.sort((a, b) => a.classId.localeCompare(b.classId));

        setParsedRows(rows);
        setClassCounts(counts);
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
   * Section 3: After Successful Excel Import Execution
   * Shows step-by-step loading animation:
   * IMPORTING DATA... -> VALIDATING RECORDS... -> CALCULATING CLASS COUNTS... -> OPENING SCANNING DASHBOARD...
   * Then automatically opens Scanning Dashboard!
   */
  const handleCommitImport = async () => {
    const validRows = parsedRows.filter(r => r.status === 'valid');
    if (validRows.length === 0) {
      setParseError('No valid rows to import.');
      return;
    }

    if (!universityName.trim()) {
      setParseError('Please enter the University Name.');
      return;
    }

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
      const itemsToImport = validRows.map(r => ({
        class_id: r.classId,
        member_id: r.memberId,
      }));

      const res = await importedService.bulkInsert(
        itemsToImport,
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
      { 'Class ID': '1211', 'Member ID': 'MEM001' },
      { 'Class ID': '1211', 'Member ID': 'MEM002' },
      { 'Class ID': '1211', 'Member ID': 'MEM003' },
      { 'Class ID': '1211', 'Member ID': 'MEM004' },
      { 'Class ID': '1211', 'Member ID': 'MEM005' },
      { 'Class ID': '1211', 'Member ID': 'MEM006' },
      { 'Class ID': '1211', 'Member ID': 'MEM007' },
      { 'Class ID': '1211', 'Member ID': 'MEM008' },
      { 'Class ID': '1211', 'Member ID': 'MEM009' },
      { 'Class ID': '1211', 'Member ID': 'MEM010' },
      { 'Class ID': '1212', 'Member ID': 'MEM011' },
      { 'Class ID': '1212', 'Member ID': 'MEM012' },
      { 'Class ID': '1212', 'Member ID': 'MEM013' },
      { 'Class ID': '1212', 'Member ID': 'MEM014' },
      { 'Class ID': '1212', 'Member ID': 'MEM015' },
      { 'Class ID': '1212', 'Member ID': 'MEM016' },
      { 'Class ID': '1212', 'Member ID': 'MEM017' },
      { 'Class ID': '1212', 'Member ID': 'MEM018' },
      { 'Class ID': '1213', 'Member ID': 'MEM019' },
      { 'Class ID': '1213', 'Member ID': 'MEM020' },
      { 'Class ID': '1213', 'Member ID': 'MEM021' },
      { 'Class ID': '1213', 'Member ID': 'MEM022' },
      { 'Class ID': '1213', 'Member ID': 'MEM023' },
      { 'Class ID': '1213', 'Member ID': 'MEM024' },
      { 'Class ID': '1213', 'Member ID': 'MEM025' },
      { 'Class ID': '1213', 'Member ID': 'MEM026' },
      { 'Class ID': '1213', 'Member ID': 'MEM027' },
      { 'Class ID': '1213', 'Member ID': 'MEM028' },
      { 'Class ID': '1213', 'Member ID': 'MEM029' },
      { 'Class ID': '1213', 'Member ID': 'MEM030' },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'InwardingTemplate');
    XLSX.writeFile(wb, 'ExamScan_Inwarding_Template.xlsx');
  };

  const validCount = parsedRows.filter(r => r.status === 'valid').length;
  const invalidCount = parsedRows.filter(r => r.status !== 'valid').length;

  return (
    <div className="space-y-4 font-sans max-w-4xl mx-auto pb-12">
      {/* Step-by-Step Processing Overlay (Section 3) */}
      {isProcessing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white border border-[#CBD5E1] shadow-2xl p-6 text-center">
            <div className="h-12 w-12 border-4 border-[#1565D8]/20 border-t-[#1565D8] rounded-full animate-spin mx-auto mb-4" />
            <div className="text-sm font-black uppercase tracking-wider text-[#1565D8]">
              {processingStep}
            </div>
            <div className="text-xs text-[#64748B] mt-2">
              Preparing class bundles and updating the inwarding scanning session...
            </div>

            <div className="mt-5 space-y-2 text-left bg-slate-50 p-3 border border-slate-200 text-xs">
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

      {/* Primary Card: UPLOAD INWARD EXCEL FILE (Section 2) */}
      <div className="bg-white border border-[#CBD5E1] shadow-xs overflow-hidden">
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
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold uppercase tracking-wider transition-colors"
            title="Download sample Excel file with Class ID and Member ID"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Sample Template</span>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Required Columns Specification Banner (Section 2) */}
          <div className="p-3 bg-[#EFF6FF] border border-[#BFDBFE] text-xs text-[#1E40AF]">
            <div className="font-bold uppercase tracking-wider text-[11px] mb-1">Required Columns:</div>
            <div className="flex items-center gap-4 text-xs font-mono font-semibold">
              <span className="bg-white px-2 py-0.5 border border-[#BFDBFE]">Class ID</span>
              <span className="text-[#64748B] font-sans">and</span>
              <span className="bg-white px-2 py-0.5 border border-[#BFDBFE]">Member ID</span>
            </div>
            <div className="text-[11px] text-[#3B82F6] mt-1.5 font-sans">
              The Excel data will serve as the source of truth for calculating expected booklet counts.
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
                className="w-full pl-9 pr-3 py-2 border border-[#CBD5E1] text-xs text-[#172033] bg-white focus:outline-hidden focus:border-[#1565D8]"
              />
            </div>
          </div>

          {/* Upload Drop Zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-[#CBD5E1] hover:border-[#1565D8] bg-[#F8FAFC] hover:bg-blue-50/40 p-6 text-center cursor-pointer transition-colors"
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
              <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-[#CBD5E1] text-xs font-mono text-[#1565D8]">
                <FileCheck className="h-4 w-4 text-[#16A34A]" />
                <span>{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</span>
              </div>
            )}
          </div>

          {/* Error Message */}
          {parseError && (
            <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#991B1B] flex items-center gap-2">
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

          {/* Parsed Summary & Class-Wise Expected Counts Preview */}
          {parsedRows.length > 0 && !isParsing && (
            <div className="space-y-4 pt-2 border-t border-[#E2E8F0]">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-2.5 bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold text-[#64748B] uppercase">Total Records</div>
                  <div className="text-base font-bold text-[#172033] mt-0.5">{parsedRows.length}</div>
                </div>
                <div className="p-2.5 bg-[#DCFCE7] border border-[#BBF7D0]">
                  <div className="text-[10px] font-bold text-[#166534] uppercase">Valid Records</div>
                  <div className="text-base font-bold text-[#16A34A] mt-0.5">{validCount}</div>
                </div>
                <div className="p-2.5 bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold text-[#64748B] uppercase">Unique Classes</div>
                  <div className="text-base font-bold text-[#1565D8] mt-0.5">{classCounts.length}</div>
                </div>
              </div>

              {/* Class-wise Expected Counts Preview */}
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-[#172033] mb-2 flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-[#1565D8]" />
                  <span>Detected Classes &amp; Expected Counts:</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {classCounts.map(cc => (
                    <div
                      key={cc.classId}
                      className="p-2.5 bg-[#F8FAFC] border border-[#CBD5E1] flex items-center justify-between"
                    >
                      <span className="font-mono font-bold text-xs text-[#172033]">
                        Class {cc.classId}
                      </span>
                      <span className="px-2 py-0.5 bg-[#1565D8] text-white font-mono font-bold text-[11px]">
                        {cc.count} Expected
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action: Import Excel Data Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleCommitImport}
                  disabled={validCount === 0 || isProcessing}
                  className="w-full py-3 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#0D47A1] transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
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
    </div>
  );
};
