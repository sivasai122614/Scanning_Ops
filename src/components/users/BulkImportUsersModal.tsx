// ==============================================================================
// Bulk Import Users Modal (Excel Upload & Template Generation)
// Reads Excel file with columns: Mail Id | Password | Role
// Automatically provisions users in Supabase Auth & public.profiles
// ==============================================================================

import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { userService } from '../../services/userService';
import { AppRole } from '../../types/auth';
import {
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  X,
  FileCheck,
  RefreshCw,
  Eye,
  EyeOff,
  UserCheck,
  Check,
} from 'lucide-react';

interface BulkUserRow {
  index: number;
  email: string;
  password: string;
  role: AppRole;
  isValid: boolean;
  validationError?: string;
}

interface BulkImportUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUsersImported: () => void;
}

export const BulkImportUsersModal: React.FC<BulkImportUsersModalProps> = ({
  isOpen,
  onClose,
  onUsersImported,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<BulkUserRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentProgressIndex, setCurrentProgressIndex] = useState(0);
  const [importSummary, setImportSummary] = useState<{
    total: number;
    success: number;
    failed: number;
    errors: Array<{ email: string; reason: string }>;
  } | null>(null);
  const [showPasswords, setShowPasswords] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  if (!isOpen) return null;

  // 1. Download official Excel template with exact requested columns (Zero sample data)
  const handleDownloadTemplate = () => {
    const headers = ['Mail Id', 'Password', 'Role'];
    const sampleData = [headers]; // No sample data rows

    const ws = XLSX.utils.aoa_to_sheet(sampleData);

    // Set column widths
    ws['!cols'] = [
      { wch: 30 }, // Mail Id
      { wch: 20 }, // Password
      { wch: 15 }, // Role
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Users');

    XLSX.writeFile(wb, 'Users_Bulk_Import_Template.xlsx');
  };

  // 2. Parse Excel file
  const handleFileUpload = (file: File) => {
    setSelectedFile(file);
    setImportSummary(null);

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (!rawJson || rawJson.length < 2) {
          alert('Excel file is empty or missing headers.');
          return;
        }

        const headerRow = rawJson[0].map(h => String(h || '').trim().toLowerCase());
        
        // Find column indices
        let emailIdx = headerRow.findIndex(h =>
          h.includes('mail') || h.includes('email') || h === 'mail id' || h === 'email id'
        );
        let passwordIdx = headerRow.findIndex(h =>
          h.includes('pass') || h === 'password'
        );
        let roleIdx = headerRow.findIndex(h =>
          h.includes('role') || h === 'user role'
        );

        // Fallbacks if header names don't match exactly
        if (emailIdx === -1) emailIdx = 0;
        if (passwordIdx === -1) passwordIdx = 1;
        if (roleIdx === -1) roleIdx = 2;

        const rows: BulkUserRow[] = [];
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        for (let r = 1; r < rawJson.length; r++) {
          const rowData = rawJson[r];
          if (!rowData || rowData.length === 0) continue;

          const rawEmail = String(rowData[emailIdx] ?? '').trim();
          const rawPassword = String(rowData[passwordIdx] ?? '').trim();
          const rawRole = String(rowData[roleIdx] ?? '').trim().toLowerCase();

          // Skip completely blank rows
          if (!rawEmail && !rawPassword && !rawRole) continue;

          let isValid = true;
          let validationError = '';

          if (!rawEmail) {
            isValid = false;
            validationError = 'Missing Mail Id';
          } else if (!emailRegex.test(rawEmail)) {
            isValid = false;
            validationError = 'Invalid email format';
          } else if (!rawPassword) {
            isValid = false;
            validationError = 'Missing Password';
          } else if (rawPassword.length < 6) {
            isValid = false;
            validationError = 'Password < 6 chars';
          }

          const resolvedRole: AppRole = rawRole === 'admin' ? 'admin' : 'inward';

          rows.push({
            index: r,
            email: rawEmail,
            password: rawPassword,
            role: resolvedRole,
            isValid,
            validationError,
          });
        }

        setParsedRows(rows);
      } catch (err: any) {
        alert('Failed to read Excel file: ' + err.message);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        handleFileUpload(file);
      } else {
        alert('Please upload an Excel (.xlsx or .xls) file.');
      }
    }
  };

  // 3. Execute bulk import
  const handleExecuteImport = async () => {
    const validRows = parsedRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      alert('No valid rows found to import.');
      return;
    }

    setIsProcessing(true);
    setProgressPercent(0);
    setCurrentProgressIndex(0);

    let successCount = 0;
    let failedCount = 0;
    const errors: Array<{ email: string; reason: string }> = [];

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      setCurrentProgressIndex(i + 1);
      setProgressPercent(Math.round(((i + 1) / validRows.length) * 100));

      const res = await userService.createAuthUser({
        email: row.email,
        password: row.password,
        role: row.role,
        fullName: row.email.split('@')[0],
      });

      if (res.success) {
        successCount++;
      } else {
        failedCount++;
        errors.push({
          email: row.email,
          reason: res.error || 'Failed to provision',
        });
      }
    }

    setImportSummary({
      total: validRows.length,
      success: successCount,
      failed: failedCount,
      errors,
    });

    setIsProcessing(false);
    onUsersImported();
  };

  const handleReset = () => {
    setSelectedFile(null);
    setParsedRows([]);
    setImportSummary(null);
    setIsProcessing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl text-slate-800 my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 border border-blue-200 text-[#1565D8]">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Bulk Import Users (Excel)</h2>
              <p className="text-xs text-slate-500">
                Upload Excel with <span className="font-mono font-semibold text-slate-700">Mail Id, Password, Role</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold hover:bg-emerald-100 transition-colors shadow-xs"
              title="Download official Excel template with Mail Id, Password, Role columns"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download Template</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Upload State or Results */}
        {!selectedFile ? (
          <div className="mt-5 space-y-4">
            <div
              onDragOver={e => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-150 ${
                dragOver
                  ? 'border-[#1565D8] bg-blue-50/50 scale-[0.99]'
                  : 'border-slate-300 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={e => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFileUpload(e.target.files[0]);
                  }
                }}
              />
              <div className="flex flex-col items-center justify-center gap-3">
                <div className="h-12 w-12 rounded-full bg-blue-100/70 text-[#1565D8] flex items-center justify-center">
                  <Upload className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-800">
                    Click to browse or drag &amp; drop Excel file here
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Supports <span className="font-mono">.xlsx</span> and <span className="font-mono">.xls</span> files
                  </div>
                </div>
                <div className="text-[11px] text-slate-400 font-medium">
                  Columns required: <span className="font-semibold text-slate-700">Mail Id</span> |{' '}
                  <span className="font-semibold text-slate-700">Password</span> |{' '}
                  <span className="font-semibold text-slate-700">Role</span> (admin / inward)
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-blue-50/80 border border-blue-200 p-3.5 text-xs text-blue-900 flex items-start gap-2.5">
              <Download className="h-4 w-4 text-[#1565D8] shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Need the Excel template?</span> Click the{' '}
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="font-bold underline text-[#1565D8] hover:text-[#0D47A1]"
                >
                  Download Template
                </button>{' '}
                button above to get a pre-formatted Excel file ready for bulk data entry.
              </div>
            </div>
          </div>
        ) : importSummary ? (
          /* Summary Screen */
          <div className="mt-5 space-y-4">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-xs text-emerald-900">
              <div className="flex items-center gap-2 font-bold text-sm text-emerald-900">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span>Bulk Import Completed</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-3 text-center">
                <div className="bg-white rounded-lg p-2.5 border border-emerald-200 shadow-2xs">
                  <div className="text-[11px] text-slate-500 font-medium">Total Processed</div>
                  <div className="text-lg font-bold font-mono text-slate-800">{importSummary.total}</div>
                </div>
                <div className="bg-white rounded-lg p-2.5 border border-emerald-200 shadow-2xs">
                  <div className="text-[11px] text-emerald-700 font-medium">Successfully Created</div>
                  <div className="text-lg font-bold font-mono text-emerald-600">{importSummary.success}</div>
                </div>
                <div className="bg-white rounded-lg p-2.5 border border-emerald-200 shadow-2xs">
                  <div className="text-[11px] text-rose-700 font-medium">Failed</div>
                  <div className="text-lg font-bold font-mono text-rose-600">{importSummary.failed}</div>
                </div>
              </div>
            </div>

            {importSummary.errors.length > 0 && (
              <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 text-xs text-rose-900 space-y-1.5 max-h-40 overflow-y-auto">
                <div className="font-bold flex items-center gap-1.5 text-rose-800">
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                  <span>Failed Accounts:</span>
                </div>
                {importSummary.errors.map((err, idx) => (
                  <div key={idx} className="flex justify-between font-mono text-[11px] border-b border-rose-100 pb-1">
                    <span>{err.email}</span>
                    <span className="text-rose-600">{err.reason}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 flex justify-end gap-3 border-t border-slate-200">
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Import Another File
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl bg-[#1565D8] text-xs font-semibold text-white hover:bg-[#0D47A1]"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Preview Parsed Rows */
          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-emerald-600" />
                <span className="font-semibold text-slate-800">{selectedFile.name}</span>
                <span className="text-slate-400">({parsedRows.length} rows found)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPasswords(!showPasswords)}
                  className="flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-900"
                >
                  {showPasswords ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  <span>{showPasswords ? 'Hide Passwords' : 'Show Passwords'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs text-rose-600 hover:underline"
                >
                  Remove File
                </button>
              </div>
            </div>

            {/* Table Preview */}
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-[11px] font-semibold text-slate-600 uppercase border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Mail Id</th>
                    <th className="px-3 py-2">Password</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Validation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsedRows.map((row, idx) => (
                    <tr key={idx} className={row.isValid ? 'hover:bg-slate-50' : 'bg-rose-50/40'}>
                      <td className="px-3 py-2 font-mono text-slate-400 text-[11px]">{idx + 1}</td>
                      <td className="px-3 py-2 font-mono font-medium text-slate-800">{row.email || '—'}</td>
                      <td className="px-3 py-2 font-mono text-slate-600">
                        {showPasswords ? row.password : '••••••••'}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            row.role === 'admin'
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : 'bg-blue-100 text-[#1565D8] border border-blue-200'
                          }`}
                        >
                          {row.role}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {row.isValid ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold">
                            <Check className="h-3 w-3" />
                            <span>Valid</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-rose-600 font-semibold">
                            <AlertTriangle className="h-3 w-3" />
                            <span>{row.validationError}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Progress Bar when importing */}
            {isProcessing && (
              <div className="space-y-1.5 p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs">
                <div className="flex justify-between font-semibold text-blue-900">
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#1565D8]" />
                    <span>Provisioning users in Supabase Auth &amp; Profiles...</span>
                  </span>
                  <span>
                    {currentProgressIndex} / {parsedRows.filter(r => r.isValid).length} ({progressPercent}%)
                  </span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-[#1565D8] h-2 transition-all duration-200"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Bottom Actions */}
            <div className="pt-2 flex items-center justify-between border-t border-slate-200">
              <div className="text-xs text-slate-500">
                <span className="font-bold text-emerald-600">{parsedRows.filter(r => r.isValid).length}</span> valid{' '}
                records ready to import.
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isProcessing || parsedRows.filter(r => r.isValid).length === 0}
                  onClick={handleExecuteImport}
                  className="px-5 py-2 rounded-xl bg-[#1565D8] text-xs font-semibold text-white hover:bg-[#0D47A1] disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Importing...</span>
                    </>
                  ) : (
                    <>
                      <UserCheck className="h-4 w-4" />
                      <span>Confirm &amp; Import Users</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
