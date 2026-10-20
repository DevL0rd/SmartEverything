import type { ReactNode } from 'react';

export interface LoopReturnGeometry {
  readonly width: number;
  readonly height: number;
  readonly inset: number;
}

export function loopReturnPath({ width, height, inset }: LoopReturnGeometry): string {
  const right = width - inset;
  const bottom = height - inset;
  const top = inset * 2;
  const bend = Math.min(48, Math.max(16, (bottom - top) / 4));
  return `M ${String(width / 2)} ${String(bottom)} C ${String(right + bend)} ${String(bottom)} ${String(right + bend)} ${String(top)} ${String(width / 2 + 24)} ${String(top)}`;
}

interface LoopReturnProps extends LoopReturnGeometry {
  readonly label: string;
}

export function LoopReturn({ label, ...geometry }: LoopReturnProps): ReactNode {
  return (
    <svg
      className="se-loop-return"
      width={geometry.width}
      height={geometry.height}
      viewBox={`0 0 ${String(geometry.width)} ${String(geometry.height)}`}
      aria-hidden="true"
    >
      <defs>
        <marker
          id="se-loop-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="se-loop-arrow" />
        </marker>
      </defs>
      <path d={loopReturnPath(geometry)} className="se-loop-path" markerEnd="url(#se-loop-arrow)" />
      <text
        className="se-loop-label"
        x={geometry.width - geometry.inset}
        y={geometry.height / 2}
        textAnchor="end"
      >
        {label}
      </text>
    </svg>
  );
}
