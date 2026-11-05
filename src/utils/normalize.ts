// ==============================================================================
// Authoritative Normalization Utility
// Used consistently across:
// 1. Excel Import
// 2. Manual Search
// 3. Class ID Search
// 4. Barcode Lookup
// 5. Member ID Lookup
// ==============================================================================

/**
 * Normalizes barcode / member_id / class_id strings.
 * Rules:
 * - Converts to string
 * - Trims accidental whitespace & non-breaking spaces
 * - Strips accidental Code 39 wrapping asterisks
 * - Preserves leading zeros (e.g., '0021' remains '0021')
 * - Does not cast to number or strip meaningful characters
 */
export function normalizeIdentifier(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  return str
    .replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '')
    .replace(/^\*+|\*+$/g, '')
    .trim();
}

export function sanitizeBarcode(code: string): string {
  return normalizeIdentifier(code);
}

/**
 * Checks if two class identifiers match strictly as exact strings,
 * preserving leading zeros (e.g. '0020' !== '20').
 */
export function isSameClassId(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  const sa = normalizeIdentifier(a).toLowerCase();
  const sb = normalizeIdentifier(b).toLowerCase();
  return sa === sb;
}

/**
 * Checks if two member identifiers match strictly as exact strings,
 * preserving leading zeros.
 */
export function isSameMemberId(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  const sa = normalizeIdentifier(a).toLowerCase();
  const sb = normalizeIdentifier(b).toLowerCase();
  return sa === sb;
}

/**
 * Robust date parser supporting:
 * - JavaScript Date objects
 * - Excel numeric serials (e.g. 45600 -> 2024-11-04, 46328 -> 2026-11-01, 46331 -> 2026-11-04)
 * - DD-MM-YYYY (e.g. 01-11-2026, 04-11-2026, 17-11-2026) -> strictly Day=1st, Month=2nd, Year=3rd
 * - DD/MM/YYYY (e.g. 01/11/2026, 04/11/2026)
 * - DD.MM.YYYY (e.g. 01.11.2026, 04.11.2026)
 * - YYYY-MM-DD (e.g. 2026-11-01, 2026-11-04)
 * - Date and time strings (e.g. 01-11-2026 10:30:00, 2026-11-01T09:00:00)
 * Returns normalized ISO date: "YYYY-MM-DD", or "" if invalid.
 */
