import { Fragment, type ReactNode } from "react";
import type { MarkedExtension, TokenizerAndRendererExtension } from "marked";
import { TrafficSign, type TrafficSignType } from "~/components/traffic-sign";

/**
 * Lesson-body shortcode renderer.
 *
 * Authors write tokens like `[[sign:stop]]` or `[[sign:speed-limit-25 size=lg]]`
 * inline in the markdown body. We register a custom `marked` inline
 * extension so the shortcode is recognized *during* markdown tokenization,
 * not after. That means:
 *   - `**[[sign:stop]]**` becomes a strong-wrapped inline sign (the
 *     previous regex-over-HTML approach choked on this).
 *   - `` `[[sign:stop]]` `` and fenced code blocks no longer accidentally
 *     render signs — marked's inline parser doesn't fire inside code.
 *
 * The extension emits a placeholder custom tag
 *   <inline-sign type="TYPE" size="SIZE"></inline-sign>
 * and `renderLessonHtml` walks the HTML for that narrow pattern and
 * substitutes a `<TrafficSign>` React component.
 *
 * Supported tokens (v1):
 *   [[sign:TYPE]]                    inline sign
 *   [[sign:TYPE size=sm|md|lg]]      sized inline sign
 *   [[sign:speed-limit-25]]          numeric sign
 *
 * Adding new shortcodes (diagrams, callouts, etc.) is the same pattern:
 * register another extension and extend the placeholder walker.
 */

// Inline tokenizer pattern for [[sign:NAME]] and [[sign:NAME key=val ...]].
// Names allow lowercase letters, digits, and dashes (covers `speed-limit-45`).
const SIGN_SHORTCODE_RE = /^\[\[sign:([a-z0-9-]+)((?:\s+\w+=\w+)*)\]\]/;

// Narrower regex used at render time — only matches the placeholder
// tags emitted by our renderer, not arbitrary author text.
const SIGN_PLACEHOLDER_RE = /<inline-sign\s+type="([a-z0-9-]+)"(?:\s+size="([a-z]+)")?\s*><\/inline-sign>/gi;

type SignToken = {
  type: "lessonSign";
  raw: string;
  signType: string;
  size: string;
};

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildSignExtension(): TokenizerAndRendererExtension {
  return {
    name: "lessonSign",
    level: "inline",
    // `start` lets marked skip ahead to the next possible shortcode start
    // instead of probing every character. Returning the index of the next
    // `[[` is the documented fast path.
    start(src: string) {
      const idx = src.indexOf("[[");
      return idx < 0 ? undefined : idx;
    },
    tokenizer(src: string): SignToken | undefined {
      const match = SIGN_SHORTCODE_RE.exec(src);
      if (!match) return undefined;
      const [raw, signType, rawArgs] = match;
      let size = "xs";
      for (const arg of rawArgs?.matchAll(/\b(\w+)=(\w+)/g) ?? []) {
        if (arg[1] === "size") size = arg[2];
      }
      return {
        type: "lessonSign",
        raw,
        signType,
        size,
      };
    },
    renderer(token): string {
      const t = token as SignToken;
      return `<inline-sign type="${escapeAttr(t.signType)}" size="${escapeAttr(t.size)}"></inline-sign>`;
    },
  };
}

let registered = false;

/**
 * Idempotently register the lesson-shortcode marked extension. Call this
 * once on module load (or in the route loader before `marked.parse`).
 */
export function registerLessonShortcodes(markedInstance: {
  use: (...extensions: MarkedExtension[]) => unknown;
}): void {
  if (registered) return;
  markedInstance.use({ extensions: [buildSignExtension()] });
  registered = true;
}

/**
 * Render a `marked`-produced HTML string with embedded `<inline-sign>`
 * placeholders into a React tree. The HTML between placeholders is
 * trusted markdown output and goes through `dangerouslySetInnerHTML`;
 * each placeholder is replaced with a real `<TrafficSign>` component.
 */
export function renderLessonHtml(html: string): ReactNode {
  const segments: Array<
    | { kind: "html"; value: string }
    | { kind: "sign"; signType: string; size: string }
  > = [];
  let lastIndex = 0;

  for (const match of html.matchAll(SIGN_PLACEHOLDER_RE)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      segments.push({ kind: "html", value: html.slice(lastIndex, idx) });
    }
    segments.push({ kind: "sign", signType: match[1], size: match[2] ?? "xs" });
    lastIndex = idx + match[0].length;
  }
  if (lastIndex < html.length) {
    segments.push({ kind: "html", value: html.slice(lastIndex) });
  }

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === "html") {
          return (
            <Fragment key={i}>
              <span dangerouslySetInnerHTML={{ __html: seg.value }} />
            </Fragment>
          );
        }
        const size =
          (seg.size as "xs" | "sm" | "md" | "lg" | "xl" | undefined) ?? "xs";
        return (
          <TrafficSign
            key={i}
            type={seg.signType as TrafficSignType}
            size={size}
            className="mx-0.5"
          />
        );
      })}
    </>
  );
}

/**
 * List every shortcode found in a lesson body. Used by the admin
 * editor to surface a quick visual reference of "this lesson renders
 * the following inline elements" without having to scroll the preview.
 *
 * Accepts either the raw markdown source or the rendered HTML — both
 * forms contain the literal `[[sign:NAME]]` tokens (markdown) or
 * `<inline-sign type="NAME">` placeholders (HTML). We try the source
 * pattern first, then fall back to the placeholder pattern, so callers
 * don't have to know which stage of the pipeline they're at.
 */
export function listShortcodes(input: string): Array<{ kind: string; name: string }> {
  const out: Array<{ kind: string; name: string }> = [];
  const sourcePattern = /\[\[(sign):([a-z0-9-]+)(?:\s+\w+=\w+)*\]\]/gi;
  for (const match of input.matchAll(sourcePattern)) {
    out.push({ kind: match[1], name: match[2] });
  }
  if (out.length === 0) {
    for (const match of input.matchAll(SIGN_PLACEHOLDER_RE)) {
      out.push({ kind: "sign", name: match[1] });
    }
  }
  return out;
}
