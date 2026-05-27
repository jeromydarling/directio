import { Form, Link, data, redirect, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/admin.library.media";
import { requireTenant } from "~/lib/tenant.server";
import { recordAudit } from "~/lib/audit.server";
import { deleteSchoolLessonAsset } from "~/lib/curriculum.server";
import { PageHeader, Card, EmptyState, Button, LinkButton } from "~/components/ui";
import { FormError } from "~/components/form";

type AssetRow = {
  id: string;
  kind: string;
  url: string;
  caption: string | null;
  metadata: string | null;
  createdAt: number;
  lessonId: string;
  lessonTitle: string;
  moduleTitle: string;
  packName: string;
  installId: string;
  lessonPublished: number;
};

type Summary = {
  total: number;
  youtube: number;
  image: number;
  pdf: number;
  link: number;
  totalBytes: number;
};

const KIND_LABEL: Record<string, string> = {
  youtube: "Videos",
  image: "Images",
  pdf: "PDFs",
  link: "Links",
};

const KIND_FILTER_ORDER = ["all", "youtube", "image", "pdf", "link"] as const;
type KindFilter = (typeof KIND_FILTER_ORDER)[number];

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const url = new URL(request.url);
  const kindRaw = url.searchParams.get("kind") ?? "all";
  const kind: KindFilter = (KIND_FILTER_ORDER as readonly string[]).includes(kindRaw)
    ? (kindRaw as KindFilter)
    : "all";

  const kindClause = kind === "all" ? "" : " AND sla.kind = ?";
  const params: unknown[] = [tenant.organization.id];
  if (kind !== "all") params.push(kind);

  const rows = await context.cloudflare.env.DB.prepare(
    `SELECT sla.id, sla.kind, sla.url, sla.caption, sla.metadata, sla.createdAt,
            sl.id AS lessonId, sl.title AS lessonTitle, sl.published AS lessonPublished,
            sm.title AS moduleTitle,
            cp.name AS packName,
            sc.schoolPackInstallId AS installId
       FROM school_lesson_asset sla
       JOIN school_lesson sl ON sl.id = sla.schoolLessonId
       JOIN school_module sm ON sm.id = sl.schoolModuleId
       JOIN school_course sc ON sc.id = sm.schoolCourseId
       JOIN school_pack_install spi ON spi.id = sc.schoolPackInstallId
       JOIN content_pack_version cpv ON cpv.id = spi.contentPackVersionId
       JOIN content_pack cp ON cp.id = cpv.contentPackId
       WHERE sla.organizationId = ?${kindClause}
       ORDER BY sla.createdAt DESC
       LIMIT 500`,
  )
    .bind(...params)
    .all<AssetRow>();

  // Independent summary so the count badges stay accurate across filters.
  const summaryRows = await context.cloudflare.env.DB.prepare(
    "SELECT kind, COUNT(*) AS n, COALESCE(SUM(json_extract(metadata, '$.sizeBytes')), 0) AS bytes FROM school_lesson_asset WHERE organizationId = ? GROUP BY kind",
  )
    .bind(tenant.organization.id)
    .all<{ kind: string; n: number; bytes: number }>();
  const summary: Summary = { total: 0, youtube: 0, image: 0, pdf: 0, link: 0, totalBytes: 0 };
  for (const r of summaryRows.results) {
    summary.total += r.n;
    summary.totalBytes += r.bytes ?? 0;
    if (r.kind === "youtube") summary.youtube = r.n;
    else if (r.kind === "image") summary.image = r.n;
    else if (r.kind === "pdf") summary.pdf = r.n;
    else if (r.kind === "link") summary.link = r.n;
  }

  return { assets: rows.results, summary, activeKind: kind };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  if (intent === "delete-asset") {
    const assetId = String(formData.get("assetId") ?? "");
    if (!assetId) return data({ error: "Asset missing." }, { status: 400 });
    await deleteSchoolLessonAsset(env, {
      organizationId: tenant.organization.id,
      assetId,
    });
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "lesson_asset.deleted",
      entityType: "school_lesson_asset",
      entityId: assetId,
      payload: { from: "media-library" },
    });
    const back = String(formData.get("returnTo") ?? "/admin/library/media");
    return redirect(back);
  }
  return data({ error: "Unknown action." }, { status: 400 });
}

