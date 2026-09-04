import type { SeriesPoint } from "@/lib/objectives";

/**
 * Six 28-day windows of share of demand as a tiny inline chart, with an
 * optional dashed target line. Pure SVG, renders on the server.
 */
export function ShareSparkline({
  series,
  target,
  className,
}: {
  series: SeriesPoint[];
  target?: number | null;
  className?: string;
}) {
  const w = 240;
  const h = 56;
  const pad = 4;
  const points = series.map((p, i) => ({
    x: pad + (i * (w - pad * 2)) / Math.max(series.length - 1, 1),
    y: p.share === null ? null : h - pad - p.share * (h - pad * 2),
    p,
  }));
  const drawn = points.filter((pt) => pt.y !== null) as { x: number; y: number }[];
  const path = drawn.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ");
  const targetY = target != null ? h - pad - target * (h - pad * 2) : null;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      role="img"
      aria-label="Évolution de la part de demande sur six périodes de 28 jours"
    >
      {targetY !== null && (
        <line
          x1={pad}
          x2={w - pad}
          y1={targetY}
          y2={targetY}
          stroke="currentColor"
          strokeOpacity="0.35"
          strokeDasharray="3 3"
        />
      )}
      {drawn.length > 1 && (
        <path d={path} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" />
      )}
      {drawn.map((pt, i) => (
        <circle key={i} cx={pt.x} cy={pt.y} r={i === drawn.length - 1 ? 3.5 : 2} fill="var(--primary)" />
      ))}
      {points.map(
        (pt, i) =>
          pt.y === null && (
            <circle key={`m${i}`} cx={pt.x} cy={h / 2} r={1.5} fill="currentColor" fillOpacity="0.25" />
          )
      )}
    </svg>
  );
}
