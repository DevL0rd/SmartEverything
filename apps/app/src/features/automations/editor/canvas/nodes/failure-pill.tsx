import { memo, type ReactNode } from 'react';
import type { NodeProps } from '@xyflow/react';
import { useGraphRun } from '../graph-context';
import type { GraphFlowNode } from '../graph-canvas-types';
import { CardHeader, CardShell } from './card-shell';
import { HeadCap } from './end-cap';

function FailurePillView({ id, data, selected }: NodeProps<GraphFlowNode>): ReactNode {
  const { scene } = data;
  const run = useGraphRun(id);
  const then = scene.rows.find((row) => row.role === 'next');
  return (
    <CardShell scene={scene} run={run} selected={selected}>
      <CardHeader scene={scene} run={run} {...(then === undefined ? {} : { then })} />
      {then === undefined ? null : <HeadCap row={then} />}
    </CardShell>
  );
}

export const FailurePill = memo(FailurePillView);
