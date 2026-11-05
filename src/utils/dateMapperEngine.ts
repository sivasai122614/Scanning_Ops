// ==============================================================================
// Excel Date Mapper Processing Engine
// Client-side O(N + M) matching engine between Step 0 (Target) and Step 1 (Reference)
// Strictly zero network calls, zero Supabase uploads, zero telemetry.
// Preserves exact original values, leading zeros, original column and row order.
// ==============================================================================

import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

export type MatchStatus = 'MATCHED' | 'UNMATCHED' | 'CONFLICT' | 'INVALID_DATE' | 'AMBIGUOUS';

export interface DateExtractionResult {
  status: 'VALID' | 'INVALID_DATE' | 'AMBIGUOUS';
  date?: string; // Formatted as DD-MM-YYYY
  raw: any;
  error?: string;
}

export interface Step1GroupRecord {
  groupName: string;
  rows: number[]; // 1-indexed row numbers in Step 1 file
  dates: string[];
  rawValues: any[];
  status: 'VALID' | 'CONFLICT' | 'INVALID_DATE' | 'AMBIGUOUS';
  resolvedDate?: string;
  errorMessage?: string;
  isDuplicate: boolean;
}

export interface MatchedRowResult {
  step0RowIndex: number; // 0-indexed relative to data rows
  step0RowNumber: number; // 1-indexed Excel row number
  groupName: string;
  date: string; // DD-MM-YYYY or empty string
  status: MatchStatus;
  reason?: string;
  step1Rows?: number[];
  originalRowData: Record<string, any>;
  orderedCells: any[];
}

export interface MatchingMetrics {
  totalStep0Records: number;
  totalStep1Records: number;
  matchedCount: number;
  unmatchedCount: number;
  duplicateGroupsCount: number; // Groups appearing multiple times in Step 1 with identical valid date
  conflictCount: number; // Groups appearing with different valid dates
  invalidDateCount: number;
  ambiguousDateCount: number;
}

export interface Step0ColumnAnalysis {
  headers: string[];
  groupColIdx: number;
  existingDateColIdx: number;
  hasExistingDateColumn: boolean;
}

export interface Step1ColumnAnalysis {
  headers: string[];
  participantGroupColIdx: number;
  testStartTimeColIdx: number;
}

export interface DateMapperResult {
  metrics: MatchingMetrics;
  step0Analysis: Step0ColumnAnalysis;
  step1Analysis: Step1ColumnAnalysis;
  matchedRows: MatchedRowResult[];
  conflicts: Step1GroupRecord[];
  unmatched: MatchedRowResult[];
  invalidDates: Step1GroupRecord[];
  ambiguousDates: Step1GroupRecord[];
  step0WorksheetName: string;
  step1WorksheetName: string;
}

/**
 * Extracts a calendar date from a source cell value without converting to UTC.
 * Rule: "Do not convert the timestamp to UTC before extracting its calendar date.
 * The date should represent the calendar date written in the source timestamp."
 * Rule: "Required output: DD-MM-YYYY. Never output YYYY-MM-DD or MM/DD/YYYY."
 * Rule: "Do not guess ambiguous date strings such as 03/04/2026. Flag them for review."
 */
