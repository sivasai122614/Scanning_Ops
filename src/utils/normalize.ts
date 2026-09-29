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
 * Checks if two class identifiers match, accounting for case, whitespace,
 * and numeric representations (e.g. '0020' === '20').
 */
export function isSameClassId(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  const sa = normalizeIdentifier(a).toLowerCase();
  const sb = normalizeIdentifier(b).toLowerCase();
  if (sa === sb) return true;
  if (/^\d+$/.test(sa) && /^\d+$/.test(sb)) {
    return parseInt(sa, 10) === parseInt(sb, 10);
  }
  return false;
}

/**
 * Checks if two member identifiers match, accounting for case, whitespace,
 * and numeric representations.
 */
export function isSameMemberId(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  const sa = normalizeIdentifier(a).toLowerCase();
  const sb = normalizeIdentifier(b).toLowerCase();
  if (sa === sb) return true;
  if (/^\d+$/.test(sa) && /^\d+$/.test(sb)) {
    return parseInt(sa, 10) === parseInt(sb, 10);
  }
  return false;
}
