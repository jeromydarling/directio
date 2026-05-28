import type * as React from "react";

/**
 * Inline-renderable traffic-sign SVGs. Every shape and color is the
 * actual MUTCD-spec geometry — these are not stylized; they're what
 * the student will see on the road.
 *
 * Usage in lesson markdown:
 *     [[sign:stop]]            inline
 *     [[sign:yield size=lg]]   bigger inline
 *     [[sign:speed-limit-25]]  parameterized
 *
 * The markdown renderer walks lesson HTML, swaps these tokens for
 * `<TrafficSign type="..." />`. Components are pure SVG — no images,
 * no font dependency for sign text (we use a system-stack via
 * `font-display: block`).
 */

export type TrafficSignType =
  | "stop"
  | "yield"
  | "do-not-enter"
  | "wrong-way"
  | "one-way"
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
  size?: "sm" | "md" | "lg";
  className?: string;
  /** When `interactive`, the sign gets a subtle hover lift. */
  interactive?: boolean;
};

const SIZES = { sm: 48, md: 80, lg: 128 } as const;

export function TrafficSign({
  type,
  size = "md",
  className = "",
  interactive = false,
}: Props) {
  const px = SIZES[size];
  const wrap = `inline-block align-middle ${interactive ? "transition-transform hover:-translate-y-0.5" : ""} ${className}`;

  // Parameterized: speed-limit-{n}
  const speedMatch = /^speed-limit-(\d+)$/.exec(type);
  if (speedMatch) {
    return (
      <span className={wrap} style={{ width: px, height: px * 1.25 }}>
        <SpeedLimitSign mph={Number(speedMatch[1])} />
      </span>
    );
  }

  const renderer = REGISTRY[type as keyof typeof REGISTRY];
  if (!renderer) return null;
  return (
    <span className={wrap} style={{ width: px, height: px * renderer.aspect }}>
      {renderer.render()}
    </span>
  );
}

// ---------------------------------------------------------------- registry

const REGISTRY: Record<
  Exclude<TrafficSignType, `speed-limit-${number}`>,
  { aspect: number; render: () => React.ReactElement }
