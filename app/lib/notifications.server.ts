/**
 * Transactional email senders — the "you did a thing, here's your
 * email" suite. Each function is self-contained: it loads what it
 * needs, honors the demo guard, dedupes, renders through the shared
 * branded layout, and sends. All swallow their own errors — an email
 * failure must never break the transaction that triggered it.
 *
 * Callers fire these fire-and-forget:
 *   ctx.waitUntil(sendPaymentReceipt(env, { paymentId }))
 * so the response isn't blocked and the Worker stays alive until the
 * send completes.
 */

import { humanizeConnectRequirements, parseRequirementsJson } from "./connect-requirements";
import { isEmailConfigured, sendEmail } from "./email.server";
import {
  claimSend,
  isSuppressed,
  moneyUsd,
  renderBrandedEmail,
  resolveOrgOwner,
  resolveSender,
  unsubscribeUrl,
  type EmailOrg,
} from "./email-templates.server";

const APP_URL_FALLBACK = "https://godirectio.com";

function appUrl(env: Env): string {
  return env.APP_URL ?? APP_URL_FALLBACK;
}

// A student's family email: prefer a linked guardian's account email,
// then the student's own email. Null if neither exists.
async function familyEmail(env: Env, studentId: string): Promise<string | null> {
  const g = await env.DB.prepare(
    `SELECT u.email FROM guardianStudent gs
       JOIN guardian g ON g.id = gs.guardianId
       JOIN user u ON u.id = g.userId
      WHERE gs.studentId = ? AND u.email IS NOT NULL
      LIMIT 1`,
  )
    .bind(studentId)
    .first<{ email: string }>();
  if (g?.email) return g.email;
  const s = await env.DB.prepare(
    "SELECT email FROM student WHERE id = ? AND email IS NOT NULL LIMIT 1",
  )
    .bind(studentId)
    .first<{ email: string }>();
  return s?.email ?? null;
}

type OrgBrand = EmailOrg & { isDemo: boolean };

async function orgBrand(env: Env, organizationId: string): Promise<OrgBrand | null> {
  const o = await env.DB.prepare(
    "SELECT id, name, logo, brandColor, slug AS publicSlug, isDemo FROM organization WHERE id = ?",
  )
    .bind(organizationId)
    .first<{
      id: string;
      name: string;
      logo: string | null;
      brandColor: string | null;
      publicSlug: string | null;
      isDemo: number;
    }>();
  if (!o) return null;
  return {
    id: o.id,
    name: o.name,
    logo: o.logo,
    brandColor: o.brandColor,
    publicSlug: o.publicSlug,
    isDemo: o.isDemo === 1,
  };
}

// School reply-to (owner email) so families can reply to their school.
async function schoolReplyTo(env: Env, organizationId: string): Promise<string | null> {
  const owner = await resolveOrgOwner(env, organizationId);
  return owner?.ownerEmail ?? null;
}

