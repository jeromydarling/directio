import { useMemo, useState } from "react";
import {
  PLATFORM_FEE_CAP_CENTS,
  platformFeeCentsFor,
  processingFeeCentsFor,
} from "~/lib/platform-fees";

/**
 * "What would directio actually cost me?" — the profit calculator on
 * /pricing. Every directio number comes from app/lib/platform-fees.ts, the same
 * module checkout uses, so the estimate here is the fee a school
 * really pays. Incumbent numbers are published list prices (sources
 * in the footnote); every one is editable because nobody's stack is
 * exactly the default.
 */

type Processor = { key: string; label: string; bps: number; fixedCents: number };
const PROCESSORS: Processor[] = [
  { key: "square_online", label: "Square online / invoices (3.3% + 30¢)", bps: 330, fixedCents: 30 },
  { key: "square_inperson", label: "Square in person (2.6% + 15¢)", bps: 260, fixedCents: 15 },
  { key: "stripe", label: "Stripe direct (2.9% + 30¢)", bps: 290, fixedCents: 30 },
  { key: "paypal", label: "PayPal invoicing (3.49% + 49¢)", bps: 349, fixedCents: 49 },
  { key: "cash", label: "Zelle / checks / cash (0%)", bps: 0, fixedCents: 0 },
];

type Tool = { key: string; label: string; monthlyCents?: number; perStudentCents?: number; on: boolean };
const DEFAULT_TOOLS: Tool[] = [
  { key: "scheduling", label: "Scheduling (Acuity Standard, Calendly Teams…)", monthlyCents: 3400, on: true },
  { key: "website", label: "Website builder (Wix Core, Squarespace…)", monthlyCents: 3600, on: true },
  { key: "lms", label: "Online classroom (Thinkific Basic, Teachable…)", monthlyCents: 5400, on: true },
  { key: "drivescout", label: "Driving-school software (DriveScout, 5-seat minimum)", monthlyCents: 25000, on: false },
  { key: "des", label: "Drivers Ed Solutions (per student)", perStudentCents: 625, on: false },
];

const STUDIO_MONTHLY_CENTS = 2900;

