/**
 * Reminder orchestration: scheduled handlers call into here to find
 * BTW lessons coming up in a given window, send notifications, and
 * record cron_run rows for idempotency so retries don't double-send.
 */

import { newId } from "./ids";
import { ResendNotConfiguredError, isResendConfigured, sendEmail } from "./email.server";

type Candidate = {
  apptId: string;
  organizationId: string;
  organizationName: string;
  startsAt: number;
  endsAt: number;
  locationLabel: string | null;
  kind: string;
  studentEmail: string | null;
  studentFirst: string;
  studentLast: string;
  guardianEmail: string | null;
  guardianName: string | null;
  instructorFirst: string | null;
  instructorLast: string | null;
};

export async function runBtwReminderSweep(
  env: Env,
  args: { hoursAhead: 24 | 1; now?: number },
): Promise<{ sent: number; skipped: number; errors: number }> {
  const now = args.now ?? Date.now();
  const windowMs = args.hoursAhead * 60 * 60 * 1000;
  const lo = now + windowMs - 30 * 60 * 1000;  // 30-min half-windows
  const hi = now + windowMs + 30 * 60 * 1000;
  const kind = args.hoursAhead === 24 ? "btw_reminder_24h" : "btw_reminder_1h";

  const rows = await env.DB.prepare(
    `SELECT a.id AS apptId, a.organizationId, o.name AS organizationName,
            a.startsAt, a.endsAt, a.locationLabel, a.kind,
            s.email AS studentEmail, s.firstName AS studentFirst, s.lastName AS studentLast,
            (SELECT u.email FROM guardian g
               JOIN guardianStudent gs ON gs.guardianId = g.id
               JOIN user u ON u.id = g.userId
               WHERE gs.studentId = s.id AND g.organizationId = a.organizationId
               LIMIT 1) AS guardianEmail,
            (SELECT g.firstName || ' ' || g.lastName FROM guardian g
               JOIN guardianStudent gs ON gs.guardianId = g.id
               WHERE gs.studentId = s.id AND g.organizationId = a.organizationId
               LIMIT 1) AS guardianName,
            i.firstName AS instructorFirst, i.lastName AS instructorLast
       FROM appointment a
       JOIN enrollment e ON e.id = a.enrollmentId
       JOIN student s ON s.id = e.studentId
       JOIN organization o ON o.id = a.organizationId
       LEFT JOIN instructor i ON i.id = a.instructorId
      WHERE a.kind = 'btw'
        AND a.status IN ('scheduled', 'confirmed')
        AND a.startsAt BETWEEN ? AND ?`,
  )
    .bind(lo, hi)
    .all<Candidate>();

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const c of rows.results) {
    const recipients = [c.guardianEmail, c.studentEmail].filter((e): e is string => Boolean(e));
    if (recipients.length === 0) {
      skipped++;
      continue;
    }

    for (const recipient of recipients) {
      // Idempotency check via UNIQUE constraint on cron_run.
      const existing = await env.DB.prepare(
        "SELECT id FROM cron_run WHERE kind = ? AND subjectType = 'appointment' AND subjectId = ? AND channel = 'email' AND recipient = ?",
      )
        .bind(kind, c.apptId, recipient)
        .first();
      if (existing) {
        skipped++;
        continue;
      }

      const when = new Date(c.startsAt).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      const subject =
        args.hoursAhead === 24
          ? `Reminder: behind-the-wheel lesson tomorrow at ${when}`
          : `Lesson in 1 hour: ${when}`;
      const greeting =
        recipient === c.guardianEmail
          ? `Hi ${c.guardianName ?? "there"},`
          : `Hi ${c.studentFirst},`;
      const html = `
        <div style="font-family: ui-sans-serif, system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
          <p>${greeting}</p>
          <p>This is a reminder for ${c.studentFirst}'s upcoming behind-the-wheel lesson with ${c.organizationName}.</p>
          <p>
            <strong>When:</strong> ${when}<br>
            ${c.locationLabel ? `<strong>Where:</strong> ${c.locationLabel}<br>` : ""}
            ${
              c.instructorFirst
                ? `<strong>Instructor:</strong> ${c.instructorFirst} ${c.instructorLast ?? ""}<br>`
                : ""
            }
          </p>
          <p>If you need to cancel, please do it in directio or call the school so we can give the slot to another student.</p>
          <p style="color: #6b7280; font-size: 12px;">Sent by directio for ${c.organizationName}.</p>
        </div>
      `;
      const text = `${greeting}

This is a reminder for ${c.studentFirst}'s behind-the-wheel lesson with ${c.organizationName}.

When: ${when}
${c.locationLabel ? `Where: ${c.locationLabel}\n` : ""}${
        c.instructorFirst ? `Instructor: ${c.instructorFirst} ${c.instructorLast ?? ""}\n` : ""
      }
If you need to cancel, please do it in directio or call the school so we can give the slot to another student.

— directio`;

      try {
        if (!isResendConfigured(env)) {
          await env.DB.prepare(
            `INSERT INTO cron_run (id, kind, organizationId, subjectType, subjectId, status, channel, recipient, payload, createdAt)
             VALUES (?, ?, ?, 'appointment', ?, 'skipped', 'email', ?, ?, ?)`,
          )
            .bind(
              newId(),
              kind,
              c.organizationId,
              c.apptId,
              recipient,
              JSON.stringify({ reason: "resend_not_configured", subject }),
              Date.now(),
            )
            .run();
          skipped++;
          continue;
        }
        const result = await sendEmail(env, { to: recipient, subject, html, text });
        await env.DB.prepare(
          `INSERT INTO cron_run (id, kind, organizationId, subjectType, subjectId, status, channel, recipient, payload, createdAt)
           VALUES (?, ?, ?, 'appointment', ?, 'sent', 'email', ?, ?, ?)`,
        )
          .bind(
            newId(),
            kind,
            c.organizationId,
            c.apptId,
            recipient,
            JSON.stringify({ resendId: result.id, subject }),
            Date.now(),
          )
          .run();
        sent++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "send failed";
        await env.DB.prepare(
          `INSERT INTO cron_run (id, kind, organizationId, subjectType, subjectId, status, channel, recipient, payload, createdAt)
           VALUES (?, ?, ?, 'appointment', ?, 'failed', 'email', ?, ?, ?)`,
        )
          .bind(
            newId(),
            kind,
            c.organizationId,
            c.apptId,
            recipient,
            JSON.stringify({ error: msg.slice(0, 400), subject }),
            Date.now(),
          )
          .run();
        if (err instanceof ResendNotConfiguredError) {
          skipped++;
        } else {
          errors++;
        }
      }
    }
  }

  return { sent, skipped, errors };
}
