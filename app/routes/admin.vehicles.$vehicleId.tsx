import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.vehicles.$vehicleId";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { recordAudit } from "~/lib/audit.server";
import {
  VEHICLE_STATUSES,
  checkVehicleCompliance,
  formatDateInput,
  parseDateInput,
  type VehicleStatus,
} from "~/lib/vehicles";
import { PageHeader, Card, Button, EmptyState, LinkButton } from "~/components/ui";
import { Field, FormError, Select, TextInput } from "~/components/form";

type VehicleRow = {
  id: string;
  label: string;
  makeModel: string | null;
  year: number | null;
  plate: string | null;
  vin: string | null;
  color: string | null;
  fuelType: string | null;
  dualControls: number;
  currentOdometer: number | null;
  quirks: string | null;
  status: string;
  photoKey: string | null;
  insuranceCarrier: string | null;
  insurancePolicyNumber: string | null;
  insuranceExpiresAt: number | null;
  registrationNumber: string | null;
  registrationExpiresAt: number | null;
  nextOilChangeMiles: number | null;
  nextTireRotationMiles: number | null;
  nextSafetyInspectionAt: number | null;
  retiredAt: number | null;
  createdAt: number;
};

type ShiftRow = {
  id: string;
  instructorId: string;
  instructorFirst: string;
  instructorLast: string;
  startedAt: number;
  endedAt: number | null;
  startOdometer: number;
  endOdometer: number | null;
  startFuelLevel: string | null;
  endFuelLevel: string | null;
  flaggedIssue: string | null;
};

type MaintRow = {
  id: string;
  kind: string;
  performedAt: number;
  odometerAt: number | null;
  costCents: number | null;
  vendor: string | null;
  notes: string | null;
};

