import { StatTile } from "~/components/ui";
import { humanDuration, type Loader } from "./helpers";

export function FunnelSection({ data }: { data: Loader }) {
  const { funnel } = data;
  if (funnel.enrolled === 0) return null;
  const conversion = funnel.enrolled > 0 ? funnel.paid / funnel.enrolled : 0;
  const fastest = funnel.fastestMs ? humanDuration(funnel.fastestMs) : null;
  const avg = funnel.avgMs ? humanDuration(Math.round(funnel.avgMs)) : null;
  return (
    <section>
      <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
        Enrollment funnel, {data.period.label.toLowerCase()}
      </h2>
      <div className="grid gap-4 md:grid-cols-3">
        <StatTile
          label="Enrolled"
          value={funnel.enrolled}
          hint="new enrollment records created"
        />
        <StatTile
          tone={conversion >= 0.8 ? "emerald" : conversion >= 0.5 ? "amber" : "rose"}
          label="Paid through"
          value={`${funnel.paid} (${Math.round(conversion * 100)}%)`}
          hint={
            funnel.paid === funnel.enrolled
              ? "every enrollment paid"
              : "of enrollments produced a paid payment"
          }
        />
        <StatTile
          label="Time to paid"
          value={avg ?? "—"}
          hint={fastest ? `Fastest: ${fastest}` : "average from enrollment to paid"}
        />
      </div>
    </section>
  );
}
