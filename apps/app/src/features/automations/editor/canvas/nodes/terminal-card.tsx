import { memo, type ReactNode } from 'react';
import type { NodeProps } from '@xyflow/react';
import { useGraphRun } from '../graph-context';
import type { GraphFlowNode } from '../graph-canvas-types';
import { CardHeader, CardShell, InputRows } from './card-shell';

function TerminalCardView({ id, data, selected }: NodeProps<GraphFlowNode>): ReactNode {
  const { scene } = data;
  const run = useGraphRun(id);
  return (
    <CardShell scene={scene} run={run} selected={selected}>
      <CardHeader scene={scene} run={run} />
      <InputRows pins={scene.inputs} />
    </CardShell>
  );
}

export const TerminalCard = memo(TerminalCardView);
