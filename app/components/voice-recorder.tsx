import { useEffect, useMemo, useRef, useState } from "react";

/**
 * In-browser voice recorder with a real audio-cleanup chain and a
 * teleprompter for the narration script.
 *
 * Audio pipeline (runs in the user's browser before any byte leaves):
 *
 *   getUserMedia (with noiseSuppression / echoCancellation /
 *      autoGainControl flags — browser-native cleanup)
 *     │
 *     ▼
 *   MediaStreamSource
 *     │
 *     ▼
 *   BiquadFilterNode (high-pass at 85 Hz — removes HVAC rumble,
 *      handling thumps, mic-stand resonance)
 *     │
 *     ▼
 *   Soft noise gate (threshold-based attenuation driven by an
 *      AnalyserNode RMS reading) — drops background hiss between
 *      sentences
 *     │
 *     ▼
 *   DynamicsCompressorNode (ratio 3:1, knee 30 dB, threshold -24 dB,
 *      attack 5 ms, release 250 ms — evens shouted vs whispered)
 *     │
 *     ▼
 *   GainNode (post-compressor makeup gain)
 *     │
 *     ▼
 *   MediaStreamDestination → MediaRecorder → Opus in WebM
 *
 * Teleprompter:
 *  - If a `script` is provided, it renders large-type with auto-scroll
 *    while recording. Pace is user-adjustable (slow / normal / fast).
 *  - The current paragraph is highlighted; the rest dim slightly so
 *    the eye knows where to go without thinking.
 *  - Position is calculated from elapsed time × words-per-minute, not
 *    from voice-recognition. Simpler and works offline.
 *
 * Browser support: desktop Chrome, Firefox, Edge, Safari 14+; iOS
 * Safari 14.5+; Android Chrome.
 */

type RecorderState = "idle" | "requesting" | "ready" | "recording" | "uploading" | "done" | "error";

export type VoiceRecorderProps = {
  /** Where to POST the recorded blob. The server upload endpoint. */
  uploadUrl: string;
  /** Optional form data fields to include with the upload (lesson id, etc.). */
  uploadFields?: Record<string, string>;
  /** Called after a successful upload with the server's response JSON. */
  onUploaded?: (response: { audioUrl: string; durationSec: number }) => void;
  /** Display label, e.g. "Record narration for: Reading traffic signs". */
  label?: string;
  /** Hint about what to do. */
  prompt?: string;
  /**
   * The script to read. Plain text with `\n\n` between paragraphs.
   * When present, the recorder shows a teleprompter that auto-scrolls
   * while recording.
   */
  script?: string;
};

const PACE_PRESETS: Array<{ key: "slow" | "normal" | "fast"; label: string; wpm: number }> = [
  { key: "slow", label: "Slow", wpm: 130 },
  { key: "normal", label: "Normal", wpm: 150 },
  { key: "fast", label: "Fast", wpm: 175 },
];

