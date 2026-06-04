import { Form } from "react-router";
import { Card, Button } from "~/components/ui";

export function OpenShiftsPanel({
  openShifts,
  submitting,
}: {
  openShifts: Array<{
    id: string;
    kind: string;
    startsAt: number;
    endsAt: number;
    locationLabel: string | null;
    studentFirst: string;
    studentLast: string;
    vehicleLabel: string | null;
  }>;
  submitting: boolean;
}) {
  return (
    <Card className="border-amber-300 bg-amber-50/30 dark:border-amber-800/60 dark:bg-amber-950/20">
      <p className="text-xs uppercase tracking-[0.16em] text-amber-700 dark:text-amber-200">
        {openShifts.length} open shift{openShifts.length === 1 ? "" : "s"} available
      </p>
      <p className="mt-1 text-sm text-ink-700 dark:text-ink-200">
        First instructor to claim gets it. Pay follows the school's
        compensation policy.
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {openShifts.map((s) => (
          <li
            key={s.id}
            className="rounded-xl border border-ink-200 bg-white/80 p-3 dark:border-ink-700 dark:bg-ink-900/60"
          >
            <p className="font-medium text-ink-900 dark:text-ink-50">
              {new Date(s.startsAt).toLocaleString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
            <p className="text-xs text-ink-600 dark:text-ink-300">
              {s.studentFirst} {s.studentLast} · {s.kind.replace("_", " ")}
              {s.vehicleLabel ? ` · ${s.vehicleLabel}` : ""}
              {s.locationLabel ? ` · ${s.locationLabel}` : ""}
            </p>
            <Form method="post" className="mt-2">
              <input type="hidden" name="intent" value="claim_open_shift" />
              <input type="hidden" name="appointmentId" value={s.id} />
              <Button type="submit" disabled={submitting} className="w-full text-xs">
                Claim shift
              </Button>
            </Form>
          </li>
        ))}
      </ul>
    </Card>
  );
}
