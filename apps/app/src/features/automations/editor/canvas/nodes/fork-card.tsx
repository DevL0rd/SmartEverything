import { memo, type ReactNode } from 'react';
import type { NodeProps } from '@xyflow/react';
import { useGraphEmit, useGraphRun } from '../graph-context';
import type { GraphFlowNode } from '../graph-canvas-types';
import {
  CardHeader,
  CardShell,
  ExecRows,
  InputRows,
  OutputGroup,
  PairGlyph,
  pinsOf,
} from './card-shell';

const PATH_CAPTION = 'Path';

export function AddPathRow({ nodeId }: { readonly nodeId: string }): ReactNode {
  const emit = useGraphEmit();
  return (
    <button
      type="button"
      className="gc-row gc-add nodrag nopan"
      onClick={(): void => {
        emit({ type: 'addPath', nodeId });
      }}
    >
      + Add path
    </button>
  );
}

function ForkCardView({ id, data, selected }: NodeProps<GraphFlowNode>): ReactNode {
  const { scene } = data;
  const run = useGraphRun(id);
  const lead = scene.pairIndex === null ? undefined : <PairGlyph index={scene.pairIndex} />;
  return (
    <CardShell scene={scene} run={run} selected={selected}>
      <CardHeader scene={scene} run={run} {...(lead === undefined ? {} : { lead })} />
      <ExecRows rows={scene.rows} captionOf={(): string => PATH_CAPTION} />
      <AddPathRow nodeId={id} />
      <InputRows pins={scene.inputs} />
      <OutputGroup pins={pinsOf(scene.outputs, 'output')} heading={null} />
    </CardShell>
  );
}

export const ForkCard = memo(ForkCardView);
