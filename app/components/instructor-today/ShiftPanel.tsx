import { Form } from "react-router";
import { Card, Button } from "~/components/ui";
import { Field, Select, TextInput } from "~/components/form";

export function ShiftPanel({
  openShift,
  bookableVehicles,
  submitting,
}: {
  openShift: {
    id: string;
    vehicleId: string;
    startedAt: number;
    startOdometer: number;
    flaggedIssue: string | null;
    vehicleLabel: string;
  } | null;
  bookableVehicles: Array<{ id: string; label: string; currentOdometer: number | null }>;
  submitting: boolean;
}) {
  if (openShift) {
    return (
      <Card className="border-emerald-300 bg-emerald-50/30 dark:border-emerald-800/60 dark:bg-emerald-950/20">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-200">
              On shift · {openShift.vehicleLabel}
            </p>
            <p className="mt-1 text-sm text-ink-700 dark:text-ink-200">
              Started {new Date(openShift.startedAt).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })} ·{" "}
              {openShift.startOdometer.toLocaleString()} mi
            </p>
          </div>
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer select-none text-sm font-medium text-brand-700 dark:text-brand-200">
            End shift
          </summary>
          <Form method="post" className="mt-3 grid gap-3 md:grid-cols-3">
            <input type="hidden" name="intent" value="end_shift" />
            <input type="hidden" name="shiftId" value={openShift.id} />
            <Field label="End odometer (mi)">
              <TextInput
                name="endOdometer"
                type="number"
                min={openShift.startOdometer}
                required
                defaultValue={openShift.startOdometer.toString()}
              />
            </Field>
            <Field label="End fuel level">
              <Select name="endFuelLevel" defaultValue="">
                <option value="">—</option>
                <option value="empty">Empty</option>
                <option value="quarter">¼</option>
                <option value="half">½</option>
                <option value="three_quarters">¾</option>
                <option value="full">Full</option>
              </Select>
            </Field>
            <Field
              label="Flag an issue (optional)"
              hint="Anything wrong with the car; this flips it out of service automatically until admin clears it."
            >
              <TextInput name="flaggedIssue" type="text" placeholder="Brakes squeaking" />
            </Field>
            <div className="md:col-span-3">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Ending…" : "End shift"}
              </Button>
            </div>
          </Form>
        </details>
      </Card>
    );
  }

  if (bookableVehicles.length === 0) return null;

  return (
    <Card className="border-brand-300 bg-brand-50/30 dark:border-brand-800/60 dark:bg-brand-950/20">
      <details>
        <summary className="cursor-pointer select-none text-sm font-medium text-brand-700 dark:text-brand-200">
          Start a shift — check out a vehicle
        </summary>
        <Form method="post" className="mt-3 grid gap-3 md:grid-cols-2">
          <input type="hidden" name="intent" value="start_shift" />
          <Field label="Vehicle">
            <Select name="vehicleId" required defaultValue={bookableVehicles[0]?.id ?? ""}>
              {bookableVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                  {v.currentOdometer !== null
                    ? ` (${v.currentOdometer.toLocaleString()} mi)`
                    : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Start odometer (mi)">
            <TextInput name="startOdometer" type="number" min="0" required />
          </Field>
          <Field label="Start fuel level">
            <Select name="startFuelLevel" defaultValue="">
              <option value="">—</option>
              <option value="empty">Empty</option>
              <option value="quarter">¼</option>
              <option value="half">½</option>
              <option value="three_quarters">¾</option>
              <option value="full">Full</option>
            </Select>
          </Field>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
              <input
                type="checkbox"
                name="walkAroundOk"
                defaultChecked
                className="h-4 w-4 rounded border-ink-300"
              />
              Walk-around inspection passed
            </label>
          </div>
          <Field label="Walk-around notes (optional)">
            <TextInput
              name="walkAroundNotes"
              type="text"
              placeholder="Tires fine; passenger side mirror loose"
            />
          </Field>
          <div className="md:col-span-2">
            <Button type="submit" disabled={submitting}>
              Start shift
            </Button>
          </div>
        </Form>
      </details>
    </Card>
  );
}
