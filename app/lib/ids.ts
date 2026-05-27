/**
 * Generate a new opaque ID for a domain row. UUIDv4 via the Workers
 * crypto runtime; safe to call from loaders and actions.
 */
export function newId(): string {
  return crypto.randomUUID();
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
