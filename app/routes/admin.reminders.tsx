import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.reminders";
import { requireTenant } from "~/lib/tenant.server";
import { runBtwReminderSweep } from "~/lib/reminders.server";
import { isResendConfigured } from "~/lib/email.server";
import { PageHeader, Card, EmptyState, Button, LinkButton } from "~/components/ui";
import { FormError } from "~/components/form";

type CronRow = {
  id: string;
  kind: string;
  subjectId: string;
  status: string;
  channel: string;
  recipient: string;
  payload: string | null;
  createdAt: number;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");

  const rows = await context.cloudflare.env.DB.prepare(
    `SELECT id, kind, subjectId, status, channel, recipient, payload, createdAt
       FROM cron_run
       WHERE organizationId = ?
       ORDER BY createdAt DESC LIMIT 100`,
  )
    .bind(tenant.organization.id)
    .all<CronRow>();

  const summary = await context.cloudflare.env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM cron_run WHERE organizationId = ? GROUP BY status`,
  )
    .bind(tenant.organization.id)
    .all<{ status: string; n: number }>();
  const counts = { sent: 0, skipped: 0, failed: 0 };
  for (const r of summary.results) {
    if (r.status === "sent") counts.sent = r.n;
    else if (r.status === "skipped") counts.skipped = r.n;
    else if (r.status === "failed") counts.failed = r.n;
  }

  return {
    runs: rows.results,
    counts,
    resendConfigured: isResendConfigured(context.cloudflare.env),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin")
    return data({ error: "Not allowed." }, { status: 403 });
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "sweep-24h") {
    const result = await runBtwReminderSweep(env, { hoursAhead: 24 });
    return data({ ok: true, ...result, label: "24-hour sweep" });
  }
  if (intent === "sweep-1h") {
    const result = await runBtwReminderSweep(env, { hoursAhead: 1 });
    return data({ ok: true, ...result, label: "1-hour sweep" });
  }
  return data({ error: "Unknown action." }, { status: 400 });
}

export default function Reminders({ loaderData, actionData }: Route.ComponentProps) {
  const { runs, counts, resendConfigured } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Notifications"
        title="Lesson reminders"
        description="A Cloudflare Cron Trigger sweeps every hour and emails families about behind-the-wheel lessons 24 hours ahead and 1 hour ahead. Sends are idempotent — a retry won't double-email."
        actions={
          <LinkButton to="/admin/schedule" variant="ghost">
            ← Schedule
          </LinkButton>
        }
      />

      {!resendConfigured && (
        <Card className="border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            Email sending is not configured yet.
          </p>
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
            Sweeps run on schedule but each candidate is logged as "skipped" with reason
            <code className="font-mono"> resend_not_configured</code>. Set RESEND_API_KEY (and
            RESEND_FROM if you want a custom sender) via wrangler secret.
          </p>
        </Card>
      )}

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />
      {actionData && "ok" in actionData && actionData.ok && (
        <Card className="border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20">
          <p className="text-sm text-emerald-800 dark:text-emerald-100">
            {actionData.label}: {actionData.sent} sent · {actionData.skipped} skipped ·{" "}
            {actionData.errors} errored
          </p>
        </Card>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <Stat label="Sent" value={counts.sent} highlight />
        <Stat label="Skipped" value={counts.skipped} />
        <Stat label="Failed" value={counts.failed} />
      </section>

      <Card>
        <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Run a sweep now
        </h3>
        <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
          Useful for testing or to backfill a sweep that missed its window. Idempotent — already-sent
          reminders are skipped automatically.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Form method="post">
            <input type="hidden" name="intent" value="sweep-24h" />
            <Button type="submit" disabled={submitting}>
              Run 24-hour sweep
            </Button>
          </Form>
          <Form method="post">
            <input type="hidden" name="intent" value="sweep-1h" />
            <Button type="submit" variant="secondary" disabled={submitting}>
              Run 1-hour sweep
            </Button>
          </Form>
        </div>
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Recent runs
        </h2>
        {runs.length === 0 ? (
          <EmptyState
            title="No reminder runs yet"
            description="Reminders appear here after the first sweep runs (or after you trigger one above)."
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white/70 dark:border-ink-800 dark:bg-ink-900/40">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink-200 bg-ink-50/60 text-xs uppercase tracking-wider text-ink-500 dark:border-ink-800 dark:bg-ink-900/60 dark:text-ink-400">
                <tr>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Kind</th>
                  <th className="px-4 py-3 font-medium">To</th>
                  <th className="px-4 py-3 font-medium">Channel</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-ink-200/60 last:border-0 dark:border-ink-800/60"
                  >
                    <td className="px-4 py-3 text-xs text-ink-500 dark:text-ink-400">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-ink-700 dark:text-ink-200">
                      {r.kind.replace("_", " ")}
                    </td>
                    <td className="px-4 py-3 text-ink-700 dark:text-ink-200">{r.recipient}</td>
                    <td className="px-4 py-3 text-xs capitalize text-ink-500 dark:text-ink-400">
                      {r.channel}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={[
                          "rounded-full px-3 py-1 text-xs font-medium capitalize",
                          r.status === "sent"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200"
                            : r.status === "failed"
                              ? "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-200"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200",
                        ].join(" ")}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <Card
      className={
        highlight ? "border-brand-300 bg-brand-50/40 dark:border-brand-700 dark:bg-brand-950/20" : ""
      }
    >
      <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
        {value}
      </p>
    </Card>
  );
}
