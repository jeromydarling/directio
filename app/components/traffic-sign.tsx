import type * as React from "react";

// Official MUTCD SVGs from Wikimedia Commons (public-domain government
// reference symbols). Imported as raw strings via Vite's `?raw` query
// so we can drop them inline and avoid an extra HTTP request per sign.
//
// File names mirror the slug used in the `[[sign:NAME]]` shortcode.

import stop from "./sign-svgs/stop.svg?raw";
import yieldSvg from "./sign-svgs/yield.svg?raw";
import doNotEnter from "./sign-svgs/do-not-enter.svg?raw";
import wrongWay from "./sign-svgs/wrong-way.svg?raw";
import oneWayLeft from "./sign-svgs/one-way-left.svg?raw";
import oneWayRight from "./sign-svgs/one-way-right.svg?raw";
import noTurnOnRed from "./sign-svgs/no-turn-on-red.svg?raw";
import leftTurnOnly from "./sign-svgs/left-turn-only.svg?raw";
import noPassing from "./sign-svgs/no-passing-zone.svg?raw";
import speedLimitBlank from "./sign-svgs/speed-limit-blank.svg?raw";
import curveLeft from "./sign-svgs/curve-left.svg?raw";
import curveRight from "./sign-svgs/curve-right.svg?raw";
import mergeLeft from "./sign-svgs/merge-left.svg?raw";
import mergeRight from "./sign-svgs/merge-right.svg?raw";
import narrowBridge from "./sign-svgs/narrow-bridge.svg?raw";
import slippery from "./sign-svgs/slippery-when-wet.svg?raw";
import laneEnds from "./sign-svgs/lane-ends.svg?raw";
import deerCrossing from "./sign-svgs/deer-crossing.svg?raw";
import bikeCrossing from "./sign-svgs/bike-crossing.svg?raw";
import pedCrossing from "./sign-svgs/ped-crossing.svg?raw";
import schoolZone from "./sign-svgs/school-zone.svg?raw";
import rrAdvance from "./sign-svgs/rr-advance.svg?raw";
import rrCrossbuck from "./sign-svgs/rr-crossbuck.svg?raw";
import construction from "./sign-svgs/construction.svg?raw";

export type TrafficSignType =
  | "stop"
  | "yield"
  | "do-not-enter"
  | "wrong-way"
  | "one-way"
  | "one-way-left"
  | "one-way-right"
  | "no-passing"
  | "school-zone"
  | "school-crossing"
  | "rr-advance"
  | "rr-crossbuck"
  | `speed-limit-${number}`
  | "construction"
  | "ped-crossing"
  | "bike-crossing"
  | "curve-left"
  | "curve-right"
  | "merge-right"
  | "merge-left"
  | "deer-crossing"
  | "narrow-bridge"
  | "slippery-when-wet"
  | "no-turn-on-red"
  | "left-turn-only"
  | "lane-ends";

type Props = {
  type: TrafficSignType;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  /** When `interactive`, the sign gets a subtle hover lift. */
  interactive?: boolean;
};

const SIZES = { sm: 56, md: 96, lg: 144, xl: 220 } as const;

const REGISTRY: Partial<Record<TrafficSignType, string>> = {
  stop,
  yield: yieldSvg,
  "do-not-enter": doNotEnter,
  "wrong-way": wrongWay,
  "one-way": oneWayLeft,
  "one-way-left": oneWayLeft,
  "one-way-right": oneWayRight,
  "no-passing": noPassing,
  "school-zone": schoolZone,
  "school-crossing": schoolZone, // share — same pentagon shape
  "rr-advance": rrAdvance,
  "rr-crossbuck": rrCrossbuck,
  construction,
  "ped-crossing": pedCrossing,
  "bike-crossing": bikeCrossing,
  "curve-left": curveLeft,
  "curve-right": curveRight,
  "merge-left": mergeLeft,
  "merge-right": mergeRight,
  "deer-crossing": deerCrossing,
  "narrow-bridge": narrowBridge,
  "slippery-when-wet": slippery,
  "no-turn-on-red": noTurnOnRed,
  "left-turn-only": leftTurnOnly,
  "lane-ends": laneEnds,
};

export function TrafficSign({
  type,
  size = "md",
  className = "",
  interactive = false,
}: Props) {
  const pxSize = SIZES[size];
  const wrap = [
    "inline-block align-middle",
    interactive ? "transition-transform hover:-translate-y-0.5" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const speedMatch = /^speed-limit-(\d+)$/.exec(type);
  if (speedMatch) {
    const mph = Number(speedMatch[1]);
    return (
      <span
        className={wrap}
        style={{ width: pxSize, height: pxSize * 1.25 }}
        aria-label={`Speed limit ${mph}`}
      >
        <SpeedLimitOverlay base={speedLimitBlank} mph={mph} />
      </span>
    );
  }

  const svg = REGISTRY[type];
  if (!svg) return null;

  // The Wikimedia SVGs have a `width` / `height` attribute in inches
  // and a `viewBox`. We strip the dimensions and let our wrapping
  // <span> size the rendered output via CSS — same SVG file, any size.
  const inlined = svg
    .replace(/<\?xml[^>]+\?>/, "")
    .replace(/width="[^"]+"/, "")
    .replace(/height="[^"]+"/, "");

  return (
    <span
      className={wrap}
      style={{ width: pxSize, height: pxSize }}
      // SVG content is from Wikimedia Commons (trusted); no user input.
      dangerouslySetInnerHTML={{ __html: inlined }}
      role="img"
      aria-label={signAriaLabel(type)}
    />
  );
}

function signAriaLabel(type: TrafficSignType): string {
  return type.replace(/-/g, " ");
}

function SpeedLimitOverlay({ base, mph }: { base: string; mph: number }) {
  // The blank R2-1 template has the SPEED LIMIT text but no number.
  // We render the template as the background and overlay the number
  // via an absolutely-positioned span so it scales with the sign.
  const cleaned = base
    .replace(/<\?xml[^>]+\?>/, "")
    .replace(/width="[^"]+"/, "")
    .replace(/height="[^"]+"/, "");
  return (
    <span className="relative inline-block h-full w-full">
      <span
        className="absolute inset-0"
        dangerouslySetInnerHTML={{ __html: cleaned }}
      />
      <span
        className="absolute left-0 right-0 text-center font-display font-black text-black tabular-nums"
        style={{
          // The R2-1 number-zone sits at roughly 55-90% of the sign
          // height; tune to lock the digit visually centered there.
          top: "52%",
          fontSize: "44%",
          letterSpacing: "-0.04em",
        }}
      >
        {mph}
      </span>
    </span>
  );
}
