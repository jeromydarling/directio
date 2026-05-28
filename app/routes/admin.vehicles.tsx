import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.vehicles";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { PageHeader, Card, EmptyState, Button } from "~/components/ui";
import { Field, FormError, TextInput, Select } from "~/components/form";
import {
  VEHICLE_STATUSES,
  checkVehicleCompliance,
  parseDateInput,
  formatDateInput,
  type VehicleStatus,
} from "~/lib/vehicles";

type Row = {
  id: string;
  label: string;
  makeModel: string | null;
  year: number | null;
  plate: string | null;
  active: number;
  status: string;
  vin: string | null;
  color: string | null;
  fuelType: string | null;
  dualControls: number;
  currentOdometer: number | null;
  quirks: string | null;
  insuranceCarrier: string | null;
  insurancePolicyNumber: string | null;
  insuranceExpiresAt: number | null;
  registrationNumber: string | null;
  registrationExpiresAt: number | null;
  nextOilChangeMiles: number | null;
  nextTireRotationMiles: number | null;
  nextSafetyInspectionAt: number | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const rows = await context.cloudflare.env.DB.prepare(
    `SELECT
       id, label, makeModel, year, plate, active, status, vin, color, fuelType,
       dualControls, currentOdometer, quirks,
       insuranceCarrier, insurancePolicyNumber, insuranceExpiresAt,
       registrationNumber, registrationExpiresAt,
       nextOilChangeMiles, nextTireRotationMiles, nextSafetyInspectionAt
     FROM vehicle
     WHERE organizationId = ?
     ORDER BY (status = 'retired'), label`,
  )
    .bind(tenant.organization.id)
    .all<Row>();
  const now = Date.now();
  const vehicles = rows.results.map((v) => ({
    ...v,
    compliance: checkVehicleCompliance(v, now),
  }));
  return { vehicles };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const formData = await request.formData();
  const label = String(formData.get("label") ?? "").trim();
  const makeModel = String(formData.get("makeModel") ?? "").trim() || null;
  const yearStr = String(formData.get("year") ?? "").trim();
  const year = yearStr ? parseInt(yearStr, 10) : null;
  const plate = String(formData.get("plate") ?? "").trim() || null;
  const vin = String(formData.get("vin") ?? "").trim() || null;
  const color = String(formData.get("color") ?? "").trim() || null;
  const fuelType = String(formData.get("fuelType") ?? "").trim() || null;
  const dualControls = formData.get("dualControls") === "off" ? 0 : 1;
  const statusRaw = String(formData.get("status") ?? "active") as VehicleStatus;
  const status = VEHICLE_STATUSES.some((s) => s.value === statusRaw)
    ? statusRaw
    : "active";
  const odoStr = String(formData.get("currentOdometer") ?? "").trim();
  const currentOdometer = odoStr ? parseInt(odoStr, 10) : null;
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

  if (!label) return data({ error: "Label is required." }, { status: 400 });
  if (year !== null && (!Number.isFinite(year) || year < 1900 || year > 2100))
    return data({ error: "Year must be reasonable." }, { status: 400 });
  if (
    currentOdometer !== null &&
    (!Number.isFinite(currentOdometer) || currentOdometer < 0)
  )
    return data({ error: "Odometer must be a non-negative number." }, { status: 400 });

  await context.cloudflare.env.DB.prepare(
    `INSERT INTO vehicle (
       id, organizationId, label, makeModel, year, plate, active, createdAt,
       status, vin, color, fuelType, dualControls, currentOdometer, quirks,
       insuranceCarrier, insurancePolicyNumber, insuranceExpiresAt,
       registrationNumber, registrationExpiresAt, nextSafetyInspectionAt
     ) VALUES (
       ?, ?, ?, ?, ?, ?, 1, ?,
       ?, ?, ?, ?, ?, ?, ?,
       ?, ?, ?,
       ?, ?, ?
     )`,
  )
    .bind(
      newId(),
      tenant.organization.id,
      label,
      makeModel,
      year,
      plate,
      Date.now(),
      status,
      vin,
      color,
      fuelType,
      dualControls,
      currentOdometer,
      quirks,
      insuranceCarrier,
      insurancePolicyNumber,
      insuranceExpiresAt,
      registrationNumber,
      registrationExpiresAt,
      nextSafetyInspectionAt,
    )
    .run();

  return redirect("/admin/vehicles");
}

