import { memo, type CSSProperties, type ReactNode } from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';
import { colourVariable, parseValueType, typeColour } from '../../../../../design/node-colours';
import type { CanvasEdge } from '../canvas-types';
import { useRunNode } from '../run-store';
import { wireState } from './edge-state';

function wireStyle(type: string | null): CSSProperties {
  const style: Record<string, string> = {};
  if (type !== null) style['--se-wire-type'] = `var(${colourVariable(typeColour(type))})`;
  return style;
}

function ValueEdgeView(props: EdgeProps<CanvasEdge>): ReactNode {
  const { id, data, markerEnd, interactionWidth, source, target } = props;
  const state = wireState(useRunNode(source), useRunNode(target));
  if (data === undefined) return null;
  const [path] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  });
  const type = data.scene.type;
  const style = wireStyle(type);
  return (
    <BaseEdge
      id={id}
      path={path}
      style={style}
      {...(markerEnd === undefined ? {} : { markerEnd })}
      {...(interactionWidth === undefined ? {} : { interactionWidth })}
      className="se-edge se-edge-value"
      data-kind="value"
      data-state={state}
      data-optional={type === null ? false : parseValueType(type).optional}
    />
  );
}

export const ValueEdge = memo(ValueEdgeView);