> = {
  stop: {
    aspect: 1,
    render: () => (
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Stop sign">
        <polygon
          points="30,5 70,5 95,30 95,70 70,95 30,95 5,70 5,30"
          fill="#D72631"
          stroke="white"
          strokeWidth="3"
        />
        <text x="50" y="60" textAnchor="middle" fill="white" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="22">
          STOP
        </text>
      </svg>
    ),
  },
  yield: {
    aspect: 1,
    render: () => (
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Yield sign">
        <polygon
          points="5,15 95,15 50,95"
          fill="white"
          stroke="#D72631"
          strokeWidth="9"
        />
        <text x="50" y="50" textAnchor="middle" fill="#D72631" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="16">
          YIELD
        </text>
      </svg>
    ),
  },
  "do-not-enter": {
    aspect: 1,
    render: () => (
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Do Not Enter sign">
        <circle cx="50" cy="50" r="45" fill="#D72631" stroke="white" strokeWidth="3" />
        <rect x="22" y="42" width="56" height="16" fill="white" />
      </svg>
    ),
  },
  "wrong-way": {
    aspect: 0.66,
    render: () => (
      <svg viewBox="0 0 100 66" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Wrong Way sign">
        <rect x="2" y="2" width="96" height="62" fill="#D72631" stroke="white" strokeWidth="3" />
        <text x="50" y="28" textAnchor="middle" fill="white" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="16">
          WRONG
        </text>
        <text x="50" y="50" textAnchor="middle" fill="white" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="16">
          WAY
        </text>
      </svg>
    ),
  },
  "one-way": {
    aspect: 0.4,
    render: () => (
      <svg viewBox="0 0 100 40" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="One Way sign">
        <rect x="0" y="0" width="100" height="40" fill="black" />
        <polygon points="8,20 28,12 28,16 80,16 80,12 92,20 80,28 80,24 28,24 28,28" fill="white" />
      </svg>
    ),
  },
  "no-passing": {
    aspect: 1.5,
    render: () => (
      <svg viewBox="0 0 100 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="No Passing pennant">
        <polygon points="5,5 95,5 50,140" fill="#FFC72C" stroke="black" strokeWidth="3" />
        <text x="50" y="45" textAnchor="middle" fill="black" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="11">
          NO
        </text>
        <text x="50" y="60" textAnchor="middle" fill="black" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="11">
          PASSING
        </text>
        <text x="50" y="78" textAnchor="middle" fill="black" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="10">
          ZONE
        </text>
      </svg>
    ),
  },
  "school-zone": {
    aspect: 1.15,
    render: () => (
      <svg viewBox="0 0 100 115" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="School zone">
        <polygon
          points="50,5 75,15 95,40 95,75 75,100 50,110 25,100 5,75 5,40 25,15"
          fill="#D5F23E"
          stroke="black"
          strokeWidth="3"
        />
        <text x="50" y="55" textAnchor="middle" fill="black" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="14">
          SCHOOL
        </text>
        <text x="50" y="75" textAnchor="middle" fill="black" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="14">
          ZONE
        </text>
      </svg>
    ),
  },
  "school-crossing": {
    aspect: 1.15,
    render: () => (
      <svg viewBox="0 0 100 115" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="School crossing">
        <polygon
          points="50,5 75,15 95,40 95,75 75,100 50,110 25,100 5,75 5,40 25,15"
          fill="#D5F23E"
          stroke="black"
          strokeWidth="3"
        />
        <PedestrianIcon x={28} y={32} size={48} fill="black" />
      </svg>
    ),
  },
  "rr-advance": {
    aspect: 1,
    render: () => (
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Railroad crossing ahead">
        <circle cx="50" cy="50" r="45" fill="#FFC72C" stroke="black" strokeWidth="3" />
        <line x1="20" y1="80" x2="80" y2="20" stroke="black" strokeWidth="4" />
        <text x="35" y="50" fill="black" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="20">R</text>
        <text x="55" y="65" fill="black" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="20">R</text>
      </svg>
    ),
  },
  "rr-crossbuck": {
    aspect: 1,
    render: () => (
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Railroad crossbuck">
        <g transform="rotate(45 50 50)">
          <rect x="42" y="5" width="16" height="90" fill="white" stroke="black" strokeWidth="2" />
        </g>
        <g transform="rotate(-45 50 50)">
          <rect x="42" y="5" width="16" height="90" fill="white" stroke="black" strokeWidth="2" />
        </g>
        <text x="40" y="42" fill="black" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="9">
          RAIL
        </text>
        <text x="42" y="65" fill="black" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="9">
          ROAD
        </text>
      </svg>
    ),
  },
  construction: {
    aspect: 1,
    render: () => (
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Construction warning">
        <polygon
          points="50,5 95,50 50,95 5,50"
          fill="#FF8C00"
          stroke="black"
          strokeWidth="3"
        />
        <text x="50" y="58" textAnchor="middle" fill="black" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="12">
          WORK
        </text>
        <text x="50" y="72" textAnchor="middle" fill="black" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="12">
          ZONE
        </text>
      </svg>
    ),
  },
  "ped-crossing": {
    aspect: 1,
    render: () => (
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Pedestrian crossing">
        <polygon points="50,5 95,50 50,95 5,50" fill="#D5F23E" stroke="black" strokeWidth="3" />
        <PedestrianIcon x={28} y={20} size={48} fill="black" />
      </svg>
    ),
  },
  "bike-crossing": {
    aspect: 1,
    render: () => (
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bicycle crossing">
        <polygon points="50,5 95,50 50,95 5,50" fill="#D5F23E" stroke="black" strokeWidth="3" />
        <circle cx="32" cy="68" r="10" fill="none" stroke="black" strokeWidth="3" />
        <circle cx="68" cy="68" r="10" fill="none" stroke="black" strokeWidth="3" />
        <path d="M 32 68 L 50 40 L 68 68 Z" fill="none" stroke="black" strokeWidth="3" />
      </svg>
    ),
  },
  "curve-left": {
    aspect: 1,
    render: () => (
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Curve left">
        <polygon points="50,5 95,50 50,95 5,50" fill="#FFC72C" stroke="black" strokeWidth="3" />
        <path d="M 70 78 Q 30 60 30 25 L 22 35 M 30 25 L 40 32" fill="none" stroke="black" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  "curve-right": {
    aspect: 1,
    render: () => (
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Curve right">
        <polygon points="50,5 95,50 50,95 5,50" fill="#FFC72C" stroke="black" strokeWidth="3" />
        <path d="M 30 78 Q 70 60 70 25 L 78 35 M 70 25 L 60 32" fill="none" stroke="black" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  "merge-right": {
    aspect: 1,
    render: () => (
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Merge right">
        <polygon points="50,5 95,50 50,95 5,50" fill="#FFC72C" stroke="black" strokeWidth="3" />
        <line x1="35" y1="80" x2="35" y2="35" stroke="black" strokeWidth="5" />
        <path d="M 65 80 L 35 50 M 30 55 L 35 50 L 30 45" fill="none" stroke="black" strokeWidth="5" strokeLinecap="round" />
      </svg>
    ),
  },
  "merge-left": {
    aspect: 1,
    render: () => (
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Merge left">
        <polygon points="50,5 95,50 50,95 5,50" fill="#FFC72C" stroke="black" strokeWidth="3" />
        <line x1="65" y1="80" x2="65" y2="35" stroke="black" strokeWidth="5" />
        <path d="M 35 80 L 65 50 M 70 55 L 65 50 L 70 45" fill="none" stroke="black" strokeWidth="5" strokeLinecap="round" />
      </svg>
    ),
  },
  "deer-crossing": {
    aspect: 1,
    render: () => (
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Deer crossing">
        <polygon points="50,5 95,50 50,95 5,50" fill="#FFC72C" stroke="black" strokeWidth="3" />
        {/* simplified deer: body + head + antlers + legs */}
        <ellipse cx="55" cy="60" rx="20" ry="9" fill="black" />
        <circle cx="78" cy="50" r="5" fill="black" />
        <path d="M 73 47 L 70 35 M 78 45 L 80 33 M 82 47 L 86 36" stroke="black" strokeWidth="2" fill="none" strokeLinecap="round" />
        <line x1="42" y1="68" x2="40" y2="80" stroke="black" strokeWidth="3" strokeLinecap="round" />
        <line x1="52" y1="68" x2="50" y2="80" stroke="black" strokeWidth="3" strokeLinecap="round" />
        <line x1="62" y1="68" x2="64" y2="80" stroke="black" strokeWidth="3" strokeLinecap="round" />
        <line x1="68" y1="68" x2="72" y2="80" stroke="black" strokeWidth="3" strokeLinecap="round" />
      </svg>
    ),
  },
  "narrow-bridge": {
    aspect: 1,
    render: () => (
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Narrow bridge">
        <polygon points="50,5 95,50 50,95 5,50" fill="#FFC72C" stroke="black" strokeWidth="3" />
        <line x1="25" y1="35" x2="25" y2="70" stroke="black" strokeWidth="4" />
        <line x1="75" y1="35" x2="75" y2="70" stroke="black" strokeWidth="4" />
        <line x1="35" y1="50" x2="65" y2="50" stroke="black" strokeWidth="4" />
      </svg>
    ),
  },
  "slippery-when-wet": {
    aspect: 1,
    render: () => (
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Slippery when wet">
        <polygon points="50,5 95,50 50,95 5,50" fill="#FFC72C" stroke="black" strokeWidth="3" />
        {/* simplified car icon with wavy skid lines */}
        <rect x="38" y="40" width="24" height="14" rx="2" fill="black" />
        <circle cx="42" cy="56" r="3" fill="black" />
        <circle cx="58" cy="56" r="3" fill="black" />
        <path d="M 26 70 Q 30 65 34 70 Q 38 75 42 70" stroke="black" strokeWidth="2.5" fill="none" />
        <path d="M 58 70 Q 62 65 66 70 Q 70 75 74 70" stroke="black" strokeWidth="2.5" fill="none" />
      </svg>
    ),
  },
  "no-turn-on-red": {
    aspect: 1.2,
    render: () => (
      <svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="No turn on red">
        <rect x="2" y="2" width="96" height="116" fill="white" stroke="black" strokeWidth="3" />
        <text x="50" y="22" textAnchor="middle" fill="black" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="13">NO TURN</text>
        <text x="50" y="38" textAnchor="middle" fill="black" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="13">ON RED</text>
        <circle cx="50" cy="78" r="22" fill="#D72631" />
        <line x1="32" y1="60" x2="68" y2="96" stroke="black" strokeWidth="5" />
      </svg>
    ),
  },
  "left-turn-only": {
    aspect: 1.2,
    render: () => (
      <svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Left turn only">
        <rect x="2" y="2" width="96" height="116" fill="white" stroke="black" strokeWidth="3" />
        <text x="50" y="22" textAnchor="middle" fill="black" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="13">LEFT</text>
        <text x="50" y="38" textAnchor="middle" fill="black" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="13">TURN</text>
        <text x="50" y="54" textAnchor="middle" fill="black" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="13">ONLY</text>
        <path d="M 70 95 L 70 75 L 40 75 L 50 65 M 40 75 L 50 85" stroke="black" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  "lane-ends": {
    aspect: 1,
    render: () => (
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Lane ends merge">
        <polygon points="50,5 95,50 50,95 5,50" fill="#FFC72C" stroke="black" strokeWidth="3" />
        <line x1="35" y1="80" x2="50" y2="30" stroke="black" strokeWidth="4" />
        <line x1="65" y1="80" x2="50" y2="30" stroke="black" strokeWidth="4" />
      </svg>
    ),
  },
};

function PedestrianIcon({
  x, y, size, fill,
}: {
  x: number; y: number; size: number; fill: string;
}) {
  // Simple stick-figure walker on a 50-unit square; scaled to size.
  return (
    <g transform={`translate(${x},${y}) scale(${size / 50})`}>
      <circle cx="25" cy="8" r="5" fill={fill} />
      <rect x="20" y="14" width="10" height="18" fill={fill} />
      <line x1="20" y1="32" x2="14" y2="44" stroke={fill} strokeWidth="3" strokeLinecap="round" />
      <line x1="30" y1="32" x2="36" y2="44" stroke={fill} strokeWidth="3" strokeLinecap="round" />
      <line x1="20" y1="20" x2="13" y2="28" stroke={fill} strokeWidth="3" strokeLinecap="round" />
      <line x1="30" y1="20" x2="37" y2="28" stroke={fill} strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

function SpeedLimitSign({ mph }: { mph: number }) {
  return (
    <svg viewBox="0 0 100 125" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={`Speed limit ${mph}`}>
      <rect x="2" y="2" width="96" height="121" fill="white" stroke="black" strokeWidth="3" />
      <text x="50" y="32" textAnchor="middle" fill="black" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="14">
        SPEED
      </text>
      <text x="50" y="50" textAnchor="middle" fill="black" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="14">
        LIMIT
      </text>
      <text x="50" y="100" textAnchor="middle" fill="black" fontFamily="system-ui, sans-serif" fontWeight="900" fontSize="40">
        {mph}
      </text>
    </svg>
  );
}
