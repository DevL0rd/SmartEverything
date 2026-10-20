import { memo, type ReactNode } from 'react';
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import type { CanvasEdge } from '../canvas-types';
import { useRunNode } from '../run-store';
import { wireState } from './edge-state';
import { InsertButton } from './insert-button';

function ExecEdgeView(props: EdgeProps<CanvasEdge>): ReactNode {
  const { id, data, markerEnd, interactionWidth, source, target } = props;
  const state = wireState(useRunNode(source), useRunNode(target));
  if (data === undefined) return null;
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
    borderRadius: 16,
  });
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        {...(markerEnd === undefined ? {} : { markerEnd })}
        {...(interactionWidth === undefined ? {} : { interactionWidth })}
        className="se-edge se-edge-exec"
        data-kind="exec"
        data-state={state}
      />
      <InsertButton x={labelX} y={labelY} />
    </>
  );
}

export const ExecEdge = memo(ExecEdgeView);
