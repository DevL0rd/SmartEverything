import { memo, type ReactNode } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { SceneExecRow } from '../../../model/graph/scene-contract';
import { useGraphRun } from '../graph-context';
import type { GraphFlowNode } from '../graph-canvas-types';
import { CardHeader, CardShell, ExecRows, InputRows, OutputGroup, pinsOf } from './card-shell';

const CAPTION_BY_PORT: Readonly<Record<string, string>> = {
  else: 'When no condition above holds',
  default: 'No case matches',
  otherwise: 'Condition is false',
};

const SINGLE_ELSE = 'When the condition above is false';

export function decisionCaption(row: SceneExecRow, conditions = 0): string {
  if (row.port.startsWith('case:')) return 'Case';
  if (row.port === 'else' && conditions === 1) return SINGLE_ELSE;
  return CAPTION_BY_PORT[row.port] ?? '';
}

function DecisionCardView({ id, data, selected }: NodeProps<GraphFlowNode>): ReactNode {
  const { scene } = data;
  const run = useGraphRun(id);
  const then = scene.rows.find((row) => row.role === 'next');
  const branches = scene.rows.filter((row) => row.role !== 'next');
  const conditions = branches.filter((row) => row.condition !== null).length;
  return (
    <CardShell scene={scene} run={run} selected={selected}>
      <CardHeader scene={scene} run={run} {...(then === undefined ? {} : { then })} />
      <ExecRows rows={branches} captionOf={(row) => decisionCaption(row, conditions)} />
      <InputRows pins={scene.inputs} />
      <OutputGroup pins={pinsOf(scene.outputs, 'output')} heading={null} />
      <OutputGroup pins={pinsOf(scene.outputs, 'after')} heading={`after the ${scene.kindName}`} />
    </CardShell>
  );
}

export const DecisionCard = memo(DecisionCardView);
