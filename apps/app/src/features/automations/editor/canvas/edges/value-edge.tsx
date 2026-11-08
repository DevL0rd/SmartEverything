import { memo, type CSSProperties, type ReactNode } from 'react';
import { BaseEdge, useInternalNode, type EdgeProps } from '@xyflow/react';
import type { GraphFlowEdge, GraphFlowNode } from '../graph-canvas-types';
import { typeToken } from '../pins/value-pin';

function typeStyle(token: string | null): CSSProperties | undefined {
  return token === null ? undefined : { stroke: `var(--se-type-${token}, var(--se-outline))` };
}

export const VALUE_LEAD = 48;

export function valuePath(ends: {
  readonly sourceX: number;
  readonly sourceY: number;
  readonly targetX: number;
  readonly targetY: number;
}): string {
  const { sourceX, sourceY, targetX, targetY } = ends;
  const lead = Math.max(VALUE_LEAD, Math.abs(targetX - sourceX) / 2);
  const points = [
    [sourceX, sourceY],
    [sourceX + lead, sourceY],
    [targetX - lead, targetY],
    [targetX, targetY],
  ].map(([x, y]) => `${String(x)},${String(y)}`);
  return `M ${points[0] ?? ''} C ${points.slice(1).join(' ')}`;
}

function ValueEdgeView(props: EdgeProps<GraphFlowEdge>): ReactNode {
  const { id, data, interactionWidth, source, sourceHandleId } = props;
  const origin = useInternalNode<GraphFlowNode>(source);
  if (data === undefined) return null;
  const pin = origin?.data.scene.outputs.find((output) => output.handle === sourceHandleId);
  const token =
    pin === undefined || data.scene.state === 'problem' ? null : typeToken(pin.type, pin.shape);
  const style = typeStyle(token);
  const path = valuePath(props);
  return (
    <BaseEdge
      id={id}
      path={path}
      {...(interactionWidth === undefined ? {} : { interactionWidth })}
      {...(style === undefined ? {} : { style })}
      data-kind="value"
    />
  );
}

export const ValueEdge = memo(ValueEdgeView);
