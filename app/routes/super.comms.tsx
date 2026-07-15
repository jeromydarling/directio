import { Form, Link } from "react-router";
import type { Route } from "./+types/super.comms";
import { requirePlatformAdmin } from "~/lib/super.server";
import { likePattern } from "~/lib/super-shared";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Communications · super · directio" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  await requirePlatformAdmin(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const kind = url.searchParams.get("kind") ?? "";

  const filters: string[] = [];
  const params: (string | number)[] = [];
  if (q) {
    filters.push(
      "(c.subject LIKE ? ESCAPE '\\' OR c.body LIKE ? ESCAPE '\\' OR o.name LIKE ? ESCAPE '\\')",
    );
    params.push(likePattern(q), likePattern(q), likePattern(q));
  }
  if (kind) {
    filters.push("c.kind = ?");
    params.push(kind);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const rows = await env.DB.prepare(
    `SELECT c.id, c.kind, c.direction, c.subject, c.body, c.actorName, c.toEmail, c.occurredAt,
            o.id AS organizationId, o.name AS orgName
       FROM crm_communication c JOIN organization o ON o.id = c.organizationId
       ${where}
       ORDER BY c.occurredAt DESC
       LIMIT 200`,
  )
    .bind(...params)
    .all<{
      id: string;
      kind: string;
      direction: string;
      subject: string | null;
      body: string;
      actorName: string | null;
      toEmail: string | null;
      occurredAt: number;
      organizationId: string;
      orgName: string;
    }>();

  return { rows: rows.results, filters: { q, kind } };
}

export default function SuperComms({ loaderData }: Route.ComponentProps) {
  const { rows, filters } = loaderData;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
          Communications
        </h1>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
          Search across every touch logged from /super — emails sent, calls,
          meetings, notes.
        </p>
      </div>

      <Form
        method="get"
        className="grid gap-3 rounded-2xl border border-ink-200 bg-white p-4 sm:grid-cols-3 dark:border-ink-800 dark:bg-ink-900"
      >
        <input
          type="text"
          name="q"
          defaultValue={filters.q}
          placeholder="Search subject, body, or org"
          className="rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm sm:col-span-2 dark:border-ink-700 dark:bg-ink-950"
        />
        <select
          name="kind"
          defaultValue={filters.kind}
          className="rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-950"
        >
          <option value="">Any kind</option>
          <option value="email">Email</option>
          <option value="call">Call</option>
          <option value="meeting">Meeting</option>
          <option value="note">Note</option>
        </select>
        <button
          type="submit"
          className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white sm:col-span-3 sm:w-max dark:bg-ink-50 dark:text-ink-900"
        >
          Search
        </button>
      </Form>

      <div className="rounded-2xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
        <ul className="divide-y divide-ink-200 dark:divide-ink-800">
          {rows.map((c) => (
            <li key={c.id} className="p-4 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <Link
                    to={`/super/orgs/${c.organizationId}`}
                    className="font-medium text-ink-900 hover:underline dark:text-ink-50"
                  >
                    {c.orgName}
                  </Link>
                  <span className="ml-3 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] uppercase tracking-widest text-ink-500 dark:bg-ink-800 dark:text-ink-400">
                    {c.kind}
                  </span>
                </div>
                <span className="text-xs text-ink-400">
                  {new Date(c.occurredAt).toISOString().replace("T", " ").slice(0, 16)}
                </span>
              </div>
              {c.subject && (
                <p className="mt-1 font-medium text-ink-800 dark:text-ink-100">
                  {c.subject}
                </p>
              )}
              <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-ink-600 dark:text-ink-300">
                {c.body}
              </p>
              <p className="mt-1 text-xs text-ink-400">
                {c.actorName ?? "?"}
                {c.toEmail ? ` → ${c.toEmail}` : ""}
              </p>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="p-8 text-center text-sm text-ink-400">
              Nothing to show.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
