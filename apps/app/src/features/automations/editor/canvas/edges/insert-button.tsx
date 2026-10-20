import type { CSSProperties, ReactNode } from 'react';
import { EdgeLabelRenderer } from '@xyflow/react';

interface InsertButtonProps {
  readonly x: number;
  readonly y: number;
}

function placement(x: number, y: number): CSSProperties {
  return { transform: `translate(-50%, -50%) translate(${String(x)}px, ${String(y)}px)` };
}

export function InsertButton({ x, y }: InsertButtonProps): ReactNode {
  return (
    <EdgeLabelRenderer>
      <div className="se-insert" aria-hidden="true" style={placement(x, y)}>
        +
      </div>
    </EdgeLabelRenderer>
  );
}
