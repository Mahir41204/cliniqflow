/**
 * Canonical E.164 phone normalizer for India-first deployments.
 *
 * Rules:
 *  1. Strip all non-digit, non-'+' characters.
 *  2. If already starts with '+' → return as-is.
 *  3. If exactly 10 digits (Indian mobile) → prepend '+91'.
 *  4. Otherwise → prepend '+' (assume the country code is included but '+' is missing).
 */
export function normalizePhone(raw: string): string {
  const stripped = raw.replace(/[^0-9+]/g, "");
  if (stripped.startsWith("+")) return stripped;
  if (stripped.length === 10) return `+91${stripped}`;
  return `+${stripped}`;
}
