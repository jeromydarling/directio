import { useOutletContext } from "react-router";
import type { Route } from "./+types/admin.settings";
import type { ActiveTenant } from "~/lib/tenant.server";
import { requireTenant } from "~/lib/tenant.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireTenant(request, context.cloudflare.env);
  return null;
}

export default function AdminSettings() {
  const { tenant } = useOutletContext<{ tenant: ActiveTenant }>();
  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm font-medium uppercase tracking-wider text-brand-600 dark:text-brand-300">
          Settings
        </p>
        <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
          {tenant.organization.name}
        </h1>
      </header>

      <dl className="grid gap-6 rounded-2xl border border-ink-200 bg-white/70 p-6 dark:border-ink-800 dark:bg-ink-900/40 md:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Slug
          </dt>
          <dd className="mt-1 font-mono text-sm text-ink-900 dark:text-ink-50">
            {tenant.organization.slug}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Your role
          </dt>
          <dd className="mt-1 text-sm capitalize text-ink-900 dark:text-ink-50">{tenant.role}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Brand color
          </dt>
          <dd className="mt-1 flex items-center gap-2 text-sm text-ink-900 dark:text-ink-50">
            <span
              className="inline-block h-4 w-4 rounded-full border border-ink-200 dark:border-ink-700"
              style={{ background: tenant.organization.brandColor ?? "transparent" }}
            />
            {tenant.organization.brandColor ?? "default"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">Logo</dt>
          <dd className="mt-1 text-sm text-ink-900 dark:text-ink-50">
            {tenant.organization.logo ?? "—"}
          </dd>
        </div>
      </dl>

      <p className="text-sm text-ink-500 dark:text-ink-400">
        Editable branding, fees, messaging templates, and rule-pack overrides land in a later
        step.
      </p>
    </div>
  );
}
