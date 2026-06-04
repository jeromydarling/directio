import { Card } from "~/components/ui";
import { VoiceRecorder } from "~/components/voice-recorder";

export type LessonNarrationLesson = {
  id: string;
  title: string;
  narrationScript: string | null;
  narrationAudioR2Key: string | null;
  narrationAudioVoiceId: string | null;
  narrationAudioGeneratedAt: number | null;
};

export function LessonNarrationSection({ lesson }: { lesson: LessonNarrationLesson }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
        Narration
      </h2>
      <div className="flex flex-col gap-4">
        {lesson.narrationAudioR2Key ? (
          <Card>
            <div className="flex flex-col gap-2">
              <p className="text-sm text-ink-700 dark:text-ink-200">
                Narration saved{" "}
                {lesson.narrationAudioGeneratedAt
                  ? new Date(lesson.narrationAudioGeneratedAt).toLocaleString()
                  : ""}
                {" — "}
                <span className="font-mono text-xs text-ink-500 dark:text-ink-400">
                  {lesson.narrationAudioVoiceId === "owner-recorded"
                    ? "owner-recorded"
                    : lesson.narrationAudioVoiceId ?? "AI"}
                </span>
              </p>
              <audio
                controls
                src={`/audio/narration/${lesson.narrationAudioR2Key}`}
                className="w-full"
              />
            </div>
          </Card>
        ) : null}

        <VoiceRecorder
          uploadUrl="/api/lesson/narration/upload"
          uploadFields={{ lessonId: lesson.id }}
          label={`Record narration: ${lesson.title}`}
          prompt="Read the script below at a comfortable pace. We clean up the audio in your browser before saving — high-pass filter, soft noise gate, compressor — so you don't need a studio mic."
          script={lesson.narrationScript ?? undefined}
        />
      </div>
    </section>
  );
}
