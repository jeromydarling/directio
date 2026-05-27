import { Link } from "react-router";
import type { Route } from "./+types/admin.programs";
import { requireTenant } from "~/lib/tenant.server";
import { PageHeader, EmptyState, LinkButton } from "~/components/ui";

const KIND_LABEL: Record<string, string> = {
  teen: "Teen",
  adult: "Adult",
  refresher: "Refresher",
  road_test_prep: "Road test prep",
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const rows = await context.cloudflare.env.DB.prepare(
    `SELECT p.id, p.name, p.kind, p.active,
            (SELECT COUNT(*) FROM programPackage pp WHERE pp.programId = p.id) AS packageCount
       FROM program p
       WHERE p.organizationId = ?
       ORDER BY p.name`,
  )
    .bind(tenant.organization.id)
    .all<{ id: string; name: string; kind: string; active: number; packageCount: number }>();
  return { programs: rows.results };
}

export default function AdminPrograms({ loaderData }: Route.ComponentProps) {
  const { programs } = loaderData;
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Programs"
        title={programs.length === 0 ? "No programs yet" : `${programs.length} programs`}
        description="Programs are the things you sell — Teen, Adult Refresher, Road Test Prep. Each program can have one or more pricing packages."
        actions={<LinkButton to="/admin/programs/new">Add program</LinkButton>}
      />

      {programs.length === 0 ? (
        <EmptyState
          title="Add your first program"
          description="Define what your school sells. You can configure pricing packages, fees, and lesson counts inside each program."
          action={<LinkButton to="/admin/programs/new">Add program</LinkButton>}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {programs.map((p) => (
            <li key={p.id}>
              <Link
                to={`/admin/programs/${p.id}`}
                className="block rounded-2xl border border-ink-200 bg-white/70 p-5 transition hover:border-brand-300 hover:shadow-sm dark:border-ink-800 dark:bg-ink-900/40 dark:hover:border-brand-700"
              >
                <p className="text-xs uppercase tracking-wider text-brand-600 dark:text-brand-300">
                  {KIND_LABEL[p.kind] ?? p.kind}
                </p>
                <p className="mt-1 text-lg font-semibold text-ink-900 dark:text-ink-50">{p.name}</p>
                <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                  {p.packageCount} package{p.packageCount === 1 ? "" : "s"} ·{" "}
                  {p.active ? "Active" : "Inactive"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
