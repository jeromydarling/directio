/**
 * Minimal CSV parser. Handles quoted fields, escaped quotes (""),
 * commas inside quotes, CRLF + LF. Good enough for the import flow;
 * if you need full RFC-4180, swap in PapaParse later.
 */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (c === "\r") {
        // ignore
      } else {
        field += c;
      }
    }
  }
  // last field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 0 && r.some((c) => c.trim()));
}

/**
 * Heuristic header → schema-field mapping for student imports.
 * Used when the Claude API isn't configured; the AI can override
 * by writing into the same `mapping` shape.
 */
const HEADER_HEURISTICS: Array<{ field: string; patterns: RegExp[] }> = [
  { field: "firstName", patterns: [/first.*name/i, /^fname$/i, /given/i, /^first$/i] },
  { field: "lastName", patterns: [/last.*name/i, /^lname$/i, /surname/i, /family/i, /^last$/i] },
  { field: "fullName", patterns: [/^name$/i, /full.*name/i, /student.*name/i] },
  { field: "email", patterns: [/e-?mail/i] },
  { field: "phone", patterns: [/phone/i, /mobile/i, /cell/i] },
  { field: "dateOfBirth", patterns: [/birth/i, /^dob$/i, /^birthday$/i] },
  { field: "notes", patterns: [/note/i, /comment/i] },
];

export function guessMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const h of headers) {
    const trimmed = h.trim();
    if (!trimmed) continue;
    const match = HEADER_HEURISTICS.find((m) => m.patterns.some((p) => p.test(trimmed)));
    if (match) mapping[trimmed] = match.field;
  }
  return mapping;
}

/**
 * Apply a header→field mapping to CSV rows, producing normalized
 * student records. Splits "fullName" on first whitespace into
 * firstName + lastName so the same CSV works either way.
 */
export function mapStudentRows(
  headers: string[],
  rows: string[][],
  mapping: Record<string, string>,
): Array<{
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  notes: string | null;
}> {
  return rows.map((row) => {
    const out: Record<string, string | null> = {
      firstName: null,
      lastName: null,
      email: null,
      phone: null,
      dateOfBirth: null,
      notes: null,
    };
    headers.forEach((h, i) => {
      const field = mapping[h.trim()];
      if (!field) return;
      const v = (row[i] ?? "").trim();
      if (!v) return;
      if (field === "fullName") {
        const parts = v.split(/\s+/);
        out.firstName = parts[0] ?? "";
        out.lastName = parts.slice(1).join(" ") || "";
      } else if (field in out) {
        out[field] = v;
      }
    });
    return {
      firstName: out.firstName ?? "",
      lastName: out.lastName ?? "",
      email: out.email,
      phone: out.phone,
      dateOfBirth: out.dateOfBirth,
      notes: out.notes,
    };
  });
}
