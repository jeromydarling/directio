import { Form, Link, data, useNavigation, useSearchParams } from "react-router";
import { marked } from "marked";
import type { Route } from "./+types/me.help";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import {
  ClaudeNotConfiguredError,
  answerHelpQuestion,
  isClaudeConfigured,
} from "~/lib/claude.server";
import { PageHeader, Card, EmptyState, Button } from "~/components/ui";
import { Field, FormError, TextInput } from "~/components/form";

type ArticleSource = "school" | "platform";

type ArticleRow = {
  id: string;
  source: ArticleSource;
  slug: string;
  category: string;
  title: string;
  body: string;
  ordinal: number;
};

const CATEGORY_ORDER: Array<{ key: string; label: string; intro: string }> = [
  { key: "getting_started", label: "Getting started", intro: "Sign-in, finding your kid, account basics." },
  { key: "permit", label: "Permit & Blue Card", intro: "How and when your child gets their permit." },
  { key: "scheduling", label: "Scheduling lessons", intro: "Booking, confirming, cancelling, no-shows." },
  { key: "payments", label: "Payments & refunds", intro: "First payment, installments, refunds." },
  { key: "behind_the_wheel", label: "Behind the wheel", intro: "BTW lessons + finding a testing center." },
  { key: "road_test", label: "Road test & license", intro: "What the test covers, what you bring." },
  { key: "troubleshooting", label: "Something feels wrong", intro: "Who to ask when you're stuck." },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;

  const url = new URL(request.url);
  const search = (url.searchParams.get("q") ?? "").trim();

  // Pull platform articles for parent audience + the school's overrides.
  // The org's jurisdiction (if any) narrows state-specific articles in.
  const orgJur = await db
    .prepare("SELECT jurisdiction FROM organization WHERE id = ?")
    .bind(tenant.organization.id)
    .first<{ jurisdiction: string | null }>();
  const jurisdiction = orgJur?.jurisdiction ?? null;

  const platformArticles = await db
    .prepare(
      `SELECT id, slug, category, title, body, ordinal
         FROM help_article
         WHERE audience = 'parent'
           AND (jurisdiction IS NULL OR jurisdiction = ?)
         ORDER BY category, ordinal, title`,
    )
    .bind(jurisdiction)
    .all<Omit<ArticleRow, "source">>();

  const schoolArticles = await db
    .prepare(
      `SELECT id, slug, category, title, body, ordinal
         FROM school_help_article
         WHERE organizationId = ? AND audience = 'parent' AND published = 1
         ORDER BY category, ordinal, title`,
    )
    .bind(tenant.organization.id)
    .all<Omit<ArticleRow, "source">>();

  // Merge with school override priority. Map by slug so a school
  // override replaces a platform article one-for-one.
  const merged = new Map<string, ArticleRow>();
  for (const a of platformArticles.results) {
    merged.set(a.slug, { ...a, source: "platform" });
  }
  for (const a of schoolArticles.results) {
    merged.set(a.slug, { ...a, source: "school" });
  }
  const articles = [...merged.values()];

  // Simple search across title + body.
  const filtered = search
    ? articles.filter(
        (a) =>
          a.title.toLowerCase().includes(search.toLowerCase()) ||
          a.body.toLowerCase().includes(search.toLowerCase()),
      )
    : articles;

  const recent = await db
    .prepare(
      `SELECT id, question, answer, matchedArticleId, matchedSource, helpful, createdAt
         FROM help_query
         WHERE organizationId = ? AND userId = ?
         ORDER BY createdAt DESC LIMIT 8`,
    )
    .bind(tenant.organization.id, tenant.user.id)
    .all<{
      id: string;
      question: string;
      answer: string | null;
      matchedArticleId: string | null;
      matchedSource: string | null;
      helpful: number | null;
      createdAt: number;
    }>();

  return {
    articles: filtered,
    grouped: groupBy(filtered, (a) => a.category),
    search,
    recent: recent.results,
    organizationName: tenant.organization.name,
    claudeConfigured: isClaudeConfigured(context.cloudflare.env),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "ask") {
    const question = String(formData.get("question") ?? "").trim();
    if (!question) return data({ error: "Type a question first." }, { status: 400 });

    const orgJur = await env.DB.prepare("SELECT jurisdiction FROM organization WHERE id = ?")
      .bind(tenant.organization.id)
      .first<{ jurisdiction: string | null }>();
    const jurisdiction = orgJur?.jurisdiction ?? null;

    // Gather both article sources for grounding. School overrides win.
    const platform = await env.DB.prepare(
      `SELECT id, slug, title, body FROM help_article
        WHERE audience = 'parent' AND (jurisdiction IS NULL OR jurisdiction = ?)`,
    )
      .bind(jurisdiction)
      .all<{ id: string; slug: string; title: string; body: string }>();
    const school = await env.DB.prepare(
      `SELECT id, slug, title, body FROM school_help_article
        WHERE organizationId = ? AND audience = 'parent' AND published = 1`,
    )
      .bind(tenant.organization.id)
      .all<{ id: string; slug: string; title: string; body: string }>();
    const bySlug = new Map<string, { id: string; title: string; body: string; source: "school" | "platform" }>();
    for (const a of platform.results)
      bySlug.set(a.slug, { id: a.id, title: a.title, body: a.body, source: "platform" });
    for (const a of school.results)
      bySlug.set(a.slug, { id: a.id, title: a.title, body: a.body, source: "school" });
    const articles = [...bySlug.values()];

    let answer = "";
    let sourceIds: string[] = [];
    let matchedSource: "school" | "platform" | "ai" | null = null;
    try {
      const result = await answerHelpQuestion(env, {
        question,
        articles,
        schoolName: tenant.organization.name,
      });
      answer = result.answer;
      sourceIds = result.sourceIds;
      matchedSource = sourceIds.length > 0 ? (articles.find((a) => sourceIds.includes(a.id))?.source ?? "ai") : "ai";
    } catch (err) {
      if (err instanceof ClaudeNotConfiguredError) {
        // Offline fallback: do a string match across titles + bodies.
        const lowered = question.toLowerCase();
        const hit = articles.find(
          (a) => a.title.toLowerCase().includes(lowered) || a.body.toLowerCase().includes(lowered),
        );
        if (hit) {
          answer = hit.body;
          sourceIds = [hit.id];
          matchedSource = hit.source;
        } else {
          answer =
            "I couldn't find an article that matches your question, and the AI assistant is currently offline. " +
            "Try one of the articles below, or contact your school directly.";
          matchedSource = null;
        }
      } else {
        return data(
          { error: err instanceof Error ? err.message : "Help search failed." },
          { status: 400 },
        );
      }
    }

    const queryId = newId();
    await env.DB.prepare(
      `INSERT INTO help_query (id, organizationId, userId, question, answer,
                                matchedArticleId, matchedSource, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        queryId,
        tenant.organization.id,
        tenant.user.id,
        question,
        answer,
        sourceIds[0] ?? null,
        matchedSource,
        Date.now(),
      )
      .run();
    const params = new URLSearchParams({ q: question, qid: queryId });
    return new Response(null, { status: 302, headers: { Location: `/me/help?${params.toString()}` } });
  }

  if (intent === "rate") {
    const queryId = String(formData.get("queryId") ?? "");
    const helpful = String(formData.get("helpful") ?? "1") === "1" ? 1 : 0;
    if (!queryId) return data({ error: "Missing." }, { status: 400 });
    await env.DB.prepare(
      "UPDATE help_query SET helpful = ? WHERE id = ? AND userId = ? AND organizationId = ?",
    )
      .bind(helpful, queryId, tenant.user.id, tenant.organization.id)
      .run();
    const url = new URL(request.url);
    return new Response(null, { status: 302, headers: { Location: `/me/help${url.search}` } });
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function HelpCenter({ loaderData, actionData }: Route.ComponentProps) {
  const { articles, grouped, search, recent, organizationName, claudeConfigured } = loaderData;
  const [params] = useSearchParams();
  const queryId = params.get("qid");
  const lastQuery = queryId ? recent.find((r) => r.id === queryId) ?? recent[0] : null;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Help"
        title="Ask anything"
        description={`Search ${organizationName}'s policies and our general parent guide. Or just ask in plain English.`}
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      <Card>
        <Form method="post" className="flex items-center gap-3">
          <input type="hidden" name="intent" value="ask" />
          <Field label="">
            <TextInput
              name="question"
              type="text"
              placeholder="When does my child get their permit?"
              defaultValue={search}
              required
              className="min-w-[28rem]"
            />
          </Field>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Thinking…" : claudeConfigured ? "Ask" : "Search"}
          </Button>
        </Form>
        {!claudeConfigured && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
            AI assistant is offline (ANTHROPIC_API_KEY not configured). Search falls back to
            keyword matching across the article library.
          </p>
        )}
      </Card>

      {lastQuery && lastQuery.answer && (
        <Card className="border-brand-300 bg-brand-50/40 dark:border-brand-700 dark:bg-brand-950/20">
          <div className="flex items-baseline justify-between">
            <p className="text-xs uppercase tracking-wider text-brand-700 dark:text-brand-200">
              Answer · {lastQuery.matchedSource ?? "ai"}
            </p>
            <p className="text-xs text-ink-500 dark:text-ink-400">
              {new Date(lastQuery.createdAt).toLocaleString()}
            </p>
          </div>
          <p className="mt-1 font-display text-lg font-semibold text-ink-900 dark:text-ink-50">
            {lastQuery.question}
          </p>
          <article
            className="prose prose-ink mt-3 max-w-none text-ink-800 dark:text-ink-100"
            // The answer is markdown; render via marked on the client
            // would need a wrapper. For now, render as HTML via the
            // markdown helper at render time.
            dangerouslySetInnerHTML={{ __html: renderMarkdown(lastQuery.answer) }}
          />
          <div className="mt-4 flex items-center gap-2 border-t border-brand-200/60 pt-4 dark:border-brand-800/60">
            <p className="text-xs text-ink-600 dark:text-ink-300">Was this helpful?</p>
            <Form method="post" className="contents">
              <input type="hidden" name="intent" value="rate" />
              <input type="hidden" name="queryId" value={lastQuery.id} />
              <input type="hidden" name="helpful" value="1" />
              <Button type="submit" variant={lastQuery.helpful === 1 ? "primary" : "ghost"}>
                Yes
              </Button>
            </Form>
            <Form method="post" className="contents">
              <input type="hidden" name="intent" value="rate" />
              <input type="hidden" name="queryId" value={lastQuery.id} />
              <input type="hidden" name="helpful" value="0" />
              <Button type="submit" variant={lastQuery.helpful === 0 ? "primary" : "ghost"}>
                Not really
              </Button>
            </Form>
          </div>
        </Card>
      )}

      {articles.length === 0 ? (
        <EmptyState
          title="No matching articles"
          description={
            search
              ? "Try the Ask box above with a full-sentence question."
              : "Your school hasn't published any help articles yet."
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          {CATEGORY_ORDER.map((cat) => {
            const items = grouped[cat.key] ?? [];
            if (items.length === 0) return null;
            return (
              <section key={cat.key}>
                <h2 className="font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
                  {cat.label}
                </h2>
                <p className="mt-1 mb-4 text-sm text-ink-500 dark:text-ink-400">{cat.intro}</p>
                <ul className="grid gap-3 md:grid-cols-2">
                  {items.map((a) => (
                    <li key={a.id}>
                      <details className="group rounded-2xl border border-ink-200 bg-white/70 p-4 transition open:bg-white dark:border-ink-800 dark:bg-ink-900/40 dark:open:bg-ink-900/60">
                        <summary className="flex cursor-pointer items-center justify-between gap-3">
                          <span className="text-base font-semibold text-ink-900 dark:text-ink-50">
                            {a.title}
                          </span>
                          <span className="text-xs uppercase tracking-wider text-brand-600 dark:text-brand-300 group-open:text-ink-500 dark:group-open:text-ink-400">
                            {a.source === "school" ? "Your school" : "directio"}
                          </span>
                        </summary>
                        <article
                          className="prose prose-ink mt-3 max-w-none text-sm text-ink-800 dark:text-ink-100"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(a.body) }}
                        />
                      </details>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {/* Anything that didn't slot into a known category */}
          {(() => {
            const other = articles.filter(
              (a) => !CATEGORY_ORDER.some((c) => c.key === a.category),
            );
            if (other.length === 0) return null;
            return (
              <section>
                <h2 className="font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
                  More
                </h2>
                <ul className="mt-4 grid gap-3 md:grid-cols-2">
                  {other.map((a) => (
                    <li key={a.id}>
                      <details className="group rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40">
                        <summary className="flex cursor-pointer items-center justify-between gap-3">
                          <span className="text-base font-semibold text-ink-900 dark:text-ink-50">
                            {a.title}
                          </span>
                        </summary>
                        <article
                          className="prose prose-ink mt-3 max-w-none text-sm text-ink-800 dark:text-ink-100"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(a.body) }}
                        />
                      </details>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function renderMarkdown(md: string): string {
  // marked is sync if we don't pass options.async; safe inside render.
  return marked.parse(md, { async: false }) as string;
}

function groupBy<T>(items: T[], key: (t: T) => string): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, it) => {
    const k = key(it);
    (acc[k] = acc[k] ?? []).push(it);
    return acc;
  }, {});
}