function dateLabel(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function dateTimeLabel(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

async function guarded(env: Env, label: string, fn: () => Promise<void>): Promise<void> {
  if (!isEmailConfigured(env)) return;
  try {
    await fn();
  } catch (err) {
    console.error(`[notify] ${label} failed:`, err);
  }
}

// ---------------------------------------------------------------------------
// 1. Payment receipt
// ---------------------------------------------------------------------------
export function sendPaymentReceipt(
  env: Env,
  args: { paymentId: string },
): Promise<void> {
  return guarded(env, "receipt", async () => {
    const p = await env.DB.prepare(
      `SELECT p.id, p.amountCents, p.currency, p.descriptionSnapshot, p.kind,
              p.createdAt, p.studentId, p.organizationId,
              s.firstName, s.lastName,
              o.name AS orgName, o.logo, o.brandColor, o.slug AS publicSlug, o.isDemo
         FROM payment p
         JOIN organization o ON o.id = p.organizationId
         LEFT JOIN student s ON s.id = p.studentId
        WHERE p.id = ?`,
    )
      .bind(args.paymentId)
      .first<{
        id: string;
        amountCents: number;
        currency: string;
        descriptionSnapshot: string | null;
        kind: string;
        createdAt: number;
        studentId: string | null;
        organizationId: string;
        firstName: string | null;
        lastName: string | null;
        orgName: string;
        logo: string | null;
        brandColor: string | null;
        publicSlug: string | null;
        isDemo: number;
      }>();
    if (!p || p.isDemo === 1 || !p.studentId) return;

    const to = await familyEmail(env, p.studentId);
    if (!to) return;
    const now = Date.now();
    if (!(await claimSend(env, `receipt:${p.id}`, "receipt", to, now))) return;

    const org: EmailOrg = {
      id: p.organizationId,
      name: p.orgName,
      logo: p.logo,
      brandColor: p.brandColor,
      publicSlug: p.publicSlug,
    };
    const studentName = [p.firstName, p.lastName].filter(Boolean).join(" ") || "your student";
    const { html, text } = renderBrandedEmail({
      org,
      preheader: `Receipt for ${moneyUsd(p.amountCents)} to ${p.orgName}`,
      heading: "Payment received — thank you",
      intro: [
        `This confirms ${p.orgName} received your payment for ${studentName}.`,
      ],
      rows: [
        { label: "Amount", value: moneyUsd(p.amountCents), strong: true },
        { label: "For", value: p.descriptionSnapshot ?? "Tuition" },
        { label: "Date", value: dateLabel(p.createdAt) },
        { label: "Paid to", value: p.orgName },
      ],
      cta: { url: `${appUrl(env)}/family/payments`, label: "View payment history" },
      footerNote:
        "Keep this email as your receipt. Payments are processed by Stripe and deposited directly to your school.",
    });
    const sender = resolveSender(env, org, await schoolReplyTo(env, p.organizationId));
    await sendEmail(env, {
      to,
      subject: `Receipt — ${moneyUsd(p.amountCents)} to ${p.orgName}`,
      html,
      text,
      from: sender.from,
      replyTo: sender.replyTo,
    });
  });
}

// ---------------------------------------------------------------------------
// 2. Enrollment confirmation (enroll flow passes data directly)
// ---------------------------------------------------------------------------
export function sendEnrollmentConfirmation(
  env: Env,
  args: {
    organizationId: string;
    enrollmentId: string;
    parentEmail: string;
    studentName: string;
    programName: string;
    packageName: string | null;
    priceCents: number | null;
    checkoutPath: string;
  },
): Promise<void> {
  return guarded(env, "enrollment", async () => {
    const org = await orgBrand(env, args.organizationId);
    if (!org || org.isDemo) return;
    const now = Date.now();
    if (
      !(await claimSend(env, `enroll:${args.enrollmentId}`, "enrollment", args.parentEmail, now))
    )
      return;

    const rows = [
      { label: "Student", value: args.studentName },
      { label: "Program", value: args.programName },
      ...(args.packageName ? [{ label: "Package", value: args.packageName }] : []),
      ...(args.priceCents != null
        ? [{ label: "Tuition", value: moneyUsd(args.priceCents), strong: true }]
        : []),
    ];
    const { html, text } = renderBrandedEmail({
      org,
      preheader: `${args.studentName} is enrolled with ${org.name}`,
      heading: `${args.studentName} is enrolled 🎉`,
      intro: [
        `Welcome to ${org.name}! Here's what you signed ${args.studentName} up for.`,
        args.priceCents != null
          ? "Next step: complete payment to lock in the spot. The button below takes you straight to checkout."
          : "Your school will be in touch with next steps. You can follow the whole journey from your family portal.",
      ],
      rows,
      cta: {
        url: `${appUrl(env)}${args.checkoutPath}`,
        label: args.priceCents != null ? "Complete payment" : "Open my family portal",
      },
      footerNote:
        "You'll see every step — classroom, permit, behind-the-wheel, road test — and every fee before it happens, in your family portal.",
    });
    const sender = resolveSender(env, org, await schoolReplyTo(env, args.organizationId));
    await sendEmail(env, {
      to: args.parentEmail,
      subject: `You're enrolled with ${org.name}`,
      html,
      text,
      from: sender.from,
      replyTo: sender.replyTo,
    });
  });
}

// ---------------------------------------------------------------------------
// 3 + 4. Lesson canceled (with optional fee) / no-show fee notice
// ---------------------------------------------------------------------------
async function appointmentContext(env: Env, appointmentId: string) {
  return env.DB.prepare(
    `SELECT a.id, a.startsAt, a.organizationId, a.studentId AS apptStudentId,
            e.studentId AS enrollStudentId,
            s.firstName, s.lastName
       FROM appointment a
       LEFT JOIN enrollment e ON e.id = a.enrollmentId
       LEFT JOIN student s ON s.id = COALESCE(a.studentId, e.studentId)
      WHERE a.id = ?`,
  )
    .bind(appointmentId)
    .first<{
      id: string;
      startsAt: number;
      organizationId: string;
      apptStudentId: string | null;
      enrollStudentId: string | null;
      firstName: string | null;
      lastName: string | null;
    }>();
}

export function sendLessonCanceled(
  env: Env,
  args: { appointmentId: string; feeCents?: number; bySchool?: boolean },
): Promise<void> {
  return guarded(env, "cancel", async () => {
    const a = await appointmentContext(env, args.appointmentId);
    if (!a) return;
    const org = await orgBrand(env, a.organizationId);
    if (!org || org.isDemo) return;
    const studentId = a.apptStudentId ?? a.enrollStudentId;
    if (!studentId) return;
    const to = await familyEmail(env, studentId);
    if (!to) return;
    const now = Date.now();
    // Dedupe on appointment + coarse timestamp so a re-cancel much
    // later can still notify, but a double-submit won't double-send.
    if (!(await claimSend(env, `cancel:${a.id}:${a.startsAt}`, "cancel", to, now))) return;

    const studentName = [a.firstName, a.lastName].filter(Boolean).join(" ") || "your student";
    const hasFee = (args.feeCents ?? 0) > 0;
    const rows = [
      { label: "Student", value: studentName },
      { label: "Lesson time", value: dateTimeLabel(a.startsAt) },
      ...(hasFee
        ? [{ label: "Late-cancellation fee", value: moneyUsd(args.feeCents!), strong: true }]
        : []),
    ];
    const { html, text } = renderBrandedEmail({
      org,
      preheader: `Lesson on ${dateTimeLabel(a.startsAt)} canceled`,
      heading: "Your lesson was canceled",
      intro: [
        args.bySchool
          ? `${org.name} canceled ${studentName}'s upcoming lesson. Reach out to reschedule.`
          : `This confirms ${studentName}'s lesson was canceled.`,
        hasFee
          ? `Because this was inside the cancellation window, a ${moneyUsd(
              args.feeCents!,
            )} late-cancel fee applies per your school's policy. It shows as pending — your school collects it on their terms.`
          : "No cancellation fee applies.",
      ],
      rows,
      cta: { url: `${appUrl(env)}/family/lessons`, label: "View lessons" },
    });
    const sender = resolveSender(env, org, await schoolReplyTo(env, a.organizationId));
    await sendEmail(env, {
      to,
      subject: `Lesson canceled — ${dateLabel(a.startsAt)}`,
      html,
      text,
      from: sender.from,
      replyTo: sender.replyTo,
    });
  });
}

export function sendNoShowFeeNotice(
  env: Env,
  args: { appointmentId: string; feeCents: number },
): Promise<void> {
  return guarded(env, "no-show", async () => {
    if (args.feeCents <= 0) return;
    const a = await appointmentContext(env, args.appointmentId);
    if (!a) return;
    const org = await orgBrand(env, a.organizationId);
    if (!org || org.isDemo) return;
    const studentId = a.apptStudentId ?? a.enrollStudentId;
    if (!studentId) return;
    const to = await familyEmail(env, studentId);
    if (!to) return;
    const now = Date.now();
    if (!(await claimSend(env, `noshow:${a.id}`, "no-show", to, now))) return;

    const studentName = [a.firstName, a.lastName].filter(Boolean).join(" ") || "your student";
    const { html, text } = renderBrandedEmail({
      org,
      preheader: `Missed lesson — ${moneyUsd(args.feeCents)} no-show fee`,
      heading: "A lesson was marked as a no-show",
      intro: [
        `${studentName}'s lesson on ${dateTimeLabel(
          a.startsAt,
        )} was marked missed by ${org.name}.`,
        `A ${moneyUsd(
          args.feeCents,
        )} no-show fee applies per your school's policy. It shows as pending in your portal — your school collects it on their terms, never as an automatic card charge.`,
      ],
      rows: [
        { label: "Student", value: studentName },
        { label: "Lesson time", value: dateTimeLabel(a.startsAt) },
        { label: "No-show fee", value: moneyUsd(args.feeCents), strong: true },
      ],
      cta: { url: `${appUrl(env)}/family/lessons`, label: "View lessons" },
      footerNote: "Think this is a mistake? Reply to this email to reach your school.",
    });
    const sender = resolveSender(env, org, await schoolReplyTo(env, a.organizationId));
    await sendEmail(env, {
      to,
      subject: `Missed lesson — ${dateLabel(a.startsAt)}`,
      html,
      text,
      from: sender.from,
      replyTo: sender.replyTo,
    });
  });
}

// ---------------------------------------------------------------------------
// 5. Certificate / program completion
// ---------------------------------------------------------------------------
export function sendCertificateIssued(
  env: Env,
  args: { enrollmentId: string },
): Promise<void> {
  return guarded(env, "certificate", async () => {
    const e = await env.DB.prepare(
      `SELECT e.id, e.studentId, e.organizationId, e.completionCertSerial,
              s.firstName, s.lastName
         FROM enrollment e
         JOIN student s ON s.id = e.studentId
        WHERE e.id = ?`,
    )
      .bind(args.enrollmentId)
      .first<{
        id: string;
        studentId: string;
        organizationId: string;
        completionCertSerial: string | null;
        firstName: string | null;
        lastName: string | null;
      }>();
    if (!e) return;
    const org = await orgBrand(env, e.organizationId);
    if (!org || org.isDemo) return;
    const to = await familyEmail(env, e.studentId);
    if (!to) return;
    const now = Date.now();
    if (!(await claimSend(env, `cert:${e.id}`, "certificate", to, now))) return;

    const studentName = [e.firstName, e.lastName].filter(Boolean).join(" ") || "your student";
    const { html, text } = renderBrandedEmail({
      org,
      preheader: `${studentName} completed their program with ${org.name}`,
      heading: `${studentName} did it 🏁`,
      intro: [
        `${studentName} has completed their driver-education program with ${org.name}. Congratulations!`,
        "Your completion certificate is ready to download from your family portal — you'll need it for the next step at the DMV.",
      ],
      ...(e.completionCertSerial
        ? { rows: [{ label: "Certificate #", value: e.completionCertSerial, strong: true }] }
        : {}),
      cta: {
        url: `${appUrl(env)}/family/certificate/${e.id}`,
        label: "Download certificate",
      },
      footerNote:
        "Proud of your student? A quick review of your school helps other families find them.",
    });
    const sender = resolveSender(env, org, await schoolReplyTo(env, e.organizationId));
    await sendEmail(env, {
      to,
      subject: `${studentName}'s completion certificate is ready`,
      html,
      text,
      from: sender.from,
      replyTo: sender.replyTo,
    });
  });
}

// ---------------------------------------------------------------------------
// 6. Welcome (school owner just created their school)
// ---------------------------------------------------------------------------
export function sendOwnerWelcome(
  env: Env,
  args: { organizationId: string; ownerEmail: string; orgName: string },
): Promise<void> {
  return guarded(env, "welcome", async () => {
    const org = await orgBrand(env, args.organizationId);
    if (org?.isDemo) return; // don't welcome demo orgs
    const now = Date.now();
    if (!(await claimSend(env, `welcome:${args.organizationId}`, "welcome", args.ownerEmail, now)))
      return;

    const { html, text } = renderBrandedEmail({
      org: null, // platform-branded — this is directio welcoming them
      preheader: `${args.orgName} is live on directio — 3 steps to your first enrollment`,
      heading: `Welcome to directio, ${args.orgName} 👋`,
      intro: [
        "Your school is set up. Three steps get you to your first paid enrollment:",
      ],
      extraHtml: `<ol style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.6;color:#1f2937">
        <li><strong>Connect your bank</strong> (Settings → Payments) so families can pay you.</li>
        <li><strong>Add a program &amp; package</strong> — the thing families buy.</li>
        <li><strong>Publish your website</strong> and share your enrollment link.</li>
      </ol>`,
      cta: { url: `${appUrl(env)}/admin`, label: "Open your dashboard" },
      footerNote:
        "Every section has a ✦ Tour button that walks you through it. Reply to this email if you get stuck — a human answers.",
    });
    await sendEmail(env, {
      to: args.ownerEmail,
      subject: `Welcome to directio — let's get ${args.orgName} earning`,
      html,
      text,
    });
  });
}

// ---------------------------------------------------------------------------
// 7. Subscription past-due (owner) + family payment failed
// ---------------------------------------------------------------------------
export function sendSubscriptionPastDue(
  env: Env,
  args: { organizationId: string },
): Promise<void> {
  return guarded(env, "past-due", async () => {
    const owner = await resolveOrgOwner(env, args.organizationId);
    if (!owner) return;
    const now = Date.now();
    // Day-bucketed dedupe: at most one past-due email per org per day.
    const day = new Date(now).toISOString().slice(0, 10);
    if (
      !(await claimSend(
        env,
        `pastdue:${args.organizationId}:${day}`,
        "past-due",
        owner.ownerEmail,
        now,
      ))
    )
      return;

    const { html, text } = renderBrandedEmail({
      org: null,
      preheader: "Your directio subscription payment didn't go through",
      heading: "Your subscription payment failed",
      intro: [
        `We couldn't process the latest payment for ${owner.org.name}'s directio subscription.`,
        "Stripe will retry automatically, but the fastest fix is to update your card. Your school keeps running in the meantime.",
      ],
      cta: { url: `${appUrl(env)}/admin/settings`, label: "Update payment method" },
      footerNote: "If the card isn't updated, the subscription may be canceled after Stripe's retries.",
    });
    await sendEmail(env, { to: owner.ownerEmail, subject: "Action needed: subscription payment failed", html, text });
  });
}

export function sendFamilyPaymentFailed(
  env: Env,
  args: { paymentId: string },
): Promise<void> {
  return guarded(env, "family-payment-failed", async () => {
    const p = await env.DB.prepare(
      `SELECT p.id, p.enrollmentId, p.studentId, p.organizationId, p.amountCents,
              s.firstName, s.lastName, o.isDemo
         FROM payment p
         JOIN organization o ON o.id = p.organizationId
         LEFT JOIN student s ON s.id = p.studentId
        WHERE p.id = ?`,
    )
      .bind(args.paymentId)
      .first<{
        id: string;
        enrollmentId: string | null;
        studentId: string | null;
        organizationId: string;
        amountCents: number;
        firstName: string | null;
        lastName: string | null;
        isDemo: number;
      }>();
    if (!p || p.isDemo === 1 || !p.studentId) return;
    const org = await orgBrand(env, p.organizationId);
    if (!org) return;
    const to = await familyEmail(env, p.studentId);
    if (!to) return;
    const now = Date.now();
    if (!(await claimSend(env, `payfail:${p.id}`, "family-payment-failed", to, now))) return;

    const studentName = [p.firstName, p.lastName].filter(Boolean).join(" ") || "your student";
    const { html, text } = renderBrandedEmail({
      org,
      preheader: `Payment didn't go through for ${studentName}`,
      heading: "Your payment didn't go through",
      intro: [
        `The ${moneyUsd(p.amountCents)} payment for ${studentName}'s enrollment with ${org.name} didn't complete.`,
        "No charge was made. You can try again from your checkout page — a different card usually does it.",
      ],
      cta: {
        url: p.enrollmentId
          ? `${appUrl(env)}/me/checkout/${p.enrollmentId}`
          : `${appUrl(env)}/family/payments`,
        label: "Try payment again",
      },
    });
    const sender = resolveSender(env, org, await schoolReplyTo(env, p.organizationId));
    await sendEmail(env, {
      to,
      subject: `Payment didn't go through — ${org.name}`,
      html,
      text,
      from: sender.from,
      replyTo: sender.replyTo,
    });
  });
}

// ---------------------------------------------------------------------------
// 8. Dispute alert to the school
// ---------------------------------------------------------------------------
export function sendDisputeAlert(
  env: Env,
  args: { organizationId: string; amountCents: number | null; reason: string | null; disputeId: string | null },
): Promise<void> {
  return guarded(env, "dispute", async () => {
    const owner = await resolveOrgOwner(env, args.organizationId);
    if (!owner) return;
    const now = Date.now();
    const key = args.disputeId ?? `${args.organizationId}:${now}`;
    if (!(await claimSend(env, `dispute:${key}`, "dispute", owner.ownerEmail, now))) return;

    const { html, text } = renderBrandedEmail({
      org: null,
      preheader: "A family disputed a charge — time-sensitive",
      heading: "A payment was disputed",
      intro: [
        `A family filed a dispute (chargeback) on a payment to ${owner.org.name}. The funds are held while it's reviewed.`,
        "Disputes are time-sensitive — respond in the Stripe dashboard with evidence (the enrollment, signed waiver, lesson history) as soon as you can.",
      ],
      rows: [
        ...(args.amountCents != null
          ? [{ label: "Amount", value: moneyUsd(args.amountCents), strong: true }]
          : []),
        ...(args.reason ? [{ label: "Stated reason", value: args.reason.replace(/_/g, " ") }] : []),
      ],
      cta: { url: "https://dashboard.stripe.com/disputes", label: "Respond in Stripe" },
      footerNote: "directio logs the dispute in your audit trail automatically. Reply here if you'd like help gathering evidence.",
    });
    await sendEmail(env, { to: owner.ownerEmail, subject: `⚠ Payment disputed — ${owner.org.name}`, html, text });
  });
}

// ---------------------------------------------------------------------------
// 9. Stripe Connect onboarding nudge (cron sweep)
// ---------------------------------------------------------------------------
export async function sweepConnectNudges(
  env: Env,
  now: number,
): Promise<{ nudged: number }> {
  if (!isEmailConfigured(env)) return { nudged: 0 };
  const DAY = 24 * 60 * 60 * 1000;
  // Orgs that started Connect but never finished, created >1 day ago
  // (give them a beat before nudging), not nudged in the last 3 days.
  const rows = await env.DB.prepare(
    `SELECT id, name, createdAt, connectNudgeLastSentAt, stripeRequirementsJson
       FROM organization
      WHERE stripeAccountId IS NOT NULL
        AND stripeChargesEnabled = 0
        AND isDemo = 0
        AND createdAt < ?
        AND (connectNudgeLastSentAt IS NULL OR connectNudgeLastSentAt < ?)
      LIMIT 200`,
  )
    .bind(now - DAY, now - 3 * DAY)
    .all<{
      id: string;
      name: string;
      createdAt: number;
      connectNudgeLastSentAt: number | null;
      stripeRequirementsJson: string | null;
    }>();

  let nudged = 0;
  for (const org of rows.results) {
    try {
      const owner = await resolveOrgOwner(env, org.id);
      if (!owner) continue;
      // Tell them exactly what's left, not just "finish setup".
      const outstanding = humanizeConnectRequirements(parseRequirementsJson(org.stripeRequirementsJson));
      const { html, text } = renderBrandedEmail({
        org: null,
        preheader: `Finish payment setup so ${org.name} can get paid`,
        heading:
          outstanding.length > 0
            ? `${outstanding.length === 1 ? "One thing" : `${outstanding.length} things`} left before families can pay you`
            : "One step left: connect your bank",
        intro: [
          `${org.name} is set up on directio, but payment onboarding isn't finished — until it is, families can't pay you online.`,
          outstanding.length > 0
            ? "Stripe still needs the items below. It's a couple of minutes, and you pick up right where you left off."
            : "It takes about five minutes: Stripe verifies your business and bank so payouts land in your account.",
        ],
        rows: outstanding.map((label) => ({ label: "☐", value: label })),
        cta: { url: `${appUrl(env)}/admin/settings/payments`, label: "Finish payment setup" },
        footerNote: "Already done it? It can take a few minutes for Stripe to confirm — you can ignore this.",
      });
      await sendEmail(env, {
        to: owner.ownerEmail,
        subject: `Finish setup so ${org.name} can accept payments`,
        html,
        text,
      });
      await env.DB.prepare(
        "UPDATE organization SET connectNudgeLastSentAt = ? WHERE id = ?",
      )
        .bind(now, org.id)
        .run();
      nudged++;
    } catch (err) {
      console.error(`[notify] connect nudge failed for org ${org.id}:`, err);
    }
  }
  return { nudged };
}

// ---------------------------------------------------------------------------
// 10. Instructor: new lesson assigned
// ---------------------------------------------------------------------------
export function sendInstructorAssigned(
  env: Env,
  args: { appointmentId: string },
): Promise<void> {
  return guarded(env, "instructor-assigned", async () => {
    const row = await env.DB.prepare(
      `SELECT a.id, a.startsAt, a.endsAt, a.kind, a.locationLabel, a.organizationId,
              i.id AS instructorId,
              COALESCE(i.email, u.email) AS instructorEmail,
              s.firstName, s.lastName,
              o.name AS orgName, o.logo, o.brandColor, o.slug AS publicSlug, o.isDemo
         FROM appointment a
         JOIN instructor i ON i.id = a.instructorId
         LEFT JOIN user u ON u.id = i.userId
         LEFT JOIN enrollment e ON e.id = a.enrollmentId
         LEFT JOIN student s ON s.id = COALESCE(a.studentId, e.studentId)
         JOIN organization o ON o.id = a.organizationId
        WHERE a.id = ?`,
    )
      .bind(args.appointmentId)
      .first<{
        id: string;
        startsAt: number;
        endsAt: number;
        kind: string;
        locationLabel: string | null;
        organizationId: string;
        instructorId: string;
        instructorEmail: string | null;
        firstName: string | null;
        lastName: string | null;
        orgName: string;
        logo: string | null;
        brandColor: string | null;
        publicSlug: string | null;
        isDemo: number;
      }>();
    if (!row || row.isDemo === 1 || !row.instructorEmail) return;
    const now = Date.now();
    if (
      !(await claimSend(env, `assigned:${row.id}`, "instructor-assigned", row.instructorEmail, now))
    )
      return;

    const org: EmailOrg = {
      id: row.organizationId,
      name: row.orgName,
      logo: row.logo,
      brandColor: row.brandColor,
      publicSlug: row.publicSlug,
    };
    const studentName = [row.firstName, row.lastName].filter(Boolean).join(" ") || "a student";
    const { html, text } = renderBrandedEmail({
      org,
      preheader: `New lesson: ${studentName}, ${dateTimeLabel(row.startsAt)}`,
      heading: "You've got a new lesson",
      intro: [`${org.name} scheduled a lesson for you with ${studentName}.`],
      rows: [
        { label: "Student", value: studentName },
        { label: "When", value: dateTimeLabel(row.startsAt), strong: true },
        ...(row.locationLabel ? [{ label: "Where", value: row.locationLabel }] : []),
      ],
      cta: { url: `${appUrl(env)}/instructor`, label: "See today's schedule" },
    });
    const sender = resolveSender(env, org, await schoolReplyTo(env, row.organizationId));
    await sendEmail(env, {
      to: row.instructorEmail,
      subject: `New lesson — ${studentName}, ${dateLabel(row.startsAt)}`,
      html,
      text,
      from: sender.from,
      replyTo: sender.replyTo,
    });
  });
}

// ---------------------------------------------------------------------------
// 11. Practice-log sign-off → parent
// ---------------------------------------------------------------------------
export function sendPracticeLogSignoff(
  env: Env,
  args: { entryId: string },
): Promise<void> {
  return guarded(env, "practice-signoff", async () => {
    const row = await env.DB.prepare(
      `SELECT ple.id, ple.studentId, ple.organizationId, ple.durationMinutes, ple.loggedByUserId,
              s.firstName, s.lastName,
              o.name AS orgName, o.logo, o.brandColor, o.slug AS publicSlug, o.isDemo
         FROM practice_log_entry ple
         JOIN organization o ON o.id = ple.organizationId
         LEFT JOIN student s ON s.id = ple.studentId
        WHERE ple.id = ?`,
    )
      .bind(args.entryId)
      .first<{
        id: string;
        studentId: string | null;
        organizationId: string;
        durationMinutes: number | null;
        loggedByUserId: string | null;
        firstName: string | null;
        lastName: string | null;
        orgName: string;
        logo: string | null;
        brandColor: string | null;
        publicSlug: string | null;
        isDemo: number;
      }>();
    if (!row || row.isDemo === 1) return;

    // Prefer the parent who logged it; fall back to the student's family.
    let to: string | null = null;
    if (row.loggedByUserId) {
      const u = await env.DB.prepare("SELECT email FROM user WHERE id = ?")
        .bind(row.loggedByUserId)
        .first<{ email: string }>();
      to = u?.email ?? null;
    }
    if (!to && row.studentId) to = await familyEmail(env, row.studentId);
    if (!to) return;
    const now = Date.now();
    if (!(await claimSend(env, `signoff:${row.id}`, "practice-signoff", to, now))) return;

    const org: EmailOrg = {
      id: row.organizationId,
      name: row.orgName,
      logo: row.logo,
      brandColor: row.brandColor,
      publicSlug: row.publicSlug,
    };
    const studentName = [row.firstName, row.lastName].filter(Boolean).join(" ") || "your student";
    const dur =
      row.durationMinutes != null ? formatMinutes(row.durationMinutes) : "a practice drive";
    const { html, text } = renderBrandedEmail({
      org,
      preheader: `Instructor signed off ${dur} of practice`,
      heading: "Practice hours signed off ✓",
      intro: [
        `An instructor at ${org.name} reviewed and signed off ${studentName}'s logged practice drive${
          row.durationMinutes != null ? ` (${dur})` : ""
        }.`,
        "Signed hours count toward your state's supervised-practice requirement. You can see the running total in your portal.",
      ],
      cta: { url: `${appUrl(env)}/family/practice-log`, label: "View practice log" },
    });
    const sender = resolveSender(env, org, await schoolReplyTo(env, row.organizationId));
    await sendEmail(env, {
      to,
      subject: `Practice hours signed off — ${org.name}`,
      html,
      text,
      from: sender.from,
      replyTo: sender.replyTo,
    });
  });
}

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// ---------------------------------------------------------------------------
// Digest unsubscribe helpers re-exported for the digest senders
// ---------------------------------------------------------------------------
export { isSuppressed, unsubscribeUrl };
