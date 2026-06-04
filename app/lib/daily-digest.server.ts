/**
 * Daily digest sweep — once-per-day owner email summarizing the
 * dashboard's top-line numbers. Hooked into the existing hourly
 * cron; sends only when dailyDigestLastSentOnDate is not today
 * (UTC). Per spec #10.
 */

import { isEmailConfigured, sendEmail } from "./email.server";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function sendDailyDigests(
  env: Env,
  now: number,
): Promise<{ sent: number; skipped: number; errored: number }> {
  if (!isEmailConfigured(env)) return { sent: 0, skipped: 0, errored: 0 };
  const today = isoDate(now);

  const orgs = await env.DB.prepare(
    `SELECT id, name, dailyDigestRecipientEmail
       FROM organization
      WHERE dailyDigestEnabled = 1
        AND dailyDigestRecipientEmail IS NOT NULL
        AND (dailyDigestLastSentOnDate IS NULL OR dailyDigestLastSentOnDate < ?)`,
  )
    .bind(today)
    .all<{
      id: string;
      name: string;
      dailyDigestRecipientEmail: string | null;
    }>();

  let sent = 0;
  let skipped = 0;
  let errored = 0;
  for (const org of orgs.results) {
    if (!org.dailyDigestRecipientEmail) {
      skipped++;
      continue;
    }
    try {
      const digest = await computeDigest(env, org.id, now);
      await sendEmail(env, {
        to: org.dailyDigestRecipientEmail,
        subject: `${org.name} · daily digest — ${today}`,
        html: digestHtml(org.name, digest, today),
        text: digestText(org.name, digest, today),
      });
      await env.DB.prepare(
        "UPDATE organization SET dailyDigestLastSentOnDate = ? WHERE id = ?",
      )
        .bind(today, org.id)
        .run();
      sent++;
    } catch (err) {
      console.warn(`[daily-digest] failed for org ${org.id}:`, err);
      errored++;
    }
  }
  return { sent, skipped, errored };
}

type Digest = {
  revenueCents: number;
  paymentCount: number;
  recoveredCents: number;
  payrollCents: number;
  upcomingNext24h: number;
  enrolledToday: number;
  unpaidArCents: number;
  instructorsLicensesExpired: number;
};

async function computeDigest(env: Env, orgId: string, now: number): Promise<Digest> {
  const since24h = now - DAY_MS;
  const horizon24h = now + DAY_MS;

  const [rev, recovered, payroll, upcoming, enrolled, ar, expired] =
    await Promise.all([
      env.DB.prepare(
        `SELECT COALESCE(SUM(schoolNetCents), 0) AS cents, COUNT(*) AS n
           FROM payment
          WHERE organizationId = ? AND status = 'succeeded' AND createdAt >= ?`,
      )
        .bind(orgId, since24h)
        .first<{ cents: number; n: number }>(),
      env.DB.prepare(
        `SELECT COALESCE(SUM(CASE WHEN feeStatus = 'paid' THEN feeAssessedCents ELSE 0 END), 0) AS cents
           FROM appointment
          WHERE organizationId = ? AND canceledAt >= ?`,
      )
        .bind(orgId, since24h)
        .first<{ cents: number }>(),
      env.DB.prepare(
        `SELECT COALESCE(SUM(totalCents), 0) AS cents
           FROM lesson_payout
          WHERE organizationId = ? AND computedAt >= ?`,
      )
        .bind(orgId, since24h)
        .first<{ cents: number }>(),
      env.DB.prepare(
        `SELECT COUNT(*) AS n FROM appointment
          WHERE organizationId = ?
            AND startsAt >= ? AND startsAt < ?
            AND status IN ('scheduled','confirmed')`,
      )
        .bind(orgId, now, horizon24h)
        .first<{ n: number }>(),
      env.DB.prepare(
        `SELECT COUNT(*) AS n FROM enrollment
          WHERE organizationId = ? AND createdAt >= ?`,
      )
        .bind(orgId, since24h)
        .first<{ n: number }>(),
      env.DB.prepare(
        `SELECT COALESCE(SUM(amountCents), 0) AS cents FROM payment
          WHERE organizationId = ?
            AND status IN ('pending','requires_action','failed')`,
      )
        .bind(orgId)
        .first<{ cents: number }>(),
      env.DB.prepare(
        `SELECT COUNT(*) AS n FROM instructor
          WHERE organizationId = ? AND active = 1
            AND stateLicenseExpiresAt IS NOT NULL AND stateLicenseExpiresAt < ?`,
      )
        .bind(orgId, now)
        .first<{ n: number }>(),
    ]);

  return {
    revenueCents: rev?.cents ?? 0,
    paymentCount: rev?.n ?? 0,
    recoveredCents: recovered?.cents ?? 0,
    payrollCents: payroll?.cents ?? 0,
    upcomingNext24h: upcoming?.n ?? 0,
    enrolledToday: enrolled?.n ?? 0,
    unpaidArCents: ar?.cents ?? 0,
    instructorsLicensesExpired: expired?.n ?? 0,
  };
}

function digestText(name: string, d: Digest, today: string): string {
  const lines: string[] = [];
  lines.push(`${name} — daily digest, ${today}`);
  lines.push("");
  lines.push(`Revenue (last 24h):       ${money(d.revenueCents)} (${d.paymentCount} payment${d.paymentCount === 1 ? "" : "s"})`);
  lines.push(`Fees recovered (24h):     ${money(d.recoveredCents)}`);
  lines.push(`Instructor pay accrued:   ${money(d.payrollCents)}`);
  lines.push(`Lessons in next 24h:      ${d.upcomingNext24h}`);
  lines.push(`New enrollments (24h):    ${d.enrolledToday}`);
  lines.push(`Outstanding A/R:          ${money(d.unpaidArCents)}`);
  if (d.instructorsLicensesExpired > 0) {
    lines.push(`⚠ Instructor licenses expired: ${d.instructorsLicensesExpired}`);
  }
  lines.push("");
  lines.push("Open the full dashboard for more.");
  return lines.join("\n");
}

function digestHtml(name: string, d: Digest, today: string): string {
  const row = (label: string, value: string, tone?: "warn") =>
    `<tr><td style="padding:4px 12px 4px 0;color:#555">${escape(label)}</td><td style="padding:4px 0;font-weight:600;${
      tone === "warn" ? "color:#b1561a" : ""
    }">${escape(value)}</td></tr>`;
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#111;max-width:540px;margin:24px auto;padding:0 16px">
  <p style="font-size:12px;color:#888;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.1em">Daily digest · ${escape(today)}</p>
  <h2 style="font-size:20px;margin:0 0 16px">${escape(name)}</h2>
  <table style="font-size:14px;border-collapse:collapse">
    ${row("Revenue (last 24h)", `${money(d.revenueCents)} · ${d.paymentCount} payment${d.paymentCount === 1 ? "" : "s"}`)}
    ${row("Fees recovered", money(d.recoveredCents))}
    ${row("Instructor pay accrued", money(d.payrollCents))}
    ${row("Lessons in next 24h", String(d.upcomingNext24h))}
    ${row("New enrollments", String(d.enrolledToday))}
    ${row("Outstanding A/R", money(d.unpaidArCents))}
    ${
      d.instructorsLicensesExpired > 0
        ? row("Instructor licenses expired", String(d.instructorsLicensesExpired), "warn")
        : ""
    }
  </table>
  <p style="font-size:13px;margin-top:24px;color:#555">Open the full dashboard for more.</p>
</body></html>`;
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(cents) / 100);
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return c;
    }
  });
}
