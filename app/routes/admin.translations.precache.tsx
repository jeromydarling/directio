import { data } from "react-router";
import type { Route } from "./+types/admin.translations.precache";
import { requireTenant } from "~/lib/tenant.server";
import { recordAudit } from "~/lib/audit.server";
import {
  TranslationVendorError,
  translateLesson,
  type TranslationTier,
} from "~/lib/translation.server";
import { LANG_LABELS } from "~/lib/lang-labels";
import { PageHeader, Card, Button } from "~/components/ui";

/**
 * Pre-cache translations for this org's published lessons into the
 * top languages the platform's student body uses. One round of work
 * (≤ MAX_PER_REQUEST translations) runs per click — keeps each
 * request under Workers' CPU limits and lets the operator drive
 * progress without a job queue.
 *
 * The shared lesson_translation cache is content-addressed, so any
 * translation cached here is instantly available to every other
 * school whose lesson content hashes to the same value (i.e. the
 * pristine, unedited national-teen-core install).
 *
 * Standard tier only — premium DeepL stays opt-in.
 */

const PRECACHE_LANGS = ["es", "vi", "zh", "ko", "so", "hmn"] as const;
const MAX_PER_REQUEST = 4;

type LessonRow = {
  schoolLessonId: string;
  title: string;
  hasCacheRow: number;
};

