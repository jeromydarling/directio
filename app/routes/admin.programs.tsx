import type { Route } from "./+types/admin.programs";
import { requireTenant } from "~/lib/tenant.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const rows = await context.cloudflare.env.DB.prepare(
    "SELECT id, name, kind, active FROM program WHERE organizationId = ? ORDER BY name",
  )
    .bind(tenant.organization.id)
    .all<{ id: string; name: string; kind: string; active: number }>();
  return { programs: rows.results };
}

export default function AdminPrograms({ loaderData }: Route.ComponentProps) {
  const { programs } = loaderData;
  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm font-medium uppercase tracking-wider text-brand-600 dark:text-brand-300">
          Programs
        </p>
        <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
          {programs.length === 0 ? "No programs yet" : `${programs.length} programs`}
        </h1>
      </header>

      {programs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-white/40 p-12 text-center dark:border-ink-800 dark:bg-ink-900/30">
          <p className="font-display text-lg text-ink-700 dark:text-ink-200">
            Define a program to start selling enrollments.
          </p>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            Programs and packages come from your jurisdiction's rule pack plus your overrides.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {programs.map((p) => (
            <li
              key={p.id}
              className="rounded-2xl border border-ink-200 bg-white/70 p-5 dark:border-ink-800 dark:bg-ink-900/40"
            >
              <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
                {p.kind}
              </p>
              <p className="mt-1 text-lg font-semibold text-ink-900 dark:text-ink-50">{p.name}</p>
              <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                {p.active ? "Active" : "Inactive"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