export function VoiceRecorder({
  uploadUrl,
  uploadFields = {},
  onUploaded,
  label,
  prompt,
  script,
}: VoiceRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [paceKey, setPaceKey] = useState<"slow" | "normal" | "fast">("normal");

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gateGainRef = useRef<GainNode | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartRef = useRef<number>(0);
  const meterRafRef = useRef<number | null>(null);
  const elapsedRafRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const scriptContainerRef = useRef<HTMLDivElement | null>(null);
  const paragraphRefs = useRef<Array<HTMLParagraphElement | null>>([]);

  const browserSupported =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  // Break the script into paragraphs and pre-compute the cumulative
  // word count up to each paragraph. We use that to figure out which
  // paragraph the reader should be on at time T given a target wpm.
  const paragraphs = useMemo(() => {
    if (!script) return [] as Array<{ text: string; cumulativeWords: number; words: number }>;
    const paras = script.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
    let cum = 0;
    return paras.map((text) => {
      const words = text.split(/\s+/).length;
      cum += words;
      return { text, cumulativeWords: cum, words };
    });
  }, [script]);
  const totalWords = paragraphs.length ? paragraphs[paragraphs.length - 1].cumulativeWords : 0;
  const pace = PACE_PRESETS.find((p) => p.key === paceKey)!;

  // Which paragraph is "active" right now (based on elapsed time × wpm)?
  const activeParagraphIndex = useMemo(() => {
    if (!paragraphs.length || state !== "recording") return -1;
    const minutesIn = elapsedMs / 60_000;
    const wordsRead = minutesIn * pace.wpm;
    // Find the first paragraph whose cumulative end > wordsRead.
    for (let i = 0; i < paragraphs.length; i++) {
      if (paragraphs[i].cumulativeWords > wordsRead) return i;
    }
    return paragraphs.length - 1;
  }, [elapsedMs, paragraphs, pace.wpm, state]);

  // Auto-scroll loop: smoothly move scrollTop toward the active
  // paragraph's position ~40% down the viewport.
  useEffect(() => {
    if (state !== "recording" || activeParagraphIndex < 0) {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
      return;
    }
    const container = scriptContainerRef.current;
    const target = paragraphRefs.current[activeParagraphIndex];
    if (!container || !target) return;

    const tick = () => {
      const cont = scriptContainerRef.current;
      const tgt = paragraphRefs.current[activeParagraphIndex];
      if (!cont || !tgt) return;
      const desired =
        tgt.offsetTop - cont.clientHeight * 0.4 + tgt.clientHeight / 2;
      const current = cont.scrollTop;
      const delta = desired - current;
      if (Math.abs(delta) < 0.5) {
        cont.scrollTop = desired;
        scrollRafRef.current = requestAnimationFrame(tick);
        return;
      }
      cont.scrollTop = current + delta * 0.08; // ease toward target
      scrollRafRef.current = requestAnimationFrame(tick);
    };
    scrollRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    };
  }, [state, activeParagraphIndex]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      teardown();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function teardown() {
    if (meterRafRef.current !== null) cancelAnimationFrame(meterRafRef.current);
    if (elapsedRafRef.current !== null) cancelAnimationFrame(elapsedRafRef.current);
    if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
    meterRafRef.current = null;
    elapsedRafRef.current = null;
    scrollRafRef.current = null;
    recorderRef.current?.state === "recording" && recorderRef.current.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
  }

  async function requestMic() {
    setError(null);
    setState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 48000 });
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);

      const highpass = audioContext.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 85;
      highpass.Q.value = 0.7;

      const gateGain = audioContext.createGain();
      gateGain.gain.value = 1;
      gateGainRef.current = gateGain;

      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 30;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.25;

      const makeup = audioContext.createGain();
      makeup.gain.value = 1.6;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyserRef.current = analyser;

      const dest = audioContext.createMediaStreamDestination();
      source.connect(highpass);
      highpass.connect(gateGain);
      gateGain.connect(compressor);
      compressor.connect(makeup);
      makeup.connect(analyser);
      analyser.connect(dest);

      const buf = new Float32Array(analyser.fftSize);
      const meterTick = () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        const meter = Math.min(1, rms * 4);
        setLevel((prev) => prev * 0.7 + meter * 0.3);
        const targetGain = rms < 0.012 ? 0.3 : 1;
        const now = audioContext.currentTime;
        gateGain.gain.setTargetAtTime(targetGain, now, 0.08);
        meterRafRef.current = requestAnimationFrame(meterTick);
      };
      meterTick();

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";
      const recorder = new MediaRecorder(dest.stream, { mimeType, audioBitsPerSecond: 96000 });
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordingChunksRef.current, { type: mimeType });
        recordingChunksRef.current = [];
        const url = URL.createObjectURL(blob);
        setPreviewBlob(blob);
        setPreviewUrl(url);
        setState("done");
      };

      setState("ready");
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Mic access was blocked. Open your browser's site settings and allow the microphone for this page."
          : err instanceof DOMException && err.name === "NotFoundError"
            ? "No microphone found on this device."
            : `Could not start the recorder (${(err as Error).message}).`;
      setError(msg);
      setState("error");
      teardown();
    }
  }

  function startRecording() {
    if (!recorderRef.current) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
    recordingChunksRef.current = [];
    // Reset teleprompter to top.
    if (scriptContainerRef.current) scriptContainerRef.current.scrollTop = 0;
    recordingStartRef.current = Date.now();
    setElapsedMs(0);
    recorderRef.current.start(250);
    setState("recording");
    const tick = () => {
      setElapsedMs(Date.now() - recordingStartRef.current);
      if (recorderRef.current?.state === "recording") {
        elapsedRafRef.current = requestAnimationFrame(tick);
      }
    };
    tick();
  }

  function stopRecording() {
    recorderRef.current?.stop();
    if (elapsedRafRef.current !== null) {
      cancelAnimationFrame(elapsedRafRef.current);
      elapsedRafRef.current = null;
    }
  }

  async function uploadRecording() {
    if (!previewBlob) return;
    setState("uploading");
    setError(null);
    try {
      const fd = new FormData();
      for (const [k, v] of Object.entries(uploadFields)) fd.set(k, v);
      const ext = previewBlob.type.includes("webm") ? "webm" : "mp4";
      fd.set("audio", previewBlob, `recording.${ext}`);
      fd.set("durationMs", String(elapsedMs));
      const res = await fetch(uploadUrl, { method: "POST", body: fd });
      if (!res.ok) {
        throw new Error(`Upload failed (${res.status} ${await res.text().catch(() => "")})`);
      }
      const json = (await res.json()) as { audioUrl: string; durationSec: number };
      onUploaded?.(json);
      setState("done");
    } catch (err) {
      setError((err as Error).message);
      setState("error");
    }
  }

  function discardRecording() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
    setElapsedMs(0);
    setState("ready");
  }

  if (!browserSupported) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200">
        Your browser doesn't support in-app recording. Use a recent desktop browser
        (Chrome, Firefox, Edge, Safari) or iOS 14.5+ on iPhone.
      </div>
    );
  }

  const seconds = Math.floor(elapsedMs / 1000);
  const meterPct = Math.round(level * 100);
  const isRecording = state === "recording";
  const showTeleprompter = paragraphs.length > 0 && (state === "ready" || state === "recording");

  // Estimated total reading time at current pace, for the operator's planning.
  const estMinutes = totalWords / pace.wpm;
  const estMin = Math.floor(estMinutes);
  const estSec = Math.round((estMinutes - estMin) * 60);

  return (
    <div
      className={[
        "overflow-hidden rounded-2xl border bg-white/70 backdrop-blur-sm transition-all dark:bg-ink-900/40",
        isRecording
          ? "border-rose-400/60 shadow-[0_0_0_4px_rgba(244,63,94,0.08)]"
          : "border-ink-200 dark:border-ink-800",
      ].join(" ")}
    >
      {/* Header */}
      <div className="border-b border-ink-200/60 px-5 py-4 dark:border-ink-800/60">
        {label && (
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-brand-600 dark:text-brand-300">
            Record your own narration
          </p>
        )}
        {label && (
          <h3 className="mt-1 font-display text-lg font-semibold text-ink-900 dark:text-ink-50">
            {label}
          </h3>
        )}
        {prompt && (
          <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">{prompt}</p>
        )}
        {error && (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </p>
        )}
      </div>

      {/* Teleprompter */}
      {showTeleprompter && (
        <div className="relative border-b border-ink-200/60 dark:border-ink-800/60">
          {/* Top + bottom fade for focus */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-white/95 to-transparent dark:from-ink-900/95"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-white/95 to-transparent dark:from-ink-900/95"
          />
          <div
            ref={scriptContainerRef}
            className="relative max-h-[55vh] min-h-[260px] overflow-y-auto px-6 py-12 sm:px-10 sm:py-16"
            style={{ scrollBehavior: "auto" }}
          >
            {paragraphs.map((p, i) => (
              <p
                key={i}
                ref={(el) => {
                  paragraphRefs.current[i] = el;
                }}
                className={[
                  "mx-auto max-w-2xl text-balance text-center font-display text-2xl leading-relaxed tracking-tight transition-all duration-500 sm:text-3xl sm:leading-[1.4]",
                  i === activeParagraphIndex
                    ? "text-ink-900 dark:text-ink-50"
                    : isRecording
                      ? "text-ink-400/60 dark:text-ink-500/60"
                      : "text-ink-700 dark:text-ink-200",
                  i === 0 ? "mt-0" : "mt-10",
                ].join(" ")}
              >
                {p.text}
              </p>
            ))}
          </div>
          {/* Pace + total time */}
          <div className="flex items-center justify-between gap-3 border-t border-ink-200/60 bg-ink-50/60 px-5 py-2.5 text-xs text-ink-500 backdrop-blur dark:border-ink-800/60 dark:bg-ink-950/60 dark:text-ink-400">
            <div className="flex items-center gap-1.5">
              <span className="font-medium uppercase tracking-wider">Pace</span>
              {PACE_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPaceKey(p.key)}
                  className={[
                    "rounded-full px-2.5 py-0.5 text-xs font-medium transition",
                    paceKey === p.key
                      ? "bg-brand-500 text-white"
                      : "text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800/60",
                  ].join(" ")}
                >
                  {p.label} <span className="opacity-60">· {p.wpm}wpm</span>
                </button>
              ))}
            </div>
            <div>
              {totalWords} words ·{" "}
              <span className="font-mono">
                ~{estMin}:{estSec.toString().padStart(2, "0")}
              </span>{" "}
              at this pace
            </div>
          </div>
        </div>
      )}

      {/* Controls + meter */}
      <div className="px-5 py-4">
        {state === "idle" && (
          <div className="flex flex-col items-start gap-2">
            <button
              type="button"
              onClick={requestMic}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-2.5 text-sm font-medium text-white shadow-[0_4px_16px_-4px_var(--color-brand-500)]"
            >
              <span aria-hidden>●</span> Enable microphone
            </button>
            <p className="text-xs text-ink-500 dark:text-ink-400">
              We add a high-pass filter, a soft noise gate, and a compressor in your
              browser before the audio is saved. Nothing is uploaded until you say so.
            </p>
          </div>
        )}

        {state === "requesting" && (
          <p className="text-sm text-ink-600 dark:text-ink-300">
            Waiting for your browser to grant microphone access…
          </p>
        )}

        {(state === "ready" || state === "recording") && (
          <div className="flex flex-col gap-3">
            <LevelMeter level={level} active={isRecording} />
            <div className="flex flex-wrap items-center gap-3">
              {state === "ready" ? (
                <button
                  type="button"
                  onClick={startRecording}
                  className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-5 py-2.5 text-sm font-medium text-white shadow-[0_4px_16px_-4px_rgba(225,29,72,0.6)]"
                >
                  <span
                    aria-hidden
                    className="grid h-2 w-2 place-items-center rounded-full bg-white"
                  />
                  Start recording
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-5 py-2.5 text-sm font-medium text-ink-50 dark:bg-ink-50 dark:text-ink-900"
                >
                  <span aria-hidden>■</span> Stop ({format(seconds)})
                </button>
              )}
              <p className="text-xs text-ink-500 dark:text-ink-400">
                {meterPct}%{" "}
                {meterPct < 8 && isRecording ? "(very quiet — speak up)" : ""}
                {meterPct > 90 ? "(clipping — back off the mic)" : ""}
                {showTeleprompter && isRecording && activeParagraphIndex >= 0
                  ? ` · paragraph ${activeParagraphIndex + 1} / ${paragraphs.length}`
                  : ""}
              </p>
            </div>
          </div>
        )}

        {state === "done" && previewUrl && (
          <div className="flex flex-col gap-3">
            <audio
              controls
              src={previewUrl}
              className="w-full"
              aria-label="Preview your recording"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={uploadRecording}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-2.5 text-sm font-medium text-white shadow-[0_4px_16px_-4px_var(--color-brand-500)]"
              >
                Save this take →
              </button>
              <button
                type="button"
                onClick={() => {
                  discardRecording();
                  startRecording();
                }}
                className="text-sm font-medium text-ink-700 hover:text-ink-900 dark:text-ink-200 dark:hover:text-ink-50"
              >
                Record again
              </button>
              <button
                type="button"
                onClick={discardRecording}
                className="text-sm text-ink-500 hover:text-ink-700 dark:text-ink-400 dark:hover:text-ink-200"
              >
                Discard
              </button>
            </div>
            <p className="text-xs text-ink-500 dark:text-ink-400">
              Duration: {format(Math.floor(elapsedMs / 1000))}. The cleanup chain
              already ran on the audio above — what you hear is what gets saved.
            </p>
          </div>
        )}

        {state === "uploading" && (
          <p className="text-sm text-ink-600 dark:text-ink-300">Uploading your take…</p>
        )}
      </div>
    </div>
  );
}

function LevelMeter({ level, active }: { level: number; active: boolean }) {
  const segments = 24;
  const litCount = Math.round(level * segments);
  return (
    <div
      className="flex h-7 items-end gap-0.5 rounded-md bg-ink-100/60 px-1 py-1 dark:bg-ink-900/60"
      role="meter"
      aria-valuenow={Math.round(level * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {Array.from({ length: segments }, (_, i) => {
        const lit = i < litCount;
        const color =
          i < segments * 0.6
            ? "bg-emerald-500"
            : i < segments * 0.85
              ? "bg-amber-500"
              : "bg-rose-500";
        return (
          <span
            key={i}
            className={[
              "h-full w-full rounded-[1px] transition-opacity",
              lit ? color : "bg-ink-300/50 dark:bg-ink-700/50",
              active ? "opacity-100" : "opacity-60",
            ].join(" ")}
            style={{ height: `${30 + (i / segments) * 70}%` }}
          />
        );
      })}
    </div>
  );
}

function format(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
