import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.library.import";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { recordAudit } from "~/lib/audit.server";
import { addSchoolLesson } from "~/lib/curriculum.server";
import {
  ClaudeNotConfiguredError,
  draftsToReview,
  isClaudeConfigured,
  segmentCurriculumText,
  type ImportSegmentReview,
  type SchoolModuleSummary,
} from "~/lib/curriculum-import.server";
import { PageHeader, Card, Button, EmptyState, LinkButton } from "~/components/ui";
import { Field, FormError, Select, TextArea, TextInput } from "~/components/form";

const MAX_TEXT_BYTES = 250_000;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

type InstallOption = {
  id: string;
  packName: string;
  version: string;
};

type ImportRow = {
  id: string;
  schoolPackInstallId: string;
  source: string;
  fileName: string | null;
  status: string;
  segmentsJson: string | null;
  segmentCount: number;
  committedLessonCount: number;
  error: string | null;
  createdAt: number;
};

type ModuleOption = SchoolModuleSummary;

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const db = context.cloudflare.env.DB;
  const orgId = tenant.organization.id;
  const url = new URL(request.url);
  const importId = url.searchParams.get("import");

  const installs = await db
    .prepare(
      `SELECT spi.id, cp.name AS packName, cpv.version
         FROM school_pack_install spi
         JOIN content_pack_version cpv ON cpv.id = spi.contentPackVersionId
         JOIN content_pack cp ON cp.id = cpv.contentPackId
        WHERE spi.organizationId = ?
        ORDER BY spi.installedAt DESC`,
    )
    .bind(orgId)
    .all<InstallOption>();

  let current: ImportRow | null = null;
  let modules: ModuleOption[] = [];

  if (importId) {
    const row = await db
      .prepare(
        `SELECT id, schoolPackInstallId, source, fileName, status, segmentsJson,
                segmentCount, committedLessonCount, error, createdAt
           FROM curriculum_import
          WHERE id = ? AND organizationId = ?`,
      )
      .bind(importId, orgId)
      .first<ImportRow>();
    current = row ?? null;
    if (current) {
      const modRes = await db
        .prepare(
          `SELECT sm.id, sm.title, sm.description
             FROM school_module sm
             JOIN school_course sc ON sc.id = sm.schoolCourseId
            WHERE sc.organizationId = ?
              AND sc.schoolPackInstallId = ?
            ORDER BY sm.ordinal`,
        )
        .bind(orgId, current.schoolPackInstallId)
        .all<ModuleOption>();
      modules = modRes.results;
    }
  }

  const recents = await db
    .prepare(
      `SELECT id, schoolPackInstallId, source, fileName, status, segmentsJson,
              segmentCount, committedLessonCount, error, createdAt
         FROM curriculum_import
        WHERE organizationId = ?
        ORDER BY createdAt DESC
        LIMIT 8`,
    )
    .bind(orgId)
    .all<ImportRow>();

  return {
    installs: installs.results,
    current,
    modules,
    recents: recents.results.filter((r) => r.id !== current?.id),
    claudeConfigured: isClaudeConfigured(context.cloudflare.env),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const env = context.cloudflare.env;
  const db = env.DB;
  const orgId = tenant.organization.id;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const now = Date.now();

  if (intent === "upload") {
    const installId = String(formData.get("schoolPackInstallId") ?? "");
    if (!installId) {
      return data({ error: "Pick a target pack." }, { status: 400 });
    }
    const install = await db
      .prepare(
        "SELECT id FROM school_pack_install WHERE id = ? AND organizationId = ?",
      )
      .bind(installId, orgId)
      .first<{ id: string }>();
    if (!install) {
      return data({ error: "That pack isn't installed in this school." }, { status: 404 });
    }

    let rawText = "";
    let source: "paste" | "file" = "paste";
    let fileName: string | null = null;
    let storageKey: string | null = null;

    const file = formData.get("file");
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_UPLOAD_BYTES) {
        return data(
          {
            error: `File is too large (max ${(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(
              0,
            )} MB). Paste the text directly instead.`,
          },
          { status: 413 },
        );
      }
      const type = file.type || "";
      if (
        !type.startsWith("text/") &&
        !file.name.match(/\.(txt|md|markdown|csv)$/i)
      ) {
        return data(
          {
            error:
              "Text-only at the moment (.txt / .md / .csv). Export your PDF or slides to text and try again.",
          },
          { status: 400 },
        );
      }
      const bytes = await file.arrayBuffer();
      rawText = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      source = "file";
      fileName = file.name;
      storageKey = `curriculum-imports/${orgId}/${newId()}/${file.name.replace(
        /[^A-Za-z0-9._-]+/g,
        "_",
      )}`;
      await env.ASSETS.put(storageKey, bytes, {
        httpMetadata: { contentType: type || "text/plain" },
      });
    } else {
      rawText = String(formData.get("pastedText") ?? "");
    }

    rawText = rawText.replace(/\r\n?/g, "\n").trim();
    if (!rawText) {
      return data({ error: "Upload a file or paste some text." }, { status: 400 });
    }
    if (rawText.length > MAX_TEXT_BYTES) {
      return data(
        {
          error: `Text is too long (${rawText.length.toLocaleString()} chars). Trim to ${MAX_TEXT_BYTES.toLocaleString()} or less.`,
        },
        { status: 413 },
      );
    }

    if (!isClaudeConfigured(env)) {
      return data(
        {
          error:
            "AI segmenting needs ANTHROPIC_API_KEY configured. Add the secret in Cloudflare to enable this flow.",
        },
        { status: 400 },
      );
    }

    const importRowId = newId();
    await db
      .prepare(
        `INSERT INTO curriculum_import
           (id, organizationId, schoolPackInstallId, source, fileName, storageKey,
            rawText, status, createdByUserId, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'segmenting', ?, ?, ?)`,
      )
      .bind(
        importRowId,
        orgId,
        installId,
        source,
        fileName,
        storageKey,
        rawText,
        tenant.user.id,
        now,
        now,
      )
      .run();

    // Load the school's modules for this pack so the AI can map into them.
    const moduleRes = await db
      .prepare(
        `SELECT sm.id, sm.title, sm.description
           FROM school_module sm
           JOIN school_course sc ON sc.id = sm.schoolCourseId
          WHERE sc.organizationId = ?
            AND sc.schoolPackInstallId = ?
          ORDER BY sm.ordinal`,
      )
      .bind(orgId, installId)
      .all<ModuleOption>();

    try {
      const drafts = await segmentCurriculumText(env, {
        rawText,
        schoolModules: moduleRes.results,
      });
      const review = draftsToReview(drafts);
      await db
        .prepare(
          `UPDATE curriculum_import
              SET status = 'segmented', segmentsJson = ?, segmentCount = ?, updatedAt = ?
            WHERE id = ?`,
        )
        .bind(JSON.stringify(review), review.length, Date.now(), importRowId)
        .run();
      await recordAudit(env, {
        organizationId: orgId,
        actorUserId: tenant.user.id,
        action: "curriculum_import.segmented",
        entityType: "curriculum_import",
        entityId: importRowId,
        payload: { source, segmentCount: review.length, fileName },
      });
      return redirect(`/admin/library/import?import=${importRowId}`);
    } catch (err) {
      const message =
        err instanceof ClaudeNotConfiguredError
          ? err.message
          : err instanceof Error
            ? err.message
            : "AI segmenting failed.";
      await db
        .prepare(
          `UPDATE curriculum_import
              SET status = 'failed', error = ?, updatedAt = ?
            WHERE id = ?`,
        )
        .bind(message, Date.now(), importRowId)
        .run();
      return data({ error: message }, { status: 500 });
    }
  }

  if (intent === "commit") {
    const importId = String(formData.get("importId") ?? "");
    const row = await db
      .prepare(
        `SELECT id, schoolPackInstallId, status, segmentsJson FROM curriculum_import
           WHERE id = ? AND organizationId = ?`,
      )
      .bind(importId, orgId)
      .first<{
        id: string;
        schoolPackInstallId: string;
        status: string;
        segmentsJson: string | null;
      }>();
    if (!row || !row.segmentsJson) {
      return data({ error: "Nothing to commit." }, { status: 400 });
    }
    if (row.status === "committed") {
      return data({ error: "Already committed." }, { status: 409 });
    }
    let segments: ImportSegmentReview[];
    try {
      segments = JSON.parse(row.segmentsJson) as ImportSegmentReview[];
    } catch {
      return data({ error: "Stored segments are corrupted." }, { status: 500 });
    }

    // Read the admin's review form: per-segment target module + confirmed flag.
    const updated: ImportSegmentReview[] = [];
    let committed = 0;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const confirmed = formData.get(`confirm.${i}`) === "on";
      const targetRaw = String(formData.get(`target.${i}`) ?? "").trim() || null;
      const next: ImportSegmentReview = {
        ...seg,
        targetSchoolModuleId: targetRaw,
        confirmed,
      };
      if (confirmed && targetRaw) {
        const lessonId = await addSchoolLesson(env, {
          organizationId: orgId,
          schoolModuleId: targetRaw,
          title: seg.title,
          body: seg.body,
          estimatedSeatMinutes: estimateSeatMinutes(seg.body),
        });
        next.schoolLessonId = lessonId;
        committed++;
      }
      updated.push(next);
    }

    await db
      .prepare(
        `UPDATE curriculum_import
            SET status = ?, segmentsJson = ?, committedLessonCount = ?, updatedAt = ?
          WHERE id = ?`,
      )
      .bind(
        committed > 0 ? "committed" : "segmented",
        JSON.stringify(updated),
        committed,
        Date.now(),
        row.id,
      )
      .run();

    await recordAudit(env, {
      organizationId: orgId,
      actorUserId: tenant.user.id,
      action: "curriculum_import.committed",
      entityType: "curriculum_import",
      entityId: row.id,
      payload: { committed, total: segments.length },
    });

    return redirect(
      `/admin/library/installed/${row.schoolPackInstallId}?imported=${committed}`,
    );
  }

  if (intent === "discard") {
    const importId = String(formData.get("importId") ?? "");
    await db
      .prepare(
        `UPDATE curriculum_import
            SET status = 'failed', error = 'discarded', updatedAt = ?
          WHERE id = ? AND organizationId = ?`,
      )
      .bind(Date.now(), importId, orgId)
      .run();
    return redirect("/admin/library/import");
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

function estimateSeatMinutes(body: string): number {
  // ~200 words per minute for adult reading, halved for teen + comprehension.
  const words = body.split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.min(45, Math.round(words / 100)));
}

