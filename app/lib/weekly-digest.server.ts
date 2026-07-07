/**
 * Weekly value digest — Monday-morning email that shows the owner
 * what directio did for their business last week. Purpose is churn
 * reduction, not operations. Numbers are framed as *your* wins
 * (revenue collected, students onboarded, lessons dispatched, hours
 * saved by automation) with one concrete next-step insight.
 *
 * Fires from the same hourly cron as the daily digest. Runs when:
 *   - it is a Monday (UTC),
 *   - the org has weeklyDigestOptOut = 0,
 *   - dailyDigestRecipientEmail is set (reused as recipient),
 *   - weeklyDigestLastSentOnDate is not this Monday.
 *
 * If the previous week had zero activity, we skip the send instead of
 * shouting into the void. Churn-reducing digests brag about real
 * numbers — an empty digest is worse than no digest.
 */

import { isEmailConfigured, sendEmail } from "./email.server";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

// Hand-tuned time savings, per platform action. Deliberately
// conservative — an owner who thinks the number is inflated will
// mistrust the whole digest.
const MIN_SAVED_PER_PAYMENT = 2;
const MIN_SAVED_PER_TRANSLATION = 4;
const MIN_SAVED_PER_QUIZ_AUTOGRADE = 3;
const MIN_SAVED_PER_NARRATION = 12;
const MIN_SAVED_PER_ENROLLMENT = 8;
const MIN_SAVED_PER_APPOINTMENT_DISPATCHED = 3;

export async function sendWeeklyDigests(
  env: Env,
  now: number,
): Promise<{ sent: number; skipped: number; errored: number }> {
  if (!isEmailConfigured(env)) return { sent: 0, skipped: 0, errored: 0 };
  // Only fire on Mondays (UTC). Cron ticks hourly; letting non-Monday
  // hours short-circuit costs one weekday check.
  if (new Date(now).getUTCDay() !== 1) {
    return { sent: 0, skipped: 0, errored: 0 };
  }

  const monday = isoDate(now);
  const weekStart = now - WEEK_MS;

  const orgs = await env.DB.prepare(
    `SELECT id, name, dailyDigestRecipientEmail
       FROM organization
      WHERE weeklyDigestOptOut = 0
        AND dailyDigestEnabled = 1
        AND dailyDigestRecipientEmail IS NOT NULL
        AND (weeklyDigestLastSentOnDate IS NULL OR weeklyDigestLastSentOnDate < ?)`,
  )
    .bind(monday)
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
      const digest = await computeWeekly(env, org.id, weekStart, now);
      if (!hasSignal(digest)) {
        // Zero-activity week — skip so a quiet org doesn't get a
        // dispiriting all-zeros email. Still stamp the send date so
        // we don't retry every hour.
        await stampSent(env, org.id, monday);
        skipped++;
        continue;
      }
      const insight = buildInsight(digest);
      await sendEmail(env, {
        to: org.dailyDigestRecipientEmail,
        subject: `${org.name} — your week on directio`,
        html: weeklyHtml(org.name, digest, insight, monday),
        text: weeklyText(org.name, digest, insight, monday),
      });
      await stampSent(env, org.id, monday);
      sent++;
    } catch (err) {
      console.warn(`[weekly-digest] failed for org ${org.id}:`, err);
      errored++;
    }
  }
  return { sent, skipped, errored };
}

type Weekly = {
  revenueCents: number;
  paymentCount: number;
  enrollmentCount: number;
  appointmentsCompleted: number;
  appointmentsUpcoming: number;
  translationsRun: number;
  quizzesAutoGraded: number;
  narrationsGenerated: number;
  permitsIssued: number;
  certificatesPrinted: number;
  roadTestsPassed: number;
  outstandingArCents: number;
  hoursSaved: number;
};

