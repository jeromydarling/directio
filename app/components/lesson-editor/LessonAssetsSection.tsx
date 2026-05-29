import { Form } from "react-router";
import { Card, Button } from "~/components/ui";
import { Field, TextInput, Select } from "~/components/form";
import { youTubeEmbedUrl } from "~/lib/youtube";

export type LessonAssetRow = {
  id: string;
  kind: string;
  url: string;
  caption: string | null;
  metadata: Record<string, unknown> | null;
  ordinal: number;
};

export function LessonAssetsSection({
  assets,
  submitting,
}: {
  assets: LessonAssetRow[];
  submitting: boolean;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
        Videos &amp; resources
      </h2>
      {assets.length === 0 ? null : (
        <ul className="mb-4 flex flex-col gap-3">
          {assets.map((a, aIdx) => {
            const meta = a.metadata as { videoId?: unknown } | null;
            const videoId =
              a.kind === "youtube" && meta && typeof meta.videoId === "string"
                ? meta.videoId
                : null;
            const isFirst = aIdx === 0;
            const isLast = aIdx === assets.length - 1;
            return (
              <li
                key={a.id}
                className="flex flex-col gap-3 rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-800 dark:bg-ink-900/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wider text-brand-600 dark:text-brand-300">
                      {a.kind}
                    </p>
                    <p className="mt-1 truncate text-sm text-ink-700 dark:text-ink-200">
                      {a.caption || a.url.split("/").pop() || a.url}
                    </p>
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block truncate text-xs text-ink-500 hover:text-brand-600 dark:text-ink-400 dark:hover:text-brand-300"
                    >
                      {a.url}
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <Form method="post" className="contents">
                      <input type="hidden" name="intent" value="move-asset-up" />
                      <input type="hidden" name="assetId" value={a.id} />
                      <Button type="submit" variant="ghost" disabled={submitting || isFirst}>
                        ↑
                      </Button>
                    </Form>
                    <Form method="post" className="contents">
                      <input type="hidden" name="intent" value="move-asset-down" />
                      <input type="hidden" name="assetId" value={a.id} />
                      <Button type="submit" variant="ghost" disabled={submitting || isLast}>
                        ↓
                      </Button>
                    </Form>
                    <Form method="post">
                      <input type="hidden" name="intent" value="delete-asset" />
                      <input type="hidden" name="assetId" value={a.id} />
                      <Button type="submit" variant="ghost" disabled={submitting}>
                        Remove
                      </Button>
                    </Form>
                  </div>
                </div>
                {videoId && (
                  <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
                    <iframe
                      src={youTubeEmbedUrl(videoId)}
                      className="h-full w-full"
                      loading="lazy"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      title={a.caption ?? "YouTube video"}
                    />
                  </div>
                )}
                {a.kind === "image" && (
                  <img
                    src={a.url}
                    alt={a.caption ?? "Lesson image"}
                    className="max-h-96 w-full rounded-xl object-contain"
                  />
                )}
                {a.kind === "pdf" && (
                  <embed
                    src={a.url}
                    type="application/pdf"
                    className="h-96 w-full rounded-xl border border-ink-200 dark:border-ink-800"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Add a YouTube video
          </h3>
          <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
            Paste any YouTube URL — watch link, share link, or embed.
          </p>
          <Form method="post" className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="intent" value="add-youtube" />
            <Field label="">
              <TextInput
                name="url"
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                required
              />
            </Field>
            <Field label="">
              <TextInput name="caption" type="text" placeholder="Caption (optional)" />
            </Field>
            <div>
              <Button type="submit" disabled={submitting}>
                Add video
              </Button>
            </div>
          </Form>
        </Card>

        <Card>
          <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Upload an image or PDF
          </h3>
          <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
            Up to 25&nbsp;MB. Images render inline; PDFs are embedded with a download link.
          </p>
          <Form
            method="post"
            encType="multipart/form-data"
            className="mt-3 flex flex-col gap-3"
          >
            <input type="hidden" name="intent" value="upload-asset" />
            <Field label="Kind">
              <Select name="kind" defaultValue="image">
                <option value="image">Image</option>
                <option value="pdf">PDF</option>
              </Select>
            </Field>
            <Field label="File">
              <input
                name="file"
                type="file"
                accept="image/*,application/pdf"
                required
                className="block w-full text-sm text-ink-700 file:mr-3 file:rounded-full file:border-0 file:bg-ink-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-ink-800 hover:file:bg-ink-200 dark:text-ink-200 dark:file:bg-ink-800 dark:file:text-ink-100 dark:hover:file:bg-ink-700"
              />
            </Field>
            <Field label="">
              <TextInput name="caption" type="text" placeholder="Caption (optional)" />
            </Field>
            <div>
              <Button type="submit" disabled={submitting}>
                Upload
              </Button>
            </div>
          </Form>
        </Card>
      </div>
    </section>
  );
}