export default function AdminVehicles({ loaderData, actionData }: Route.ComponentProps) {
  const { vehicles } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  const blockedCount = vehicles.filter((v) => v.compliance.state === "blocked").length;
  const warningCount = vehicles.filter((v) => v.compliance.state === "warning").length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Fleet"
        title={vehicles.length === 0 ? "No vehicles yet" : `${vehicles.length} vehicles`}
        description="Insurance, registration, and maintenance keep your cars on the schedule. Anything expired auto-removes the vehicle from booking until you resolve it."
      />

      {(blockedCount > 0 || warningCount > 0) && (
        <div className="flex flex-wrap gap-2">
          {blockedCount > 0 && (
            <span className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-800 dark:bg-rose-900/40 dark:text-rose-200">
              <span className="h-2 w-2 rounded-full bg-rose-500" /> {blockedCount} blocked from scheduling
            </span>
          )}
          {warningCount > 0 && (
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> {warningCount} expiring soon
            </span>
          )}
        </div>
      )}

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
                <th className="px-4 py-3 font-medium">Vehicle</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Compliance</th>
                <th className="px-4 py-3 font-medium">Odometer</th>
                <th className="px-4 py-3 font-medium">Plate / VIN</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr
                  key={v.id}
                  className="border-b border-ink-200/60 align-top last:border-0 dark:border-ink-800/60"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink-900 dark:text-ink-50">{v.label}</p>
                    {v.makeModel && (
                      <p className="text-xs text-ink-600 dark:text-ink-300">
                        {v.makeModel}
                        {v.year ? ` · ${v.year}` : ""}
                        {v.color ? ` · ${v.color}` : ""}
                      </p>
                    )}
                    {v.fuelType && (
                      <p className="text-[10px] uppercase tracking-wider text-ink-400">
                        {v.fuelType}
                        {v.dualControls ? " · dual-controls" : " · no dual-controls"}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={v.status} />
                  </td>
                  <td className="px-4 py-3">
                    <CompliancePill state={v.compliance.state} />
                    {(v.compliance.blockers.length > 0 ||
                      v.compliance.warnings.length > 0) && (
                      <ul className="mt-1.5 space-y-0.5 text-xs">
                        {v.compliance.blockers.map((b) => (
                          <li key={b} className="text-rose-700 dark:text-rose-300">
                            ⛔ {b}
                          </li>
                        ))}
                        {v.compliance.warnings.map((w) => (
                          <li key={w} className="text-amber-700 dark:text-amber-300">
                            ⚠ {w}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-600 tabular-nums dark:text-ink-300">
                    {v.currentOdometer === null
                      ? "—"
                      : `${v.currentOdometer.toLocaleString()} mi`}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-600 dark:text-ink-300">
                    {v.plate ?? "—"}
                    {v.vin && (
                      <>
                        <br />
                        <span className="text-[10px] text-ink-400">{v.vin}</span>
                      </>
                    )}
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
        <Form method="post" className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="md:col-span-3">
            <SectionTitle>Identity</SectionTitle>
          </div>
          <Field label="Label">
            <TextInput name="label" type="text" required placeholder="Car 1" />
          </Field>
          <Field label="Make / Model">
            <TextInput name="makeModel" type="text" placeholder="Honda Civic" />
          </Field>
          <Field label="Year">
            <TextInput name="year" type="number" min="1990" max="2100" placeholder="2022" />
          </Field>
          <Field label="Color">
            <TextInput name="color" type="text" placeholder="Silver" />
          </Field>
          <Field label="License plate">
            <TextInput name="plate" type="text" placeholder="ABC-1234" />
          </Field>
          <Field label="VIN">
            <TextInput name="vin" type="text" placeholder="17-character VIN" />
          </Field>
          <Field label="Fuel type">
            <Select name="fuelType" defaultValue="">
              <option value="">—</option>
              <option value="gas">Gas</option>
              <option value="diesel">Diesel</option>
              <option value="hybrid">Hybrid</option>
              <option value="ev">EV</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue="active">
              {VEHICLE_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Dual controls">
            <Select name="dualControls" defaultValue="on">
              <option value="on">Yes</option>
              <option value="off">No</option>
            </Select>
          </Field>

          <div className="md:col-span-3">
            <SectionTitle>Insurance & registration</SectionTitle>
          </div>
          <Field label="Insurance carrier">
            <TextInput name="insuranceCarrier" type="text" placeholder="Geico" />
          </Field>
          <Field label="Insurance policy #">
            <TextInput name="insurancePolicyNumber" type="text" />
          </Field>
          <Field label="Insurance expires">
            <TextInput name="insuranceExpiresAt" type="date" />
          </Field>
          <Field label="Registration #">
            <TextInput name="registrationNumber" type="text" />
          </Field>
          <Field label="Registration expires">
            <TextInput name="registrationExpiresAt" type="date" />
          </Field>
          <Field label="Next safety inspection">
            <TextInput name="nextSafetyInspectionAt" type="date" />
          </Field>

          <div className="md:col-span-3">
            <SectionTitle>Maintenance</SectionTitle>
          </div>
          <Field label="Current odometer (mi)">
            <TextInput
              name="currentOdometer"
              type="number"
              min="0"
              placeholder="42500"
            />
          </Field>
          <Field
            label="Quirks"
            hint="Anything an instructor should know about this car (sticky window, touchy brakes…)."
          >
            <TextInput name="quirks" type="text" placeholder="Passenger window sticky" />
          </Field>

          <div className="md:col-span-3">
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-b border-ink-200 pb-2 text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:border-ink-800 dark:text-ink-400">
      {children}
    </p>
  );
}

function StatusPill({ status }: { status: string }) {
  const meta = VEHICLE_STATUSES.find((s) => s.value === status);
  const label = meta?.label ?? status;
  const cls =
    status === "active"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
      : status === "in_service"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
        : status === "out_of_service"
          ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200"
          : "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function CompliancePill({ state }: { state: "ok" | "warning" | "blocked" }) {
  const map = {
    ok: {
      cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
      label: "Clean",
    },
    warning: {
      cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
      label: "Watch",
    },
    blocked: {
      cls: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
      label: "Blocked",
    },
  } as const;
  const { cls, label } = map[state];
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}
