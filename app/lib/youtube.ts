/**
 * Parse a YouTube URL into its 11-character video ID.
 *
 * Handles the common shapes:
 *   https://www.youtube.com/watch?v=VIDEO_ID[&...]
 *   https://youtube.com/watch?v=VIDEO_ID
 *   https://m.youtube.com/watch?v=VIDEO_ID
 *   https://youtu.be/VIDEO_ID[?...]
 *   https://www.youtube.com/embed/VIDEO_ID[?...]
 *   https://www.youtube.com/shorts/VIDEO_ID
 *   https://www.youtube.com/live/VIDEO_ID
 *
 * Returns null if the URL is not a recognizable YouTube link. We never
 * trust the raw URL for embeds; we always embed via the parsed video
 * ID into the iframe template so a malicious paste can't smuggle in
 * arbitrary scripts.
 */
export function parseYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  const idShape = /^[A-Za-z0-9_-]{11}$/;

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return idShape.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") {
      const v = url.searchParams.get("v");
      return v && idShape.test(v) ? v : null;
    }
    const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
  }
  return null;
}

export function youTubeEmbedUrl(videoId: string): string {
  // youtube-nocookie reduces tracking on the embed player; safer default.
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}
