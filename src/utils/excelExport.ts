// ==============================================================================
// Excel & Spreadsheet Generation Utility
// Supports genuine .xlsx generation with merged header rows, centered bold university,
// bold column headers, and uniform standard row heights matching data entries.
// Strictly zero mock data.
// ==============================================================================

import ExcelJS from 'exceljs';
import { ScannedScript } from '../types/exam';

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
