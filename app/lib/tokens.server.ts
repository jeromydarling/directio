/**
 * Constant-time string comparison for bearer-token checks. One shared
 * implementation — constant-time code must never drift between copies,
 * or one token-gated endpoint silently regresses to a timing oracle.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}
