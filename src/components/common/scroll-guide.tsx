"use client";
import { useEffect, useRef, useState } from "react";

type Layout = { width: number; height: number; d: string; size: number };
const STEP = 6;

// The interviewer orb walks the visitor down the landing page. It rides a
// path through the side gutters and only crosses the page in the empty gaps
// between sections, so it never covers any text.
function buildLayout(page: HTMLElement): Layout | null {
  const top = page.getBoundingClientRect().top;
  const box = (selector: string) => {
    const element = page.querySelector(selector);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { top: rect.top - top, bottom: rect.bottom - top, left: rect.left };
  };
  const hero = box(".lp-hero-grid");
  const how = box("#how-it-works > .container");
  const measure = box("#what-we-measure > .container");
  const report = box("#sample-report > .container");
  const hiring = box("#hiring > .container");
  const faq = box("#faq > .container");
  const cta = box(".lp-cta-band");
  if (!hero || !how || !measure || !report || !hiring || !faq || !cta)
    return null;
  const width = page.clientWidth;
  const gutter = hero.left - page.getBoundingClientRect().left + 24;
  if (gutter < 52) return null;
  const size = Math.min(56, gutter - 12);
  const left = gutter / 2;
  const right = width - gutter / 2;
  const cross = (x: number, from: number, to: number, toX: number) => {
    const middle = (from + to) / 2;
    return `L ${x} ${from} C ${x} ${middle} ${toX} ${middle} ${toX} ${to} `;
  };
  const d =
    `M ${left} ${hero.top + 24} ` +
    cross(left, how.bottom + 20, measure.top - 20, right) +
    cross(right, report.bottom + 20, hiring.top - 20, left) +
    cross(left, faq.bottom + 16, cta.top - 4, width / 2);
  return { width, height: page.scrollHeight, d, size };
}

export function ScrollGuide() {
  const root = useRef<HTMLDivElement>(null);
  const run = useRef<SVGPathElement>(null);
  const rider = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);

  useEffect(() => {
    const page = root.current?.parentElement;
    if (!page) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = buildLayout(page);
        setLayout((current) =>
          current?.d === next?.d &&
          current?.height === next?.height &&
          current?.size === next?.size
            ? current
            : next,
        );
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(page);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const path = run.current;
    const guide = rider.current;
    const page = root.current?.parentElement;
    if (!layout || !path || !guide || !page) return;
    const total = path.getTotalLength();
    const count = Math.ceil(total / STEP) + 1;
    const xs = new Float32Array(count);
    const ys = new Float32Array(count);
    for (let index = 0; index < count; index++) {
      const point = path.getPointAtLength(Math.min(total, index * STEP));
      xs[index] = point.x;
      ys[index] = point.y;
    }
    path.style.strokeDasharray = String(total);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let current = -1;
    let target = 0;
    let frame = 0;

    const lengthAt = (y: number) => {
      if (y <= ys[0]) return 0;
      if (y >= ys[count - 1]) return total;
      let low = 0;
      let high = count - 1;
      while (high - low > 1) {
        const middle = (low + high) >> 1;
        if (ys[middle] < y) low = middle;
        else high = middle;
      }
      const span = ys[high] - ys[low] || 1;
      return Math.min(total, (low + (y - ys[low]) / span) * STEP);
    };
    const draw = () => {
      const index = Math.min(count - 1, Math.round(current / STEP));
      const before = Math.max(0, index - 4);
      const after = Math.min(count - 1, index + 4);
      const dx = xs[after] - xs[before];
      const dy = ys[after] - ys[before] || 1;
      const lean = Math.max(
        -18,
        Math.min(18, (Math.atan2(dx, dy) * 180) / Math.PI / 4),
      );
      const x = xs[index] - layout.size / 2;
      const y = ys[index] - layout.size / 2;
      guide.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${lean}deg)`;
      guide.dataset.look = dx > 40 ? "right" : dx < -40 ? "left" : "";
      guide.dataset.end = current >= total - 2 ? "true" : "";
      path.style.strokeDashoffset = String(total - current);
    };
    const tick = () => {
      const gap = target - current;
      current =
        reduced.matches || current < 0 || Math.abs(gap) < 0.5
          ? target
          : current + gap * 0.16;
      draw();
      frame = current === target ? 0 : requestAnimationFrame(tick);
    };
    const update = () => {
      const offset = page.getBoundingClientRect().top + scrollY;
      target = lengthAt(scrollY - offset + innerHeight * 0.38);
      if (!frame) frame = requestAnimationFrame(tick);
    };
    update();
    addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("scroll", update);
      removeEventListener("resize", update);
    };
  }, [layout]);

  return (
    <div ref={root} className="lp-guide" aria-hidden="true">
      {layout && (
        <>
          <svg width={layout.width} height={layout.height}>
            <path className="lp-guide-bed" d={layout.d} />
            <path ref={run} className="lp-guide-run" d={layout.d} />
          </svg>
          <div
            ref={rider}
            className="lp-rider"
            style={{ "--size": layout.size + "px" } as React.CSSProperties}
          >
            <Mascot />
            <span className="lp-rider-bubble">Ready when you are</span>
          </div>
        </>
      )}
    </div>
  );
}

// SkillMirror's interviewer orb, wearing its headset.
function Mascot() {
  return (
    <svg viewBox="0 0 56 56">
      <defs>
        <radialGradient id="lp-rider-orb" cx="0.36" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#eafff5" />
          <stop offset="0.32" stopColor="#74f5b6" />
          <stop offset="0.62" stopColor="#2fe08a" />
          <stop offset="1" stopColor="#128a50" />
        </radialGradient>
      </defs>
      <ellipse cx="28" cy="52.5" rx="12" ry="2.5" fill="#000" opacity="0.5" />
      <g className="lp-rider-body">
        <circle cx="28" cy="29" r="17" fill="url(#lp-rider-orb)" />
        <ellipse
          cx="21.5"
          cy="20.5"
          rx="5.5"
          ry="3.4"
          fill="#fff"
          opacity="0.38"
          transform="rotate(-28 21.5 20.5)"
        />
        <g fill="none" strokeLinecap="round">
          <path
            d="M10.5 27a17.5 17.5 0 0 1 35 0"
            stroke="#0a1a12"
            strokeWidth="3.4"
          />
          <path
            d="M46 33c.5 6-4.5 10-10.5 9.5"
            stroke="#0a1a12"
            strokeWidth="2.4"
          />
          <g stroke="#7ef5c3" strokeOpacity="0.55">
            <path d="M10.5 27a17.5 17.5 0 0 1 35 0" strokeWidth="1" />
            <path d="M46 33c.5 6-4.5 10-10.5 9.5" strokeWidth="0.8" />
          </g>
        </g>
        <g fill="#0a1a12" stroke="#7ef5c3" strokeOpacity="0.55">
          <rect x="6.5" y="23" width="7" height="12" rx="3.5" />
          <rect x="42.5" y="23" width="7" height="12" rx="3.5" />
          <circle cx="34.5" cy="42.5" r="2.4" />
        </g>
        <g className="lp-rider-look">
          <g className="lp-rider-eyes" fill="#052016">
            <ellipse cx="22.5" cy="28" rx="2.6" ry="3.4" />
            <ellipse cx="33.5" cy="28" rx="2.6" ry="3.4" />
            <circle cx="23.4" cy="26.6" r="1" fill="#fff" />
            <circle cx="34.4" cy="26.6" r="1" fill="#fff" />
          </g>
          <path
            d="M25 34.2q3 2.6 6 0"
            fill="none"
            stroke="#052016"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </g>
      </g>
    </svg>
  );
}
