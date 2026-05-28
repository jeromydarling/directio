import { useEffect, useRef, useState } from "react";

/**
 * In-browser voice recorder with a real audio-cleanup chain.
 *
 * Pipeline (Web Audio API, runs in the user's browser):
 *
 *   getUserMedia (with noiseSuppression / echoCancellation /
 *      autoGainControl flags — browser native cleanup)
 *     │
 *     ▼
 *   MediaStreamSource
 *     │
 *     ▼
 *   BiquadFilterNode (high-pass at 85 Hz — removes HVAC rumble,
 *      handling thumps, mic-stand resonance)
 *     │
 *     ▼
 *   Soft noise gate (threshold-based attenuation via a custom
 *      GainNode driven by an AnalyserNode RMS reading) — drops
 *      background room hiss between sentences
 *     │
 *     ▼
 *   DynamicsCompressorNode (ratio 3:1, knee 30 dB, threshold -24 dB,
 *      attack 5 ms, release 250 ms — evens out shouted vs whispered
 *      passages, makes the recording broadcast-consistent)
 *     │
 *     ▼
 *   GainNode (post-compressor makeup gain)
 *     │
 *     ▼
 *   MediaStreamDestination → MediaRecorder → Opus in WebM
 *
 * The AnalyserNode also drives the live level meter so the user can
 * see they're picking up sound and aren't clipping.
 *
 * Works on:
 *  - Desktop Chrome, Firefox, Edge, Safari 14+
 *  - iOS Safari 14.5+ (MediaRecorder shipped)
 *  - Android Chrome / Samsung Internet
 *
 * Not supported: legacy iOS Safari (<14.5). We feature-detect and
 * show a friendly "use a desktop or update iOS" message.
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
  /** Hint about what to say. */
  prompt?: string;
};

export function VoiceRecorder({
  uploadUrl,
  uploadFields = {},
  onUploaded,
  label,
  prompt,
}: VoiceRecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0); // 0..1 instant RMS for the meter
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gateGainRef = useRef<GainNode | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  const browserSupported =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      teardown();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function teardown() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
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
          // Browser-native cleanup — these are honored by Chrome,
          // Firefox, Edge, and Safari 17+ to varying depths. They run
          // before our Web Audio chain so we layer on top of them.
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        },
      });

      streamRef.current = stream;

      // Build the cleanup chain.
      const audioContext = new AudioContext({ sampleRate: 48000 });
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);

      // High-pass at 85 Hz — strips rumble / footsteps / HVAC.
      const highpass = audioContext.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 85;
      highpass.Q.value = 0.7;

      // Soft noise gate — driven below by an analyzer RMS loop.
      // Starts at unity gain; rAF loop attenuates when RMS is low.
      const gateGain = audioContext.createGain();
      gateGain.gain.value = 1;
      gateGainRef.current = gateGain;

      // Compressor — typical voice settings. The compressor smooths
      // dynamic range so loud and quiet passages even out, and acts
      // as a safety brake against clipping.
      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 30;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.25;

      // Makeup gain (slight boost so the post-compressor signal sits
      // around -16 dB FS where ElevenLabs and other downstream
      // processors expect it).
      const makeup = audioContext.createGain();
      makeup.gain.value = 1.6;

      // Analyzer for the gate decision + the visible level meter.
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyserRef.current = analyser;

      // Wire it: source → highpass → gateGain → compressor → makeup →
      // analyser → destination.
      const dest = audioContext.createMediaStreamDestination();
      source.connect(highpass);
      highpass.connect(gateGain);
      gateGain.connect(compressor);
      compressor.connect(makeup);
      makeup.connect(analyser);
      analyser.connect(dest);

      // Drive the gate + level meter from the analyser.
      const buf = new Float32Array(analyser.fftSize);
      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        // Smooth meter and clamp to 0..1.
        const meter = Math.min(1, rms * 4);
        setLevel((prev) => prev * 0.7 + meter * 0.3);
        // Soft gate: below RMS 0.012 attenuate to 30% gain. Smooth
        // attack to avoid clicks.
        const targetGain = rms < 0.012 ? 0.3 : 1;
        const now = audioContext.currentTime;
        gateGain.gain.setTargetAtTime(targetGain, now, 0.08);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      // MediaRecorder records the processed stream.
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
    recordingStartRef.current = Date.now();
    recorderRef.current.start(250); // 250ms slices
    setState("recording");
    const tick = () => {
      setElapsedMs(Date.now() - recordingStartRef.current);
      if (recorderRef.current?.state === "recording") {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    tick();
  }

  function stopRecording() {
    recorderRef.current?.stop();
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

  return (
    <div className="rounded-2xl border border-ink-200 bg-white/70 p-5 backdrop-blur-sm dark:border-ink-800 dark:bg-ink-900/40">
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

      <div className="mt-4 flex flex-col gap-4">
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
          <>
            <LevelMeter level={level} active={state === "recording"} />
            <div className="flex flex-wrap items-center gap-3">
              {state === "ready" ? (
                <button
                  type="button"
                  onClick={startRecording}
                  className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-5 py-2.5 text-sm font-medium text-white shadow-[0_4px_16px_-4px_rgba(225,29,72,0.6)]"
                >
                  <span aria-hidden className="grid h-2 w-2 place-items-center rounded-full bg-white" />
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
                Level meter: {meterPct}%{" "}
                {meterPct < 8 && state === "recording" ? "(very quiet — speak up)" : ""}
                {meterPct > 90 ? "(clipping — back off the mic)" : ""}
              </p>
            </div>
          </>
        )}

        {state === "done" && previewUrl && (
          <>
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
          </>
        )}

        {state === "uploading" && (
          <p className="text-sm text-ink-600 dark:text-ink-300">Uploading your take…</p>
        )}
      </div>
    </div>
  );
}

function LevelMeter({ level, active }: { level: number; active: boolean }) {
  // 24 segments lit progressively.
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