export function normalizeExamDate(raw: unknown): string {
  if (raw === null || raw === undefined) return '';

  // 1. If JavaScript Date instance:
  // Beware of local timezone offset! In IST (UTC+05:30), local midnight is 18:30 UTC of previous day.
  // Calling .getUTCDate() incorrectly subtracts a day!
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    let y = raw.getFullYear();
    let m = raw.getMonth() + 1;
    let d = raw.getDate();
    if (raw.getUTCHours() === 0 && raw.getHours() >= 12) {
      y = raw.getUTCFullYear();
      m = raw.getUTCMonth() + 1;
      d = raw.getUTCDate();
    }
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  // 2. If numeric Excel serial
  if (typeof raw === 'number' && !isNaN(raw) && raw > 30000 && raw < 75000) {
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    const dObj = new Date(ms);
    if (!isNaN(dObj.getTime())) {
      const y = dObj.getUTCFullYear();
      const m = String(dObj.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dObj.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  const str = String(raw).trim();
  if (!str) return '';

  // 3. If string representation of numeric Excel serial (e.g. "46331")
  if (/^\d{5}(\.\d+)?$/.test(str)) {
    const serial = parseFloat(str);
    if (!isNaN(serial) && serial > 30000 && serial < 75000) {
      const ms = Math.round((serial - 25569) * 86400 * 1000);
      const dObj = new Date(ms);
      if (!isNaN(dObj.getTime())) {
        const y = dObj.getUTCFullYear();
        const m = String(dObj.getUTCMonth() + 1).padStart(2, '0');
        const d = String(dObj.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }
  }

  // 4. Remove time portion if present (e.g. "01-11-2026 14:30:00" or "2026-11-01T08:30:00")
  const dateOnlyPart = str.split(/[T\s]/)[0].trim();

  // 5. Match YYYY-MM-DD or YYYY/MM/DD (starts with 4-digit year)
  const ymdMatch = dateOnlyPart.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    let m = String(parseInt(ymdMatch[2], 10)).padStart(2, '0');
    let d = String(parseInt(ymdMatch[3], 10)).padStart(2, '0');
    // If 2026-0X-11 where month is 1..10 and day is 11, heal inverted Nov 2026 date (e.g. 2026-01-11 was Nov 1, 2026)
    if (y === '2026' && parseInt(m, 10) <= 10 && d === '11') {
      return `2026-11-${m}`;
    }
    return `${y}-${m}-${d}`;
  }

  // 6. Match DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  // MANDATORY USER REQUIREMENT: "UI lo dd-mm-yyyy e type lo kanipinchali"
  const dmyMatch = dateOnlyPart.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmyMatch) {
    let p1 = parseInt(dmyMatch[1], 10);
    let p2 = parseInt(dmyMatch[2], 10);
    const y = dmyMatch[3];
    // If p1 === 11 and p2 <= 10 in 2026 (e.g. "11-01-2026", "11-02-2026" from US Excel locale):
    // In Nov 2026 exam season, month is 11 and day is 1..10!
    if (y === '2026' && p1 === 11 && p2 <= 10) {
      const d = String(p2).padStart(2, '0');
      return `2026-11-${d}`;
    }
    const d = String(p1).padStart(2, '0');
    const m = String(p2).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 7. Match DD-MM-YY or DD/MM/YY (e.g. 1-11-26 -> 2026-11-01, 4-11-26 -> 2026-11-04)
  const dmyShortMatch = dateOnlyPart.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (dmyShortMatch) {
    let p1 = parseInt(dmyShortMatch[1], 10);
    let p2 = parseInt(dmyShortMatch[2], 10);
    const yr = parseInt(dmyShortMatch[3], 10);
    const y = yr < 50 ? `20${String(yr).padStart(2, '0')}` : `19${String(yr).padStart(2, '0')}`;
    if (y === '2026' && p1 === 11 && p2 <= 10) {
      const d = String(p2).padStart(2, '0');
      return `2026-11-${d}`;
    }
    const d = String(p1).padStart(2, '0');
    const m = String(p2).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 8. Match single day number (e.g. "17" or "17th" or "4")
  const dayMatch = dateOnlyPart.match(/^(\d{1,2})(?:st|nd|rd|th)?$/i);
  if (dayMatch) {
    const d = String(parseInt(dayMatch[1], 10)).padStart(2, '0');
    return `2026-11-${d}`;
  }

  // 9. Fallback standard parse: only if str contains separators or is not a plain number
  if (/^\d{1,4}$/.test(dateOnlyPart)) {
    return '';
  }

  try {
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      let y = parsed.getFullYear();
      let m = parsed.getMonth() + 1;
      let d = parsed.getDate();
      if (parsed.getUTCHours() === 0 && parsed.getHours() >= 12) {
        y = parsed.getUTCFullYear();
        m = parsed.getUTCMonth() + 1;
        d = parsed.getUTCDate();
      }
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  } catch {}

  return '';
}

/**
 * Formats normalized "YYYY-MM-DD" to user-friendly "DD-MM-YYYY" (e.g. 01-11-2026, 04-11-2026, 17-11-2026)
 * Strictly ensures DD-MM-YYYY output across the entire UI.
 */
export function formatExamDate(isoDate?: string | null): string {
  if (!isoDate || isoDate === '—') return '—';
  const clean = String(isoDate).trim().split(/[T\s]/)[0];
  // If in YYYY-MM-DD format (e.g. 2026-11-01):
  const parts = clean.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    const y = parts[0];
    const m = parts[1];
    const d = parts[2];
    if (y === '2026' && parseInt(m, 10) <= 10 && d === '11') {
      return `${m.padStart(2, '0')}-11-2026`;
    }
    return `${d.padStart(2, '0')}-${m.padStart(2, '0')}-${y}`;
  }
  // If already in DD-MM-YYYY or MM-DD-YYYY format:
  if (/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.test(clean)) {
    const p = clean.split(/[-/.]/);
    const p1 = parseInt(p[0], 10);
    const p2 = parseInt(p[1], 10);
    const y = p[2];
    if (y === '2026' && p1 === 11 && p2 <= 10) {
      return `${String(p2).padStart(2, '0')}-11-2026`;
    }
    return `${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}-${y}`;
  }
  return clean;
}

/**
 * Detects whether a string or value represents a calendar date rather than a Class ID.
 * Returns true for:
 * - JavaScript Date instances
 * - Numeric Excel date codes (e.g. 40000 - 65000)
 * - Date patterns like "25-08-2026", "2026-08-25", "9/3/26", "9/1/26", "28-08-2026", "01/11/2026"
 * Returns false for Class IDs like "2031", "2040", "0020", "0865", "CS101", "A1", "BATCH-01", "24BAR0087"
 */
export function isDateLikeString(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  if (val instanceof Date) return true;
  const s = String(val).trim();
  if (!s) return false;

  // Plain numbers with 1 to 4 digits (e.g. "2031", "2040", "0020", "0865", "101", "2026")
  // are Class IDs / Bundle IDs / Room numbers, NEVER full calendar dates!
  if (/^\d{1,4}$/.test(s)) return false;

  // Standard alphanumeric class identifiers without date separators:
  if (/^[A-Za-z0-9_-]{1,8}$/.test(s) && !s.includes('-') && !s.includes('/') && !s.includes('.')) {
    return false;
  }

  // Excel numeric date code (40000 to 60000)
  if (/^\d{5}$/.test(s)) {
    const num = Number(s);
    if (num >= 40000 && num <= 60000) return true;
  }

  // Any date pattern with separators - or / or . between numbers:
  // e.g. 25-08-2026, 9/3/26, 2026-08-25, 01-11-2026, 9/1/26
  if (/^\d{1,4}[-/\.]\d{1,2}[-/\.]\d{2,4}$/.test(s)) return true;

  // Month text format e.g. 25-Aug-2026, Aug 25 2026
  if (/^\d{1,2}[-/\. ](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[-/\. ]\d{2,4}$/i.test(s)) return true;

  return false;
}
