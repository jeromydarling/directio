import type { Route } from "./+types/admin.export[.csv]";
import { redirect } from "react-router";
import { requireTenant } from "~/lib/tenant.server";

/**
 * Symmetric exporter (spec #4). Returns a single CSV per entity kind,
 * selected by ?entity= query param. The exporter covers every entity
 * the importer touches, in the same column shape, so a school can
 * leave with their data intact — a trust signal at sales time and an
 * anti-lock-in hedge.
 *
 * Supported entities (per the import provenance migration 0022):
 *   students, guardians, enrollments, appointments, instructors,
 *   vehicles, payments
 */
const ENTITIES = new Set([
  "students",
  "guardians",
  "enrollments",
  "appointments",
  "instructors",
  "vehicles",
  "payments",
]);

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const db = context.cloudflare.env.DB;
  const orgId = tenant.organization.id;
  const url = new URL(request.url);
  const entity = url.searchParams.get("entity") ?? "students";
  if (!ENTITIES.has(entity)) {
    return new Response(`Unknown entity. Supported: ${[...ENTITIES].join(", ")}`, {
      status: 400,
    });
  }

  let header: string[] = [];
  let rows: string[][] = [];

  if (entity === "students") {
    header = [
      "id",
      "firstName",
      "lastName",
      "email",
      "phone",
      "dateOfBirth",
      "createdAt",
      "importSource",
      "importExternalId",
    ];
    const res = await db
      .prepare(
        `SELECT id, firstName, lastName, email, phone, dateOfBirth, createdAt,
                importSource, importExternalId
           FROM student WHERE organizationId = ? ORDER BY lastName, firstName`,
      )
      .bind(orgId)
      .all<Record<string, unknown>>();
    rows = res.results.map((r) =>
      header.map((k) => stringify(r[k], k === "createdAt")),
    );
  } else if (entity === "guardians") {
    header = [
      "id",
      "firstName",
      "lastName",
      "phone",
      "createdAt",
      "userId",
      "importSource",
      "importExternalId",
    ];
    const res = await db
      .prepare(
        `SELECT id, firstName, lastName, phone, createdAt, userId,
                importSource, importExternalId
           FROM guardian WHERE organizationId = ? ORDER BY lastName, firstName`,
      )
      .bind(orgId)
      .all<Record<string, unknown>>();
    rows = res.results.map((r) =>
      header.map((k) => stringify(r[k], k === "createdAt")),
    );
  } else if (entity === "enrollments") {
    header = [
      "id",
      "studentId",
      "programId",
      "programPackageId",
      "status",
      "journeyState",
      "priorHoursClassroom",
      "priorHoursBtw",
      "enrolledAt",
      "completedAt",
      "importSource",
      "importExternalId",
    ];
    const res = await db
      .prepare(
        `SELECT id, studentId, programId, programPackageId, status, journeyState,
                priorHoursClassroom, priorHoursBtw, enrolledAt, completedAt,
                importSource, importExternalId
           FROM enrollment WHERE organizationId = ? ORDER BY enrolledAt DESC`,
      )
      .bind(orgId)
      .all<Record<string, unknown>>();
    rows = res.results.map((r) =>
      header.map((k) =>
        stringify(
          r[k],
          k === "enrolledAt" || k === "completedAt",
        ),
      ),
    );
  } else if (entity === "appointments") {
    header = [
      "id",
      "enrollmentId",
      "instructorId",
      "vehicleId",
      "kind",
      "status",
      "startsAt",
      "endsAt",
      "locationLabel",
      "feeAssessedCents",
      "feeReason",
      "feeStatus",
      "externalInstructorName",
      "externalInstructorLicense",
      "importSource",
      "importExternalId",
    ];
    const res = await db
      .prepare(
        `SELECT id, enrollmentId, instructorId, vehicleId, kind, status,
                startsAt, endsAt, locationLabel,
                feeAssessedCents, feeReason, feeStatus,
                externalInstructorName, externalInstructorLicense,
                importSource, importExternalId
           FROM appointment WHERE organizationId = ? ORDER BY startsAt`,
      )
      .bind(orgId)
      .all<Record<string, unknown>>();
    rows = res.results.map((r) =>
      header.map((k) =>
        stringify(r[k], k === "startsAt" || k === "endsAt"),
      ),
    );
  } else if (entity === "instructors") {
    header = [
      "id",
      "firstName",
      "lastName",
      "email",
      "phone",
      "active",
      "createdAt",
      "importSource",
      "importExternalId",
    ];
    const res = await db
      .prepare(
        `SELECT id, firstName, lastName, email, phone, active, createdAt,
                importSource, importExternalId
           FROM instructor WHERE organizationId = ? ORDER BY lastName, firstName`,
      )
      .bind(orgId)
      .all<Record<string, unknown>>();
    rows = res.results.map((r) =>
      header.map((k) => stringify(r[k], k === "createdAt")),
    );
  } else if (entity === "vehicles") {
    header = [
      "id",
      "label",
      "makeModel",
      "year",
      "plate",
      "vin",
      "color",
      "fuelType",
      "currentOdometer",
      "status",
      "insuranceCarrier",
      "insurancePolicyNumber",
      "insuranceExpiresAt",
      "registrationNumber",
      "registrationExpiresAt",
      "importSource",
      "importExternalId",
    ];
    const res = await db
      .prepare(
        `SELECT id, label, makeModel, year, plate, vin, color, fuelType, currentOdometer,
                status, insuranceCarrier, insurancePolicyNumber, insuranceExpiresAt,
                registrationNumber, registrationExpiresAt,
                importSource, importExternalId
           FROM vehicle WHERE organizationId = ? ORDER BY label`,
      )
      .bind(orgId)
      .all<Record<string, unknown>>();
    rows = res.results.map((r) =>
      header.map((k) =>
        stringify(
          r[k],
          k === "insuranceExpiresAt" || k === "registrationExpiresAt",
        ),
      ),
    );
  } else if (entity === "payments") {
    header = [
      "id",
      "enrollmentId",
      "studentId",
      "kind",
      "status",
      "amountCents",
      "currency",
      "platformFeeCents",
      "schoolNetCents",
      "stripeChargeId",
      "descriptionSnapshot",
      "createdAt",
      "importSource",
      "importExternalId",
    ];
    const res = await db
      .prepare(
        `SELECT id, enrollmentId, studentId, kind, status, amountCents, currency,
                platformFeeCents, schoolNetCents, stripeChargeId, descriptionSnapshot,
                createdAt, importSource, importExternalId
           FROM payment WHERE organizationId = ? ORDER BY createdAt`,
      )
      .bind(orgId)
      .all<Record<string, unknown>>();
    rows = res.results.map((r) =>
      header.map((k) => stringify(r[k], k === "createdAt")),
    );
  }

  const csv = toCsv([header, ...rows]);
  const fileName = `directio-${entity}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

function stringify(v: unknown, isEpochMs: boolean): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {
    if (isEpochMs && v > 1_000_000_000_000) return new Date(v).toISOString();
    return String(v);
  }
  return String(v);
}

function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escape).join(",")).join("\r\n") + "\r\n";
}

function escape(cell: string): string {
  if (cell === "") return "";
  if (/[",\r\n]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
  return cell;
}