export function extractCalendarDate(val: unknown): DateExtractionResult {
  if (val === null || val === undefined || val === '') {
    return {
      status: 'INVALID_DATE',
      raw: val,
      error: 'Empty or missing Test Start Time',
    };
  }

  // Case 1: Excel numeric serial (e.g. 46255 or 46255.3958)
  if (typeof val === 'number') {
    if (isNaN(val) || val < 1000 || val > 100000) {
      return {
        status: 'INVALID_DATE',
        raw: val,
        error: `Out-of-range numeric date value (${val})`,
      };
    }

    try {
      if ((XLSX as any).SSF && typeof (XLSX as any).SSF.parse_date_code === 'function') {
        const parsed = (XLSX as any).SSF.parse_date_code(val);
        if (parsed && parsed.y && parsed.m && parsed.d) {
          const dd = String(parsed.d).padStart(2, '0');
          const mm = String(parsed.m).padStart(2, '0');
          const yyyy = String(parsed.y);
          return {
            status: 'VALID',
            date: `${dd}-${mm}-${yyyy}`,
            raw: val,
          };
        }
      }
    } catch (e: any) {
      return {
        status: 'INVALID_DATE',
        raw: val,
        error: `Failed to parse Excel date serial: ${e?.message || e}`,
      };
    }
  }

  // Case 2: JavaScript Date instance
  if (val instanceof Date) {
    if (isNaN(val.getTime())) {
      return {
        status: 'INVALID_DATE',
        raw: val,
        error: 'Invalid JavaScript Date object',
      };
    }
    const dd = String(val.getDate()).padStart(2, '0');
    const mm = String(val.getMonth() + 1).padStart(2, '0');
    const yyyy = String(val.getFullYear());
    return {
      status: 'VALID',
      date: `${dd}-${mm}-${yyyy}`,
      raw: val,
    };
  }

  // Case 3: String representation
  const str = String(val).trim();
  if (!str) {
    return {
      status: 'INVALID_DATE',
      raw: val,
      error: 'Blank date string',
    };
  }

  // 3A: ISO Timestamp or space-separated timestamp starting with YYYY-MM-DD
  // e.g. "2026-08-21T09:30:00+05:30", "2026-08-21 09:30:00", "2026-08-21T09:30:00Z"
  // Direct literal extraction preserves calendar date written in source without UTC shift!
  const isoMatch = str.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})(?:[T\s].*)?$/);
  if (isoMatch) {
    const yyyy = isoMatch[1];
    const mm = isoMatch[2];
    const dd = isoMatch[3];
    const mNum = parseInt(mm, 10);
    const dNum = parseInt(dd, 10);
    if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
      return {
        status: 'VALID',
        date: `${dd}-${mm}-${yyyy}`,
        raw: val,
      };
    }
    return {
      status: 'INVALID_DATE',
      raw: val,
      error: `Invalid calendar values in ISO date: ${str}`,
    };
  }

  // 3B: Format DD-MM-YYYY or D-M-YYYY with hyphen
  const hyphenDmy = str.match(/^([0-9]{1,2})-([0-9]{1,2})-([0-9]{4})(?:[\sT].*)?$/);
  if (hyphenDmy) {
    const dNum = parseInt(hyphenDmy[1], 10);
    const mNum = parseInt(hyphenDmy[2], 10);
    const yyyy = hyphenDmy[3];
    if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
      const dd = String(dNum).padStart(2, '0');
      const mm = String(mNum).padStart(2, '0');
      return {
        status: 'VALID',
        date: `${dd}-${mm}-${yyyy}`,
        raw: val,
      };
    }
    return {
      status: 'INVALID_DATE',
      raw: val,
      error: `Out of range date values: ${str}`,
    };
  }

  // 3C: Slash separator format: DD/MM/YYYY or MM/DD/YYYY or YYYY/MM/DD
  // Check for YYYY/MM/DD first
  const slashYmd = str.match(/^([0-9]{4})\/([0-9]{1,2})\/([0-9]{1,2})(?:[\sT].*)?$/);
  if (slashYmd) {
    const yyyy = slashYmd[1];
    const mm = String(parseInt(slashYmd[2], 10)).padStart(2, '0');
    const dd = String(parseInt(slashYmd[3], 10)).padStart(2, '0');
    return {
      status: 'VALID',
      date: `${dd}-${mm}-${yyyy}`,
      raw: val,
    };
  }

  // Check for XX/XX/YYYY
  const slashDmy = str.match(/^([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{4})(?:[\sT].*)?$/);
  if (slashDmy) {
    const p1 = parseInt(slashDmy[1], 10);
    const p2 = parseInt(slashDmy[2], 10);
    const yyyy = slashDmy[3];

    // Case: p1 > 12 -> must be Day / Month / Year (unambiguous, e.g. 21/08/2026)
    if (p1 > 12 && p1 <= 31 && p2 >= 1 && p2 <= 12) {
      const dd = String(p1).padStart(2, '0');
      const mm = String(p2).padStart(2, '0');
      return {
        status: 'VALID',
        date: `${dd}-${mm}-${yyyy}`,
        raw: val,
      };
    }

    // Case: p2 > 12 -> must be Month / Day / Year (unambiguous, e.g. 08/21/2026)
    if (p2 > 12 && p2 <= 31 && p1 >= 1 && p1 <= 12) {
      const mm = String(p1).padStart(2, '0');
      const dd = String(p2).padStart(2, '0');
      return {
        status: 'VALID',
        date: `${dd}-${mm}-${yyyy}`,
        raw: val,
      };
    }

    // Case: p1 === p2 (e.g. 05/05/2026) -> day and month are identical, unambiguous!
    if (p1 === p2 && p1 >= 1 && p1 <= 12) {
      const dd = String(p1).padStart(2, '0');
      const mm = String(p2).padStart(2, '0');
      return {
        status: 'VALID',
        date: `${dd}-${mm}-${yyyy}`,
        raw: val,
      };
    }

    // Case: Both p1 and p2 <= 12, different values (e.g. 03/04/2026)
    // STRICT RULE: "Do not guess ambiguous date strings such as 03/04/2026. Flag them for review."
    return {
      status: 'AMBIGUOUS',
      raw: val,
      error: `Ambiguous date string "${str}" (could be DD/MM/YYYY or MM/DD/YYYY). Flagged for review.`,
    };
  }

  // 3D: Named month format: e.g. "21-Aug-2026", "21 Aug 2026", "August 21, 2026"
  const monthMap: Record<string, string> = {
    jan: '01', january: '01',
    feb: '02', february: '02',
    mar: '03', march: '03',
    apr: '04', april: '04',
    may: '05',
    jun: '06', june: '06',
    jul: '07', july: '07',
    aug: '08', august: '08',
    sep: '09', september: '09',
    oct: '10', october: '10',
    nov: '11', november: '11',
    dec: '12', december: '12',
  };

  const textMonthMatch = str.match(/^([0-9]{1,2})[-/\s]([A-Za-z]{3,9})[-/\s]([0-9]{4})/);
  if (textMonthMatch) {
    const dd = String(parseInt(textMonthMatch[1], 10)).padStart(2, '0');
    const mStr = textMonthMatch[2].toLowerCase();
    const yyyy = textMonthMatch[3];
    if (monthMap[mStr]) {
      return {
        status: 'VALID',
        date: `${dd}-${monthMap[mStr]}-${yyyy}`,
        raw: val,
      };
    }
  }

  return {
    status: 'INVALID_DATE',
    raw: val,
    error: `Unrecognized date format: "${str}"`,
  };
}