export default function CurriculumImport({ loaderData, actionData }: Route.ComponentProps) {
  const { installs, current, modules, recents, claudeConfigured } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  if (current && current.status === "segmented" && current.segmentsJson) {
    return (
      <ReviewView
        importRow={current}
        modules={modules}
        submitting={submitting}
        actionData={actionData}
      />
    );
  }
  if (current && current.status === "committed") {
    return (
      <CommittedView importRow={current} actionData={actionData} />
    );
  }

  return (
    <UploadView
      installs={installs}
      recents={recents}
      claudeConfigured={claudeConfigured}
      submitting={submitting}
      actionData={actionData}
    />
  );
}

function UploadView({
  installs,
  recents,
  claudeConfigured,
  submitting,
  actionData,
}: {
  installs: InstallOption[];
  recents: ImportRow[];
  claudeConfigured: boolean;
  submitting: boolean;
  actionData: Route.ComponentProps["actionData"];
}) {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Curriculum"
        title="Import your existing materials"
        description="Upload or paste your existing course content. AI segments it into lesson-sized chunks and suggests which module of your installed pack each piece belongs in. You review and confirm — nothing lands without your sign-off."
        actions={
          <LinkButton to="/admin/library" variant="ghost">
            ← Library
          </LinkButton>
        }
      />

      {!claudeConfigured && (
        <Card className="border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            AI segmenting isn't configured yet.
          </p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
            Set <code className="font-mono">ANTHROPIC_API_KEY</code> via wrangler
            secrets to enable this flow.
          </p>
        </Card>
      )}

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      {installs.length === 0 ? (
        <EmptyState
          title="No packs installed yet"
          description="Install a content pack from the library first — that's the target your imported materials will layer on top of."
          action={
            <LinkButton to="/admin/library" variant="secondary">
              Open library
            </LinkButton>
          }
        />
      ) : (
        <Card>
          <Form method="post" encType="multipart/form-data" className="flex flex-col gap-4">
            <input type="hidden" name="intent" value="upload" />
            <Field label="Target pack">
              <Select name="schoolPackInstallId" required defaultValue={installs[0].id}>
                {installs.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.packName} (v{i.version})
                  </option>
                ))}
              </Select>
            </Field>

            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
                Upload a text file (.txt, .md, .csv) — up to{" "}
                {(MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(0)} MB
              </label>
              <input
                type="file"
                name="file"
                accept=".txt,.md,.markdown,.csv,text/plain,text/markdown,text/csv"
                className="mt-1 block w-full text-sm text-ink-700 file:mr-3 file:rounded-full file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-500 dark:text-ink-200"
              />
              <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                Export your PDF or slide deck to text first — Workers-side PDF
                parsing is on the roadmap.
              </p>
            </div>

            <Field
              label="Or paste your text"
              hint={`Markdown welcome. Max ${MAX_TEXT_BYTES.toLocaleString()} characters.`}
            >
              <TextArea
                name="pastedText"
                placeholder="Paste a chapter, a lesson plan, or your whole curriculum here…"
                className="min-h-[14rem] font-mono text-sm"
              />
            </Field>

            <div>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Segmenting…" : "Segment with AI"}
              </Button>
            </div>
          </Form>
        </Card>
      )}

      {recents.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Recent imports
          </h2>
          <ul className="flex flex-col gap-2">
            {recents.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40"
              >
                <div>
                  <p className="text-sm font-medium text-ink-900 dark:text-ink-50">
                    {r.fileName ?? "Pasted text"} · {r.source}
                  </p>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    {r.segmentCount} segment{r.segmentCount === 1 ? "" : "s"} ·{" "}
                    {r.committedLessonCount} committed ·{" "}
                    {new Date(r.createdAt).toLocaleString()}
                  </p>
                  {r.error && (
                    <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
                      {r.error}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={
                      r.status === "committed"
                        ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200"
                        : r.status === "segmented"
                          ? "rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700 dark:bg-brand-900/60 dark:text-brand-200"
                          : r.status === "failed"
                            ? "rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-700 dark:bg-rose-900/60 dark:text-rose-200"
                            : "rounded-full bg-ink-100 px-3 py-1 text-xs font-medium text-ink-700 dark:bg-ink-800 dark:text-ink-200"
                    }
                  >
                    {r.status}
                  </span>
                  {r.status === "segmented" && (
                    <Link
                      to={`/admin/library/import?import=${r.id}`}
                      className="text-xs text-brand-600 hover:underline dark:text-brand-300"
                    >
                      Review →
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ReviewView({
  importRow,
  modules,
  submitting,
  actionData,
}: {
  importRow: ImportRow;
  modules: ModuleOption[];
  submitting: boolean;
  actionData: Route.ComponentProps["actionData"];
}) {
  let segments: ImportSegmentReview[] = [];
  try {
    segments = JSON.parse(importRow.segmentsJson ?? "[]") as ImportSegmentReview[];
  } catch {
    /* ignore */
  }

  const confirmedCount = segments.filter(
    (s) => s.suggestedSchoolModuleId !== null,
  ).length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Curriculum import · review"
        title={`${segments.length} segment${segments.length === 1 ? "" : "s"} ready`}
        description="AI proposed module mappings based on your existing pack's slots. Pick the right slot per segment (or skip), then commit — only confirmed segments become school_lesson rows."
        actions={
          <Form method="post">
            <input type="hidden" name="intent" value="discard" />
            <input type="hidden" name="importId" value={importRow.id} />
            <Button type="submit" variant="ghost" disabled={submitting}>
              Discard import
            </Button>
          </Form>
        }
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      <p className="text-sm text-ink-600 dark:text-ink-300">
        AI suggested mappings for{" "}
        <strong>
          {confirmedCount} of {segments.length}
        </strong>{" "}
        segments. Adjust any of them, then commit.
      </p>

      <Form method="post" className="flex flex-col gap-4">
        <input type="hidden" name="intent" value="commit" />
        <input type="hidden" name="importId" value={importRow.id} />

        {segments.map((s, i) => (
          <SegmentCard
            key={i}
            index={i}
            segment={s}
            modules={modules}
          />
        ))}

        <div className="flex items-center justify-between">
          <p className="text-xs text-ink-500 dark:text-ink-400">
            Unchecked segments stay in this import for later review.
          </p>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Committing…" : "Commit selected segments"}
          </Button>
        </div>
      </Form>
    </div>
  );
}

function SegmentCard({
  index,
  segment,
  modules,
}: {
  index: number;
  segment: ImportSegmentReview;
  modules: ModuleOption[];
}) {
  const confTone =
    segment.confidence === "high"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
      : segment.confidence === "low"
        ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200"
        : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200";
  return (
    <Card className="border-l-4 border-l-brand-400">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-xs uppercase tracking-wider text-brand-600 dark:text-brand-300">
            Segment {index + 1}
          </p>
          <p className="mt-1 font-display text-lg font-semibold text-ink-900 dark:text-ink-50">
            <TitleInput
              name={`title.${index}`}
              defaultValue={segment.title}
            />
          </p>
          <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
            {segment.summary}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${confTone}`}
        >
          {segment.confidence} confidence
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="Target module slot">
          <Select
            name={`target.${index}`}
            defaultValue={segment.targetSchoolModuleId ?? ""}
          >
            <option value="">— Skip this segment —</option>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </Select>
        </Field>
        <label className="mt-7 flex items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
          <input
            type="checkbox"
            name={`confirm.${index}`}
            defaultChecked={segment.confirmed}
            className="h-4 w-4 rounded border-ink-300"
          />
          Include in commit
        </label>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer select-none text-xs text-ink-500 dark:text-ink-400">
          Preview body ({segment.body.length.toLocaleString()} chars)
        </summary>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-ink-50 p-3 font-mono text-xs text-ink-700 dark:bg-ink-900/40 dark:text-ink-200">
          {segment.body}
        </pre>
      </details>
    </Card>
  );
}

function TitleInput({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue: string;
}) {
  return (
    <TextInput
      name={name}
      type="text"
      defaultValue={defaultValue}
      className="font-display text-lg font-semibold"
    />
  );
}

function CommittedView({
  importRow,
  actionData,
}: {
  importRow: ImportRow;
  actionData: Route.ComponentProps["actionData"];
}) {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Curriculum import · committed"
        title={`${importRow.committedLessonCount} lesson${
          importRow.committedLessonCount === 1 ? "" : "s"
        } added`}
        description="Your imported segments are now school-owned lessons in the target pack. You can edit them like any other lesson — quizzes, ordering, body — from the library."
      />
      <FormError message={actionData && "error" in actionData ? actionData.error : null} />
      <Card>
        <p className="text-sm text-ink-700 dark:text-ink-200">
          Imported on{" "}
          {new Date(importRow.createdAt).toLocaleString()} from{" "}
          {importRow.source} ({importRow.fileName ?? "pasted text"}).
        </p>
        <div className="mt-3 flex gap-2">
          <LinkButton
            to={`/admin/library/installed/${importRow.schoolPackInstallId}`}
            variant="secondary"
          >
            Open target pack →
          </LinkButton>
          <LinkButton to="/admin/library/import" variant="ghost">
            Import another
          </LinkButton>
        </div>
      </Card>
    </div>
  );
}
