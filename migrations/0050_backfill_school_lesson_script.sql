-- Backfill: copy narrationScript from the master `lesson` row to every
-- existing `school_lesson` that was installed before the deepCopy
-- function knew to copy the script column. Without this, the audio
-- resolver hashes `body` instead of `narrationScript` on these school
-- copies, misses the shared cache (which was built from scripts),
-- and triggers an on-the-fly Aura-2 render on every page load.

UPDATE school_lesson
   SET narrationScript = (
         SELECT l.narrationScript
           FROM lesson l
          WHERE l.id = school_lesson.sourceLessonId
       )
 WHERE narrationScript IS NULL
   AND sourceLessonId IS NOT NULL
   AND EXISTS (
         SELECT 1 FROM lesson l
          WHERE l.id = school_lesson.sourceLessonId
            AND l.narrationScript IS NOT NULL
       );
