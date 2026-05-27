import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type ElementType,
} from "react";

/**
 * Reveal-on-scroll. Adds `.is-visible` to the element when it intersects
 * the viewport. Pure intersection observer; no Framer Motion dep.
 */
export function Reveal({
  as: Tag = "div",
  delay = 0,
  className = "",
  children,
  ...rest
}: {
  as?: ElementType;
  delay?: number;
  className?: string;
  children: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const style: CSSProperties = delay
    ? { transitionDelay: `${delay}ms`, animationDelay: `${delay}ms` }
    : {};
  const Component = Tag;
  return (
    <Component
      ref={ref as never}
      className={`reveal ${visible ? "is-visible" : ""} ${className}`}
      style={style}
      {...rest}
    >
      {children}
    </Component>
  );
}

/**
 * Animated mesh-gradient background. Drops absolute-positioned blurred
 * gradient blobs into a relative parent. Use behind heros / hero-like
 * sections.
 */
export function MeshBackground({ withGrain = true }: { withGrain?: boolean }) {
  return (
    <>
      <div className="mesh-bg" aria-hidden="true">
        <span className="blob" />
      </div>
      {withGrain && <div className="grain pointer-events-none absolute inset-0" aria-hidden="true" />}
    </>
  );
}

/**
 * Glass card surface. Use for inline UI on top of mesh backgrounds.
 */
export function GlassCard({
  children,
  className = "",
  hover = true,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={[
        "relative rounded-2xl p-6 glass",
        hover ? "lift" : "",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

/**
 * Animated number counter. Counts up from 0 to `value` when it enters
 * the viewport.
 */
export function Counter({
  value,
  duration = 1400,
  suffix = "",
  prefix = "",
  className = "",
}: {
  value: number;
  duration?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let start = 0;
    const animate = (t: number) => {
      if (!start) start = t;
      const progress = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(eased * value));
      if (progress < 1) raf = requestAnimationFrame(animate);
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          raf = requestAnimationFrame(animate);
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {current.toLocaleString()}
      {suffix}
    </span>
  );
}

/**
 * Marquee strip of items that scrolls horizontally forever.
 * Used for the "as featured in" / "what we replace" strips.
 */
export function Marquee({
  children,
  speed = 30,
  className = "",
}: {
  children: ReactNode;
  speed?: number; // seconds per loop
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div
        className="flex w-max gap-12"
        style={{ animation: `scroll-x ${speed}s linear infinite` }}
      >
        {children}
        {children}
      </div>
    </div>
  );
}
