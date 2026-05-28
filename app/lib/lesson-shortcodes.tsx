import { Fragment, type ReactNode } from "react";
import { TrafficSign, type TrafficSignType } from "~/components/traffic-sign";

/**
 * Lesson-body shortcode renderer.
 *
 * Authors write tokens like `[[sign:stop]]` or `[[sign:speed-limit-25 size=lg]]`
 * inline in the markdown body. After `marked` renders the body to HTML
 * (with shortcodes still embedded as plain text inside paragraphs), we
 * post-process the HTML by splitting on the shortcode pattern and
 * substituting the appropriate React component.
 *
 * Why post-process rather than pre-process the markdown? Because
 * markdown-aware authoring (parents/teachers editing in the school's
 * lesson editor) is a lot easier when shortcodes look like plain text.
 * `marked` leaves them untouched; we swap them at render time.
 *
 * Supported tokens (v1):
 *   [[sign:TYPE]]                    inline sign
 *   [[sign:TYPE size=sm|md|lg]]      sized inline sign
 *   [[sign:speed-limit-25]]          numeric sign
 *
 * Adding new shortcodes (diagrams, callouts, etc.) is the same pattern:
 * extend `SHORTCODE_PATTERN` and the renderer switch.
 */

const SHORTCODE_PATTERN = /\[\[(sign):([a-z0-9-]+)((?:\s+\w+=\w+)*)\]\]/gi;

/**
 * Render an HTML string with embedded shortcodes into a React tree.
 * Uses `dangerouslySetInnerHTML` for the non-shortcode parts (the HTML
 * is already sanitized markdown output from `marked`) and inserts
 * React components where shortcodes appear.
 */
export function renderLessonHtml(html: string): ReactNode {
  const segments: Array<{ kind: "html" | "shortcode"; value: string; args?: Record<string, string> }> = [];
  let lastIndex = 0;

  for (const match of html.matchAll(SHORTCODE_PATTERN)) {
    const [, kind, name, rawArgs] = match;
    const idx = match.index ?? 0;
    if (idx > lastIndex) {
      segments.push({ kind: "html", value: html.slice(lastIndex, idx) });
    }
    const args: Record<string, string> = {};
    for (const arg of rawArgs?.matchAll(/\b(\w+)=(\w+)/g) ?? []) {
      args[arg[1]] = arg[2];
    }
    segments.push({ kind: "shortcode", value: `${kind}:${name}`, args });
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
        const [kind, name] = seg.value.split(":");
        if (kind === "sign") {
          const size = (seg.args?.size as "sm" | "md" | "lg" | undefined) ?? "md";
          return (
            <TrafficSign
              key={i}
              type={name as TrafficSignType}
              size={size}
              className="mx-1"
            />
          );
        }
        return null;
      })}
    </>
  );
}

/**
 * List every shortcode found in a lesson body. Used by the admin
 * editor to surface a quick visual reference of "this lesson renders
 * the following inline elements" without having to scroll the preview.
 */
export function listShortcodes(html: string): Array<{ kind: string; name: string }> {
  const out: Array<{ kind: string; name: string }> = [];
  for (const match of html.matchAll(SHORTCODE_PATTERN)) {
    out.push({ kind: match[1], name: match[2] });
  }
  return out;
}
