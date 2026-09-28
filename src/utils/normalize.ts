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
