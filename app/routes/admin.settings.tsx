import { Form, data, redirect, useNavigation, useOutletContext } from "react-router";
import type { Route } from "./+types/admin.settings";
import type { ActiveTenant } from "~/lib/tenant.server";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { recordAudit } from "~/lib/audit.server";
import { PageHeader, Card, EmptyState, Button, LinkButton } from "~/components/ui";
import { Field, FormError, Select, TextInput } from "~/components/form";
import {
  MATURITY_LABEL,
  maturityForJurisdiction,
  whatWeHandle,
  whatYouStillDo,
} from "~/lib/state-coverage";

type RulePackOption = {
  versionId: string;
  rulePackId: string;
  jurisdiction: string;
  name: string;
  version: string;
  installed: number;
};

type AuditRow = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  payload: string | null;
  createdAt: number;
  actorName: string | null;
  actorEmail: string | null;
};

type InstalledPack = {
  versionId: string;
  name: string;
  version: string;
  jurisdiction: string;
  definition: string;
  installedAt: number;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;

  const availablePacks = await db
    .prepare(
      `SELECT rpv.id AS versionId, rp.id AS rulePackId, rp.jurisdiction, rp.name, rpv.version,
              CASE WHEN orp.id IS NULL THEN 0 ELSE 1 END AS installed
         FROM rule_pack_version rpv
         JOIN rule_pack rp ON rp.id = rpv.rulePackId
         LEFT JOIN organization_rule_pack orp
           ON orp.rulePackVersionId = rpv.id AND orp.organizationId = ?
        WHERE rpv.publishedAt IS NOT NULL
        ORDER BY rp.jurisdiction, rpv.version`,
    )
    .bind(tenant.organization.id)
    .all<RulePackOption>();

  const installed = await db
    .prepare(
      `SELECT rpv.id AS versionId, rp.name, rpv.version, rp.jurisdiction,
              rpv.definition, orp.installedAt
         FROM organization_rule_pack orp
         JOIN rule_pack_version rpv ON rpv.id = orp.rulePackVersionId
         JOIN rule_pack rp ON rp.id = rpv.rulePackId
         WHERE orp.organizationId = ?
         ORDER BY orp.installedAt DESC`,
    )
    .bind(tenant.organization.id)
    .all<InstalledPack>();

  const audit = await db
    .prepare(
      `SELECT al.id, al.action, al.entityType, al.entityId, al.payload, al.createdAt,
              u.name AS actorName, u.email AS actorEmail
         FROM auditLog al
         LEFT JOIN user u ON u.id = al.actorUserId
         WHERE al.organizationId = ?
         ORDER BY al.createdAt DESC
         LIMIT 25`,
    )
    .bind(tenant.organization.id)
    .all<AuditRow>();

  // Per-school adapter maturity for the page-one disclosure card. Derived
  // from the installed rule pack's jurisdiction (or the organization's
  // own jurisdiction column if set), so the school sees their reality
  // without us guessing.
  const orgRow = await db
    .prepare(
      `SELECT jurisdiction, dailyDigestEnabled, dailyDigestRecipientEmail,
              dailyDigestLastSentOnDate, geolocationPolicy,
              requireAudioCompletionBeforeQuiz
         FROM organization WHERE id = ?`,
    )
    .bind(tenant.organization.id)
    .first<{
      jurisdiction: string | null;
      dailyDigestEnabled: number;
      dailyDigestRecipientEmail: string | null;
      dailyDigestLastSentOnDate: string | null;
      geolocationPolicy: string;
      requireAudioCompletionBeforeQuiz: number;
    }>();
  const installedJurisdiction = installed.results[0]?.jurisdiction ?? null;
  const adapter = maturityForJurisdiction(
    orgRow?.jurisdiction ?? installedJurisdiction,
  );

  return {
    available: availablePacks.results,
    installed: installed.results,
    audit: audit.results,
    adapter,
    digest: {
      enabled: Boolean(orgRow?.dailyDigestEnabled),
      recipient: orgRow?.dailyDigestRecipientEmail ?? "",
      lastSentOnDate: orgRow?.dailyDigestLastSentOnDate ?? null,
    },
    geolocationPolicy: (orgRow?.geolocationPolicy ?? "off") as
      | "off"
      | "opt_in"
      | "required",
    requireAudioCompletionBeforeQuiz: Boolean(orgRow?.requireAudioCompletionBeforeQuiz),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "save-geolocation-policy") {
    const raw = String(formData.get("geolocationPolicy") ?? "off");
    const policy =
      raw === "opt_in" || raw === "required" ? raw : "off";
    await context.cloudflare.env.DB.prepare(
      "UPDATE organization SET geolocationPolicy = ? WHERE id = ?",
    )
      .bind(policy, tenant.organization.id)
      .run();
    await recordAudit(context.cloudflare.env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "organization.geolocation_policy_changed",
      entityType: "organization",
      entityId: tenant.organization.id,
      payload: { policy },
    });
    return redirect("/admin/settings");
  }

  if (intent === "save-audio-gate") {
    const enabled = formData.get("requireAudioCompletionBeforeQuiz") === "on" ? 1 : 0;
    await env.DB.prepare(
      "UPDATE organization SET requireAudioCompletionBeforeQuiz = ? WHERE id = ?",
    )
      .bind(enabled, tenant.organization.id)
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "organization.audio_gate_changed",
      entityType: "organization",
      entityId: tenant.organization.id,
      payload: { requireAudioCompletionBeforeQuiz: Boolean(enabled) },
    });
    return redirect("/admin/settings");
  }

  if (intent === "save-daily-digest") {
    const enabled = formData.get("dailyDigestEnabled") === "on" ? 1 : 0;
    const email =
      String(formData.get("dailyDigestRecipientEmail") ?? "").trim() || null;
    if (enabled && !email) {
      return data(
        { error: "Pick a recipient email if the daily digest is on." },
        { status: 400 },
      );
    }
    await context.cloudflare.env.DB.prepare(
      `UPDATE organization
          SET dailyDigestEnabled = ?, dailyDigestRecipientEmail = ?
        WHERE id = ?`,
    )
      .bind(enabled, email, tenant.organization.id)
      .run();
    await recordAudit(context.cloudflare.env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "organization.daily_digest_updated",
      entityType: "organization",
      entityId: tenant.organization.id,
      payload: { enabled: Boolean(enabled), hasEmail: Boolean(email) },
    });
    return redirect("/admin/settings");
  }

  if (intent === "install-rule-pack") {
    const versionId = String(formData.get("versionId") ?? "");
    if (!versionId) return data({ error: "Pick a rule pack version." }, { status: 400 });

    const exists = await env.DB.prepare(
      "SELECT id FROM rule_pack_version WHERE id = ?",
    )
      .bind(versionId)
      .first<{ id: string }>();
    if (!exists) return data({ error: "Rule pack version not found." }, { status: 400 });

    try {
      await env.DB.prepare(
        `INSERT INTO organization_rule_pack (id, organizationId, rulePackVersionId, installedAt)
         VALUES (?, ?, ?, ?)`,
      )
        .bind(newId(), tenant.organization.id, versionId, Date.now())
        .run();

      await recordAudit(env, {
        organizationId: tenant.organization.id,
        actorUserId: tenant.user.id,
        action: "rule_pack.installed",
        entityType: "rule_pack_version",
        entityId: versionId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Install failed.";
      return data({ error: message }, { status: 400 });
    }

    return data({ ok: true });
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function AdminSettings({ loaderData, actionData }: Route.ComponentProps) {
  const { tenant } = useOutletContext<{ tenant: ActiveTenant }>();
  const {
    available,
    installed,
    audit,
    adapter,
    digest,
    geolocationPolicy,
    requireAudioCompletionBeforeQuiz,
  } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Settings"
        title={tenant.organization.name}
        actions={
          <div className="flex items-center gap-2">
            <LinkButton to="/admin/settings/payments" variant="secondary">
              Payments
            </LinkButton>
            <LinkButton to="/admin/settings/compensation" variant="secondary">
              Compensation
            </LinkButton>
            <LinkButton to="/admin/settings/btw-flow" variant="secondary">
              BTW flow
            </LinkButton>
            <LinkButton to="/admin/settings/public-listing" variant="secondary">
              Public listing
            </LinkButton>
            <LinkButton to="/admin/settings/cancellation" variant="secondary">
              Cancellation policy
            </LinkButton>
          </div>
        }
      />

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Quiz access
        </h2>
        <Card>
          <p className="text-sm text-ink-600 dark:text-ink-300">
            Lessons with audio narration can require the student to listen to
            at least 85% before the quiz unlocks. Server-side tracking — speed-
            running, scrubbing, or hidden tabs don't earn credit. Off by default.
          </p>
          <Form method="post" className="mt-3 flex flex-wrap items-center gap-3">
            <input type="hidden" name="intent" value="save-audio-gate" />
            <label className="inline-flex items-center gap-2 text-sm text-ink-800 dark:text-ink-200">
              <input
                type="checkbox"
                name="requireAudioCompletionBeforeQuiz"
                defaultChecked={requireAudioCompletionBeforeQuiz}
                className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500 dark:border-ink-600 dark:bg-ink-900"
              />
              Require 85% listen-completion before the quiz unlocks
            </label>
            <Button type="submit" variant="secondary">
              Save
            </Button>
          </Form>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Lesson geolocation
        </h2>
        <Card>
          <p className="text-sm text-ink-600 dark:text-ink-300">
            Two-ping evidence: one GPS reading captured when the instructor
            confirms a lesson, one captured when they sign off as complete.
            Defends good instructors against false accusations and catches
            "ghost lesson" patterns. Never live tracking, never visible to
            parents.
          </p>
          <Form method="post" className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="intent" value="save-geolocation-policy" />
            <Field label="Policy">
              <Select name="geolocationPolicy" defaultValue={geolocationPolicy}>
                <option value="off">Off — don't capture</option>
                <option value="opt_in">
                  Opt-in — capture when the browser allows
                </option>
                <option value="required">
                  Required — every instructor accepted at school-join
                </option>
              </Select>
            </Field>
            <Button type="submit" variant="secondary">
              Save policy
            </Button>
          </Form>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Daily digest email
        </h2>
        <Card>
          <p className="text-sm text-ink-600 dark:text-ink-300">
            One email a day with the top-line numbers — revenue, fees
            recovered, payroll accrued, lessons in the next 24h, outstanding
            A/R, instructor licenses expiring. Sends once a day per the
            platform's hourly cron; tomorrow's digest covers the previous day.
          </p>
          {digest.enabled && digest.lastSentOnDate && (
            <p className="mt-2 text-xs text-ink-500 dark:text-ink-400">
              Last sent on {digest.lastSentOnDate}.
            </p>
          )}
          <Form method="post" className="mt-3 grid gap-3 md:grid-cols-2">
            <input type="hidden" name="intent" value="save-daily-digest" />
            <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
              <input
                type="checkbox"
                name="dailyDigestEnabled"
                defaultChecked={digest.enabled}
                className="h-4 w-4 rounded border-ink-300"
              />
              Send me the daily digest
            </label>
            <Field label="Recipient email">
              <TextInput
                name="dailyDigestRecipientEmail"
                type="email"
                defaultValue={digest.recipient}
                placeholder="owner@example.com"
              />
            </Field>
            <div className="md:col-span-2">
              <Button type="submit">Save</Button>
            </div>
          </Form>
        </Card>
      </section>

      {adapter && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Your state's adapter coverage
          </h2>
          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-brand-700 dark:text-brand-200">
                  {adapter.name} ({adapter.code})
                </p>
                <p className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
                  Level {adapter.maturity.level} ·{" "}
                  {MATURITY_LABEL[adapter.maturity.level]}
                </p>
                {adapter.maturity.credentialLabel && (
                  <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
                    Permit-eligibility credential:{" "}
                    <strong>{adapter.maturity.credentialLabel}</strong>
                  </p>
                )}
                {adapter.maturity.lastVerifiedAt && (
                  <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                    Last verified with state DPS:{" "}
                    {adapter.maturity.lastVerifiedAt}
                  </p>
                )}
              </div>
              <LinkButton to="/states" variant="ghost">
                All states →
              </LinkButton>
            </div>

            {adapter.maturity.legalBlocker && (
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50/40 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-100">
                <p className="text-xs font-semibold uppercase tracking-wider">
                  Disclosure
                </p>
                <p className="mt-1">{adapter.maturity.legalBlocker}</p>
              </div>
            )}

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-200">
                  What directio handles for you
                </p>
                <p className="mt-1 text-sm text-ink-700 dark:text-ink-200">
                  {whatWeHandle(adapter.maturity)}.
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
                  What you still do
                </p>
                <p className="mt-1 text-sm text-ink-700 dark:text-ink-200">
                  {whatYouStillDo(adapter.maturity)}.
                </p>
              </div>
            </div>

            {adapter.maturity.note && (
              <p className="mt-4 text-xs italic text-ink-500 dark:text-ink-400">
                Note: {adapter.maturity.note}
              </p>
            )}
          </Card>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          School info
        </h2>
        <Card>
          <dl className="grid gap-6 md:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
                Slug
              </dt>
              <dd className="mt-1 font-mono text-sm text-ink-900 dark:text-ink-50">
                {tenant.organization.slug}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
                Your role
              </dt>
              <dd className="mt-1 text-sm capitalize text-ink-900 dark:text-ink-50">
                {tenant.role}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
                Brand color
              </dt>
              <dd className="mt-1 flex items-center gap-2 text-sm text-ink-900 dark:text-ink-50">
                <span
                  className="inline-block h-4 w-4 rounded-full border border-ink-200 dark:border-ink-700"
                  style={{ background: tenant.organization.brandColor ?? "transparent" }}
                />
                {tenant.organization.brandColor ?? "default"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
                Logo
              </dt>
              <dd className="mt-1 text-sm text-ink-900 dark:text-ink-50">
                {tenant.organization.logo ?? "—"}
              </dd>
            </div>
          </dl>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Rule packs
        </h2>
        <p className="mb-4 max-w-2xl text-sm text-ink-600 dark:text-ink-300">
          Rule packs encode the state-specific requirements for your school's jurisdiction —
          required hours, credential labels, eligibility logic. Install a pack to opt in.
        </p>

        {installed.length === 0 ? (
          <EmptyState
            title="No rule pack installed"
            description="Install a rule pack to activate state-aware credential workflows for your enrollments."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {installed.map((p) => (
              <RulePackCard key={p.versionId} pack={p} />
            ))}
          </div>
        )}

        {available.filter((p) => !p.installed).length > 0 && (
          <Card className="mt-6">
            <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
              Install a rule pack
            </h3>
            <Form method="post" className="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
              <input type="hidden" name="intent" value="install-rule-pack" />
              <Field label="Pack">
                <Select name="versionId" defaultValue="" required className="min-w-[24rem]">
                  <option value="" disabled>
                    Pick a pack…
                  </option>
                  {available
                    .filter((p) => !p.installed)
                    .map((p) => (
                      <option key={p.versionId} value={p.versionId}>
                        {p.jurisdiction} — {p.name} v{p.version}
                      </option>
                    ))}
                </Select>
              </Field>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Installing…" : "Install"}
              </Button>
            </Form>
            <FormError message={actionData && "error" in actionData ? actionData.error : null} />
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Audit log
        </h2>
        {audit.length === 0 ? (
          <EmptyState title="No compliance events yet" />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white/70 dark:border-ink-800 dark:bg-ink-900/40">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink-200 bg-ink-50/60 text-xs uppercase tracking-wider text-ink-500 dark:border-ink-800 dark:bg-ink-900/60 dark:text-ink-400">
                <tr>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Entity</th>
                  <th className="px-4 py-3 font-medium">By</th>
                  <th className="px-4 py-3 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-ink-200/60 last:border-0 dark:border-ink-800/60"
                  >
                    <td className="px-4 py-3 align-top text-xs text-ink-500 dark:text-ink-400">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 align-top font-mono text-xs text-ink-900 dark:text-ink-50">
                      {row.action}
                    </td>
                    <td className="px-4 py-3 align-top font-mono text-xs text-ink-600 dark:text-ink-300">
                      {row.entityType ?? "—"}
                      {row.entityId && `:${row.entityId.slice(0, 8)}`}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-ink-600 dark:text-ink-300">
                      {row.actorName ?? row.actorEmail ?? "system"}
                    </td>
                    <td className="px-4 py-3 align-top font-mono text-xs text-ink-500 dark:text-ink-400">
                      {row.payload ? renderPayload(row.payload) : "—"}
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

function RulePackCard({ pack }: { pack: InstalledPack }) {
  let parsed: {
    credentials?: Array<{ key: string; label: string; description?: string }>;
    requirements?: Array<{ key: string; label: string; target: number; unit: string }>;
    rules?: Array<{ key: string }>;
  } | null = null;
  try {
    parsed = JSON.parse(pack.definition);
  } catch {
    parsed = null;
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-brand-600 dark:text-brand-300">
            {pack.jurisdiction}
          </p>
          <p className="mt-1 text-lg font-semibold text-ink-900 dark:text-ink-50">
            {pack.name} <span className="text-ink-400 dark:text-ink-500">v{pack.version}</span>
          </p>
          <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
            Installed {new Date(pack.installedAt).toLocaleDateString()}
          </p>
        </div>
        <span className="rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700 dark:bg-brand-900/60 dark:text-brand-200">
          Active
        </span>
      </div>

      {parsed && (
        <div className="mt-5 grid gap-6 md:grid-cols-3">
          <Group label="Credentials">
            {parsed.credentials?.length ? (
              parsed.credentials.map((c) => (
                <div key={c.key} className="text-sm">
                  <p className="font-medium text-ink-900 dark:text-ink-50">{c.label}</p>
                  {c.description && (
                    <p className="text-xs text-ink-500 dark:text-ink-400">{c.description}</p>
                  )}
                </div>
              ))
            ) : (
              <p className="text-xs text-ink-500 dark:text-ink-400">—</p>
            )}
          </Group>
          <Group label="Requirements">
            {parsed.requirements?.length ? (
              parsed.requirements.map((r) => (
                <p key={r.key} className="text-sm text-ink-700 dark:text-ink-200">
                  {r.label}{" "}
                  <span className="text-xs text-ink-500 dark:text-ink-400">
                    · {r.target} {r.unit}
                    {r.target === 1 ? "" : "s"}
                  </span>
                </p>
              ))
            ) : (
              <p className="text-xs text-ink-500 dark:text-ink-400">—</p>
            )}
          </Group>
          <Group label="Rules">
            {parsed.rules?.length ? (
              parsed.rules.map((r) => (
                <p key={r.key} className="font-mono text-xs text-ink-700 dark:text-ink-200">
                  {r.key}
                </p>
              ))
            ) : (
              <p className="text-xs text-ink-500 dark:text-ink-400">—</p>
            )}
          </Group>
        </div>
      )}
    </Card>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">{label}</p>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function renderPayload(json: string): string {
  try {
    const parsed = JSON.parse(json);
    return Object.entries(parsed)
      .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join(" ");
  } catch {
    return json;
  }
}