/**
 * Normalizes header string for comparison (case-insensitive, trims extra spaces).
 */
export function normalizeHeader(h: any): string {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Finds the Step 0 "GROUP NAMES" column and detects if a "DATE" column already exists.
 */
export function analyzeStep0Headers(headers: string[]): Step0ColumnAnalysis {
  let groupColIdx = -1;
  let existingDateColIdx = -1;

  for (let i = 0; i < headers.length; i++) {
    const raw = String(headers[i] || '').trim();
    const norm = normalizeHeader(raw);
    const clean = norm.replace(/[^a-z0-9]/g, '');

    // Match "GROUP NAMES"
    if (
      norm === 'group names' ||
      clean === 'groupnames' ||
      norm === 'group name' ||
      clean === 'groupname' ||
      norm === 'group_names' ||
      norm === 'group_name'
    ) {
      if (groupColIdx === -1) groupColIdx = i;
    }

    // Match existing "DATE" column
    if (norm === 'date' || clean === 'date' || norm === 'exam date' || clean === 'examdate') {
      if (existingDateColIdx === -1) existingDateColIdx = i;
    }
  }

  // Fallback: If no exact "group names", look for header containing "group"
  if (groupColIdx === -1) {
    for (let i = 0; i < headers.length; i++) {
      const norm = normalizeHeader(headers[i]);
      if (norm.includes('group') && !norm.includes('date')) {
        groupColIdx = i;
        break;
      }
    }
  }

  return {
    headers,
    groupColIdx,
    existingDateColIdx,
    hasExistingDateColumn: existingDateColIdx !== -1,
  };
}

/**
 * Finds the Step 1 "Participant Group Names" and "Test Start Time" columns.
 */
export function analyzeStep1Headers(headers: string[]): Step1ColumnAnalysis {
  let participantGroupColIdx = -1;
  let testStartTimeColIdx = -1;

  for (let i = 0; i < headers.length; i++) {
    const raw = String(headers[i] || '').trim();
    const norm = normalizeHeader(raw);
    const clean = norm.replace(/[^a-z0-9]/g, '');

    // Match "Participant Group Names"
    if (
      norm === 'participant group names' ||
      clean === 'participantgroupnames' ||
      norm === 'participant group name' ||
      clean === 'participantgroupname' ||
      norm === 'participant group' ||
      norm === 'participant_group_names'
    ) {
      if (participantGroupColIdx === -1) participantGroupColIdx = i;
    } else if (participantGroupColIdx === -1 && norm.includes('participant') && norm.includes('group')) {
      participantGroupColIdx = i;
    }

    // Match "Test Start Time"
    if (
      norm === 'test start time' ||
      clean === 'teststarttime' ||
      norm === 'test_start_time' ||
      norm === 'start time' ||
      clean === 'starttime' ||
      norm === 'test start'
    ) {
      if (testStartTimeColIdx === -1) testStartTimeColIdx = i;
    } else if (testStartTimeColIdx === -1 && norm.includes('test') && (norm.includes('start') || norm.includes('time'))) {
      testStartTimeColIdx = i;
    }
  }

  // Fallback for participant group: check if header is simply "group names" or contains "group"
  if (participantGroupColIdx === -1) {
    for (let i = 0; i < headers.length; i++) {
      if (i === testStartTimeColIdx) continue;
      const norm = normalizeHeader(headers[i]);
      if (norm.includes('group')) {
        participantGroupColIdx = i;
        break;
      }
    }
  }

  // Fallback for test start time: check if header contains "time" or "date"
  if (testStartTimeColIdx === -1) {
    for (let i = 0; i < headers.length; i++) {
      if (i === participantGroupColIdx) continue;
      const norm = normalizeHeader(headers[i]);
      if (norm.includes('time') || norm.includes('date')) {
        testStartTimeColIdx = i;
        break;
      }
    }
  }

  return {
    headers,
    participantGroupColIdx,
    testStartTimeColIdx,
  };
}

/**
 * Inspects a workbook and returns its sheet names.
 */
export async function getWorkbookSheetNames(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array', bookSheets: true });
  return workbook.SheetNames || ['Sheet1'];
}

/**
 * Core Matching Algorithm between Step 0 and Step 1.
 * O(N + M) complexity using a Map-based lookup index.
 * Strictly preserves leading zeros and exact text values.
 */
export async function matchExcelDateRecords(
  step0File: File,
  step1File: File,
  options?: {
    step0Sheet?: string;
    step1Sheet?: string;
    onProgress?: (percent: number, message: string) => void;
  }
): Promise<DateMapperResult> {
  const notify = options?.onProgress || (() => {});

  notify(10, 'Reading Step 1 (Reference File)...');
  const step1Buffer = await step1File.arrayBuffer();
  const step1Wb = XLSX.read(step1Buffer, { type: 'array', cellDates: false });
  const step1SheetName = options?.step1Sheet && step1Wb.SheetNames.includes(options.step1Sheet)
    ? options.step1Sheet
    : step1Wb.SheetNames[0];

  const step1Ws = step1Wb.Sheets[step1SheetName];
  if (!step1Ws) {
    throw new Error(`Worksheet "${step1SheetName}" not found in Step 1 file.`);
  }

  // Convert to array of arrays preserving strings (raw: false preserves formatted text, but we also inspect raw values)
  const step1Rows: any[][] = XLSX.utils.sheet_to_json(step1Ws, { header: 1, raw: true });
  if (!step1Rows || step1Rows.length < 2) {
    throw new Error('Step 1 Reference File is empty or has no data rows.');
  }

  // Identify Header Row for Step 1
  let step1HeaderRowIdx = 0;
  for (let r = 0; r < Math.min(step1Rows.length, 5); r++) {
    const row = step1Rows[r];
    if (!row || !Array.isArray(row)) continue;
    const hasGroup = row.some(c => String(c || '').toLowerCase().includes('group'));
    const hasTime = row.some(c => String(c || '').toLowerCase().includes('time') || String(c || '').toLowerCase().includes('date'));
    if (hasGroup && hasTime) {
      step1HeaderRowIdx = r;
      break;
    }
  }

  const step1Headers: string[] = (step1Rows[step1HeaderRowIdx] || []).map((h: any) => String(h ?? '').trim());
  const step1Analysis = analyzeStep1Headers(step1Headers);

  if (step1Analysis.participantGroupColIdx === -1) {
    throw new Error(
      `MISSING REQUIRED COLUMN IN STEP 1 FILE: Could not locate column "Participant Group Names" in "${step1File.name}". Found columns: [${step1Headers.join(', ')}]`
    );
  }
  if (step1Analysis.testStartTimeColIdx === -1) {
    throw new Error(
      `MISSING REQUIRED COLUMN IN STEP 1 FILE: Could not locate column "Test Start Time" in "${step1File.name}". Found columns: [${step1Headers.join(', ')}]`
    );
  }

  notify(30, 'Indexing Step 1 Reference Records...');
  // Index Step 1 into a Map: groupName -> Step1GroupRecord
  const step1GroupMap = new Map<string, Step1GroupRecord>();

  for (let r = step1HeaderRowIdx + 1; r < step1Rows.length; r++) {
    const row = step1Rows[r];
    if (!row || row.length === 0) continue;

    const rawGroupVal = row[step1Analysis.participantGroupColIdx];
    if (rawGroupVal === null || rawGroupVal === undefined || String(rawGroupVal).trim() === '') {
      continue; // Skip rows with blank group name
    }

    // Preserve exact group string (leading zeros intact)
    const groupName = String(rawGroupVal).trim();
    const rawTimeVal = row[step1Analysis.testStartTimeColIdx];
    const excelRowNumber = r + 1; // 1-indexed Excel row

    const dateExtraction = extractCalendarDate(rawTimeVal);
    const existing = step1GroupMap.get(groupName);

    if (!existing) {
      // First time seeing this group name
      step1GroupMap.set(groupName, {
        groupName,
        rows: [excelRowNumber],
        dates: dateExtraction.date ? [dateExtraction.date] : [],
        rawValues: [rawTimeVal],
        status: dateExtraction.status,
        resolvedDate: dateExtraction.date,
        errorMessage: dateExtraction.error,
        isDuplicate: false,
      });
    } else {
      // Duplicate group name in Step 1!
      existing.rows.push(excelRowNumber);
      existing.rawValues.push(rawTimeVal);
      existing.isDuplicate = true;

      if (dateExtraction.date) {
        if (!existing.dates.includes(dateExtraction.date)) {
          existing.dates.push(dateExtraction.date);
        }
      }

      // Conflict logic:
      // Scenario A: Duplicate rows contain the SAME valid date -> allow matching with that date
      // Scenario B: Duplicate rows contain DIFFERENT valid dates -> flag as CONFLICT
      // Scenario C: Some duplicate rows contain invalid or missing dates -> flag as review
      if (existing.status === 'CONFLICT') {
        // Already conflicting
        continue;
      }

      if (dateExtraction.status === 'VALID') {
        if (existing.status === 'VALID') {
          if (existing.resolvedDate !== dateExtraction.date) {
            existing.status = 'CONFLICT';
            existing.resolvedDate = undefined;
            existing.errorMessage = `Conflicting dates found in Step 1 (${existing.dates.join(', ')}) at rows [${existing.rows.join(', ')}]`;
          }
        } else if (existing.status === 'INVALID_DATE' || existing.status === 'AMBIGUOUS') {
          existing.status = 'CONFLICT';
          existing.resolvedDate = undefined;
          existing.errorMessage = `Inconsistent date entries in Step 1: some rows valid (${dateExtraction.date}) and some invalid at rows [${existing.rows.join(', ')}]`;
        }
      } else {
        // Current row is invalid or ambiguous
        if (existing.status === 'VALID') {
          existing.status = 'CONFLICT';
          existing.resolvedDate = undefined;
          existing.errorMessage = `Inconsistent date entries in Step 1: row ${excelRowNumber} has missing/invalid date while earlier rows had valid date (${existing.resolvedDate})`;
        } else {
          // Both invalid
          existing.status = 'INVALID_DATE';
          existing.errorMessage = `All duplicate entries at rows [${existing.rows.join(', ')}] have invalid or missing dates`;
        }
      }
    }
  }

  notify(50, 'Reading Step 0 (Target File)...');
  const step0Buffer = await step0File.arrayBuffer();
  const step0Wb = XLSX.read(step0Buffer, { type: 'array', cellDates: false });
  const step0SheetName = options?.step0Sheet && step0Wb.SheetNames.includes(options.step0Sheet)
    ? options.step0Sheet
    : step0Wb.SheetNames[0];

  const step0Ws = step0Wb.Sheets[step0SheetName];
  if (!step0Ws) {
    throw new Error(`Worksheet "${step0SheetName}" not found in Step 0 file.`);
  }

  const step0Rows: any[][] = XLSX.utils.sheet_to_json(step0Ws, { header: 1, raw: true });
  if (!step0Rows || step0Rows.length < 2) {
    throw new Error('Step 0 Target File is empty or has no data rows.');
  }

  // Identify Header Row for Step 0
  let step0HeaderRowIdx = 0;
  for (let r = 0; r < Math.min(step0Rows.length, 5); r++) {
    const row = step0Rows[r];
    if (!row || !Array.isArray(row)) continue;
    const hasGroup = row.some(c => String(c || '').toLowerCase().includes('group'));
    if (hasGroup) {
      step0HeaderRowIdx = r;
      break;
    }
  }

  const step0Headers: string[] = (step0Rows[step0HeaderRowIdx] || []).map((h: any) => String(h ?? '').trim());
  const step0Analysis = analyzeStep0Headers(step0Headers);

  if (step0Analysis.groupColIdx === -1) {
    throw new Error(
      `MISSING REQUIRED COLUMN IN STEP 0 FILE: Could not locate column "GROUP NAMES" in "${step0File.name}". Found columns: [${step0Headers.join(', ')}]`
    );
  }

  notify(70, 'Matching Step 0 Records Against Reference Index...');
  const matchedRows: MatchedRowResult[] = [];
  const unmatchedList: MatchedRowResult[] = [];
  let matchedCount = 0;
  let unmatchedCount = 0;

  for (let r = step0HeaderRowIdx + 1; r < step0Rows.length; r++) {
    const row = step0Rows[r];
    // Preserve empty rows or rows with data
    const rawGroupVal = row ? row[step0Analysis.groupColIdx] : '';
    const groupName = String(rawGroupVal ?? '').trim();
    const excelRowNumber = r + 1;

    // Build row record
    const orderedCells = row ? [...row] : [];
    const originalRowData: Record<string, any> = {};
    for (let c = 0; c < step0Headers.length; c++) {
      const colName = step0Headers[c] || `Column_${c + 1}`;
      originalRowData[colName] = row ? row[c] : '';
    }

    if (!groupName) {
      // Row has blank group name
      const res: MatchedRowResult = {
        step0RowIndex: r - (step0HeaderRowIdx + 1),
        step0RowNumber: excelRowNumber,
        groupName: '',
        date: '',
        status: 'UNMATCHED',
        reason: 'Blank or missing Group Name in Step 0',
        originalRowData,
        orderedCells,
      };
      matchedRows.push(res);
      unmatchedList.push(res);
      unmatchedCount++;
      continue;
    }

    const step1Entry = step1GroupMap.get(groupName);

    if (!step1Entry) {
      // Group not found in Step 1
      const res: MatchedRowResult = {
        step0RowIndex: r - (step0HeaderRowIdx + 1),
        step0RowNumber: excelRowNumber,
        groupName,
        date: '',
        status: 'UNMATCHED',
        reason: `Group "${groupName}" not found in Step 1 Reference File`,
        originalRowData,
        orderedCells,
      };
      matchedRows.push(res);
      unmatchedList.push(res);
      unmatchedCount++;
      continue;
    }

    if (step1Entry.status === 'VALID' && step1Entry.resolvedDate) {
      const res: MatchedRowResult = {
        step0RowIndex: r - (step0HeaderRowIdx + 1),
        step0RowNumber: excelRowNumber,
        groupName,
        date: step1Entry.resolvedDate,
        status: 'MATCHED',
        step1Rows: step1Entry.rows,
        originalRowData,
        orderedCells,
      };
      matchedRows.push(res);
      matchedCount++;
    } else if (step1Entry.status === 'CONFLICT') {
      const res: MatchedRowResult = {
        step0RowIndex: r - (step0HeaderRowIdx + 1),
        step0RowNumber: excelRowNumber,
        groupName,
        date: '',
        status: 'CONFLICT',
        reason: step1Entry.errorMessage || 'Multiple conflicting dates in Step 1',
        step1Rows: step1Entry.rows,
        originalRowData,
        orderedCells,
      };
      matchedRows.push(res);
      unmatchedList.push(res);
    } else if (step1Entry.status === 'AMBIGUOUS') {
      const res: MatchedRowResult = {
        step0RowIndex: r - (step0HeaderRowIdx + 1),
        step0RowNumber: excelRowNumber,
        groupName,
        date: '',
        status: 'AMBIGUOUS',
        reason: step1Entry.errorMessage || 'Ambiguous date format in Step 1',
        step1Rows: step1Entry.rows,
        originalRowData,
        orderedCells,
      };
      matchedRows.push(res);
      unmatchedList.push(res);
    } else {
      const res: MatchedRowResult = {
        step0RowIndex: r - (step0HeaderRowIdx + 1),
        step0RowNumber: excelRowNumber,
        groupName,
        date: '',
        status: 'INVALID_DATE',
        reason: step1Entry.errorMessage || 'Invalid or missing Test Start Time in Step 1',
        step1Rows: step1Entry.rows,
        originalRowData,
        orderedCells,
      };
      matchedRows.push(res);
      unmatchedList.push(res);
    }
  }

  notify(90, 'Computing Metrics & Summaries...');
  const conflictsList: Step1GroupRecord[] = [];
  const invalidDatesList: Step1GroupRecord[] = [];
  const ambiguousDatesList: Step1GroupRecord[] = [];
  let duplicateGroupsCount = 0;

  for (const entry of step1GroupMap.values()) {
    if (entry.isDuplicate && entry.status === 'VALID') {
      duplicateGroupsCount++;
    }
    if (entry.status === 'CONFLICT') {
      conflictsList.push(entry);
    } else if (entry.status === 'INVALID_DATE') {
      invalidDatesList.push(entry);
    } else if (entry.status === 'AMBIGUOUS') {
      ambiguousDatesList.push(entry);
    }
  }

  const metrics: MatchingMetrics = {
    totalStep0Records: matchedRows.length,
    totalStep1Records: step1Rows.length - (step1HeaderRowIdx + 1),
    matchedCount,
    unmatchedCount,
    duplicateGroupsCount,
    conflictCount: conflictsList.length,
    invalidDateCount: invalidDatesList.length,
    ambiguousDateCount: ambiguousDatesList.length,
  };

  notify(100, 'Matching complete!');

  return {
    metrics,
    step0Analysis,
    step1Analysis,
    matchedRows,
    conflicts: conflictsList,
    unmatched: unmatchedList,
    invalidDates: invalidDatesList,
    ambiguousDates: ambiguousDatesList,
    step0WorksheetName: step0SheetName,
    step1WorksheetName: step1SheetName,
  };
}

/**
 * Generates the updated Step 0 Excel file (`step_0_with_dates.xlsx`)
 * using SheetJS (XLSX) to preserve original column order, original row order,
 * multiple worksheets, formulas, leading zeros, and append the `DATE` column.
 * Completely eliminates Microsoft Excel "We found a problem with some content" recovery dialogs.
 */
export async function generateUpdatedStep0Workbook(
  originalStep0File: File,
  matchingResult: DateMapperResult,
  options?: {
    overwriteExistingDate?: boolean;
    step0Sheet?: string;
  }
): Promise<Blob> {
  const originalBuffer = await originalStep0File.arrayBuffer();

  // Read the original workbook preserving cell structures, strings, and types
  const workbook = XLSX.read(originalBuffer, {
    type: 'array',
    cellDates: false,
    cellStyles: true,
  });

  const targetSheetName = options?.step0Sheet && workbook.SheetNames.includes(options.step0Sheet)
    ? options.step0Sheet
    : (matchingResult.step0WorksheetName && workbook.SheetNames.includes(matchingResult.step0WorksheetName)
        ? matchingResult.step0WorksheetName
        : workbook.SheetNames[0]);

  const worksheet = workbook.Sheets[targetSheetName];
  if (!worksheet) {
    throw new Error(`Worksheet "${targetSheetName}" not found in Step 0 workbook.`);
  }

  const { step0Analysis, matchedRows } = matchingResult;
  const overwrite = options?.overwriteExistingDate ?? false;

  // Determine current worksheet boundary
  const range = worksheet['!ref']
    ? XLSX.utils.decode_range(worksheet['!ref'])
    : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };

  // Identify Header Row Index (0-indexed)
  let headerRowIdx = 0;
  for (let r = 0; r <= Math.min(range.e.r, 5); r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r, c })];
      if (cell && typeof cell.v === 'string') {
        const text = cell.v.toLowerCase();
        if (text.includes('group')) {
          headerRowIdx = r;
          break;
        }
      }
    }
  }

  // Determine target column index (0-indexed)
  let dateColIdx: number;
  if (step0Analysis.hasExistingDateColumn && overwrite) {
    dateColIdx = step0Analysis.existingDateColIdx;
  } else {
    // Append after the rightmost column
    dateColIdx = range.e.c + 1;
  }

  // Set Header for DATE column
  const headerAddr = XLSX.utils.encode_cell({ r: headerRowIdx, c: dateColIdx });
  worksheet[headerAddr] = { t: 's', v: 'DATE' };

  // Map each data row
  for (let i = 0; i < matchedRows.length; i++) {
    const res = matchedRows[i];
    const r = res.step0RowNumber - 1; // 0-indexed row
    const cellAddr = XLSX.utils.encode_cell({ r, c: dateColIdx });

    if (res.date) {
      // Explicit text cell ensures DD-MM-YYYY format is displayed exactly as intended
      worksheet[cellAddr] = { t: 's', v: res.date };
    } else {
      if (overwrite) {
        delete worksheet[cellAddr];
      }
    }
  }

  // Update worksheet range (!ref)
  range.e.c = Math.max(range.e.c, dateColIdx);
  range.e.r = Math.max(range.e.r, matchedRows.length + headerRowIdx);
  worksheet['!ref'] = XLSX.utils.encode_range(range);

  // Set column widths properly sequenced from col 0 to targetCol
  if (!worksheet['!cols']) {
    worksheet['!cols'] = [];
  }
  while (worksheet['!cols'].length <= dateColIdx) {
    worksheet['!cols'].push({ wch: 14 });
  }
  worksheet['!cols'][dateColIdx] = { wch: 16 };

  // Write out with standard compression and clean OpenXML specification
  const updatedBuffer = XLSX.write(workbook, {
    type: 'array',
    bookType: 'xlsx',
    compression: true,
  });

  return new Blob([updatedBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Generates an Issues Report Excel file (`date_mapper_issues_report.xlsx`)
 * containing separate sheets for Unmatched Records, Conflicting Groups, and Invalid Dates.
 */
export async function generateIssuesReportExcel(result: DateMapperResult): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Inward Scan • Excel Date Mapper';
  workbook.created = new Date();

  // 1. Unmatched Records Sheet
  const unmatchedSheet = workbook.addWorksheet('Unmatched Records', { views: [{ showGridLines: true }] });
  unmatchedSheet.columns = [
    { header: 'Step 0 Row #', key: 'row', width: 14 },
    { header: 'Group Name', key: 'group', width: 28 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Reason / Details', key: 'reason', width: 44 },
  ];
  unmatchedSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  unmatchedSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1565D8' } };

  for (const item of result.unmatched) {
    unmatchedSheet.addRow({
      row: item.step0RowNumber,
      group: item.groupName || '(Blank)',
      status: item.status,
      reason: item.reason || 'Unmatched',
    });
  }

  // 2. Conflicting Groups Sheet
  const conflictSheet = workbook.addWorksheet('Conflicting Groups', { views: [{ showGridLines: true }] });
  conflictSheet.columns = [
    { header: 'Group Name', key: 'group', width: 28 },
    { header: 'Step 1 Rows', key: 'rows', width: 20 },
    { header: 'Dates Encountered', key: 'dates', width: 32 },
    { header: 'Conflict Description', key: 'desc', width: 50 },
  ];
  conflictSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  conflictSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };

  for (const conf of result.conflicts) {
    conflictSheet.addRow({
      group: conf.groupName,
      rows: conf.rows.join(', '),
      dates: conf.dates.join(', '),
      desc: conf.errorMessage || 'Multiple conflicting dates for same group',
    });
  }

  // 3. Invalid Date Records Sheet
  const invalidSheet = workbook.addWorksheet('Invalid or Ambiguous Dates', { views: [{ showGridLines: true }] });
  invalidSheet.columns = [
    { header: 'Group Name', key: 'group', width: 28 },
    { header: 'Step 1 Rows', key: 'rows', width: 20 },
    { header: 'Raw Values', key: 'raw', width: 32 },
    { header: 'Issue Description', key: 'desc', width: 46 },
  ];
  invalidSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  invalidSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } };

  for (const inv of [...result.invalidDates, ...result.ambiguousDates]) {
    invalidSheet.addRow({
      group: inv.groupName,
      rows: inv.rows.join(', '),
      raw: inv.rawValues.map(v => String(v ?? '')).join('; '),
      desc: inv.errorMessage || 'Invalid or ambiguous date format',
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
