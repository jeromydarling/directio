import { youTubeEmbedUrl } from "~/lib/youtube";

type Asset = {
  id: string;
  kind: string;
  url: string;
  caption: string | null;
  videoId: string | null;
};

export function LessonAssetGrid({ assets }: { assets: Asset[] }) {
  if (assets.length === 0) return null;
  return (
    <section className="flex flex-col gap-5">
      {assets.map((a) => {
        if (a.videoId) return <VideoAsset key={a.id} asset={a} />;
        if (a.kind === "image") return <ImageAsset key={a.id} asset={a} />;
        if (a.kind === "pdf") return <PdfAsset key={a.id} asset={a} />;
        return <FallbackLink key={a.id} asset={a} />;
      })}
    </section>
  );
}

function VideoAsset({ asset }: { asset: Asset }) {
  return (
    <figure className="flex flex-col gap-2">
      <div className="aspect-video w-full overflow-hidden rounded-2xl border border-ink-200 bg-black dark:border-ink-800">
        <iframe
          src={youTubeEmbedUrl(asset.videoId!)}
          className="h-full w-full"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          title={asset.caption ?? "Lesson video"}
        />
      </div>
      {asset.caption && (
        <figcaption className="text-sm text-ink-500 dark:text-ink-400">
          {asset.caption}
        </figcaption>
      )}
    </figure>
  );
}

function ImageAsset({ asset }: { asset: Asset }) {
  return (
    <figure className="flex flex-col gap-2">
      <img
        src={asset.url}
        alt={asset.caption ?? "Lesson image"}
        className="w-full rounded-2xl border border-ink-200 object-contain dark:border-ink-800"
      />
      {asset.caption && (
        <figcaption className="text-sm text-ink-500 dark:text-ink-400">
          {asset.caption}
        </figcaption>
      )}
    </figure>
  );
}

function PdfAsset({ asset }: { asset: Asset }) {
  return (
    <figure className="flex flex-col gap-2">
      <embed
        src={asset.url}
        type="application/pdf"
        className="h-[36rem] w-full rounded-2xl border border-ink-200 dark:border-ink-800"
      />
      <figcaption className="flex items-center justify-between text-sm text-ink-500 dark:text-ink-400">
        <span>{asset.caption ?? "Lesson PDF"}</span>
        <a
          href={asset.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-600 hover:underline dark:text-brand-300"
        >
          Open PDF →
        </a>
      </figcaption>
    </figure>
  );
}

function FallbackLink({ asset }: { asset: Asset }) {
  return (
    <a
      href={asset.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-2xl border border-ink-200 bg-white/70 p-4 text-sm text-ink-700 transition hover:border-brand-300 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200"
    >
      {asset.caption ?? asset.url}
    </a>
  );
}