async function computeWeekly(
  env: Env,
  orgId: string,
  weekStart: number,
  now: number,
): Promise<Weekly> {
  // We intentionally issue N small parallel queries instead of one
  // giant CTE. D1's planner is simple; small queries with indexed
  // predicates are cheaper than one union.
  const [
    rev,
    enroll,
    apptDone,
    apptSoon,
    translations,
    quizzes,
    narrations,
    permits,
    certs,
    roadTests,
    ar,
  ] = await Promise.all([
    env.DB.prepare(
      `SELECT COALESCE(SUM(schoolNetCents), 0) AS cents, COUNT(*) AS n
         FROM payment
        WHERE organizationId = ? AND status = 'succeeded' AND createdAt >= ?`,
    )
      .bind(orgId, weekStart)
      .first<{ cents: number; n: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM enrollment
        WHERE organizationId = ? AND createdAt >= ?`,
    )
      .bind(orgId, weekStart)
      .first<{ n: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM appointment
        WHERE organizationId = ? AND status = 'completed'
          AND endsAt >= ? AND endsAt < ?`,
    )
      .bind(orgId, weekStart, now)
      .first<{ n: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM appointment
        WHERE organizationId = ?
          AND status IN ('scheduled','confirmed')
          AND startsAt >= ? AND startsAt < ?`,
    )
      .bind(orgId, now, now + WEEK_MS)
      .first<{ n: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM translation_cache
        WHERE organizationId = ? AND createdAt >= ?`,
    )
      .bind(orgId, weekStart)
      .first<{ n: number }>()
      .catch(() => ({ n: 0 })),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM quiz_attempt
        WHERE organizationId = ? AND completedAt >= ?`,
    )
      .bind(orgId, weekStart)
      .first<{ n: number }>()
      .catch(() => ({ n: 0 })),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM lesson_audio_cache
        WHERE organizationId = ? AND createdAt >= ?`,
    )
      .bind(orgId, weekStart)
      .first<{ n: number }>()
      .catch(() => ({ n: 0 })),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM credential_submission
        WHERE organizationId = ? AND issuedAt >= ?`,
    )
      .bind(orgId, weekStart)
      .first<{ n: number }>()
      .catch(() => ({ n: 0 })),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM enrollment
        WHERE organizationId = ? AND certificatePrintedAt >= ?`,
    )
      .bind(orgId, weekStart)
      .first<{ n: number }>()
      .catch(() => ({ n: 0 })),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM road_test_result
        WHERE organizationId = ? AND passed = 1 AND takenOn >= ?`,
    )
      .bind(orgId, isoDate(weekStart))
      .first<{ n: number }>()
      .catch(() => ({ n: 0 })),
    env.DB.prepare(
      `SELECT COALESCE(SUM(amountCents), 0) AS cents FROM payment
        WHERE organizationId = ?
          AND status IN ('pending','requires_action','failed')`,
    )
      .bind(orgId)
      .first<{ cents: number }>(),
  ]);

  const paymentCount = rev?.n ?? 0;
  const enrollmentCount = enroll?.n ?? 0;
  const appointmentsCompleted = apptDone?.n ?? 0;
  const translationsRun = translations?.n ?? 0;
  const quizzesAutoGraded = quizzes?.n ?? 0;
  const narrationsGenerated = narrations?.n ?? 0;

  const minutesSaved =
    paymentCount * MIN_SAVED_PER_PAYMENT +
    enrollmentCount * MIN_SAVED_PER_ENROLLMENT +
    appointmentsCompleted * MIN_SAVED_PER_APPOINTMENT_DISPATCHED +
    translationsRun * MIN_SAVED_PER_TRANSLATION +
    quizzesAutoGraded * MIN_SAVED_PER_QUIZ_AUTOGRADE +
    narrationsGenerated * MIN_SAVED_PER_NARRATION;

  return {
    revenueCents: rev?.cents ?? 0,
    paymentCount,
    enrollmentCount,
    appointmentsCompleted,
    appointmentsUpcoming: apptSoon?.n ?? 0,
    translationsRun,
    quizzesAutoGraded,
    narrationsGenerated,
    permitsIssued: permits?.n ?? 0,
    certificatesPrinted: certs?.n ?? 0,
    roadTestsPassed: roadTests?.n ?? 0,
    outstandingArCents: ar?.cents ?? 0,
    hoursSaved: Math.round((minutesSaved / 60) * 10) / 10,
  };
}

function hasSignal(d: Weekly): boolean {
  return (
    d.revenueCents > 0 ||
    d.enrollmentCount > 0 ||
    d.appointmentsCompleted > 0 ||
    d.permitsIssued > 0 ||
    d.certificatesPrinted > 0 ||
    d.roadTestsPassed > 0
  );
}

// The insight is what turns this from a report into a "still worth
// paying for" moment. Pick ONE thing that will actually help this
// week; do not stack three.
function buildInsight(d: Weekly): string {
  if (d.outstandingArCents > 20_000) {
    return `You have ${money(d.outstandingArCents)} in unpaid balances. One family-facing "friendly reminder" send from Payments recovers most of it.`;
  }
  if (d.appointmentsUpcoming === 0 && d.enrollmentCount > 0) {
    return `You onboarded ${d.enrollmentCount} student${plural(d.enrollmentCount)} but nothing is on the calendar this week. Open the Scheduling board and offer them slots.`;
  }
  if (d.roadTestsPassed > 0) {
    return `${d.roadTestsPassed} road-test pass${d.roadTestsPassed === 1 ? "" : "es"} this week. Every family who watches their student take the test is your next referral — the certificate page has a "share your review" button.`;
  }
  if (d.translationsRun > 0) {
    return `You served ${d.translationsRun} translated lesson view${plural(d.translationsRun)} this week. The Translations page has a precache button that eliminates the wait on the next language you add.`;
  }
  if (d.certificatesPrinted > 0) {
    return `${d.certificatesPrinted} completion certificate${plural(d.certificatesPrinted)} printed. Families who see the branded certificate are your best social proof — the certificate page has a "share" button.`;
  }
  return `Steady week. Consider publishing to /schools/your-slug (Website tab) if you haven't yet — the URL is the #1 SEO signal your school actually exists.`;
}

