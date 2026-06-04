/**
 * Pure fee helpers that are safe for both client and server.
 * Server-side mutation lives in fees.server.ts.
 */

export function formatCents(cents: number): string {
  if (!Number.isFinite(cents)) return "$0";
  return `$${(cents / 100).toFixed(2)}`;
}

export function isInsideCancelDeadline(
  startsAt: number,
  now: number,
  deadlineHours: number,
): boolean {
  return startsAt - now < deadlineHours * 60 * 60 * 1000;
}
