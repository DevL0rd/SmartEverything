import { memo, useState, type ReactNode } from 'react';
import { Handle, Position, useConnection, type NodeProps } from '@xyflow/react';
import type { SceneExecRow } from '../../../model/graph/scene-contract';
import { ERROR_EXIT_LABEL } from '../../../model/graph/scene-exec';
import { useGraphRun } from '../graph-context';
import type { GraphFlowNode } from '../graph-canvas-types';
import { ArrowHead } from '../pins/exec-pin';
import { CardHeader, CardShell, InputRows, OutputGroup, pinsOf } from './card-shell';
import { CappedRows, HeadCap } from './end-cap';
import './error-handle.css';

const LANE_CAPTION: Readonly<Record<string, string>> = {
  onError: 'When this step fails',
  timedOut: 'When nothing arrives in time',
  body: 'While it is set',
};

export const ERROR_HANDLE_HINT = 'Drag or tap to choose what runs if this step fails';

export function stepCaption(row: SceneExecRow): string {
  return LANE_CAPTION[row.port] ?? '';
}

export interface ErrorHandleShown {
  readonly selected: boolean;
  readonly hovered: boolean;
  readonly dragging: boolean;
}

export function showsErrorHandle(state: ErrorHandleShown): boolean {
  return state.selected || state.hovered || state.dragging;
}

function ErrorHandle({ handle }: { readonly handle: string }): ReactNode {
  return (
    <Handle
      id={handle}
      type="source"
      position={Position.Right}
      className="gc-handle gc-exec gc-exec-out gc-error-handle"
      data-role="lane"
      data-wired={false}
      data-latent
      title={ERROR_HANDLE_HINT}
    >
      <span className="gc-error-label">{ERROR_EXIT_LABEL}</span>
      <ArrowHead />
    </Handle>
  );
}

function useDraggingFrom(id: string, handle: string | null): boolean {
  return useConnection(
    (connection) =>
      handle !== null &&
      connection.inProgress &&
      connection.fromHandle.nodeId === id &&
      connection.fromHandle.id === handle,
  );
}

function StepCardView({ id, data, selected }: NodeProps<GraphFlowNode>): ReactNode {
  const { scene } = data;
  const run = useGraphRun(id);
  const [hovered, setHovered] = useState(false);
  const errorHandle = scene.errorHandle;
  const dragging = useDraggingFrom(id, errorHandle);
  const owner = scene.family === 'owner';
  const then = scene.rows.find((row) => row.role === 'next');
  const head = owner ? undefined : then;
  const tail = owner && then !== undefined ? [then] : [];
  const lanes = scene.rows.filter((row) => row.role !== 'next');
  const shown = showsErrorHandle({ selected, hovered, dragging }) ? errorHandle : null;
  return (
    <CardShell scene={scene} run={run} selected={selected}>
      <div
        className="gc-hover-zone"
        onPointerEnter={(): void => {
          setHovered(true);
        }}
        onPointerLeave={(): void => {
          setHovered(false);
        }}
      >
        <CardHeader scene={scene} run={run} {...(head === undefined ? {} : { then: head })} />
        {head === undefined ? null : <HeadCap row={head} />}
        <CappedRows rows={lanes} captionOf={stepCaption} />
        <OutputGroup pins={pinsOf(scene.outputs, 'inside')} heading="inside" />
        <CappedRows rows={tail} captionOf={stepCaption} />
        <InputRows pins={scene.inputs} />
        <OutputGroup pins={pinsOf(scene.outputs, 'output')} heading={null} />
        <OutputGroup pins={pinsOf(scene.outputs, 'after')} heading="after this step" />
        {shown === null ? null : <ErrorHandle handle={shown} />}
      </div>
    </CardShell>
  );
}

export const StepCard = memo(StepCardView);
