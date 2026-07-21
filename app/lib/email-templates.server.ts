/**
 * Shared branded email layout + per-school sender resolution +
 * unsubscribe plumbing. Every outbound email routes through
 * renderBrandedEmail() so the whole suite looks like one product and
 * carries the sending school's identity.
 */

import { escapeHtml, moneyUsd } from "./format";

export { moneyUsd };

const APEX = "https://godirectio.com";

export type EmailOrg = {
  id: string;
  name: string;
  logo: string | null;
  brandColor: string | null;
  /** Public slug, for a "view in your portal" link when relevant. */
  publicSlug?: string | null;
};

export type SenderIdentity = {
  /** RFC 5322 From, e.g. `Bob's Driving School <no-reply@godirectio.com>`. */
  from: string;
  /** Reply-To — the school's own contact, so replies reach them. */
  replyTo?: string;
};

/**
 * Build the From/Reply-To for a message.
 *
 * The From address always stays on godirectio.com (the only domain
 * with DKIM/SPF/DMARC), but the DISPLAY NAME is the school's, and
 * Reply-To points at the school's contact email when we have one. That
 * is the honest white-label within the deliverability constraint: the
 * family sees "Bob's Driving School" in their inbox and replies land
 * with Bob, not our no-reply box.
 */
export function resolveSender(
  env: Env,
  org: EmailOrg | null,
  contactEmail?: string | null,
): SenderIdentity {
  const addr = "no-reply@godirectio.com";
  if (!org) {
    return { from: env.EMAIL_FROM ?? `directio <${addr}>` };
  }
  const name = sanitizeDisplayName(org.name);
  return {
    from: `${name} <${addr}>`,
    replyTo: contactEmail || undefined,
  };
}