function usd(cents: number, opts: { sign?: boolean } = {}): string {
  const abs = Math.abs(cents);
  const s = `$${(abs / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (opts.sign && cents < 0) return `−${s}`;
  return s;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function PricingCalculator() {
  const [enrollments, setEnrollments] = useState(15);
  const [priceDollars, setPriceDollars] = useState(600);
  const [processor, setProcessor] = useState("square_online");
  const [tools, setTools] = useState<Tool[]>(DEFAULT_TOOLS);
  const [bankShare, setBankShare] = useState(60);
  const [studio, setStudio] = useState(false);

  const r = useMemo(() => {
    const n = Math.max(0, Math.floor(enrollments || 0));
    const p = Math.max(0, Math.round((priceDollars || 0) * 100));
    const proc = PROCESSORS.find((x) => x.key === processor) ?? PROCESSORS[0];

    const todayProcessing = n * (Math.round((p * proc.bps) / 10000) + (p > 0 ? proc.fixedCents : 0));
    const todaySoftware = tools.reduce(
      (sum, t) => (t.on ? sum + (t.monthlyCents ?? 0) + n * (t.perStudentCents ?? 0) : sum),
      0,
    );
    const todayTotal = todayProcessing + todaySoftware;

    const a = Math.min(1, Math.max(0, bankShare / 100));
    const platform = n * platformFeeCentsFor(p);
    const bank = processingFeeCentsFor(p, "us_bank_account");
    const card = processingFeeCentsFor(p, "card");
    const directioProcessing = Math.round(n * (a * bank + (1 - a) * card));
    const directioSoftware = studio ? STUDIO_MONTHLY_CENTS : 0;
    const directioTotal = platform + directioProcessing + directioSoftware;

    const volume = n * p;
    return {
      n,
      p,
      todayProcessing,
      todaySoftware,
      todayTotal,
      platform,
      directioProcessing,
      directioSoftware,
      directioTotal,
      savingsMonthly: todayTotal - directioTotal,
      todayRate: volume > 0 ? todayTotal / volume : 0,
      directioRate: volume > 0 ? directioTotal / volume : 0,
      bankFee: bank,
      cardFee: card,
      platformPerStudent: platformFeeCentsFor(p),
    };
  }, [enrollments, priceDollars, processor, tools, bankShare, studio]);

  const maxBar = Math.max(r.todayTotal, r.directioTotal, 1);
  const saves = r.savingsMonthly >= 0;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col gap-5 rounded-3xl border border-ink-200 bg-white/70 p-6 backdrop-blur-md dark:border-ink-800 dark:bg-ink-900/40 sm:p-8">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-800 dark:text-ink-200">Enrollments per month</span>
            <input
              type="number"
              min={0}
              step={1}
              value={enrollments}
              onChange={(e) => setEnrollments(Number(e.target.value))}
              className="rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-base text-ink-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200/60 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-50"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-800 dark:text-ink-200">Average package price ($)</span>
            <input
              type="number"
              min={0}
              step={10}
              value={priceDollars}
              onChange={(e) => setPriceDollars(Number(e.target.value))}
              className="rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-base text-ink-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200/60 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-50"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-800 dark:text-ink-200">How families pay you today</span>
          <select
            value={processor}
            onChange={(e) => setProcessor(e.target.value)}
            className="rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-base text-ink-900 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200/60 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-50"
          >
            {PROCESSORS.map((x) => (
              <option key={x.key} value={x.key}>
                {x.label}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-ink-800 dark:text-ink-200">
            Tools you pay for today (edit the amounts)
          </legend>
          {tools.map((t, i) => (
            <div key={t.key} className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex flex-1 items-center gap-2 text-ink-700 dark:text-ink-200">
                <input
                  type="checkbox"
                  checked={t.on}
                  onChange={(e) =>
                    setTools((prev) => prev.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))
                  }
                  className="h-4 w-4 rounded border-ink-300"
                />
                <span>{t.label}</span>
              </label>
              <span className="flex items-center gap-1 text-ink-500 dark:text-ink-400">
                $
                <input
                  type="number"
                  min={0}
                  aria-label={`${t.label} amount`}
                  value={((t.monthlyCents ?? t.perStudentCents ?? 0) / 100).toFixed(2).replace(/\.00$/, "")}
                  onChange={(e) => {
                    const cents = Math.max(0, Math.round(Number(e.target.value) * 100));
                    setTools((prev) =>
                      prev.map((x, j) =>
                        j === i
                          ? x.perStudentCents !== undefined
                            ? { ...x, perStudentCents: cents }
                            : { ...x, monthlyCents: cents }
                          : x,
                      ),
                    );
                  }}
                  className="w-24 rounded-lg border border-ink-200 bg-white px-2 py-1 text-right text-sm text-ink-900 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-50"
                />
                <span className="text-xs">{t.perStudentCents !== undefined ? "/student" : "/mo"}</span>
              </span>
            </div>
          ))}
        </fieldset>

        <label className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between text-sm font-medium text-ink-800 dark:text-ink-200">
            <span>Families who'll pay by bank account</span>
            <span className="font-display text-base text-brand-700 dark:text-brand-300">{bankShare}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={bankShare}
            onChange={(e) => setBankShare(Number(e.target.value))}
            className="accent-brand-600"
          />
          <span className="text-xs text-ink-500 dark:text-ink-400">
            Bank is the default at checkout; most families take it when it's offered. Slide to 0 for
            a cards-only worst case.
          </span>
        </label>

        <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
          <input
            type="checkbox"
            checked={studio}
            onChange={(e) => setStudio(e.target.checked)}
            className="h-4 w-4 rounded border-ink-300"
          />
          Add Studio (AI-built website on your domain, $29/mo) — replaces the website line above
        </label>
      </div>

      <div className="flex flex-col gap-5">
        <div
          className={[
            "rounded-3xl border p-6 sm:p-8",
            saves
              ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20"
              : "border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20",
          ].join(" ")}
          aria-live="polite"
        >
          <p className="text-xs uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
            {saves ? "You'd keep" : "It would cost"}
          </p>
          <p className="mt-1 font-display text-4xl font-semibold text-ink-900 sm:text-5xl dark:text-ink-50">
            {usd(Math.abs(r.savingsMonthly))}
            <span className="text-lg font-normal text-ink-500 dark:text-ink-400"> / month</span>
          </p>
          <p className="mt-1 text-sm text-ink-700 dark:text-ink-200">
            {saves ? "compared with your stack today" : "more than your stack today"} —{" "}
            {usd(Math.abs(r.savingsMonthly) * 12)} a year at {r.n} enrollments of {usd(r.p)}.
          </p>
        </div>

        <div className="rounded-3xl border border-ink-200 bg-white/70 p-6 backdrop-blur-md dark:border-ink-800 dark:bg-ink-900/40 sm:p-8">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-500 dark:text-ink-400">
            Monthly cost, today vs. directio
          </p>
          <div className="mt-4 flex flex-col gap-4">
            <Bar label="Your stack today" value={r.todayTotal} max={maxBar} tone="neutral" rate={r.todayRate} />
            <Bar label="directio" value={r.directioTotal} max={maxBar} tone="brand" rate={r.directioRate} />
          </div>

          <table className="mt-6 w-full text-sm">
            <caption className="sr-only">Cost breakdown</caption>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-800/60">
              <Row label="Processing fees today" value={usd(r.todayProcessing)} />
              <Row label="Software today" value={usd(r.todaySoftware)} />
              <Row
                label={`directio fee (2.5%, max $${PLATFORM_FEE_CAP_CENTS / 100}) · ${usd(r.platformPerStudent)}/student`}
                value={usd(r.platform)}
                strong
              />
              <Row
                label={`Processing at cost · bank ${usd(r.bankFee)} / card ${usd(r.cardFee)} per student`}
                value={usd(r.directioProcessing)}
                strong
              />
              {studio && <Row label="Studio website" value={usd(r.directioSoftware)} strong />}
            </tbody>
          </table>
          <p className="mt-4 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
            Estimates from published list prices (Square/NerdWallet, Stripe, Acuity, Wix, Thinkific,
            DriveScout, Drivers Ed Solutions) as of {new Date().getFullYear()}. directio's numbers are
            the exact fee logic checkout runs. Stripe's fee is passed through with no markup; the
            card rate is collected up front and the difference is returned to you the moment a
            bank payment settles.
          </p>
        </div>
      </div>
    </div>
  );
}

function Bar({
  label,
  value,
  max,
  tone,
  rate,
}: {
  label: string;
  value: number;
  max: number;
  tone: "neutral" | "brand";
  rate: number;
}) {
  const width = Math.max(2, Math.round((value / max) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink-700 dark:text-ink-200">{label}</span>
        <span className="font-display font-semibold text-ink-900 dark:text-ink-50">
          {usd(value)}
          <span className="ml-2 text-xs font-normal text-ink-500 dark:text-ink-400">{pct(rate)} of tuition</span>
        </span>
      </div>
      <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
        <div
          className={[
            "h-full rounded-full transition-all duration-300",
            tone === "brand" ? "bg-brand-500" : "bg-ink-400 dark:bg-ink-500",
          ].join(" ")}
          style={{ width: `${width}%` }}
          role="img"
          aria-label={`${label}: ${usd(value)} per month`}
        />
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <tr>
      <td className={`py-2 pr-3 ${strong ? "text-ink-900 dark:text-ink-50" : "text-ink-600 dark:text-ink-300"}`}>
        {label}
      </td>
      <td className={`py-2 text-right tabular-nums ${strong ? "font-medium text-ink-900 dark:text-ink-50" : "text-ink-600 dark:text-ink-300"}`}>
        {value}
      </td>
    </tr>
  );
}
