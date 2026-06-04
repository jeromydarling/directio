import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.import.fleet";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { recordAudit } from "~/lib/audit.server";
import { parseCsv } from "~/lib/csv";
import { parseDateInput } from "~/lib/vehicles";
import { PageHeader, Card, Button, LinkButton } from "~/components/ui";
import { Field, FormError, TextArea } from "~/components/form";

type PreviewRow = {
  label: string;
  makeModel: string | null;
  year: number | null;
  plate: string | null;
  vin: string | null;
  color: string | null;
  fuelType: string | null;
  currentOdometer: number | null;
  insuranceCarrier: string | null;
  insurancePolicyNumber: string | null;
  insuranceExpiresAt: number | null;
  registrationNumber: string | null;
  registrationExpiresAt: number | null;
};

const HEADER_HEURISTICS: Array<{ field: keyof PreviewRow; patterns: RegExp[] }> = [
  { field: "label", patterns: [/^label$/i, /^name$/i, /^car$/i, /^unit$/i] },
  { field: "makeModel", patterns: [/make.*model/i, /^model$/i, /^vehicle$/i] },
  { field: "year", patterns: [/year/i] },
  { field: "plate", patterns: [/plate/i, /^tag$/i] },
  { field: "vin", patterns: [/^vin$/i] },
  { field: "color", patterns: [/color/i, /colour/i] },
  { field: "fuelType", patterns: [/fuel/i] },
  { field: "currentOdometer", patterns: [/odom/i, /mile/i] },
  { field: "insuranceCarrier", patterns: [/insurance.*carrier/i, /^carrier$/i] },
  { field: "insurancePolicyNumber", patterns: [/insurance.*policy/i, /^policy$/i] },
  {
    field: "insuranceExpiresAt",
    patterns: [/insurance.*expir/i, /policy.*expir/i],
  },
  { field: "registrationNumber", patterns: [/registration.*(no|num|#)/i, /^reg(istration)?$/i] },
  {
    field: "registrationExpiresAt",
    patterns: [/registration.*expir/i, /reg.*expir/i],
  },
];

function guessMapping(headers: string[]): Record<string, keyof PreviewRow> {
  const out: Record<string, keyof PreviewRow> = {};
  for (const h of headers) {
    const m = HEADER_HEURISTICS.find((m) => m.patterns.some((p) => p.test(h.trim())));
    if (m) out[h.trim()] = m.field;
  }
  return out;
}

function mapRows(
  headers: string[],
  rows: string[][],
  mapping: Record<string, keyof PreviewRow>,
): PreviewRow[] {
  return rows.map((row) => {
    const r: PreviewRow = {
      label: "",
      makeModel: null,
      year: null,
      plate: null,
      vin: null,
      color: null,
      fuelType: null,
      currentOdometer: null,
      insuranceCarrier: null,
      insurancePolicyNumber: null,
      insuranceExpiresAt: null,
      registrationNumber: null,
      registrationExpiresAt: null,
    };
    headers.forEach((h, i) => {
      const field = mapping[h.trim()];
      if (!field) return;
      const v = (row[i] ?? "").trim();
      if (!v) return;
      switch (field) {
        case "label":
        case "makeModel":
        case "plate":
        case "vin":
        case "color":
        case "fuelType":
        case "insuranceCarrier":
        case "insurancePolicyNumber":
        case "registrationNumber":
          r[field] = v;
          break;
        case "year": {
          const n = Number.parseInt(v, 10);
          r.year = Number.isFinite(n) && n > 1900 && n < 2100 ? n : null;
          break;
        }
        case "currentOdometer": {
          const n = Number.parseInt(v.replace(/[^0-9]/g, ""), 10);
          r.currentOdometer = Number.isFinite(n) ? n : null;
          break;
        }
        case "insuranceExpiresAt":
          r.insuranceExpiresAt = parseDateInput(v);
          break;
        case "registrationExpiresAt":
          r.registrationExpiresAt = parseDateInput(v);
          break;
      }
    });
    return r;
  });
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  return {};
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const env = context.cloudflare.env;
  const orgId = tenant.organization.id;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const now = Date.now();

  if (intent === "commit") {
    const csvText = String(formData.get("csvText") ?? "");
    if (!csvText.trim())
      return data({ error: "Paste a CSV with a header row + at least one row." }, { status: 400 });
    const parsed = parseCsv(csvText);
    if (parsed.length < 2)
      return data({ error: "Need a header row + one data row." }, { status: 400 });
    const headers = parsed[0];
    const mapping = guessMapping(headers);
    const rows = mapRows(headers, parsed.slice(1), mapping).filter((r) => r.label);
    if (rows.length === 0) {
      return data(
        { error: "No rows with a recognizable label found. Check your header mapping." },
        { status: 400 },
      );
    }

    let inserted = 0;
    let skipped = 0;
    const batchId = newId();
    for (const r of rows) {
      const externalId = r.vin || r.plate || r.label;
      const existing = await env.DB.prepare(
        `SELECT id FROM vehicle
          WHERE organizationId = ? AND importSource = ? AND importExternalId = ?`,
      )
        .bind(orgId, "csv-import", externalId)
        .first<{ id: string }>();
      if (existing) {
        skipped++;
        continue;
      }
      await env.DB.prepare(
        `INSERT INTO vehicle
           (id, organizationId, label, makeModel, year, plate, active, createdAt,
            status, vin, color, fuelType, currentOdometer,
            insuranceCarrier, insurancePolicyNumber, insuranceExpiresAt,
            registrationNumber, registrationExpiresAt,
            importSource, importExternalId, importBatchId)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          newId(),
          orgId,
          r.label,
          r.makeModel,
          r.year,
          r.plate,
          now,
          r.vin,
          r.color,
          r.fuelType,
          r.currentOdometer,
          r.insuranceCarrier,
          r.insurancePolicyNumber,
          r.insuranceExpiresAt,
          r.registrationNumber,
          r.registrationExpiresAt,
          "csv-import",
          externalId,
          batchId,
        )
        .run();
      inserted++;
    }
    await recordAudit(env, {
      organizationId: orgId,
      actorUserId: tenant.user.id,
      action: "vehicle.imported_csv",
      entityType: "import_batch",
      entityId: batchId,
      payload: { inserted, skipped },
    });
    return redirect(`/admin/vehicles?imported=${inserted}`);
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function ImportFleet({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Import · fleet"
        title="Bring your vehicles over"
        description="Paste a CSV with one row per vehicle. Recognized headers: label, makeModel, year, plate, vin, color, fuel, odometer, insurance carrier/policy/expiry, registration number/expiry. Dates accept YYYY-MM-DD. Re-running skips rows with the same VIN/plate/label."
        actions={
          <LinkButton to="/admin/vehicles" variant="ghost">
            ← Fleet
          </LinkButton>
        }
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      <Card>
        <Form method="post" className="flex flex-col gap-3">
          <input type="hidden" name="intent" value="commit" />
          <Field label="CSV (paste rows here)">
            <TextArea
              name="csvText"
              required
              className="min-h-[14rem] font-mono text-xs"
              placeholder={"label,makeModel,year,plate,vin,insuranceExpiresAt,registrationExpiresAt\nCar 1,Honda Civic,2022,ABC-1234,1HGCM82633A123456,2026-09-01,2026-04-15"}
            />
          </Field>
          <div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Importing…" : "Import"}
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
}
