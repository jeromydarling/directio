import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.settings.cancellation";
import { requireTenant } from "~/lib/tenant.server";
import { recordAudit } from "~/lib/audit.server";
import { PageHeader, Button, LinkButton, Card } from "~/components/ui";
import { Field, FormError, TextInput } from "~/components/form";

type Policy = {
  cancellationDeadlineHours: number;
  lateCancelFeeCents: number;
  noShowFeeCents: number;
  allowFamilyReschedule: number;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const row = await context.cloudflare.env.DB.prepare(
    `SELECT cancellationDeadlineHours, lateCancelFeeCents, noShowFeeCents, allowFamilyReschedule
       FROM organization WHERE id = ?`,
  )
    .bind(tenant.organization.id)
    .first<Policy>();
  return {
    policy: row ?? {
      cancellationDeadlineHours: 24,
      lateCancelFeeCents: 0,
      noShowFeeCents: 0,
      allowFamilyReschedule: 1,
    },
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const env = context.cloudflare.env;
  const formData = await request.formData();

  const cancellationDeadlineHours = Math.max(
    0,
    Math.min(168, parseInt(String(formData.get("cancellationDeadlineHours") ?? "24"), 10) || 0),
  );
  const lateCancelFeeCents = dollarsToCents(formData.get("lateCancelFeeDollars"));
  const noShowFeeCents = dollarsToCents(formData.get("noShowFeeDollars"));
  const allowFamilyReschedule = formData.get("allowFamilyReschedule") === "on" ? 1 : 0;

  if (lateCancelFeeCents < 0 || noShowFeeCents < 0)
    return data({ error: "Fees must be zero or positive." }, { status: 400 });
  if (lateCancelFeeCents > 50_000 || noShowFeeCents > 50_000)
    return data({ error: "Fees over $500 feel unintentional. Adjust if you really meant it." }, { status: 400 });

  await env.DB.prepare(
    `UPDATE organization
        SET cancellationDeadlineHours = ?,
            lateCancelFeeCents = ?,
            noShowFeeCents = ?,
            allowFamilyReschedule = ?
      WHERE id = ?`,
  )
    .bind(
      cancellationDeadlineHours,
      lateCancelFeeCents,
      noShowFeeCents,
      allowFamilyReschedule,
      tenant.organization.id,
    )
    .run();

  await recordAudit(env, {
    organizationId: tenant.organization.id,
    actorUserId: tenant.user.id,
    action: "cancellation_policy.updated",
    entityType: "organization",
    entityId: tenant.organization.id,
    payload: {
      cancellationDeadlineHours,
      lateCancelFeeCents,
      noShowFeeCents,
      allowFamilyReschedule,
    },
  });

  return redirect("/admin/settings/cancellation");
}

function dollarsToCents(input: FormDataEntryValue | null): number {
  const raw = String(input ?? "0").replace(/[^0-9.]/g, "");
  const num = Number.parseFloat(raw || "0");
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export default function CancellationSettings({ loaderData, actionData }: Route.ComponentProps) {
  const { policy } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Settings"
        title="Cancellation & no-show policy"
        description="The deadline and fee structure your families see. We never auto-charge a saved card; assessed fees show up as 'pending' until you collect them or mark them waived."
        actions={
          <LinkButton to="/admin/settings" variant="ghost">
            ← Settings
          </LinkButton>
        }
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      <Form method="post" className="grid max-w-3xl gap-4 md:grid-cols-2">
        <Field
          label="Cancellation deadline (hours before lesson)"
          hint="Cancellations made closer to the start time trigger the late-cancel fee."
        >
          <TextInput
            name="cancellationDeadlineHours"
            type="number"
            min="0"
            max="168"
            step="1"
            required
            defaultValue={String(policy.cancellationDeadlineHours)}
          />
        </Field>
        <Field label="Late-cancel fee ($)" hint="Assessed when a family cancels inside the deadline.">
          <TextInput
            name="lateCancelFeeDollars"
            type="number"
            min="0"
            step="0.01"
            defaultValue={centsToDollars(policy.lateCancelFeeCents)}
          />
        </Field>
        <Field label="No-show fee ($)" hint="Assessed when the instructor marks an appointment no-show.">
          <TextInput
            name="noShowFeeDollars"
            type="number"
            min="0"
            step="0.01"
            defaultValue={centsToDollars(policy.noShowFeeCents)}
          />
        </Field>

        <div className="md:col-span-2">
          <label className="flex items-start gap-2 text-sm text-ink-700 dark:text-ink-200">
            <input
              type="checkbox"
              name="allowFamilyReschedule"
              defaultChecked={policy.allowFamilyReschedule === 1}
              className="mt-1 h-4 w-4 rounded border-ink-300"
            />
            <span>
              <strong>Let families cancel themselves from /family.</strong> Families can cancel
              upcoming lessons online. Cancellations inside the deadline still trigger the late-cancel
              fee, but they don't have to call the office to do it.
            </span>
          </label>
        </div>

        <div className="md:col-span-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save policy"}
          </Button>
        </div>
      </Form>

      <Card>
        <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          What families see
        </h3>
        <p className="mt-2 text-sm text-ink-700 dark:text-ink-200">
          Before booking, families see the deadline and both fee amounts on the lesson detail page.
          After-the-fact fees show up on their /family/payments page alongside tuition. We do not
          auto-debit a saved card; you mark each fee paid or waived from{" "}
          <code className="font-mono">/admin/payments</code>.
        </p>
      </Card>
    </div>
  );
}
