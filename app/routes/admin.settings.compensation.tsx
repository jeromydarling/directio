import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.settings.compensation";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { recordAudit } from "~/lib/audit.server";
import {
  COMP_RATE_TYPE_LABELS,
  type CompDefinition,
  type CompLine,
  type CompRateType,
} from "~/lib/comp";
import { PageHeader, Card, Button, EmptyState } from "~/components/ui";
import { FormError } from "~/components/form";

type VersionRow = {
  id: string;
  compRuleId: string;
  version: string;
  definition: string;
  activatedAt: number | null;
  retiredAt: number | null;
  notes: string | null;
  createdAt: number;
};

const STARTER_LINES: CompLine[] = [
  {
    rateType: "per_lesson",
    amountCents: 3000,
    description: "BTW lesson base rate",
    conditions: { kinds: ["btw"], statuses: ["completed"] },
  },
  {
    rateType: "per_hour",
    amountCents: 2500,
    description: "Classroom rate",
    conditions: { kinds: ["classroom"], statuses: ["completed"] },
  },
  {
    rateType: "no_show_stipend",
    amountCents: 1500,
    description: "Paid when student no-shows",
    conditions: { kinds: ["btw"], statuses: ["no_show"] },
  },
  {
    rateType: "weekend_differential",
    amountCents: 500,
    description: "Saturday and Sunday lessons",
    conditions: { kinds: ["btw"], weekend: true, statuses: ["completed"] },
  },
  {
    rateType: "evening_differential",
    amountCents: 500,
    description: "Lessons starting at 5pm or later",
    conditions: { kinds: ["btw"], evening: true, statuses: ["completed"] },
  },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");

  const versions = await context.cloudflare.env.DB.prepare(
    `SELECT v.id, v.compRuleId, v.version, v.definition,
            v.activatedAt, v.retiredAt, v.notes, v.createdAt
       FROM comp_rule_version v
      WHERE v.organizationId = ?
      ORDER BY v.createdAt DESC`,
  )
    .bind(tenant.organization.id)
    .all<VersionRow>();

  return { versions: versions.results };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const now = Date.now();

  if (intent === "seed_default") {
    // Idempotent — if a rule already exists, just activate the latest
    // draft instead of creating a duplicate.
    const existingRule = await env.DB.prepare(
      "SELECT id FROM comp_rule WHERE organizationId = ? LIMIT 1",
    )
      .bind(tenant.organization.id)
      .first<{ id: string }>();

    const ruleId = existingRule?.id ?? newId();
    if (!existingRule) {
      await env.DB.prepare(
        `INSERT INTO comp_rule (id, organizationId, name, createdAt)
         VALUES (?, ?, ?, ?)`,
      )
        .bind(ruleId, tenant.organization.id, "Standard compensation", now)
        .run();
    }

    // Retire any currently-active version.
    await env.DB.prepare(
      `UPDATE comp_rule_version
          SET retiredAt = ?
        WHERE organizationId = ?
          AND activatedAt IS NOT NULL
          AND retiredAt IS NULL`,
    )
      .bind(now, tenant.organization.id)
      .run();

    const versionCount = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM comp_rule_version WHERE compRuleId = ?",
    )
      .bind(ruleId)
      .first<{ n: number }>();
    const versionString = `1.${versionCount?.n ?? 0}.0`;

    const definition: CompDefinition = { lines: STARTER_LINES };
    const versionId = newId();
    await env.DB.prepare(
      `INSERT INTO comp_rule_version
         (id, organizationId, compRuleId, version, definition,
          activatedAt, notes, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        versionId,
        tenant.organization.id,
        ruleId,
        versionString,
        JSON.stringify(definition),
        now,
        "Starter policy — edit lines once you have your own rates.",
        now,
      )
      .run();

    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "comp_rule.activated",
      entityType: "comp_rule_version",
      entityId: versionId,
      payload: { version: versionString, lineCount: STARTER_LINES.length },
    });

    return redirect("/admin/settings/compensation");
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function CompensationSettings({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { versions } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  const active = versions.find((v) => v.activatedAt !== null && v.retiredAt === null);
  const history = versions.filter((v) => v.id !== active?.id);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Settings"
        title="Instructor compensation"
        description="The rules that compute each instructor's payout when a lesson is signed off. Versioned and audit-logged so a rate change applies going forward without rewriting history."
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      {!active && (
        <Card className="border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            No active compensation policy.
          </p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
            Without an active policy, every lesson sign-off records a $0 payout.
            Activate the starter policy below to seed reasonable defaults — you
            can edit individual rates later.
          </p>
          <Form method="post" className="mt-3">
            <input type="hidden" name="intent" value="seed_default" />
            <Button type="submit" disabled={submitting}>
              {submitting ? "Activating…" : "Activate starter policy"}
            </Button>
          </Form>
        </Card>
      )}

      {active && (
        <Card>
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-200">
                Active policy · v{active.version}
              </p>
              <p className="mt-1 font-display text-xl font-semibold text-ink-900 dark:text-ink-50">
                Standard compensation
              </p>
              {active.notes && (
                <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">{active.notes}</p>
              )}
            </div>
            <Form method="post">
              <input type="hidden" name="intent" value="seed_default" />
              <Button type="submit" variant="ghost" disabled={submitting}>
                Reset to starter
              </Button>
            </Form>
          </div>
          <CompLinesTable definition={active.definition} />
        </Card>
      )}

      {history.length > 0 && (
        <Card>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
            History
          </p>
          <ul className="mt-3 divide-y divide-ink-200 text-sm dark:divide-ink-800">
            {history.map((v) => (
              <li key={v.id} className="flex items-baseline justify-between py-2">
                <span className="text-ink-700 dark:text-ink-200">
                  v{v.version}
                  {v.retiredAt && (
                    <span className="ml-2 text-xs text-ink-500 dark:text-ink-400">
                      retired {new Date(v.retiredAt).toLocaleDateString()}
                    </span>
                  )}
                </span>
                <span className="text-xs text-ink-500 dark:text-ink-400">
                  created {new Date(v.createdAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!active && versions.length === 0 && (
        <EmptyState
          title="No policy history yet"
          description="Once you activate a policy, every version of it is preserved here for audit."
        />
      )}
    </div>
  );
}

function CompLinesTable({ definition }: { definition: string }) {
  let parsed: CompDefinition | null = null;
  try {
    parsed = JSON.parse(definition) as CompDefinition;
  } catch {
    parsed = null;
  }
  const lines = parsed?.lines ?? [];
  if (lines.length === 0) {
    return (
      <p className="mt-4 text-sm text-ink-500 dark:text-ink-400">
        This policy has no rate lines.
      </p>
    );
  }
  return (
    <table className="mt-4 w-full text-left text-sm">
      <thead className="border-b border-ink-200 text-xs uppercase tracking-wider text-ink-500 dark:border-ink-800 dark:text-ink-400">
        <tr>
          <th className="py-2 pr-3 font-medium">Rate type</th>
          <th className="py-2 pr-3 font-medium">Amount</th>
          <th className="py-2 pr-3 font-medium">Applies to</th>
          <th className="py-2 pr-3 font-medium">Description</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
        {lines.map((line, i) => (
          <tr key={i}>
            <td className="py-2 pr-3 text-ink-700 dark:text-ink-200">
              {COMP_RATE_TYPE_LABELS[line.rateType as CompRateType] ?? line.rateType}
            </td>
            <td className="py-2 pr-3 font-display tabular-nums">
              {formatRate(line)}
            </td>
            <td className="py-2 pr-3 text-xs text-ink-600 dark:text-ink-300">
              {describeConditions(line)}
            </td>
            <td className="py-2 pr-3 text-xs text-ink-500 dark:text-ink-400">
              {line.description ?? "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function formatRate(line: CompLine): string {
  const money = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(line.amountCents / 100);
  if (line.rateType === "per_hour") return `${money}/hr`;
  if (line.rateType === "per_mile") return `${money}/mi`;
  return money;
}

function describeConditions(line: CompLine): string {
  const c = line.conditions;
  if (!c) return "all lessons";
  const parts: string[] = [];
  if (c.kinds && c.kinds.length > 0) parts.push(c.kinds.join("/"));
  if (c.statuses && c.statuses.length > 0) parts.push(`status: ${c.statuses.join("/")}`);
  if (c.weekend === true) parts.push("weekend");
  if (c.evening === true)
    parts.push(`after ${c.eveningStartHour ?? 17}:00`);
  return parts.join(" · ") || "all lessons";
}
