import { useEffect, useRef, useState } from "react";

/**
 * Audio player with server-side listen tracking.
 *
 * Counts monotonic forward play time only — scrubbing to the end,
 * tab-hiding, and >1.5x speedruns don't earn credit. Posts a
 * heartbeat every 10 seconds (or on visibility change / pause / end)
 * with the delta since the last beat. Server caps and accumulates.
 *
 * Renders a normal HTML5 audio element with custom progress display
 * that shows how much of the lesson the student has *actually heard*.
 *
 * Future v2: surface a per-paragraph "engagement check" prompt every
 * 90 seconds — for now, the server-side ground truth + the parent
 * dashboard is the deterrent.
 */

type Props = {
  src: string;
  lessonId: string;
  /** From the lesson loader — used for the >= 85% completion target. */
  estimatedSeatMinutes: number;
  /** Cumulative total before this visit, so we don't double-count. */
  initialTotalSeconds?: number;
};

export function TrackedAudioPlayer({
  src,
  lessonId,
  estimatedSeatMinutes,
  initialTotalSeconds = 0,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const pendingDeltaRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);
  const lastSyncAtRef = useRef<number>(Date.now());
  const tabHiddenRef = useRef<boolean>(false);
  const hiddenStartRef = useRef<number | null>(null);

  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(initialTotalSeconds);
  const [meetsThreshold, setMeetsThreshold] = useState(false);
  const [warn, setWarn] = useState<string | null>(null);

  const requiredSeconds = duration > 0 ? duration * 0.85 : estimatedSeatMinutes * 60 * 0.85;

  async function flush(extra: { ended?: boolean; hidden?: boolean } = {}) {
    const a = audioRef.current;
    if (!a) return;
    const delta = pendingDeltaRef.current;
    pendingDeltaRef.current = 0;
    if (delta <= 0 && !extra.ended) return;
    const fd = new FormData();
    fd.set("sessionId", sessionIdRef.current);
    fd.set("schoolLessonId", lessonId);
    fd.set("secondsPlayedDelta", String(delta));
    fd.set("currentPositionSec", String(a.currentTime));
    fd.set("playbackRate", String(a.playbackRate));
    fd.set("hidden", extra.hidden ? "1" : "0");
    fd.set("ended", extra.ended ? "1" : "0");
    fd.set("audioDurationSec", String(a.duration || 0));

    try {
      const res = await fetch("/api/lesson/listen-heartbeat", {
        method: "POST",
        body: fd,
        keepalive: true,
      });
      if (res.ok) {
        const j = (await res.json()) as {
          totalSeconds: number;
          meetsThreshold: boolean;
        };
        setTotalSeconds(j.totalSeconds);
        setMeetsThreshold(j.meetsThreshold);
      }
    } catch {
      // best-effort — visibility-change can race the unload
    }
    lastSyncAtRef.current = Date.now();
  }

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onMeta = () => setDuration(a.duration || 0);
    const onTime = () => {
      const now = a.currentTime;
      const last = lastTickRef.current;
      setPosition(now);
      // Only credit forward play that happens within 1s of the last
      // tick (browsers fire timeupdate every ~250ms during normal play).
      if (!a.paused && !tabHiddenRef.current && now > last && now - last < 1.0) {
        pendingDeltaRef.current += now - last;
      }
      lastTickRef.current = now;

      if (a.playbackRate > 1.75) {
        setWarn("Audio sped up past 1.75× — listen-time is being slowed down to keep your progress honest.");
      } else {
        setWarn(null);
      }

      // Flush every 10s of wall clock.
      if (Date.now() - lastSyncAtRef.current > 10_000) {
        void flush();
      }
    };
    const onPlay = () => {
      lastTickRef.current = a.currentTime;
    };
    const onPause = () => {
      void flush();
    };
    const onEnded = () => {
      void flush({ ended: true });
    };
    const onSeeking = () => {
      // Scrubbing: don't credit forward jumps. The next timeupdate
      // will reset lastTickRef to the new position.
      lastTickRef.current = a.currentTime;
    };
    const onVisChange = () => {
      const hidden = document.visibilityState === "hidden";
      tabHiddenRef.current = hidden;
      if (hidden) hiddenStartRef.current = Date.now();
      void flush({ hidden });
    };

    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);
    a.addEventListener("seeking", onSeeking);
    document.addEventListener("visibilitychange", onVisChange);
    const unload = () => void flush();
    window.addEventListener("pagehide", unload);

    return () => {
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("seeking", onSeeking);
      document.removeEventListener("visibilitychange", onVisChange);
      window.removeEventListener("pagehide", unload);
      void flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  const pct = duration > 0 ? Math.min(100, (totalSeconds / duration) * 100) : 0;
  const remaining = Math.max(0, requiredSeconds - totalSeconds);

  return (
    <div className="flex flex-col gap-3">
      <audio ref={audioRef} controls src={src} className="w-full" />
      <div>
        <div className="flex items-center justify-between text-xs text-ink-600 dark:text-ink-300">
          <span>
            Listened: {formatTime(totalSeconds)}
            {duration > 0 && ` / ${formatTime(duration)}`}
          </span>
          {meetsThreshold ? (
            <span className="font-medium text-emerald-700 dark:text-emerald-300">
              ✓ Lesson audio complete
            </span>
          ) : (
            <span className="text-ink-500 dark:text-ink-400">
              {Math.ceil(remaining)}s left to unlock the quiz
            </span>
          )}
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
          <div
            className={[
              "h-full transition-all duration-300",
              meetsThreshold
                ? "bg-emerald-500"
                : "bg-gradient-to-r from-brand-500 to-accent-500",
            ].join(" ")}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      {warn && (
        <p className="rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200">
          {warn}
        </p>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
