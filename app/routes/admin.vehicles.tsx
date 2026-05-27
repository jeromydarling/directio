import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.vehicles";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { PageHeader, Card, EmptyState, Button } from "~/components/ui";
import { Field, FormError, TextInput } from "~/components/form";

type Row = {
  id: string;
  label: string;
  makeModel: string | null;
  year: number | null;
  plate: string | null;
  active: number;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const rows = await context.cloudflare.env.DB.prepare(
    "SELECT id, label, makeModel, year, plate, active FROM vehicle WHERE organizationId = ? ORDER BY label",
  )
    .bind(tenant.organization.id)
    .all<Row>();
  return { vehicles: rows.results };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const formData = await request.formData();
  const label = String(formData.get("label") ?? "").trim();
  const makeModel = String(formData.get("makeModel") ?? "").trim() || null;
  const yearStr = String(formData.get("year") ?? "").trim();
  const year = yearStr ? parseInt(yearStr, 10) : null;
  const plate = String(formData.get("plate") ?? "").trim() || null;

  if (!label) return data({ error: "Label is required." }, { status: 400 });
  if (year !== null && (!Number.isFinite(year) || year < 1900 || year > 2100))
    return data({ error: "Year must be reasonable." }, { status: 400 });

  await context.cloudflare.env.DB.prepare(
    `INSERT INTO vehicle (id, organizationId, label, makeModel, year, plate, active, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
  )
    .bind(newId(), tenant.organization.id, label, makeModel, year, plate, Date.now())
    .run();

  return redirect("/admin/vehicles");
}

export default function AdminVehicles({ loaderData, actionData }: Route.ComponentProps) {
  const { vehicles } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Fleet"
        title={vehicles.length === 0 ? "No vehicles yet" : `${vehicles.length} vehicles`}
        description="The cars you use for behind-the-wheel lessons. Assigning a vehicle to a lesson helps with insurance and maintenance tracking."
      />

      {vehicles.length === 0 ? (
        <EmptyState
          title="Add a vehicle"
          description="Use the form below to add your first vehicle."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white/70 dark:border-ink-800 dark:bg-ink-900/40">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-200 bg-ink-50/60 text-xs uppercase tracking-wider text-ink-500 dark:border-ink-800 dark:bg-ink-900/60 dark:text-ink-400">
              <tr>
                <th className="px-4 py-3 font-medium">Label</th>
                <th className="px-4 py-3 font-medium">Make / Model</th>
                <th className="px-4 py-3 font-medium">Year</th>
                <th className="px-4 py-3 font-medium">Plate</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr
                  key={v.id}
                  className="border-b border-ink-200/60 last:border-0 dark:border-ink-800/60"
                >
                  <td className="px-4 py-3 font-medium text-ink-900 dark:text-ink-50">{v.label}</td>
                  <td className="px-4 py-3 text-ink-600 dark:text-ink-300">
                    {v.makeModel ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-600 dark:text-ink-300">{v.year ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-600 dark:text-ink-300">
                    {v.plate ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Card>
        <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Add a vehicle
        </h3>
        <Form method="post" className="mt-4 grid gap-4 md:grid-cols-4">
          <Field label="Label">
            <TextInput name="label" type="text" required placeholder="Car 1" />
          </Field>
          <Field label="Make / Model">
            <TextInput name="makeModel" type="text" placeholder="Honda Civic" />
          </Field>
          <Field label="Year">
            <TextInput name="year" type="number" min="1990" max="2100" placeholder="2022" />
          </Field>
          <Field label="License plate">
            <TextInput name="plate" type="text" placeholder="ABC-1234" />
          </Field>
          <div className="md:col-span-4">
            <FormError message={actionData && "error" in actionData ? actionData.error : null} />
            <Button type="submit" disabled={submitting} className="mt-3">
              {submitting ? "Adding…" : "Add vehicle"}
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
}
