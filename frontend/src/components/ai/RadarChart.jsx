import { useEffect, useMemo, useState } from 'react';

/**
 * Reusable animated radar chart.
 * @param {Object} props
 * @param {{ label: string, score: number }[]} props.dimensions - Any number of axes (typically 6)
 * @param {number} [props.size=320]
 * @param {boolean} [props.animated=true]
 * @param {number|null} [props.activeIndex] - Highlighted point index
 * @param {(index: number, dimension: object) => void} [props.onPointClick]
 */
export function RadarChart({
  dimensions = [],
  size = 500,
  animated = true,
  activeIndex = null,
  onPointClick,
}) {
  const count = dimensions.length;
  const [progress, setProgress] = useState(animated ? 0 : 1);

  useEffect(() => {
    if (!animated) {
      setProgress(1);
      return;
    }
    setProgress(0);
    const start = performance.now();
    const duration = 900;
    let frame;

    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - t) ** 3;
      setProgress(eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [dimensions, animated]);

  const layout = useMemo(() => {
    const cx = size / 2;
    const cy = size / 2;
    // Reduce radius to leave more room for text labels around the edges
    const radius = size * 0.26;
    const labelRadius = size * 0.35;

    const angles = Array.from({ length: count }, (_, i) => {
      const step = (Math.PI * 2) / count;
      return -Math.PI / 2 + i * step;
    });

    const axisPoints = angles.map((angle) => ({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      lx: cx + labelRadius * Math.cos(angle),
      ly: cy + labelRadius * Math.sin(angle),
      angle,
    }));

    const dataPoints = dimensions.map((dim, i) => {
      const r = (dim.score / 100) * radius * progress;
      const { angle } = axisPoints[i];
      return {
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
        score: dim.score,
        label: dim.label,
      };
    });

    const polygon = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');

    return { cx, cy, radius, axisPoints, dataPoints, polygon };
  }, [count, dimensions, progress, size]);

  if (count === 0) return null;

  const { cx, cy, radius, axisPoints, dataPoints, polygon } = layout;

  return (
    <svg
      width="100%"
      height="auto"
      viewBox={`0 0 ${size} ${size}`}
      className="max-w-[500px] mx-auto select-none"
      role="img"
      aria-label="Career DNA radar chart"
    >
      {/* Grid rings */}
      {[0.25, 0.5, 0.75, 1].map((level) => (
        <polygon
          key={level}
          points={axisPoints
            .map(({ angle }) => {
              const r = radius * level;
              return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
            })
            .join(' ')}
          fill="none"
          stroke="#D4D4D4"
          strokeWidth={level === 1 ? 1.5 : 1}
        />
      ))}

      {/* Axis lines */}
      {axisPoints.map(({ x, y }, i) => (
        <line
          key={`axis-${i}`}
          x1={cx}
          y1={cy}
          x2={x}
          y2={y}
          stroke="#D4D4D4"
          strokeWidth={1}
        />
      ))}

      {/* Data fill */}
      <polygon
        points={polygon}
        fill="rgba(99,102,241,0.18)"
        stroke="#1A1A1A"
        strokeWidth={2}
        strokeLinejoin="round"
        style={{ transition: animated ? 'none' : 'all 0.3s ease' }}
      />

      {/* Clickable vertices + labels */}
      {dataPoints.map((point, i) => {
        const isActive = activeIndex === i;
        const dim = dimensions[i];
        const { lx, ly, angle } = axisPoints[i];
        const anchor = Math.cos(angle) > 0.2 ? 'start' : Math.cos(angle) < -0.2 ? 'end' : 'middle';
        const dy = Math.sin(angle) > 0.35 ? 12 : Math.sin(angle) < -0.35 ? 4 : 8;

        return (
          <g key={`point-${i}-${dim.label}`}>
            <text
              x={lx}
              y={ly + dy}
              textAnchor={anchor}
              className={`text-[11px] font-medium fill-brand-700 ${isActive ? 'fill-brand-700 font-bold' : ''}`}
            >
              {(() => {
                const words = dim.label.split(' ');
                if (words.length <= 1) {
                  return dim.label.length > 22 ? `${dim.label.slice(0, 20)}…` : dim.label;
                }
                const mid = Math.ceil(words.length / 2);
                const line1 = words.slice(0, mid).join(' ');
                const line2 = words.slice(mid).join(' ');
                return (
                  <>
                    <tspan x={lx} dy="-0.4em">{line1}</tspan>
                    <tspan x={lx} dy="1.2em">{line2.length > 22 ? `${line2.slice(0, 20)}…` : line2}</tspan>
                  </>
                );
              })()}
            </text>
            <circle
              cx={point.x}
              cy={point.y}
              r={isActive ? 8 : 6}
              fill={isActive ? '#333333' : '#1A1A1A'}
              stroke="#fff"
              strokeWidth={2}
              className={onPointClick ? 'cursor-pointer' : ''}
              style={{ transition: 'r 0.15s ease, fill 0.15s ease' }}
              onClick={() => onPointClick?.(i, dimensions[i])}
            />
            <circle
              cx={point.x}
              cy={point.y}
              r={14}
              fill="transparent"
              className={onPointClick ? 'cursor-pointer' : ''}
              onClick={() => onPointClick?.(i, dimensions[i])}
            />
          </g>
        );
      })}
    </svg>
  );
}

export default RadarChart;
