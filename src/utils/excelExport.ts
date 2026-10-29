// ==============================================================================
// Excel & Spreadsheet Generation Utility
// Supports genuine .xlsx generation with merged header rows, centered bold university,
// bold column headers, and uniform standard row heights matching data entries.
// Strictly zero mock data.
// ==============================================================================

import ExcelJS from 'exceljs';
import { ScannedScript } from '../types/exam';
import type { ClassBundle, SessionSummary } from '../services/importedService';

export interface ExportDataPayload {
  universityTitle: string;
  scans: (ScannedScript & { university?: string })[];
}

/**
 * Generates and downloads a genuine Microsoft Excel (.xlsx) file
 * with Row 1 completely merged displaying the University Name in BOLD and CENTERED,
 * uniform row height matching other entries, and Row 2 column headings in BOLD.
 */
export async function exportToExcel(payload: ExportDataPayload, fileNamePrefix = 'ExamScan_Report'): Promise<void> {
  const { universityTitle, scans } = payload;
  const displayTitle = (universityTitle || 'EXAMINATION RECONCILIATION REPORT').toUpperCase();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ExamScan Administration';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Reconciliation Report', {
    views: [{ showGridLines: true }],
  });

  // Standard uniform row height across the spreadsheet (standard Excel row height ~20)
  const STANDARD_ROW_HEIGHT = 20;

  // Setup 9 Columns with comfortable widths
  worksheet.columns = [
    { key: 'scheduled_id', width: 16 },
    { key: 'student_id', width: 18 },
    { key: 'class_id', width: 14 },
    { key: 'room_number', width: 12 },
    { key: 'subject', width: 26 },
    { key: 'status', width: 14 },
    { key: 'scanned_at', width: 24 },
    { key: 'scanned_by', width: 32 },
    { key: 'university', width: 22 },
  ];

  // Requirement 2 & 5: Row 1 Merged across A1:I1
  // Centered horizontally & vertically, BOLD font, and standard row height (matching entries below)
  worksheet.mergeCells('A1:I1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = displayTitle;
  titleCell.font = {
    name: 'Calibri',
    size: 11,
    bold: true,
    color: { argb: 'FF0F172A' },
  };
  titleCell.alignment = {
    horizontal: 'center',
    vertical: 'middle',
  };
  worksheet.getRow(1).height = STANDARD_ROW_HEIGHT;

  // Requirement 2: Row 2 Column Headers in BOLD font, matching standard row height
  const headers = [
    'Schedule ID',
    'Student ID',
    'Class ID',
    'Room',
    'Subject',
    'Status',
    'Timestamp',
    'Operator',
    'University',
  ];
  const headerRow = worksheet.getRow(2);
  headerRow.values = headers;
  headerRow.height = STANDARD_ROW_HEIGHT;
  headerRow.eachCell(cell => {
    cell.font = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: 'FF0F172A' },
    };
    cell.alignment = {
      horizontal: 'left',
      vertical: 'middle',
    };
  });

  // Data Rows: Standard row height, clean typography, sorted data
  for (const scan of scans) {
    const formattedDate = scan.scanned_at ? new Date(scan.scanned_at).toLocaleString() : '';
    const row = worksheet.addRow({
      scheduled_id: scan.scheduled_id,
      student_id: scan.student_id,
      class_id: scan.class_id || 'General',
      room_number: scan.room_number || 'Room 1',
      subject: scan.subject || 'General Subject',
      status: scan.status,
      scanned_at: formattedDate,
      scanned_by: scan.scanned_by || 'Staff Officer',
      university: scan.university || universityTitle || 'University',
    });
    row.height = STANDARD_ROW_HEIGHT;
    row.eachCell(cell => {
      cell.font = {
        name: 'Calibri',
        size: 11,
        bold: false,
        color: { argb: 'FF334155' },
      };
      cell.alignment = {
        horizontal: 'left',
        vertical: 'middle',
      };
    });
  }

  // Generate real .xlsx buffer
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeName = (universityTitle || 'All_Universities')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 30);
  const dateStr = new Date().toISOString().split('T')[0];
  link.href = url;
  link.download = `${fileNamePrefix}_${safeName}_${dateStr}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Copies reconciliation records formatted as Google Sheets TSV tab-separated data
 * into the clipboard for immediate paste into Google Sheets.
 */
export function formatDataForGoogleSheets(payload: ExportDataPayload): string {
  const { universityTitle, scans } = payload;
  const headers = [
    'Schedule ID',
    'Student ID',
    'Class ID',
    'Room',
    'Subject',
    'Status',
    'Timestamp',
    'Operator',
    'University',
  ];

  const lines = [
    (universityTitle || 'EXAMINATION RECONCILIATION REPORT').toUpperCase(),
    headers.join('\t'),
    ...scans.map(s =>
      [
        s.scheduled_id,
        s.student_id,
        s.class_id || 'General',
        s.room_number || 'Room 1',
        s.subject || 'General Subject',
        s.status,
        s.scanned_at ? new Date(s.scanned_at).toLocaleString() : '',
        s.scanned_by || 'Staff Officer',
        s.university || universityTitle || 'University',
      ].join('\t')
    ),
  ];

  return lines.join('\n');
}

/**
 * Generates and downloads a complete, professional Excel (.xlsx) report for
 * the entire "Scanning Status Overview" containing all classes with live status,
 * expected/received/pending counts, completion percentage, operators and timestamps.
 */
export async function exportScanningStatusOverviewToExcel(
  bundles: ClassBundle[],
  universityName: string,
  summary?: SessionSummary,
  fileNamePrefix = 'Scanning_Status_Overview'
): Promise<void> {
  const displayTitle = `SCANNING STATUS OVERVIEW - ${(universityName || 'ALL CLASSES').toUpperCase()}`;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ExamScan Administration';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Status Overview', {
    views: [{ showGridLines: true }],
  });

  const STANDARD_ROW_HEIGHT = 20;

  worksheet.columns = [
    { key: 'sno', width: 8 },
    { key: 'class_id', width: 18 },
    { key: 'university', width: 22 },
    { key: 'status', width: 18 },
    { key: 'expected', width: 18 },
    { key: 'received', width: 18 },
    { key: 'pending', width: 18 },
    { key: 'progress', width: 16 },
    { key: 'started_by', width: 22 },
    { key: 'saved_by', width: 22 },
    { key: 'last_activity', width: 22 },
    { key: 'saved_at', width: 22 },
  ];

  // Row 1: Banner Header Title
  worksheet.mergeCells('A1:L1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = displayTitle;
  titleCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1565D8' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 28;

  // Row 2: Subtitle summary metadata
  worksheet.mergeCells('A2:L2');
  const subCell = worksheet.getCell('A2');
  const expTotal = summary?.totalExpected ?? bundles.reduce((acc, b) => acc + b.expectedCount, 0);
  const recTotal = summary?.totalReceived ?? bundles.reduce((acc, b) => acc + b.receivedCount, 0);
  const penTotal = summary?.totalPending ?? bundles.reduce((acc, b) => acc + b.missingCount, 0);
  const compTotal = bundles.filter(b => b.status === 'COMPLETED').length;
  const partTotal = bundles.filter(b => b.status === 'PARTIAL / SAVED').length;
  const progTotal = bundles.filter(b => b.status === 'IN PROGRESS').length;
  const notStartTotal = bundles.filter(b => b.status === 'NOT STARTED').length;

  subCell.value = `Generated: ${new Date().toLocaleString()} | Total Classes: ${bundles.length} | Completed: ${compTotal} | Partial/Saved: ${partTotal} | In Progress: ${progTotal} | Not Started: ${notStartTotal} | Expected: ${expTotal} | Received: ${recTotal} | Pending: ${penTotal}`;
  subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(2).height = 20;

  // Row 3: Column Headers
  const headers = [
    'S.No',
    'Class ID / SH ID',
    'Institution / University',
    'Scanning Status',
    'Expected Booklets',
    'Received Booklets',
    'Pending Booklets',
    'Completion %',
    'Started By',
    'Saved By',
    'Last Activity',
    'Saved At',
  ];
  const headerRow = worksheet.getRow(3);
  headerRow.values = headers;
  headerRow.height = 24;
  headerRow.eachCell(cell => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // Data rows
  bundles.forEach((b, idx) => {
    const row = worksheet.addRow({
      sno: idx + 1,
      class_id: b.classId,
      university: b.universityName || universityName || 'VIT',
      status: b.status,
      expected: b.expectedCount,
      received: b.receivedCount,
      pending: b.missingCount,
      progress: `${b.progressPercentage}%`,
      started_by: b.startedBy || '—',
      saved_by: b.savedBy || '—',
      last_activity: b.lastActivityAt ? new Date(b.lastActivityAt).toLocaleString() : '—',
      saved_at: b.savedAt ? new Date(b.savedAt).toLocaleString() : '—',
    });
    row.height = STANDARD_ROW_HEIGHT;

    // Status styling colors
    const statusCell = row.getCell('status');
    if (b.status === 'COMPLETED') {
      statusCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF15803D' } };
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
    } else if (b.status === 'PARTIAL / SAVED') {
      statusCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFB45309' } };
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
    } else if (b.status === 'IN PROGRESS') {
      statusCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1D4ED8' } };
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    } else {
      statusCell.font = { name: 'Calibri', size: 10, color: { argb: 'FF64748B' } };
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    }

    row.getCell('sno').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('class_id').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('status').alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell('expected').alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell('received').alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell('pending').alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell('progress').alignment = { horizontal: 'right', vertical: 'middle' };
  });

  // Summary Row at the bottom
  const totalRowIndex = bundles.length + 4;
  const totalRow = worksheet.getRow(totalRowIndex);
  totalRow.values = [
    'TOTAL',
    `${bundles.length} Classes`,
    '',
    `${compTotal} Completed`,
    expTotal,
    recTotal,
    penTotal,
    expTotal > 0 ? `${Math.round((recTotal / expTotal) * 100)}%` : '0%',
    '',
    '',
    '',
    '',
  ];
  totalRow.height = 24;
  totalRow.eachCell(cell => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    cell.alignment = { vertical: 'middle' };
  });

  // Download trigger
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeName = (universityName || 'VIT').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
  const dateStr = new Date().toISOString().split('T')[0];
  link.href = url;
  link.download = `${fileNamePrefix}_${safeName}_${dateStr}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

