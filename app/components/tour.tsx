import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { TOURS, type TourStep } from "~/lib/tours";

/**
 * Coach-mark tour engine. Dependency-free.
 *
 * <SectionTour tourId="admin-students" /> renders the ✦ Tour launcher
 * (PageHeader mounts one automatically via its `tour` prop). Opening
 * it resolves the tour's steps against the live DOM — steps whose
 * target isn't present AND visible are dropped, so empty states and
 * mobile-hidden sidebars never produce a spotlight on nothing.
 *
 * Mechanics:
 *  - Spotlight: a fixed, rounded rect over the target with a huge
 *    box-shadow dimming everything else. pointer-events are captured
 *    by a full-screen backdrop (click = next step) so tour mode is
 *    read-only — you can't misclick your way into an action.
 *  - Popover placement: below the target if it fits, else above;
 *    clamped to the viewport. On phones it becomes a bottom sheet.
 *  - Position tracking: a rAF loop re-measures the target while the
 *    tour is open, so smooth-scrolling and layout shifts can't strand
 *    the spotlight.
 *  - Keyboard: ← → navigate, Esc closes. The popover takes focus on
 *    each step for screen readers.
 *  - Completion is remembered in localStorage; the launcher shows a
 *    pulsing dot until the tour has been taken once.
 */

const LS_PREFIX = "directio:tour:";

function markDone(tourId: string) {
  try {
    localStorage.setItem(LS_PREFIX + tourId, "done");
  } catch {
    // Private mode etc. — the pulse just shows again next visit.
  }
}

function isDone(tourId: string): boolean {
  try {
    return localStorage.getItem(LS_PREFIX + tourId) === "done";
  } catch {
    return false;
  }
}

function findVisible(selector: string): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(selector);
  for (const el of nodes) {
    const rects = el.getClientRects();
    if (rects.length === 0) continue;
    const style = window.getComputedStyle(el);
    if (style.visibility === "hidden" || style.opacity === "0") continue;
    return el;
  }
  return null;
}

type ResolvedStep = TourStep & { el: HTMLElement | null };

export function SectionTour({ tourId }: { tourId: string }) {
  const tour = TOURS[tourId];
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(true); // assume seen until localStorage says otherwise (avoids SSR flash)

  useEffect(() => {
    setSeen(isDone(tourId));
  }, [tourId]);

  if (!tour) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={tour.label}
        title={tour.label}
        className="relative inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white/60 px-3 py-1.5 text-xs font-medium text-ink-600 backdrop-blur-sm transition hover:border-brand-300 hover:text-ink-900 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-300 dark:hover:border-brand-700 dark:hover:text-ink-50"
      >
        <span aria-hidden>✦</span>
        Tour
        {!seen && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-brand-500"
          />
        )}
      </button>
      {open && (
        <TourOverlay
          tourId={tourId}
          onClose={(completed) => {
            setOpen(false);
            if (completed) {
              markDone(tourId);
              setSeen(true);
            }
          }}
        />
      )}
    </>
  );
}

function TourOverlay({
  tourId,
  onClose,
}: {
  tourId: string;
  onClose: (completed: boolean) => void;
}) {
  const tour = TOURS[tourId];
  const [steps, setSteps] = useState<ResolvedStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [narrow, setNarrow] = useState(false);
  const [popPos, setPopPos] = useState<{ top: number; left: number } | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  // Resolve steps against the live DOM once, at open.
  useEffect(() => {
    const resolved: ResolvedStep[] = tour.steps
      .map((s) => ({ ...s, el: s.target ? findVisible(s.target) : null }))
      .filter((s) => !s.target || s.el);
    setSteps(resolved);
    setIndex(0);
  }, [tour]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const step = steps?.[index] ?? null;
  const total = steps?.length ?? 0;

  const close = useCallback(
    (completed: boolean) => onClose(completed),
    [onClose],
  );
  const next = useCallback(() => {
    if (!steps) return;
    if (index >= steps.length - 1) close(true);
    else setIndex((i) => i + 1);
  }, [steps, index, close]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Bring the target into view on step change.
  useEffect(() => {
    if (step?.el) {
      step.el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [step]);

  // Track the target's rect while open — survives smooth scroll,
  // resizes, and late layout shifts without event-listener bingo.
  useEffect(() => {
    const tick = () => {
      if (step?.el) {
        const r = step.el.getBoundingClientRect();
        setRect((prev) =>
          prev &&
          Math.abs(prev.top - r.top) < 1 &&
          Math.abs(prev.left - r.left) < 1 &&
          Math.abs(prev.width - r.width) < 1 &&
          Math.abs(prev.height - r.height) < 1
            ? prev
            : r,
        );
      } else {
        setRect(null);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [step]);

  // Keyboard controls + focus management.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, next, back]);

  useEffect(() => {
    popRef.current?.focus();
  }, [index, steps]);

  // Place the popover after it has a measurable size.
  useLayoutEffect(() => {
    if (narrow) {
      setPopPos(null);
      return;
    }
    const pop = popRef.current;
    if (!pop) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    if (!rect) {
      setPopPos({ top: Math.max(24, vh / 2 - ph / 2), left: vw / 2 - pw / 2 });
      return;
    }
    const margin = 12;
    const below = rect.bottom + margin + ph <= vh - 8;
    const top = below
      ? rect.bottom + margin
      : Math.max(8, rect.top - margin - ph);
    const left = Math.min(Math.max(8, rect.left), vw - pw - 8);
    setPopPos({ top, left });
  }, [rect, narrow, index, steps]);

  if (!steps || !step) return null;

  const pad = 6;

  return (
    <div className="fixed inset-0 z-[90]" role="presentation">
      {/* Click-catcher: dims when no spotlight; advances on click. */}
      <div
        onClick={next}
        className="absolute inset-0"
        style={rect ? undefined : { background: "rgba(2, 6, 23, 0.72)" }}
      />
      {/* Spotlight over the target; the giant shadow does the dimming. */}
      {rect && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl transition-all duration-200"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow:
              "0 0 0 2px var(--color-brand-400, #7c9cf5), 0 0 0 100vmax rgba(2, 6, 23, 0.72)",
          }}
        />
      )}

      <div
        ref={popRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={step.title}
        onClick={(e) => e.stopPropagation()}
        className={
          narrow
            ? "fixed inset-x-3 bottom-3 rounded-2xl border border-ink-200 bg-white p-5 shadow-2xl outline-none dark:border-ink-700 dark:bg-ink-900"
            : "fixed w-[360px] max-w-[92vw] rounded-2xl border border-ink-200 bg-white p-5 shadow-2xl outline-none dark:border-ink-700 dark:bg-ink-900"
        }
        style={narrow ? undefined : (popPos ?? { visibility: "hidden" as const })}
      >
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-brand-600 dark:text-brand-300">
          {index + 1} of {total}
        </p>
        <h2 className="mt-1.5 font-display text-lg font-semibold text-ink-900 dark:text-ink-50">
          {step.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
          {step.body}
        </p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => close(false)}
            className="text-xs text-ink-400 transition hover:text-ink-600 dark:hover:text-ink-200"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={back}
                className="rounded-full border border-ink-200 px-4 py-1.5 text-sm font-medium text-ink-700 transition hover:border-ink-300 dark:border-ink-700 dark:text-ink-200"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="rounded-full bg-ink-900 px-4 py-1.5 text-sm font-medium text-ink-50 transition hover:bg-ink-800 dark:bg-ink-50 dark:text-ink-900 dark:hover:bg-ink-100"
            >
              {index >= total - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
