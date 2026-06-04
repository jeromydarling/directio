import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.settings.btw-flow";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { recordAudit } from "~/lib/audit.server";
import { PageHeader, Card, EmptyState, Button, LinkButton } from "~/components/ui";
import { Field, FormError, Select, TextArea, TextInput } from "~/components/form";

type StepRow = {
  id: string;
  ordinal: number;
  title: string;
  body: string | null;
  kind: string;
  config: string | null;
};

const STEP_KIND_OPTIONS = [
  { value: "instruction", label: "Plain instruction" },
  { value: "find_place", label: "Find a place on the map (state testing, partner school)" },
  { value: "external_link", label: "External link (state website, forms, etc.)" },
  { value: "upload_doc", label: "Upload a document (signed waiver, parent log)" },
  { value: "pay", label: "Make a payment (Blue Card, road-test fee)" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const rows = await context.cloudflare.env.DB.prepare(
    "SELECT id, ordinal, title, body, kind, config FROM school_btw_step WHERE organizationId = ? ORDER BY ordinal",
  )
    .bind(tenant.organization.id)
    .all<StepRow>();
  return { steps: rows.results, orgJurisdiction: tenant.organization.brandColor /* unused */ };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const now = Date.now();

  if (intent === "add-step") {
    const title = String(formData.get("title") ?? "").trim();
    const body = String(formData.get("body") ?? "").trim() || null;
    const kind = String(formData.get("kind") ?? "instruction").trim();
    if (!title) return data({ error: "Title required." }, { status: 400 });

    const config: Record<string, unknown> = {};
    const placeKind = String(formData.get("placeKind") ?? "").trim();
    if (kind === "find_place" && placeKind) config.placeKind = placeKind;
    const linkUrl = String(formData.get("linkUrl") ?? "").trim();
    if (kind === "external_link" && linkUrl) config.url = linkUrl;

    const last = await env.DB.prepare(
      "SELECT COALESCE(MAX(ordinal), -1) AS maxOrd FROM school_btw_step WHERE organizationId = ?",
    )
      .bind(tenant.organization.id)
      .first<{ maxOrd: number }>();
    const ordinal = (last?.maxOrd ?? -1) + 1;
    const id = newId();
    await env.DB.prepare(
      `INSERT INTO school_btw_step (id, organizationId, ordinal, title, body, kind, config, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, tenant.organization.id, ordinal, title, body, kind, JSON.stringify(config), now, now)
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "btw_step.created",
      entityType: "school_btw_step",
      entityId: id,
      payload: { title, kind },
    });
    return redirect("/admin/settings/btw-flow");
  }

  if (intent === "delete-step") {
    const id = String(formData.get("stepId") ?? "");
    if (!id) return data({ error: "Missing." }, { status: 400 });
    await env.DB.prepare(
      "DELETE FROM school_btw_step WHERE id = ? AND organizationId = ?",
    )
      .bind(id, tenant.organization.id)
      .run();
    return redirect("/admin/settings/btw-flow");
  }

  if (intent === "move-step-up" || intent === "move-step-down") {
    const id = String(formData.get("stepId") ?? "");
    if (!id) return data({ error: "Missing." }, { status: 400 });
    const me = await env.DB.prepare(
      "SELECT ordinal FROM school_btw_step WHERE id = ? AND organizationId = ?",
    )
      .bind(id, tenant.organization.id)
      .first<{ ordinal: number }>();
    if (!me) return data({ error: "Step not found." }, { status: 404 });
    const compareOp = intent === "move-step-up" ? "<" : ">";
    const orderDir = intent === "move-step-up" ? "DESC" : "ASC";
    const neighbor = await env.DB.prepare(
      `SELECT id, ordinal FROM school_btw_step
        WHERE organizationId = ? AND ordinal ${compareOp} ?
        ORDER BY ordinal ${orderDir} LIMIT 1`,
    )
      .bind(tenant.organization.id, me.ordinal)
      .first<{ id: string; ordinal: number }>();
    if (!neighbor) return redirect("/admin/settings/btw-flow");
    await env.DB.batch([
      env.DB.prepare("UPDATE school_btw_step SET ordinal = -1 WHERE id = ?").bind(id),
      env.DB.prepare("UPDATE school_btw_step SET ordinal = ? WHERE id = ?").bind(me.ordinal, neighbor.id),
      env.DB.prepare("UPDATE school_btw_step SET ordinal = ? WHERE id = ?").bind(neighbor.ordinal, id),
    ]);
    return redirect("/admin/settings/btw-flow");
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function BtwFlowSettings({ loaderData, actionData }: Route.ComponentProps) {
  const { steps } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Settings"
        title="Behind-the-wheel flow"
        description="Define the steps a student sees on /me/find-school once they reach the behind-the-wheel stage. Each state has different licensing rules, so configure what's actually true for your school."
        actions={
          <LinkButton to="/admin/settings" variant="ghost">
            ← Settings
          </LinkButton>
        }
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      {steps.length === 0 ? (
        <EmptyState
          title="No BTW steps yet"
          description="Define your school's BTW process below. A typical Minnesota flow might be: Schedule your road test, Find a testing center near you, Bring your Blue Card and parent log, Pass the test, Get your provisional license."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {steps.map((s, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === steps.length - 1;
            return (
              <li
                key={s.id}
                className="rounded-2xl border border-ink-200 bg-white/70 p-5 dark:border-ink-800 dark:bg-ink-900/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-brand-600 dark:text-brand-300">
                      Step {idx + 1} · {s.kind.replace("_", " ")}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-ink-900 dark:text-ink-50">
                      {s.title}
                    </p>
                    {s.body && (
                      <p className="mt-1 whitespace-pre-line text-sm text-ink-600 dark:text-ink-300">
                        {s.body}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Form method="post" className="contents">
                      <input type="hidden" name="intent" value="move-step-up" />
                      <input type="hidden" name="stepId" value={s.id} />
                      <Button type="submit" variant="ghost" disabled={submitting || isFirst}>
                        ↑
                      </Button>
                    </Form>
                    <Form method="post" className="contents">
                      <input type="hidden" name="intent" value="move-step-down" />
                      <input type="hidden" name="stepId" value={s.id} />
                      <Button type="submit" variant="ghost" disabled={submitting || isLast}>
                        ↓
                      </Button>
                    </Form>
                    <Form method="post" className="contents">
                      <input type="hidden" name="intent" value="delete-step" />
                      <input type="hidden" name="stepId" value={s.id} />
                      <Button type="submit" variant="ghost" disabled={submitting}>
                        ×
                      </Button>
                    </Form>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Card>
        <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Add a step
        </h3>
        <Form method="post" className="mt-4 flex flex-col gap-4">
          <input type="hidden" name="intent" value="add-step" />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Title">
              <TextInput name="title" type="text" required placeholder="Schedule your road test" />
            </Field>
            <Field label="Kind">
              <Select name="kind" defaultValue="instruction">
                {STEP_KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Body" hint="Optional. Markdown supported.">
            <TextArea
              name="body"
              placeholder="Schedule your road test at any state testing location once your Blue Card is in hand."
              className="min-h-[5rem]"
            />
          </Field>
          <Field label="Place kind (only for 'find a place' steps)">
            <Select name="placeKind" defaultValue="">
              <option value="">— Not applicable —</option>
              <option value="state_testing">State testing centers</option>
              <option value="driving_school">Driving schools</option>
              <option value="dmv_office">DMV offices</option>
            </Select>
          </Field>
          <Field label="External link URL (only for 'external link' steps)">
            <TextInput name="linkUrl" type="url" placeholder="https://dvs.dps.mn.gov/..." />
          </Field>
          <div>
            <Button type="submit" disabled={submitting}>
              Add step
            </Button>
          </div>
        </Form>
      </Card>

      <Card>
        <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          How this is used
        </h3>
        <p className="mt-2 text-sm text-ink-700 dark:text-ink-200">
          When a student reaches the behind-the-wheel stage of their journey, they'll see
          your steps on <code className="font-mono">/me/find-school</code> alongside the
          interactive map. A "find a place" step lets them search by ZIP code and see the
          nearest options of the kind you configured.
        </p>
      </Card>
    </div>
  );
}
