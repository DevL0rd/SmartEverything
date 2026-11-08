import { memo, type ReactNode } from 'react';
import type { NodeProps } from '@xyflow/react';
import { useGraphRun } from '../graph-context';
import type { GraphFlowNode } from '../graph-canvas-types';
import { CardHeader, CardShell, InputRows, OutputGroup, pinsOf } from './card-shell';
import { EmptyPlaceholders, emptySidesOf } from './empty-sides';
import { HeadCap } from './end-cap';

function StartPillView({ id, data, selected }: NodeProps<GraphFlowNode>): ReactNode {
  const { scene } = data;
  const run = useGraphRun(id);
  const then = scene.rows.find((row) => row.role === 'next');
  const sides = emptySidesOf(scene, data.incoming, then);
  return (
    <CardShell scene={scene} run={run} selected={selected}>
      <CardHeader scene={scene} run={run} {...(then === undefined ? {} : { then })} />
      {then === undefined || sides.step ? null : <HeadCap row={then} />}
      <EmptyPlaceholders scene={scene} then={then} sides={sides} />
      <InputRows pins={scene.inputs} />
      <OutputGroup pins={pinsOf(scene.outputs, 'output')} heading="Inputs of this run" />
    </CardShell>
  );
}

function TriggerPillView({ id, data, selected }: NodeProps<GraphFlowNode>): ReactNode {
  const { scene } = data;
  const run = useGraphRun(id);
  const then = scene.rows.find((row) => row.role === 'next');
  return (
    <CardShell scene={scene} run={run} selected={selected}>
      <CardHeader scene={scene} run={run} {...(then === undefined ? {} : { then })} />
      <InputRows pins={scene.inputs} />
      <OutputGroup pins={pinsOf(scene.outputs, 'output')} heading={null} />
    </CardShell>
  );
}

export const StartPill = memo(StartPillView);

export const TriggerPill = memo(TriggerPillView);
