import { Card } from "~/components/ui";
import { TrackedAudioPlayer } from "~/components/tracked-audio-player";

type Props = {
  audioUrl: string;
  lessonId: string;
  estimatedSeatMinutes: number;
  initialTotalSeconds: number;
};

export function LessonAudioBlock({
  audioUrl,
  lessonId,
  estimatedSeatMinutes,
  initialTotalSeconds,
}: Props) {
  return (
    <Card>
      <p className="mb-2 text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
        Listen along
      </p>
      <TrackedAudioPlayer
        src={audioUrl}
        lessonId={lessonId}
        estimatedSeatMinutes={estimatedSeatMinutes}
        initialTotalSeconds={initialTotalSeconds}
      />
    </Card>
  );
}
