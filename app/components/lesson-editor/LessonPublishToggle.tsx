import { Form } from "react-router";
import { Button } from "~/components/ui";

export function LessonPublishToggle({ published }: { published: number }) {
  return (
    <Form method="post">
      <input type="hidden" name="intent" value={published ? "unpublish" : "publish"} />
      <Button type="submit" variant={published ? "secondary" : "primary"}>
        {published ? "Unpublish" : "Publish"}
      </Button>
    </Form>
  );
}
