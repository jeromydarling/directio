import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.locations";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { recordAudit } from "~/lib/audit.server";
import { PageHeader, Card, EmptyState, Button } from "~/components/ui";
import { Field, FormError, TextInput } from "~/components/form";

type LocationRow = {
  id: string;
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  active: number;
  vehicleCount: number;
  instructorCount: number;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const orgId = tenant.organization.id;
  const rows = await context.cloudflare.env.DB.prepare(
    `SELECT l.id, l.name, l.addressLine1, l.addressLine2, l.city, l.region,
            l.postalCode, l.active,
            (SELECT COUNT(*) FROM vehicle    WHERE locationId     = l.id) AS vehicleCount,
            (SELECT COUNT(*) FROM instructor WHERE homeLocationId = l.id) AS instructorCount
       FROM location l
      WHERE l.organizationId = ?
      ORDER BY l.active DESC, l.name`,
  )
    .bind(orgId)
    .all<LocationRow>();
  return { locations: rows.results };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const env = context.cloudflare.env;
  const orgId = tenant.organization.id;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "create");

  if (intent === "create") {
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return data({ error: "Name is required." }, { status: 400 });
    const id = newId();
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO location
         (id, organizationId, name, addressLine1, addressLine2,
          city, region, postalCode, active, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    )
      .bind(
        id,
        orgId,
        name,
        String(formData.get("addressLine1") ?? "").trim() || null,
        String(formData.get("addressLine2") ?? "").trim() || null,
        String(formData.get("city") ?? "").trim() || null,
        String(formData.get("region") ?? "").trim().toUpperCase() || null,
        String(formData.get("postalCode") ?? "").trim() || null,
        now,
      )
      .run();
    await recordAudit(env, {
      organizationId: orgId,
      actorUserId: tenant.user.id,
      action: "location.created",
      entityType: "location",
      entityId: id,
      payload: { name },
    });
    return redirect("/admin/locations");
  }

  if (intent === "toggle") {
    const id = String(formData.get("locationId") ?? "");
    if (!id) return data({ error: "Missing location." }, { status: 400 });
    await env.DB.prepare(
      "UPDATE location SET active = 1 - active WHERE id = ? AND organizationId = ?",
    )
      .bind(id, orgId)
      .run();
    return redirect("/admin/locations");
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function AdminLocations({ loaderData, actionData }: Route.ComponentProps) {
  const { locations } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Fleet"
        title="Locations"
        description="Multi-location schools assign vehicles + instructors to a home location. Single-location schools can ignore this entirely — leave the table empty."
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      {locations.length === 0 ? (
        <EmptyState
          title="No locations yet"
          description="Add your first location below. You only need this if your school operates from more than one address."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white/70 dark:border-ink-800 dark:bg-ink-900/40">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-200 bg-ink-50/60 text-xs uppercase tracking-wider text-ink-500 dark:border-ink-800 dark:bg-ink-900/60 dark:text-ink-400">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Address</th>
                <th className="px-4 py-3 font-medium text-right">Vehicles</th>
                <th className="px-4 py-3 font-medium text-right">Instructors</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
              {locations.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-3 font-medium text-ink-900 dark:text-ink-50">
                    {l.name}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-600 dark:text-ink-300">
                    {[l.addressLine1, l.city, l.region, l.postalCode]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {l.vehicleCount}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {l.instructorCount}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        l.active
                          ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                          : "rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600 dark:bg-ink-800 dark:text-ink-200"
                      }
                    >
                      {l.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Form method="post">
                      <input type="hidden" name="intent" value="toggle" />
                      <input type="hidden" name="locationId" value={l.id} />
                      <button
                        type="submit"
                        className="text-xs text-brand-600 hover:underline dark:text-brand-300"
                      >
                        {l.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </Form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Card>
        <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Add a location
        </h3>
        <Form method="post" className="mt-4 grid gap-3 md:grid-cols-3">
          <input type="hidden" name="intent" value="create" />
          <Field label="Name">
            <TextInput name="name" type="text" required placeholder="Downtown campus" />
          </Field>
          <Field label="Address line 1">
            <TextInput name="addressLine1" type="text" placeholder="123 Main St" />
          </Field>
          <Field label="Address line 2">
            <TextInput name="addressLine2" type="text" placeholder="Suite 200" />
          </Field>
          <Field label="City">
            <TextInput name="city" type="text" />
          </Field>
          <Field label="State / region">
            <TextInput name="region" type="text" maxLength={2} placeholder="MN" />
          </Field>
          <Field label="Postal code">
            <TextInput name="postalCode" type="text" />
          </Field>
          <div className="md:col-span-3">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding…" : "Add location"}
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
}