function stampSent(env: Env, orgId: string, monday: string) {
  return env.DB.prepare(
    "UPDATE organization SET weeklyDigestLastSentOnDate = ? WHERE id = ?",
  )
    .bind(monday, orgId)
    .run();
}

function weeklyText(
  name: string,
  d: Weekly,
  insight: string,
  monday: string,
): string {
  const lines: string[] = [];
  lines.push(`${name} — your week on directio (${monday})`);
  lines.push("");
  lines.push(`Revenue collected:       ${money(d.revenueCents)} (${d.paymentCount} payment${plural(d.paymentCount)})`);
  lines.push(`Students onboarded:      ${d.enrollmentCount}`);
  lines.push(`Lessons dispatched:      ${d.appointmentsCompleted}`);
  lines.push(`Lessons upcoming (7d):   ${d.appointmentsUpcoming}`);
  if (d.permitsIssued > 0) lines.push(`Permits issued:          ${d.permitsIssued}`);
  if (d.roadTestsPassed > 0) lines.push(`Road tests passed:       ${d.roadTestsPassed}`);
  if (d.certificatesPrinted > 0) lines.push(`Certificates printed:    ${d.certificatesPrinted}`);
  lines.push("");
  lines.push("Automation:");
  if (d.translationsRun > 0) lines.push(`  Translations rendered: ${d.translationsRun}`);
  if (d.quizzesAutoGraded > 0) lines.push(`  Quizzes auto-graded:   ${d.quizzesAutoGraded}`);
  if (d.narrationsGenerated > 0) lines.push(`  Lesson audio narrated: ${d.narrationsGenerated}`);
  lines.push(`  Estimated hours saved: ${d.hoursSaved}`);
  lines.push("");
  lines.push(`This week's move: ${insight}`);
  lines.push("");
  lines.push("Manage this email under Settings → Notifications.");
  return lines.join("\n");
}

function weeklyHtml(
  name: string,
  d: Weekly,
  insight: string,
  monday: string,
): string {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 14px 6px 0;color:#555">${escape(label)}</td><td style="padding:6px 0;font-weight:600">${escape(value)}</td></tr>`;
  const auto = [
    d.translationsRun > 0 && row("Translations rendered", String(d.translationsRun)),
    d.quizzesAutoGraded > 0 && row("Quizzes auto-graded", String(d.quizzesAutoGraded)),
    d.narrationsGenerated > 0 && row("Lesson audio narrated", String(d.narrationsGenerated)),
    row("Estimated hours saved", `${d.hoursSaved.toFixed(1)}h`),
  ]
    .filter(Boolean)
    .join("");

  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#111;max-width:560px;margin:24px auto;padding:0 16px">
  <p style="font-size:12px;color:#888;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.14em">Weekly digest · week of ${escape(monday)}</p>
  <h2 style="font-size:22px;margin:0 0 6px">${escape(name)}</h2>
  <p style="font-size:15px;color:#333;margin:0 0 18px">Here's what directio ran on your behalf last week.</p>

  <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.1em;color:#666;margin:14px 0 6px">Your wins</h3>
  <table style="font-size:14px;border-collapse:collapse">
    ${row("Revenue collected", `${money(d.revenueCents)} · ${d.paymentCount} payment${plural(d.paymentCount)}`)}
    ${row("Students onboarded", String(d.enrollmentCount))}
    ${row("Lessons dispatched", String(d.appointmentsCompleted))}
    ${row("Lessons upcoming (7d)", String(d.appointmentsUpcoming))}
    ${d.permitsIssued > 0 ? row("Permits issued", String(d.permitsIssued)) : ""}
    ${d.roadTestsPassed > 0 ? row("Road tests passed", String(d.roadTestsPassed)) : ""}
    ${d.certificatesPrinted > 0 ? row("Certificates printed", String(d.certificatesPrinted)) : ""}
  </table>

  <h3 style="font-size:13px;text-transform:uppercase;letter-spacing:0.1em;color:#666;margin:22px 0 6px">What we handled for you</h3>
  <table style="font-size:14px;border-collapse:collapse">${auto}</table>

  <div style="margin-top:24px;padding:14px 16px;background:#f5f2ec;border-radius:12px;border:1px solid #e5dfd3">
    <p style="font-size:12px;color:#a06018;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.1em">This week's move</p>
    <p style="font-size:15px;margin:0;color:#3a2a10">${escape(insight)}</p>
  </div>

  <p style="font-size:12px;color:#888;margin-top:28px">Manage this email under Settings → Notifications.</p>
</body></html>`;
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function plural(n: number): string {
  return n === 1 ? "" : "s";
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