export default function MediaLibrary({ loaderData, actionData }: Route.ComponentProps) {
  const { assets, summary, activeKind } = loaderData;
  const [params] = useSearchParams();
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  const returnTo = `/admin/library/media${params.toString() ? `?${params.toString()}` : ""}`;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Media library"
        title="All your media"
        description="Every video, image, and PDF you've added to a lesson. Use this view to audit, reuse, or clean up assets across your school's curriculum."
        actions={
          <LinkButton to="/admin/library" variant="ghost">
            ← All packs
          </LinkButton>
        }
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      <section className="grid gap-4 md:grid-cols-5">
        <SummaryCard label="Total" value={summary.total} hint="assets across all lessons" highlight />
        <SummaryCard label="Videos" value={summary.youtube} hint="YouTube embeds" />
        <SummaryCard label="Images" value={summary.image} hint="uploaded inline" />
        <SummaryCard label="PDFs" value={summary.pdf} hint="embedded + downloadable" />
        <SummaryCard
          label="Storage"
          value={formatBytes(summary.totalBytes)}
          hint="uploaded files in R2"
        />
      </section>

      <nav className="flex flex-wrap items-center gap-2 border-b border-ink-200/60 pb-3 dark:border-ink-800/60">
        {KIND_FILTER_ORDER.map((k) => {
          const isActive = activeKind === k;
          const href = k === "all" ? "/admin/library/media" : `/admin/library/media?kind=${k}`;
          const label =
            k === "all"
              ? `All (${summary.total})`
              : `${KIND_LABEL[k] ?? k} (${summary[k as keyof Summary] ?? 0})`;
          return (
            <Link
              key={k}
              to={href}
              className={[
                "rounded-full px-3 py-1.5 text-sm font-medium transition",
                isActive
                  ? "bg-ink-900 text-ink-50 dark:bg-ink-50 dark:text-ink-900"
                  : "bg-ink-100 text-ink-700 hover:bg-ink-200 dark:bg-ink-900/40 dark:text-ink-200 dark:hover:bg-ink-800/60",
              ].join(" ")}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {assets.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          description="When you add videos, images, or PDFs to lessons, they'll appear here."
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {assets.map((a) => (
            <AssetCard
              key={a.id}
              asset={a}
              submitting={submitting}
              returnTo={returnTo}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: number | string;
  hint: string;
  highlight?: boolean;
}) {
  return (
    <Card
      className={
        highlight ? "border-brand-300 bg-brand-50/40 dark:border-brand-700 dark:bg-brand-950/20" : ""
      }
    >
      <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
        {value}
      </p>
      <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{hint}</p>
    </Card>
  );
}

function AssetCard({
  asset: a,
  submitting,
  returnTo,
}: {
  asset: AssetRow;
  submitting: boolean;
  returnTo: string;
}) {
  const meta = a.metadata ? safeJsonParse(a.metadata) : null;
  const videoId =
    a.kind === "youtube" && meta && typeof meta.videoId === "string" ? meta.videoId : null;
  const sizeBytes =
    meta && typeof meta.sizeBytes === "number" ? (meta.sizeBytes as number) : null;
  const lessonHref = `/admin/library/installed/${a.installId}/lessons/${a.lessonId}`;

  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white/70 dark:border-ink-800 dark:bg-ink-900/40">
      <div className="aspect-video w-full overflow-hidden bg-ink-100 dark:bg-ink-800/50">
        {videoId ? (
          <img
            src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`}
            alt={a.caption ?? "Video thumbnail"}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : a.kind === "image" ? (
          <img
            src={a.url}
            alt={a.caption ?? "Image"}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-ink-400 dark:text-ink-500">
            <span className="font-display text-4xl">
              {a.kind === "pdf" ? "PDF" : a.kind.toUpperCase()}
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs uppercase tracking-wider text-brand-600 dark:text-brand-300">
            {a.kind}
          </span>
          <span className="text-xs text-ink-500 dark:text-ink-400">
            {new Date(a.createdAt).toLocaleDateString()}
          </span>
        </div>
        <p className="text-sm font-medium text-ink-900 dark:text-ink-50 line-clamp-2">
          {a.caption || a.url.split("/").pop() || a.url}
        </p>
        <Link
          to={lessonHref}
          className="text-xs text-ink-500 transition hover:text-brand-600 dark:text-ink-400 dark:hover:text-brand-300"
        >
          {a.lessonTitle} <span className="text-ink-400 dark:text-ink-500">· {a.moduleTitle}</span>
          {a.lessonPublished ? (
            <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-medium text-brand-700 dark:bg-brand-900/60 dark:text-brand-200">
              live
            </span>
          ) : null}
        </Link>
        {sizeBytes !== null && (
          <p className="text-xs text-ink-500 dark:text-ink-400">{formatBytes(sizeBytes)}</p>
        )}
        <div className="mt-auto flex items-center justify-between pt-3 border-t border-ink-200/60 dark:border-ink-800/60">
          <Link
            to={lessonHref}
            className="text-sm font-medium text-brand-600 hover:text-brand-500 dark:text-brand-300"
          >
            Open lesson →
          </Link>
          <Form method="post">
            <input type="hidden" name="intent" value="delete-asset" />
            <input type="hidden" name="assetId" value={a.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <Button type="submit" variant="ghost" disabled={submitting}>
              Delete
            </Button>
          </Form>
        </div>
      </div>
    </li>
  );
}

function safeJsonParse(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}
