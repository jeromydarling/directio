import { Form } from "react-router";
import { Card, Button } from "~/components/ui";
import { Field, TextInput, TextArea } from "~/components/form";

export type LessonContentFormLesson = {
  title: string;
  body: string;
  estimatedSeatMinutes: number;
};

export function LessonContentForm({
  lesson,
  submitting,
}: {
  lesson: LessonContentFormLesson;
  submitting: boolean;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
        Lesson content
      </h2>
      <Card>
        <Form method="post" className="flex flex-col gap-4">
          <input type="hidden" name="intent" value="save-lesson" />
          <Field label="Title">
            <TextInput name="title" type="text" defaultValue={lesson.title} required />
          </Field>
          <Field label="Estimated seat minutes" hint="How long a student should plan to spend.">
            <TextInput
              name="estimatedSeatMinutes"
              type="number"
              min="1"
              defaultValue={lesson.estimatedSeatMinutes}
              required
            />
          </Field>
          <Field label="Body (markdown)" hint="Headings, lists, and emphasis are supported.">
            <TextArea
              name="body"
              defaultValue={lesson.body}
              className="min-h-[24rem] font-mono text-sm leading-relaxed"
            />
          </Field>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save lesson"}
          </Button>
        </Form>
      </Card>
    </section>
  );
}
