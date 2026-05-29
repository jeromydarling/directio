import type React from "react";

/**
 * Render the BTW lesson plan markdown with a light touch — preserves
 * headings and bullets without pulling in a markdown library. Each
 * lesson body is platform-controlled so we trust the content.
 */
export function BtwLessonBody({ body }: { body: string }) {
  const blocks: Array<{ kind: "h"; level: number; text: string } | { kind: "p"; text: string } | { kind: "ul"; items: string[] }> = [];
  let currentList: string[] | null = null;
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      if (currentList) {
        blocks.push({ kind: "ul", items: currentList });
        currentList = null;
      }
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      if (currentList) {
        blocks.push({ kind: "ul", items: currentList });
        currentList = null;
      }
      blocks.push({ kind: "h", level: heading[1].length, text: heading[2] });
      continue;
    }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      currentList = currentList ?? [];
      currentList.push(bullet[1]);
      continue;
    }
    if (currentList) {
      blocks.push({ kind: "ul", items: currentList });
      currentList = null;
    }
    blocks.push({ kind: "p", text: line });
  }
  if (currentList) blocks.push({ kind: "ul", items: currentList });

  return (
    <div className="space-y-2 pt-1">
      {blocks.map((b, i) => {
        if (b.kind === "h") {
          const cls =
            b.level === 1
              ? "text-base font-semibold"
              : b.level === 2
                ? "text-sm font-semibold"
                : "text-xs font-semibold uppercase tracking-wider";
          return (
            <p key={i} className={`${cls} text-ink-900 dark:text-ink-50`}>
              {renderInline(b.text)}
            </p>
          );
        }
        if (b.kind === "ul") {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5 text-sm">
              {b.items.map((it, j) => (
                <li key={j}>{renderInline(it)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="text-sm">
            {renderInline(b.text)}
          </p>
        );
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  // Render **bold**, `code`, and leave the rest as-is.
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(
        <strong key={++key} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      parts.push(
        <code
          key={++key}
          className="rounded bg-ink-100 px-1 py-0.5 font-mono text-xs dark:bg-ink-800"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
