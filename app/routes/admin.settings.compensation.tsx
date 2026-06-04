import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.settings.compensation";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { recordAudit } from "~/lib/audit.server";
import {
  COMP_RATE_TYPE_LABELS,
  COMP_RATE_TYPES,
  PAY_CADENCES,
  isCompRateType,
  isPayCadence,
  type CompConditions,
  type CompDefinition,
  type CompLine,
  type CompRateType,
  type PayCadence,
} from "~/lib/comp";
import { PageHeader, Card, Button, EmptyState, LinkButton } from "~/components/ui";
import { Field, FormError, Select, TextInput } from "~/components/form";

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

type InstructorRow = {
  id: string;
  firstName: string;
  lastName: string;
};

type OverrideRow = {
  id: string;
  instructorId: string;
  instructorFirst: string;
  instructorLast: string;
  rateType: string;
  amountCents: number;
  conditions: string | null;
  effectiveFrom: number;
  effectiveTo: number | null;
  notes: string | null;
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
  const db = context.cloudflare.env.DB;
  const orgId = tenant.organization.id;

  const [versions, instructors, overrides, org] = await Promise.all([
    db
      .prepare(
        `SELECT id, compRuleId, version, definition, activatedAt, retiredAt, notes, createdAt
           FROM comp_rule_version
          WHERE organizationId = ?
          ORDER BY createdAt DESC`,
      )
      .bind(orgId)
      .all<VersionRow>(),
    db
      .prepare(
        "SELECT id, firstName, lastName FROM instructor WHERE organizationId = ? AND active = 1 ORDER BY lastName",
      )
      .bind(orgId)
      .all<InstructorRow>(),
    db
      .prepare(
        `SELECT o.id, o.instructorId, o.rateType, o.amountCents, o.conditions,
                o.effectiveFrom, o.effectiveTo, o.notes,
                i.firstName AS instructorFirst, i.lastName AS instructorLast
           FROM instructor_comp_override o
           JOIN instructor i ON i.id = o.instructorId
          WHERE o.organizationId = ?
            AND (o.effectiveTo IS NULL OR o.effectiveTo > ?)
          ORDER BY i.lastName, o.rateType`,
      )
      .bind(orgId, Date.now())
      .all<OverrideRow>(),
    db
      .prepare(
        "SELECT payCadence, payCadenceAnchor FROM organization WHERE id = ?",
      )
      .bind(orgId)
      .first<{ payCadence: string; payCadenceAnchor: number | null }>(),
  ]);

  return {
    versions: versions.results,
    instructors: instructors.results,
    overrides: overrides.results,
    org: {
      payCadence: (org?.payCadence ?? "biweekly") as PayCadence,
    },
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const now = Date.now();
  const orgId = tenant.organization.id;

  if (intent === "set_cadence") {
    const cadenceRaw = String(formData.get("payCadence") ?? "");
    if (!isPayCadence(cadenceRaw)) {
      return data({ error: "Invalid cadence." }, { status: 400 });
    }
    await env.DB.prepare(
      "UPDATE organization SET payCadence = ? WHERE id = ?",
    )
      .bind(cadenceRaw, orgId)
      .run();
    await recordAudit(env, {
      organizationId: orgId,
      actorUserId: tenant.user.id,
      action: "organization.pay_cadence_changed",
      entityType: "organization",
      entityId: orgId,
      payload: { cadence: cadenceRaw },
    });
    return redirect("/admin/settings/compensation");
  }

  if (intent === "seed_default") {
    await saveNewVersion(env, {
      organizationId: orgId,
      lines: STARTER_LINES,
      notes: "Starter policy.",
      userId: tenant.user.id,
      now,
    });
    return redirect("/admin/settings/compensation");
  }

  if (intent === "add_line") {
    const rateTypeRaw = String(formData.get("rateType") ?? "");
    if (!isCompRateType(rateTypeRaw)) {
      return data({ error: "Pick a rate type." }, { status: 400 });
    }
    const amountDollars = Number.parseFloat(String(formData.get("amountDollars") ?? "0"));
    if (!Number.isFinite(amountDollars) || amountDollars < 0) {
      return data({ error: "Amount must be a non-negative number." }, { status: 400 });
    }
    const description = String(formData.get("description") ?? "").trim() || undefined;
    const conditions = readConditionsFromForm(formData);
    const newLine: CompLine = {
      rateType: rateTypeRaw,
      amountCents: Math.round(amountDollars * 100),
      description,
      conditions,
    };
    const current = await loadActiveDefinition(env.DB, orgId);
    const lines = [...(current?.definition.lines ?? []), newLine];
    await saveNewVersion(env, {
      organizationId: orgId,
      lines,
      notes: `Added ${COMP_RATE_TYPE_LABELS[rateTypeRaw]} line.`,
      userId: tenant.user.id,
      now,
    });
    return redirect("/admin/settings/compensation");
  }

  if (intent === "remove_line") {
    const indexRaw = String(formData.get("lineIndex") ?? "");
    const index = Number.parseInt(indexRaw, 10);
    const current = await loadActiveDefinition(env.DB, orgId);
    if (!current) {
      return data({ error: "No active policy." }, { status: 404 });
    }
    if (!Number.isInteger(index) || index < 0 || index >= current.definition.lines.length) {
      return data({ error: "Invalid line." }, { status: 400 });
    }
    const removed = current.definition.lines[index];
    const lines = current.definition.lines.filter((_, i) => i !== index);
    await saveNewVersion(env, {
      organizationId: orgId,
      lines,
      notes: `Removed ${COMP_RATE_TYPE_LABELS[removed.rateType]} line.`,
      userId: tenant.user.id,
      now,
    });
    return redirect("/admin/settings/compensation");
  }

  if (intent === "add_override") {
    const instructorId = String(formData.get("instructorId") ?? "").trim();
    const rateTypeRaw = String(formData.get("rateType") ?? "");
    if (!instructorId) return data({ error: "Pick an instructor." }, { status: 400 });
    if (!isCompRateType(rateTypeRaw))
      return data({ error: "Pick a rate type." }, { status: 400 });
    const amountDollars = Number.parseFloat(String(formData.get("amountDollars") ?? "0"));
    if (!Number.isFinite(amountDollars)) {
      return data({ error: "Amount required." }, { status: 400 });
    }
    const conditions = readConditionsFromForm(formData);
    const notes = String(formData.get("notes") ?? "").trim() || null;
    const id = newId();
    await env.DB.prepare(
      `INSERT INTO instructor_comp_override
         (id, organizationId, instructorId, rateType, amountCents, conditions,
          effectiveFrom, notes, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        orgId,
        instructorId,
        rateTypeRaw,
        Math.round(amountDollars * 100),
        conditions ? JSON.stringify(conditions) : null,
        now,
        notes,
        now,
      )
      .run();
    await recordAudit(env, {
      organizationId: orgId,
      actorUserId: tenant.user.id,
      action: "instructor_comp_override.added",
      entityType: "instructor_comp_override",
      entityId: id,
      payload: {
        instructorId,
        rateType: rateTypeRaw,
        amountCents: Math.round(amountDollars * 100),
      },
    });
    return redirect("/admin/settings/compensation");
  }

  if (intent === "remove_override") {
    const id = String(formData.get("overrideId") ?? "").trim();
    if (!id) return data({ error: "Missing override." }, { status: 400 });
    // Soft-end by setting effectiveTo so history is preserved.
    await env.DB.prepare(
      `UPDATE instructor_comp_override
          SET effectiveTo = ?
        WHERE id = ? AND organizationId = ?`,
    )
      .bind(now, id, orgId)
      .run();
    await recordAudit(env, {
      organizationId: orgId,
      actorUserId: tenant.user.id,
      action: "instructor_comp_override.ended",
      entityType: "instructor_comp_override",
      entityId: id,
      payload: {},
    });
    return redirect("/admin/settings/compensation");
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

/**
 * Save a new version of the active rule. Retires the previously active
 * version. Creates the comp_rule itself if the school doesn't have one yet.
 */
async function saveNewVersion(
  env: Env,
  input: {
    organizationId: string;
    lines: CompLine[];
    notes: string | null;
    userId: string;
    now: number;
  },
) {
  // Find or create the comp_rule (school has at most one in MVP).
  const existing = await env.DB.prepare(
    "SELECT id FROM comp_rule WHERE organizationId = ? LIMIT 1",
  )
    .bind(input.organizationId)
    .first<{ id: string }>();
  const ruleId = existing?.id ?? newId();
  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO comp_rule (id, organizationId, name, createdAt)
       VALUES (?, ?, ?, ?)`,
    )
      .bind(ruleId, input.organizationId, "Standard compensation", input.now)
      .run();
  }

  // Retire the currently-active version.
  await env.DB.prepare(
    `UPDATE comp_rule_version
        SET retiredAt = ?
      WHERE organizationId = ?
        AND activatedAt IS NOT NULL
        AND retiredAt IS NULL`,
  )
    .bind(input.now, input.organizationId)
    .run();

  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM comp_rule_version WHERE compRuleId = ?",
  )
    .bind(ruleId)
    .first<{ n: number }>();
  const versionString = `1.${count?.n ?? 0}.0`;

  const definition: CompDefinition = { lines: input.lines };
  const versionId = newId();
  await env.DB.prepare(
    `INSERT INTO comp_rule_version
       (id, organizationId, compRuleId, version, definition,
        activatedAt, notes, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      versionId,
      input.organizationId,
      ruleId,
      versionString,
      JSON.stringify(definition),
      input.now,
      input.notes,
      input.now,
    )
    .run();

  await recordAudit(env, {
    organizationId: input.organizationId,
    actorUserId: input.userId,
    action: "comp_rule.activated",
    entityType: "comp_rule_version",
    entityId: versionId,
    payload: { version: versionString, lineCount: input.lines.length },
  });
}

async function loadActiveDefinition(
  db: D1Database,
  organizationId: string,
): Promise<{ versionId: string; definition: CompDefinition } | null> {
  const row = await db
    .prepare(
      `SELECT id, definition FROM comp_rule_version
        WHERE organizationId = ?
          AND activatedAt IS NOT NULL
          AND retiredAt IS NULL
        ORDER BY activatedAt DESC LIMIT 1`,
    )
    .bind(organizationId)
    .first<{ id: string; definition: string }>();
  if (!row) return null;
  try {
    const def = JSON.parse(row.definition) as CompDefinition;
    if (!Array.isArray(def?.lines)) return null;
    return { versionId: row.id, definition: def };
  } catch {
    return null;
  }
}

function readConditionsFromForm(formData: FormData): CompConditions | undefined {
  const kindsRaw = String(formData.get("conditionKinds") ?? "").trim();
  const statusesRaw = String(formData.get("conditionStatuses") ?? "").trim();
  const weekend = formData.get("conditionWeekend") === "on";
  const evening = formData.get("conditionEvening") === "on";
  const conds: CompConditions = {};
  if (kindsRaw) conds.kinds = kindsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  if (statusesRaw)
    conds.statuses = statusesRaw.split(",").map((s) => s.trim()).filter(Boolean);
  if (weekend) conds.weekend = true;
  if (evening) conds.evening = true;
  return Object.keys(conds).length > 0 ? conds : undefined;
}

/* ------------------------------------------------------------------ */
/* UI                                                                  */
/* ------------------------------------------------------------------ */

export default function CompensationSettings({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { versions, instructors, overrides, org } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  const active = versions.find(
    (v) => v.activatedAt !== null && v.retiredAt === null,
  );
  const history = versions.filter((v) => v.id !== active?.id);
  const parsedDefinition = active ? parseDefinition(active.definition) : null;
  const activeLines = parsedDefinition?.lines ?? [];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Settings"
        title="Instructor compensation"
        description="Declarative, versioned pay policy. Every edit creates a new version so historical payouts stay defensible — the old version is preserved and lesson_payout rows continue pointing at it."
        actions={
          <LinkButton to="/admin/payroll" variant="ghost">
            View payroll →
          </LinkButton>
        }
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      <Card>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
          Pay cadence
        </p>
        <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
          Determines pay-period boundaries. Lessons signed off during the
          current cadence window land in the current pay period.
        </p>
        <Form method="post" className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="intent" value="set_cadence" />
          <Field label="Cadence">
            <Select name="payCadence" defaultValue={org.payCadence}>
              {PAY_CADENCES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="secondary" disabled={submitting}>
            Save cadence
          </Button>
        </Form>
      </Card>

      {!active && (
        <Card className="border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            No active compensation policy.
          </p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
            Without an active policy, every lesson sign-off records a $0 payout.
            Activate the starter policy to seed reasonable defaults; edit rates
            individually below.
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
                {activeLines.length} rate line{activeLines.length === 1 ? "" : "s"}
              </p>
            </div>
            <Form method="post">
              <input type="hidden" name="intent" value="seed_default" />
              <Button type="submit" variant="ghost" disabled={submitting}>
                Reset to starter
              </Button>
            </Form>
          </div>

          {activeLines.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500 dark:text-ink-400">
              This policy has no rate lines yet. Add one below.
            </p>
          ) : (
            <table className="mt-4 w-full text-left text-sm">
              <thead className="border-b border-ink-200 text-xs uppercase tracking-wider text-ink-500 dark:border-ink-800 dark:text-ink-400">
                <tr>
                  <th className="py-2 pr-3 font-medium">Rate type</th>
                  <th className="py-2 pr-3 font-medium">Amount</th>
                  <th className="py-2 pr-3 font-medium">Applies to</th>
                  <th className="py-2 pr-3 font-medium">Description</th>
                  <th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
                {activeLines.map((line, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-3 text-ink-700 dark:text-ink-200">
                      {COMP_RATE_TYPE_LABELS[line.rateType] ?? line.rateType}
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
                    <td className="py-2 pr-3 text-right">
                      <Form method="post">
                        <input type="hidden" name="intent" value="remove_line" />
                        <input type="hidden" name="lineIndex" value={i} />
                        <button
                          type="submit"
                          disabled={submitting}
                          className="text-xs text-rose-600 hover:underline dark:text-rose-300"
                        >
                          Remove
                        </button>
                      </Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <details className="mt-6">
            <summary className="cursor-pointer select-none text-sm font-medium text-brand-700 dark:text-brand-200">
              + Add a rate line
            </summary>
            <Form method="post" className="mt-3 grid gap-3 md:grid-cols-2">
              <input type="hidden" name="intent" value="add_line" />
              <Field label="Rate type">
                <Select name="rateType" defaultValue="per_lesson">
                  {COMP_RATE_TYPES.map((rt) => (
                    <option key={rt} value={rt}>
                      {COMP_RATE_TYPE_LABELS[rt]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Amount (USD)">
                <TextInput
                  name="amountDollars"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="30.00"
                />
              </Field>
              <Field label="Description (optional)">
                <TextInput
                  name="description"
                  type="text"
                  placeholder="BTW base rate"
                />
              </Field>
              <Field label="Limit to kinds (comma-separated)">
                <TextInput
                  name="conditionKinds"
                  type="text"
                  placeholder="btw or btw,classroom"
                />
              </Field>
              <Field label="Limit to statuses (comma-separated)">
                <TextInput
                  name="conditionStatuses"
                  type="text"
                  placeholder="completed or completed,no_show"
                />
              </Field>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
                <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
                  <input
                    type="checkbox"
                    name="conditionWeekend"
                    className="h-4 w-4 rounded border-ink-300"
                  />
                  Weekend only
                </label>
                <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
                  <input
                    type="checkbox"
                    name="conditionEvening"
                    className="h-4 w-4 rounded border-ink-300"
                  />
                  Evening only (5pm+)
                </label>
              </div>
              <div className="md:col-span-2">
                <Button type="submit" disabled={submitting}>
                  Add line (creates new version)
                </Button>
              </div>
            </Form>
          </details>
        </Card>
      )}

      <Card>
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
              Per-instructor overrides
            </p>
            <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
              An override replaces the rule line for the same rate type when
              its conditions match. Use sparingly — the policy table above
              should carry the rules everyone shares.
            </p>
          </div>
        </div>
        {overrides.length === 0 ? (
          <p className="mt-4 text-sm text-ink-500 dark:text-ink-400">
            No active overrides.
          </p>
        ) : (
          <table className="mt-4 w-full text-left text-sm">
            <thead className="border-b border-ink-200 text-xs uppercase tracking-wider text-ink-500 dark:border-ink-800 dark:text-ink-400">
              <tr>
                <th className="py-2 pr-3 font-medium">Instructor</th>
                <th className="py-2 pr-3 font-medium">Rate type</th>
                <th className="py-2 pr-3 font-medium">Amount</th>
                <th className="py-2 pr-3 font-medium">Conditions</th>
                <th className="py-2 pr-3 font-medium">Note</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
              {overrides.map((o) => (
                <tr key={o.id}>
                  <td className="py-2 pr-3 text-ink-700 dark:text-ink-200">
                    {o.instructorFirst} {o.instructorLast}
                  </td>
                  <td className="py-2 pr-3 text-ink-700 dark:text-ink-200">
                    {COMP_RATE_TYPE_LABELS[o.rateType as CompRateType] ?? o.rateType}
                  </td>
                  <td className="py-2 pr-3 font-display tabular-nums">
                    {formatRate({ rateType: o.rateType as CompRateType, amountCents: o.amountCents })}
                  </td>
                  <td className="py-2 pr-3 text-xs text-ink-600 dark:text-ink-300">
                    {describeConditions({
                      rateType: o.rateType as CompRateType,
                      amountCents: o.amountCents,
                      conditions: o.conditions ? safeParseConditions(o.conditions) : undefined,
                    })}
                  </td>
                  <td className="py-2 pr-3 text-xs text-ink-500 dark:text-ink-400">
                    {o.notes ?? "—"}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <Form method="post">
                      <input type="hidden" name="intent" value="remove_override" />
                      <input type="hidden" name="overrideId" value={o.id} />
                      <button
                        type="submit"
                        disabled={submitting}
                        className="text-xs text-rose-600 hover:underline dark:text-rose-300"
                      >
                        End
                      </button>
                    </Form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {instructors.length > 0 && (
          <details className="mt-6">
            <summary className="cursor-pointer select-none text-sm font-medium text-brand-700 dark:text-brand-200">
              + Add an override
            </summary>
            <Form method="post" className="mt-3 grid gap-3 md:grid-cols-2">
              <input type="hidden" name="intent" value="add_override" />
              <Field label="Instructor">
                <Select name="instructorId" required defaultValue="">
                  <option value="" disabled>
                    Pick…
                  </option>
                  {instructors.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.firstName} {i.lastName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Rate type">
                <Select name="rateType" defaultValue="per_lesson">
                  {COMP_RATE_TYPES.map((rt) => (
                    <option key={rt} value={rt}>
                      {COMP_RATE_TYPE_LABELS[rt]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Amount (USD)">
                <TextInput
                  name="amountDollars"
                  type="number"
                  step="0.01"
                  required
                  placeholder="35.00"
                />
              </Field>
              <Field label="Notes">
                <TextInput
                  name="notes"
                  type="text"
                  placeholder="e.g. Seniority bonus"
                />
              </Field>
              <Field label="Limit to kinds (comma-separated)">
                <TextInput name="conditionKinds" type="text" placeholder="btw" />
              </Field>
              <Field label="Limit to statuses (comma-separated)">
                <TextInput
                  name="conditionStatuses"
                  type="text"
                  placeholder="completed"
                />
              </Field>
              <div className="md:col-span-2">
                <Button type="submit" disabled={submitting}>
                  Add override
                </Button>
              </div>
            </Form>
          </details>
        )}
      </Card>

      {history.length > 0 && (
        <Card>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
            Version history
          </p>
          <ul className="mt-3 divide-y divide-ink-200 text-sm dark:divide-ink-800">
            {history.map((v) => (
              <li key={v.id} className="flex items-baseline justify-between py-2">
                <span className="text-ink-700 dark:text-ink-200">
                  v{v.version}
                  {v.notes && (
                    <span className="ml-2 text-xs text-ink-500 dark:text-ink-400">
                      {v.notes}
                    </span>
                  )}
                </span>
                <span className="text-xs text-ink-500 dark:text-ink-400">
                  {v.retiredAt
                    ? `retired ${new Date(v.retiredAt).toLocaleDateString()}`
                    : `created ${new Date(v.createdAt).toLocaleDateString()}`}
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

function parseDefinition(raw: string): CompDefinition | null {
  try {
    const parsed = JSON.parse(raw) as CompDefinition;
    if (!parsed || !Array.isArray(parsed.lines)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function safeParseConditions(raw: string): CompConditions | undefined {
  try {
    const parsed = JSON.parse(raw) as CompConditions;
    return parsed;
  } catch {
    return undefined;
  }
}

function formatRate(line: { rateType: CompRateType; amountCents: number }): string {
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
  if (c.evening === true) parts.push(`after ${c.eveningStartHour ?? 17}:00`);
  return parts.join(" · ") || "all lessons";
}
