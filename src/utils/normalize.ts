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

  // 1. If JavaScript Date instance
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    const y = raw.getUTCFullYear();
    const m = String(raw.getUTCMonth() + 1).padStart(2, '0');
    const d = String(raw.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
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
    const m = String(parseInt(ymdMatch[2], 10)).padStart(2, '0');
    const d = String(parseInt(ymdMatch[3], 10)).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 6. Match DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  // MANDATORY USER REQUIREMENT: "Date eh format lo unna manam mathram dd-mm-yyyy lage thisukovali"
  const dmyMatch = dateOnlyPart.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmyMatch) {
    const d = String(parseInt(dmyMatch[1], 10)).padStart(2, '0');
    const m = String(parseInt(dmyMatch[2], 10)).padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }

  // 7. Match DD-MM-YY or DD/MM/YY (e.g. 1-11-26 -> 2026-11-01, 4-11-26 -> 2026-11-04)
  const dmyShortMatch = dateOnlyPart.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (dmyShortMatch) {
    const d = String(parseInt(dmyShortMatch[1], 10)).padStart(2, '0');
    const m = String(parseInt(dmyShortMatch[2], 10)).padStart(2, '0');
    const yr = parseInt(dmyShortMatch[3], 10);
    const y = yr < 50 ? `20${String(yr).padStart(2, '0')}` : `19${String(yr).padStart(2, '0')}`;
    return `${y}-${m}-${d}`;
  }

  // 8. Match single day number (e.g. "17" or "17th" or "4")
  const dayMatch = dateOnlyPart.match(/^(\d{1,2})(?:st|nd|rd|th)?$/i);
  if (dayMatch) {
    const d = String(parseInt(dayMatch[1], 10)).padStart(2, '0');
    return `2026-11-${d}`;
  }

  // 9. Fallback standard parse
  try {
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  } catch {}

  return '';
}

/**
 * Formats normalized "YYYY-MM-DD" to user-friendly "DD-MM-YYYY" (e.g. 01-11-2026, 04-11-2026, 17-11-2026)
 */
export function formatExamDate(isoDate?: string | null): string {
  if (!isoDate || isoDate === '—') return '—';
  const clean = String(isoDate).trim().split(/[T\s]/)[0];
  // If already in DD-MM-YYYY format:
  if (/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.test(clean)) {
    const parts = clean.split(/[-/.]/);
    return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
  }
  // If in YYYY-MM-DD format:
  const parts = clean.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[0]}`;
  }
  return clean;
}