// Strip CR/LF and quote-breakers from a name going into a header.
function sanitizeDisplayName(name: string): string {
  const clean = name.replace(/[\r\n"]/g, "").trim().slice(0, 78);
  return clean || "directio";
}

export type EmailRow = { label: string; value: string; strong?: boolean };

export type BrandedEmailArgs = {
  /** Sending school; null for platform mail (welcome, operator). */
  org: EmailOrg | null;
  /** Inbox-preview snippet (hidden in body). */
  preheader: string;
  heading: string;
  /** Lead paragraph(s); each string becomes its own <p>. */
  intro: string | string[];
  /** Optional labeled detail table (receipts, fee notices…). */
  rows?: EmailRow[];
  /** Optional extra raw-HTML block after the rows (already escaped). */
  extraHtml?: string;
  /** Primary call-to-action button. */
  cta?: { label: string; url: string };
  /** Small print above the footer. */
  footerNote?: string;
  /** When set, renders a CAN-SPAM unsubscribe line. */
  unsubscribeUrl?: string;
};

/**
 * Render a branded email as { html, text }. Table-based, inline-styled
 * HTML for maximum client compatibility; the text part is generated
 * from the same content so it always matches.
 */
export function renderBrandedEmail(args: BrandedEmailArgs): {
  html: string;
  text: string;
} {
  const accent = safeColor(args.org?.brandColor) ?? "#1e3a8a";
  const orgName = args.org?.name ?? "directio";
  const intro = Array.isArray(args.intro) ? args.intro : [args.intro];

  // Header: school logo if we have one, else a wordmark.
  const header = args.org?.logo
    ? `<img src="${escapeHtml(args.org.logo)}" alt="${escapeHtml(orgName)}" height="40" style="max-height:40px;display:block" />`
    : `<span style="font-size:20px;font-weight:700;letter-spacing:-0.01em;color:${accent}">${escapeHtml(orgName)}</span>`;

  const introHtml = intro
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1f2937">${escapeHtml(
          p,
        )}</p>`,
    )
    .join("");

  const rowsHtml =
    args.rows && args.rows.length
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0 16px">${args.rows
          .map(
            (r) =>
              `<tr><td style="padding:7px 0;font-size:14px;color:#6b7280">${escapeHtml(
                r.label,
              )}</td><td style="padding:7px 0;font-size:14px;text-align:right;color:#111827;font-weight:${
                r.strong ? "700" : "500"
              }">${escapeHtml(r.value)}</td></tr>`,
          )
          .join("")}</table>`
      : "";

  const ctaHtml = args.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td style="border-radius:8px;background:${accent}"><a href="${escapeHtml(
        args.cta.url,
      )}" style="display:inline-block;padding:11px 20px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">${escapeHtml(
        args.cta.label,
      )}</a></td></tr></table>`
    : "";

  const footerNoteHtml = args.footerNote
    ? `<p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#9ca3af">${escapeHtml(
        args.footerNote,
      )}</p>`
    : "";

  const unsubHtml = args.unsubscribeUrl
    ? `<p style="margin:8px 0 0;font-size:12px;color:#9ca3af">Don't want these? <a href="${escapeHtml(
        args.unsubscribeUrl,
      )}" style="color:#9ca3af;text-decoration:underline">Unsubscribe</a>.</p>`
    : "";

  const poweredBy = args.org
    ? `<p style="margin:8px 0 0;font-size:12px;color:#b3b9c4">${escapeHtml(
        orgName,
      )} runs on <a href="${APEX}" style="color:#b3b9c4;text-decoration:underline">directio</a>.</p>`
    : `<p style="margin:8px 0 0;font-size:12px;color:#b3b9c4"><a href="${APEX}" style="color:#b3b9c4;text-decoration:underline">directio</a> — the operating system for driver education.</p>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(
    args.heading,
  )}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${escapeHtml(
    args.preheader,
  )}</span>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f3f4f6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
<tr><td style="padding:22px 28px;border-bottom:1px solid #f0f1f3">${header}</td></tr>
<tr><td style="padding:26px 28px 8px">
<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:#0f172a;font-weight:700">${escapeHtml(
    args.heading,
  )}</h1>
${introHtml}
${rowsHtml}
${ctaHtml}
${args.extraHtml ?? ""}
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #f0f1f3">
${footerNoteHtml}
${poweredBy}
${unsubHtml}
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  // Plain-text twin.
  const textLines: string[] = [];
  textLines.push(orgName);
  textLines.push("");
  textLines.push(args.heading);
  textLines.push("");
  for (const p of intro) textLines.push(p);
  if (args.rows?.length) {
    textLines.push("");
    for (const r of args.rows) textLines.push(`${r.label}: ${r.value}`);
  }
  if (args.cta) {
    textLines.push("");
    textLines.push(`${args.cta.label}: ${args.cta.url}`);
  }
  if (args.footerNote) {
    textLines.push("");
    textLines.push(args.footerNote);
  }
  if (args.unsubscribeUrl) {
    textLines.push("");
    textLines.push(`Unsubscribe: ${args.unsubscribeUrl}`);
  }
  return { html, text: textLines.join("\n") };
}

function safeColor(c: string | null | undefined): string | null {
  if (!c) return null;
  return /^#[0-9a-fA-F]{3,8}$/.test(c.trim()) ? c.trim() : null;
}

/**
 * Stateless unsubscribe token: HMAC-SHA256(email:category) with
 * BETTER_AUTH_SECRET. No token storage — the link verifies itself.
 */
export async function unsubscribeToken(
  env: Env,
  email: string,
  category: string,
): Promise<string> {
  const secret = env.BETTER_AUTH_SECRET ?? "";
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`${email.toLowerCase()}:${category}`),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export async function unsubscribeUrl(
  env: Env,
  email: string,
  category: string,
): Promise<string> {
  const t = await unsubscribeToken(env, email, category);
  const base = env.APP_URL ?? APEX;
  const q = new URLSearchParams({ e: email, c: category, t });
  return `${base}/unsubscribe?${q.toString()}`;
}

export async function isSuppressed(
  env: Env,
  email: string,
  category: string,
): Promise<boolean> {
  try {
    const row = await env.DB.prepare(
      "SELECT 1 AS one FROM email_suppression WHERE email = ? AND category = ? LIMIT 1",
    )
      .bind(email.toLowerCase(), category)
      .first<{ one: number }>();
    return Boolean(row);
  } catch {
    // Table missing (migration not applied) → nobody is suppressed.
    return false;
  }
}

/**
 * Transactional idempotency: returns true if this dedupeKey has NOT
 * been sent before (and records it), false if it's a repeat. Fail-open
 * (returns true) if the table is missing so a schema lag never blocks
 * a receipt.
 */
export async function claimSend(
  env: Env,
  dedupeKey: string,
  kind: string,
  toEmail: string,
  now: number,
): Promise<boolean> {
  try {
    const res = await env.DB.prepare(
      "INSERT OR IGNORE INTO email_sent (dedupeKey, kind, toEmail, sentAt) VALUES (?, ?, ?, ?)",
    )
      .bind(dedupeKey, kind, toEmail.toLowerCase(), now)
      .run();
    return Boolean(res.meta?.changes);
  } catch (err) {
    console.error("[email] claimSend unavailable:", err);
    return true;
  }
}

/**
 * Resolve a school owner's email + the org's branding in one query.
 * Returns null for demo orgs (never email demo data) or when there's
 * no owner/admin with an email on file.
 */
export async function resolveOrgOwner(
  env: Env,
  organizationId: string,
): Promise<{ org: EmailOrg; ownerEmail: string; ownerName: string | null } | null> {
  const row = await env.DB.prepare(
    `SELECT o.id, o.name, o.logo, o.brandColor, o.slug AS publicSlug, o.isDemo,
            u.email AS ownerEmail, u.name AS ownerName
       FROM organization o
       JOIN member m ON m.organizationId = o.id AND m.role IN ('owner','admin')
       JOIN user u ON u.id = m.userId
      WHERE o.id = ?
      ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, m.createdAt ASC
      LIMIT 1`,
  )
    .bind(organizationId)
    .first<{
      id: string;
      name: string;
      logo: string | null;
      brandColor: string | null;
      publicSlug: string | null;
      isDemo: number;
      ownerEmail: string;
      ownerName: string | null;
    }>();
  if (!row || row.isDemo === 1 || !row.ownerEmail) return null;
  return {
    org: {
      id: row.id,
      name: row.name,
      logo: row.logo,
      brandColor: row.brandColor,
      publicSlug: row.publicSlug,
    },
    ownerEmail: row.ownerEmail,
    ownerName: row.ownerName,
  };
}