type CombinedRow = {
  schoolLessonId: string;
  title: string;
  targetLang: string;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const tenant = await requireTenant(request, env);
  if (
    tenant.role !== "owner" &&
    tenant.role !== "admin" &&
    !tenant.organization.isDemo
  ) {
    throw new Response("Forbidden", { status: 403 });
  }

  const todo = await listUncachedPairs(env, tenant.organization.id);
  const totalPairs = await countAllPairs(env, tenant.organization.id);

  return {
    organizationName: tenant.organization.name,
    remaining: todo.length,
    total: totalPairs,
    done: totalPairs - todo.length,
    nextBatch: todo.slice(0, MAX_PER_REQUEST),
    languages: PRECACHE_LANGS,
    batchSize: MAX_PER_REQUEST,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const tenant = await requireTenant(request, env);
  if (
    tenant.role !== "owner" &&
    tenant.role !== "admin" &&
    !tenant.organization.isDemo
  ) {
    return data({ error: "Forbidden" }, { status: 403 });
  }

  const todo = await listUncachedPairs(env, tenant.organization.id);
  const batch = todo.slice(0, MAX_PER_REQUEST);

  const results: Array<{
    schoolLessonId: string;
    targetLang: string;
    title: string;
    status: "ok" | "error";
    detail?: string;
    ms?: number;
  }> = [];

  for (const pair of batch) {
    const start = Date.now();
    try {
      const tier: TranslationTier = "standard";
      await translateLesson(env, {
        organizationId: tenant.organization.id,
        schoolLessonId: pair.schoolLessonId,
        targetLang: pair.targetLang,
        requestedByUserId: tenant.user.id,
        tier,
      });
      results.push({
        schoolLessonId: pair.schoolLessonId,
        targetLang: pair.targetLang,
        title: pair.title,
        status: "ok",
        ms: Date.now() - start,
      });
    } catch (err) {
      const detail =
        err instanceof TranslationVendorError
          ? err.message
          : err instanceof Error
            ? err.message
            : "unknown";
      results.push({
        schoolLessonId: pair.schoolLessonId,
        targetLang: pair.targetLang,
        title: pair.title,
        status: "error",
        detail,
        ms: Date.now() - start,
      });
    }
  }

  await recordAudit(env, {
    organizationId: tenant.organization.id,
    actorUserId: tenant.user.id,
    action: "translation.precache_batch",
    entityType: "organization",
    entityId: tenant.organization.id,
    payload: {
      attempted: batch.length,
      ok: results.filter((r) => r.status === "ok").length,
      errors: results.filter((r) => r.status === "error").length,
    },
  });

  return data({ ok: true, results });
}

async function listUncachedPairs(
  env: Env,
  organizationId: string,
): Promise<CombinedRow[]> {
  const lessons = await env.DB.prepare(
    `SELECT sl.id AS schoolLessonId, sl.title
       FROM school_lesson sl
      WHERE sl.organizationId = ? AND sl.published = 1
      ORDER BY sl.title`,
  )
    .bind(organizationId)
    .all<LessonRow>();

  const pairs: CombinedRow[] = [];
  for (const lesson of lessons.results) {
    for (const lang of PRECACHE_LANGS) {
      // Skip if there's already a linked translation for this lesson/lang
      // (cache hit will be free regardless, but no need to recompute).
      const existing = await env.DB.prepare(
        `SELECT slt.id
           FROM school_lesson_translation slt
           JOIN lesson_translation lt ON lt.id = slt.translationId
          WHERE slt.schoolLessonId = ?
            AND lt.targetLang = ?
            AND lt.vendor = 'llama'
            AND lt.invalidatedAt IS NULL
          LIMIT 1`,
      )
        .bind(lesson.schoolLessonId, lang)
        .first<{ id: string }>();
      if (existing) continue;
      pairs.push({
        schoolLessonId: lesson.schoolLessonId,
        title: lesson.title,
        targetLang: lang,
      });
    }
  }
  return pairs;
}

async function countAllPairs(env: Env, organizationId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n
       FROM school_lesson sl
      WHERE sl.organizationId = ? AND sl.published = 1`,
  )
    .bind(organizationId)
    .first<{ n: number }>();
  const lessonCount = row?.n ?? 0;
  return lessonCount * PRECACHE_LANGS.length;
}

export default function PrecacheTranslations({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { organizationName, remaining, total, done, nextBatch, languages, batchSize } =
    loaderData;
  const pctDone = total > 0 ? Math.round((done / total) * 100) : 100;
  const results = actionData && "results" in actionData ? actionData.results : null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Translation pre-cache"
        title="Warm the platform translation cache"
        description={`Pre-translates this school's lessons into ${languages.length} priority languages (Spanish, Vietnamese, Chinese, Korean, Somali, Hmong) using Workers AI Llama. Every translation cached here is instantly free for every other school whose lesson content matches.`}
      />

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
              Progress for {organizationName}
            </p>
            <p className="mt-1 font-display text-3xl font-semibold text-ink-900 dark:text-ink-50">
              {done.toLocaleString()} / {total.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
              {pctDone}% cached · {remaining.toLocaleString()} lesson×language pairs to go
            </p>
          </div>
          <form method="post">
            <Button type="submit" disabled={remaining === 0}>
              {remaining === 0
                ? "Fully cached"
                : `Run next batch (up to ${batchSize})`}
            </Button>
          </form>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink-200/60 dark:bg-ink-800">
          <div
            className="h-full bg-gradient-to-r from-brand-500 to-accent-500 transition-[width]"
            style={{ width: `${pctDone}%` }}
          />
        </div>
      </Card>

      {results && results.length > 0 && (
        <Card>
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
            Last batch
          </p>
          <ul className="flex flex-col gap-1.5 text-sm">
            {results.map((r, i) => (
              <li
                key={i}
                className={
                  r.status === "ok"
                    ? "text-ink-700 dark:text-ink-200"
                    : "text-rose-700 dark:text-rose-300"
                }
              >
                <span className="font-mono text-xs opacity-60">
                  {r.status === "ok" ? "✓" : "✗"} {(r.ms ?? 0).toString().padStart(5)}ms
                </span>{" "}
                <strong>{LANG_LABELS[r.targetLang]?.english ?? r.targetLang}</strong>
                {" · "}
                {r.title}
                {r.detail ? <span className="ml-2 text-xs opacity-70">— {r.detail}</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {remaining > 0 && nextBatch.length > 0 && (
        <Card>
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
            Next batch
          </p>
          <ul className="flex flex-col gap-1.5 text-sm text-ink-600 dark:text-ink-300">
            {nextBatch.map((p, i) => (
              <li key={i}>
                <span className="opacity-60">·</span>{" "}
                <strong>{LANG_LABELS[p.targetLang]?.english ?? p.targetLang}</strong>
                {" · "}
                {p.title}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