const MAINT_KINDS = [
  { value: "oil_change", label: "Oil change" },
  { value: "tire_rotation", label: "Tire rotation" },
  { value: "safety_inspection", label: "Safety inspection" },
  { value: "repair", label: "Repair" },
  { value: "other", label: "Other" },
];

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const db = context.cloudflare.env.DB;
  const orgId = tenant.organization.id;

  const vehicle = await db
    .prepare(
      `SELECT id, label, makeModel, year, plate, vin, color, fuelType,
              dualControls, currentOdometer, quirks, status, photoKey,
              insuranceCarrier, insurancePolicyNumber, insuranceExpiresAt,
              registrationNumber, registrationExpiresAt,
              nextOilChangeMiles, nextTireRotationMiles, nextSafetyInspectionAt,
              retiredAt, createdAt
         FROM vehicle
        WHERE id = ? AND organizationId = ?`,
    )
    .bind(params.vehicleId, orgId)
    .first<VehicleRow>();
  if (!vehicle) throw new Response("Vehicle not found", { status: 404 });

  const [shifts, maintenance] = await Promise.all([
    db
      .prepare(
        `SELECT vs.id, vs.instructorId, vs.startedAt, vs.endedAt,
                vs.startOdometer, vs.endOdometer, vs.startFuelLevel, vs.endFuelLevel,
                vs.flaggedIssue,
                i.firstName AS instructorFirst, i.lastName AS instructorLast
           FROM vehicle_shift vs
           JOIN instructor i ON i.id = vs.instructorId
          WHERE vs.vehicleId = ? AND vs.organizationId = ?
          ORDER BY vs.startedAt DESC
          LIMIT 25`,
      )
      .bind(params.vehicleId, orgId)
      .all<ShiftRow>(),
    db
      .prepare(
        `SELECT id, kind, performedAt, odometerAt, costCents, vendor, notes
           FROM vehicle_maintenance_event
          WHERE vehicleId = ? AND organizationId = ?
          ORDER BY performedAt DESC
          LIMIT 25`,
      )
      .bind(params.vehicleId, orgId)
      .all<MaintRow>(),
  ]);

  const compliance = checkVehicleCompliance(vehicle);
  return {
    vehicle,
    compliance,
    shifts: shifts.results,
    maintenance: maintenance.results,
  };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const env = context.cloudflare.env;
  const orgId = tenant.organization.id;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const now = Date.now();

  if (intent === "save") {
    const label = String(formData.get("label") ?? "").trim();
    if (!label) return data({ error: "Label is required." }, { status: 400 });
    const makeModel = String(formData.get("makeModel") ?? "").trim() || null;
    const yearStr = String(formData.get("year") ?? "").trim();
    const year = yearStr ? Number.parseInt(yearStr, 10) : null;
    const plate = String(formData.get("plate") ?? "").trim() || null;
    const vin = String(formData.get("vin") ?? "").trim() || null;
    const color = String(formData.get("color") ?? "").trim() || null;
    const fuelType = String(formData.get("fuelType") ?? "").trim() || null;
    const dualControls = formData.get("dualControls") === "off" ? 0 : 1;
    const statusRaw = String(formData.get("status") ?? "active") as VehicleStatus;
    const status = VEHICLE_STATUSES.some((s) => s.value === statusRaw)
      ? statusRaw
      : "active";
    const retiredAt =
      status === "retired" ? now : null; // setting retired stamps it; un-retire clears
    const odoStr = String(formData.get("currentOdometer") ?? "").trim();
    const currentOdometer = odoStr ? Number.parseInt(odoStr, 10) : null;
    const quirks = String(formData.get("quirks") ?? "").trim() || null;
    const insuranceCarrier =
      String(formData.get("insuranceCarrier") ?? "").trim() || null;
    const insurancePolicyNumber =
      String(formData.get("insurancePolicyNumber") ?? "").trim() || null;
    const insuranceExpiresAt = parseDateInput(
      String(formData.get("insuranceExpiresAt") ?? ""),
    );
    const registrationNumber =
      String(formData.get("registrationNumber") ?? "").trim() || null;
    const registrationExpiresAt = parseDateInput(
      String(formData.get("registrationExpiresAt") ?? ""),
    );
    const nextSafetyInspectionAt = parseDateInput(
      String(formData.get("nextSafetyInspectionAt") ?? ""),
    );
    const nextOilStr = String(formData.get("nextOilChangeMiles") ?? "").trim();
    const nextOilChangeMiles = nextOilStr ? Number.parseInt(nextOilStr, 10) : null;
    const nextTireStr = String(formData.get("nextTireRotationMiles") ?? "").trim();
    const nextTireRotationMiles = nextTireStr
      ? Number.parseInt(nextTireStr, 10)
      : null;

    await env.DB.prepare(
      `UPDATE vehicle SET
         label = ?, makeModel = ?, year = ?, plate = ?, vin = ?, color = ?,
         fuelType = ?, dualControls = ?, status = ?, retiredAt = ?,
         currentOdometer = ?, quirks = ?,
         insuranceCarrier = ?, insurancePolicyNumber = ?, insuranceExpiresAt = ?,
         registrationNumber = ?, registrationExpiresAt = ?,
         nextSafetyInspectionAt = ?,
         nextOilChangeMiles = ?, nextTireRotationMiles = ?
       WHERE id = ? AND organizationId = ?`,
    )
      .bind(
        label,
        makeModel,
        year,
        plate,
        vin,
        color,
        fuelType,
        dualControls,
        status,
        retiredAt,
        currentOdometer,
        quirks,
        insuranceCarrier,
        insurancePolicyNumber,
        insuranceExpiresAt,
        registrationNumber,
        registrationExpiresAt,
        nextSafetyInspectionAt,
        nextOilChangeMiles,
        nextTireRotationMiles,
        params.vehicleId,
        orgId,
      )
      .run();
    await recordAudit(env, {
      organizationId: orgId,
      actorUserId: tenant.user.id,
      action: "vehicle.updated",
      entityType: "vehicle",
      entityId: params.vehicleId,
      payload: { label, status },
    });
    return redirect(`/admin/vehicles/${params.vehicleId}`);
  }

  if (intent === "log_maintenance") {
    const kind = String(formData.get("kind") ?? "other");
    if (!MAINT_KINDS.some((k) => k.value === kind)) {
      return data({ error: "Pick a maintenance kind." }, { status: 400 });
    }
    const performedAtRaw = String(formData.get("performedAt") ?? "");
    const performedAt = parseDateInput(performedAtRaw) ?? now;
    const odoStr = String(formData.get("odometerAt") ?? "").trim();
    const odometerAt = odoStr ? Number.parseInt(odoStr, 10) : null;
    const costStr = String(formData.get("costDollars") ?? "").trim();
    const costCents = costStr ? Math.round(Number.parseFloat(costStr) * 100) : null;
    const vendor = String(formData.get("vendor") ?? "").trim() || null;
    const notes = String(formData.get("notes") ?? "").trim() || null;

    const eventId = newId();
    await env.DB.prepare(
      `INSERT INTO vehicle_maintenance_event
         (id, organizationId, vehicleId, kind, performedAt, odometerAt,
          costCents, vendor, notes, loggedByUserId, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        eventId,
        orgId,
        params.vehicleId,
        kind,
        performedAt,
        odometerAt,
        costCents,
        vendor,
        notes,
        tenant.user.id,
        now,
      )
      .run();

    // Bump the corresponding threshold forward by a sensible interval so
    // the auto-blocker stays accurate. Defaults: oil 5k mi, tire 7.5k mi,
    // safety inspection +1 year. Admin can override on the edit form.
    if (kind === "oil_change" && odometerAt !== null) {
      await env.DB.prepare(
        "UPDATE vehicle SET nextOilChangeMiles = ? WHERE id = ? AND organizationId = ?",
      )
        .bind(odometerAt + 5000, params.vehicleId, orgId)
        .run();
    } else if (kind === "tire_rotation" && odometerAt !== null) {
      await env.DB.prepare(
        "UPDATE vehicle SET nextTireRotationMiles = ? WHERE id = ? AND organizationId = ?",
      )
        .bind(odometerAt + 7500, params.vehicleId, orgId)
        .run();
    } else if (kind === "safety_inspection") {
      const oneYearMs = 365 * 24 * 60 * 60 * 1000;
      await env.DB.prepare(
        "UPDATE vehicle SET nextSafetyInspectionAt = ? WHERE id = ? AND organizationId = ?",
      )
        .bind(performedAt + oneYearMs, params.vehicleId, orgId)
        .run();
    }

    await recordAudit(env, {
      organizationId: orgId,
      actorUserId: tenant.user.id,
      action: "vehicle.maintenance_logged",
      entityType: "vehicle",
      entityId: params.vehicleId,
      payload: { kind, costCents, vendor: vendor ? "[present]" : null },
    });
    return redirect(`/admin/vehicles/${params.vehicleId}`);
  }

  if (intent === "upload_photo") {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return data({ error: "Pick a photo to upload." }, { status: 400 });
    }
    const MAX = 5 * 1024 * 1024;
    if (file.size > MAX) {
      return data({ error: "Photo too large (max 5 MB)." }, { status: 413 });
    }
    if (!file.type.startsWith("image/")) {
      return data({ error: "Photos must be an image file." }, { status: 400 });
    }
    const storageKey = `vehicles/${orgId}/${params.vehicleId}/photo-${newId()}`;
    await env.ASSETS.put(storageKey, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });
    // Delete the previous photo if any.
    const prev = await env.DB.prepare(
      "SELECT photoKey FROM vehicle WHERE id = ? AND organizationId = ?",
    )
      .bind(params.vehicleId, orgId)
      .first<{ photoKey: string | null }>();
    if (prev?.photoKey) {
      await env.ASSETS.delete(prev.photoKey);
    }
    await env.DB.prepare(
      "UPDATE vehicle SET photoKey = ? WHERE id = ? AND organizationId = ?",
    )
      .bind(storageKey, params.vehicleId, orgId)
      .run();
    await recordAudit(env, {
      organizationId: orgId,
      actorUserId: tenant.user.id,
      action: "vehicle.photo_uploaded",
      entityType: "vehicle",
      entityId: params.vehicleId,
      payload: { sizeBytes: file.size, contentType: file.type },
    });
    return redirect(`/admin/vehicles/${params.vehicleId}`);
  }

  if (intent === "set_status") {
    const statusRaw = String(formData.get("status") ?? "") as VehicleStatus;
    if (!VEHICLE_STATUSES.some((s) => s.value === statusRaw)) {
      return data({ error: "Invalid status." }, { status: 400 });
    }
    const retiredAt = statusRaw === "retired" ? now : null;
    await env.DB.prepare(
      "UPDATE vehicle SET status = ?, retiredAt = ? WHERE id = ? AND organizationId = ?",
    )
      .bind(statusRaw, retiredAt, params.vehicleId, orgId)
      .run();
    await recordAudit(env, {
      organizationId: orgId,
      actorUserId: tenant.user.id,
      action: "vehicle.status_changed",
      entityType: "vehicle",
      entityId: params.vehicleId,
      payload: { status: statusRaw },
    });
    return redirect(`/admin/vehicles/${params.vehicleId}`);
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function VehicleDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { vehicle, compliance, shifts, maintenance } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Fleet"
        title={vehicle.label}
        description={
          [vehicle.makeModel, vehicle.year, vehicle.color]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        actions={
          <LinkButton to="/admin/vehicles" variant="ghost">
            ← All vehicles
          </LinkButton>
        }
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      <ComplianceBanner compliance={compliance} />

      <QuickStatus vehicle={vehicle} submitting={submitting} />

      <PhotoPanel vehicle={vehicle} submitting={submitting} />

      <Card>
        <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
          Identity, compliance, maintenance
        </h2>
        <Form method="post" className="mt-4 grid gap-4 md:grid-cols-3">
          <input type="hidden" name="intent" value="save" />

          <SectionTitle>Identity</SectionTitle>
          <Field label="Label">
            <TextInput name="label" type="text" required defaultValue={vehicle.label} />
          </Field>
          <Field label="Make / Model">
            <TextInput
              name="makeModel"
              type="text"
              defaultValue={vehicle.makeModel ?? ""}
            />
          </Field>
          <Field label="Year">
            <TextInput
              name="year"
              type="number"
              min="1990"
              max="2100"
              defaultValue={vehicle.year?.toString() ?? ""}
            />
          </Field>
          <Field label="Color">
            <TextInput
              name="color"
              type="text"
              defaultValue={vehicle.color ?? ""}
            />
          </Field>
          <Field label="License plate">
            <TextInput
              name="plate"
              type="text"
              defaultValue={vehicle.plate ?? ""}
            />
          </Field>
          <Field label="VIN">
            <TextInput
              name="vin"
              type="text"
              defaultValue={vehicle.vin ?? ""}
            />
          </Field>
          <Field label="Fuel type">
            <Select name="fuelType" defaultValue={vehicle.fuelType ?? ""}>
              <option value="">—</option>
              <option value="gas">Gas</option>
              <option value="diesel">Diesel</option>
              <option value="hybrid">Hybrid</option>
              <option value="ev">EV</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={vehicle.status}>
              {VEHICLE_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Dual controls">
            <Select name="dualControls" defaultValue={vehicle.dualControls ? "on" : "off"}>
              <option value="on">Yes</option>
              <option value="off">No</option>
            </Select>
          </Field>

          <SectionTitle>Insurance &amp; registration</SectionTitle>
          <Field label="Insurance carrier">
            <TextInput
              name="insuranceCarrier"
              type="text"
              defaultValue={vehicle.insuranceCarrier ?? ""}
            />
          </Field>
          <Field label="Insurance policy #">
            <TextInput
              name="insurancePolicyNumber"
              type="text"
              defaultValue={vehicle.insurancePolicyNumber ?? ""}
            />
          </Field>
          <Field label="Insurance expires">
            <TextInput
              name="insuranceExpiresAt"
              type="date"
              defaultValue={formatDateInput(vehicle.insuranceExpiresAt)}
            />
          </Field>
          <Field label="Registration #">
            <TextInput
              name="registrationNumber"
              type="text"
              defaultValue={vehicle.registrationNumber ?? ""}
            />
          </Field>
          <Field label="Registration expires">
            <TextInput
              name="registrationExpiresAt"
              type="date"
              defaultValue={formatDateInput(vehicle.registrationExpiresAt)}
            />
          </Field>
          <Field label="Next safety inspection">
            <TextInput
              name="nextSafetyInspectionAt"
              type="date"
              defaultValue={formatDateInput(vehicle.nextSafetyInspectionAt)}
            />
          </Field>

          <SectionTitle>Maintenance thresholds</SectionTitle>
          <Field label="Current odometer (mi)">
            <TextInput
              name="currentOdometer"
              type="number"
              min="0"
              defaultValue={vehicle.currentOdometer?.toString() ?? ""}
            />
          </Field>
          <Field label="Next oil change at (mi)">
            <TextInput
              name="nextOilChangeMiles"
              type="number"
              min="0"
              defaultValue={vehicle.nextOilChangeMiles?.toString() ?? ""}
            />
          </Field>
          <Field label="Next tire rotation at (mi)">
            <TextInput
              name="nextTireRotationMiles"
              type="number"
              min="0"
              defaultValue={vehicle.nextTireRotationMiles?.toString() ?? ""}
            />
          </Field>

          <SectionTitle>Notes</SectionTitle>
          <Field label="Quirks" hint="Anything an instructor should know.">
            <TextInput
              name="quirks"
              type="text"
              defaultValue={vehicle.quirks ?? ""}
            />
          </Field>

          <div className="md:col-span-3">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </Form>
      </Card>

      <Card>
        <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
          Log maintenance event
        </h2>
        <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
          Logging an event automatically advances the relevant maintenance
          threshold (oil change +5k mi, tire rotation +7.5k mi, safety
          inspection +1 year).
        </p>
        <Form method="post" className="mt-3 grid gap-3 md:grid-cols-3">
          <input type="hidden" name="intent" value="log_maintenance" />
          <Field label="Kind">
            <Select name="kind" defaultValue="oil_change">
              {MAINT_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Performed on">
            <TextInput
              name="performedAt"
              type="date"
              defaultValue={formatDateInput(Date.now())}
            />
          </Field>
          <Field label="Odometer at service (mi)">
            <TextInput
              name="odometerAt"
              type="number"
              min="0"
              defaultValue={vehicle.currentOdometer?.toString() ?? ""}
            />
          </Field>
          <Field label="Cost (USD)">
            <TextInput name="costDollars" type="number" step="0.01" min="0" />
          </Field>
          <Field label="Vendor">
            <TextInput name="vendor" type="text" placeholder="Joe's Garage" />
          </Field>
          <Field label="Notes">
            <TextInput name="notes" type="text" placeholder="Full synthetic; tires looked good" />
          </Field>
          <div className="md:col-span-3">
            <Button type="submit" variant="secondary" disabled={submitting}>
              Log event
            </Button>
          </div>
        </Form>
        {maintenance.length === 0 ? (
          <p className="mt-4 text-sm text-ink-500 dark:text-ink-400">
            No maintenance events logged yet.
          </p>
        ) : (
          <table className="mt-4 w-full text-left text-sm">
            <thead className="border-b border-ink-200 text-xs uppercase tracking-wider text-ink-500 dark:border-ink-800 dark:text-ink-400">
              <tr>
                <th className="py-2 pr-3 font-medium">Kind</th>
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Odometer</th>
                <th className="py-2 pr-3 font-medium">Cost</th>
                <th className="py-2 pr-3 font-medium">Vendor</th>
                <th className="py-2 pr-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
              {maintenance.map((m) => (
                <tr key={m.id}>
                  <td className="py-2 pr-3 text-ink-700 dark:text-ink-200">
                    {MAINT_KINDS.find((k) => k.value === m.kind)?.label ?? m.kind}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    {new Date(m.performedAt).toLocaleDateString()}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    {m.odometerAt?.toLocaleString() ?? "—"}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    {m.costCents !== null ? formatMoney(m.costCents) : "—"}
                  </td>
                  <td className="py-2 pr-3 text-ink-600 dark:text-ink-300">
                    {m.vendor ?? "—"}
                  </td>
                  <td className="py-2 pr-3 text-xs text-ink-500 dark:text-ink-400">
                    {m.notes ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
          Recent shifts
        </h2>
        {shifts.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500 dark:text-ink-400">
            No shifts recorded yet. Shifts are created when an instructor
            checks the vehicle out at the start of their day.
          </p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead className="border-b border-ink-200 text-xs uppercase tracking-wider text-ink-500 dark:border-ink-800 dark:text-ink-400">
              <tr>
                <th className="py-2 pr-3 font-medium">Instructor</th>
                <th className="py-2 pr-3 font-medium">Start</th>
                <th className="py-2 pr-3 font-medium">End</th>
                <th className="py-2 pr-3 font-medium">Start mi</th>
                <th className="py-2 pr-3 font-medium">End mi</th>
                <th className="py-2 pr-3 font-medium">Miles</th>
                <th className="py-2 pr-3 font-medium">Issue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
              {shifts.map((s) => (
                <tr key={s.id}>
                  <td className="py-2 pr-3 text-ink-700 dark:text-ink-200">
                    {s.instructorFirst} {s.instructorLast}
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {new Date(s.startedAt).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {s.endedAt
                      ? new Date(s.endedAt).toLocaleString()
                      : (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                            open
                          </span>
                        )}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    {s.startOdometer.toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    {s.endOdometer !== null ? s.endOdometer.toLocaleString() : "—"}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    {s.endOdometer !== null
                      ? (s.endOdometer - s.startOdometer).toLocaleString()
                      : "—"}
                  </td>
                  <td className="py-2 pr-3 text-xs text-rose-700 dark:text-rose-300">
                    {s.flaggedIssue ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function ComplianceBanner({ compliance }: { compliance: ReturnType<typeof checkVehicleCompliance> }) {
  if (compliance.state === "ok") {
    return (
      <div className="rounded-xl border border-emerald-300 bg-emerald-50/30 px-4 py-2 text-sm text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/20 dark:text-emerald-100">
        ✓ Compliance clean. Vehicle is bookable.
      </div>
    );
  }
  const cls =
    compliance.state === "blocked"
      ? "border-rose-300 bg-rose-50/30 text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/20 dark:text-rose-100"
      : "border-amber-300 bg-amber-50/30 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-100";
  return (
    <div className={`rounded-xl border px-4 py-3 ${cls}`}>
      <p className="text-sm font-semibold">
        {compliance.state === "blocked"
          ? "Auto-removed from scheduling"
          : "Action needed soon"}
      </p>
      <ul className="mt-2 space-y-0.5 text-xs">
        {compliance.blockers.map((b) => (
          <li key={b}>⛔ {b}</li>
        ))}
        {compliance.warnings.map((w) => (
          <li key={w}>⚠ {w}</li>
        ))}
      </ul>
    </div>
  );
}

function PhotoPanel({
  vehicle,
  submitting,
}: {
  vehicle: VehicleRow;
  submitting: boolean;
}) {
  return (
    <Card>
      <div className="flex flex-wrap gap-4">
        {vehicle.photoKey ? (
          <img
            src={`/admin/vehicles/${vehicle.id}/photo.jpg`}
            alt={`${vehicle.label} photo`}
            className="h-32 w-48 rounded-xl object-cover ring-1 ring-ink-200 dark:ring-ink-700"
          />
        ) : (
          <div className="flex h-32 w-48 items-center justify-center rounded-xl border border-dashed border-ink-300 text-xs text-ink-500 dark:border-ink-700 dark:text-ink-400">
            No photo yet
          </div>
        )}
        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
            Photo
          </p>
          <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
            Helps instructors and students recognize the car at pickup. Max 5 MB,
            any image format.
          </p>
          <Form
            method="post"
            encType="multipart/form-data"
            className="mt-2 flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="intent" value="upload_photo" />
            <input
              type="file"
              name="file"
              accept="image/*"
              required
              className="block text-sm text-ink-700 file:mr-3 file:rounded-full file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-brand-500 dark:text-ink-200"
            />
            <Button type="submit" variant="secondary" disabled={submitting}>
              {vehicle.photoKey ? "Replace photo" : "Upload photo"}
            </Button>
          </Form>
        </div>
      </div>
    </Card>
  );
}

function QuickStatus({
  vehicle,
  submitting,
}: {
  vehicle: VehicleRow;
  submitting: boolean;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-ink-500 dark:text-ink-400">
            Current status
          </p>
          <p className="mt-1 font-display text-lg font-semibold text-ink-900 dark:text-ink-50">
            {VEHICLE_STATUSES.find((s) => s.value === vehicle.status)?.label ??
              vehicle.status}
            {vehicle.currentOdometer !== null && (
              <span className="ml-3 text-sm font-normal text-ink-500 dark:text-ink-400">
                {vehicle.currentOdometer.toLocaleString()} mi
              </span>
            )}
          </p>
        </div>
        <Form method="post" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="intent" value="set_status" />
          <label className="flex flex-col gap-1 text-xs text-ink-500 dark:text-ink-400">
            Set status
            <Select name="status" defaultValue={vehicle.status}>
              {VEHICLE_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </label>
          <Button type="submit" variant="secondary" disabled={submitting}>
            Update
          </Button>
        </Form>
      </div>
    </Card>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="md:col-span-3 border-b border-ink-200 pb-2 text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:border-ink-800 dark:text-ink-400">
      {children}
    </p>
  );
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
