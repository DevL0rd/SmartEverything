import { memo, type ReactNode } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { SceneExecRow, ScenePin } from '../../../model/graph/scene-contract';
import { useGraphEmit, useGraphRun, type GraphNodeRun } from '../graph-context';
import type { GraphFlowNode } from '../graph-canvas-types';
import { CardHeader, CardShell, ExecRows, InputRows, OutputGroup, pinsOf } from './card-shell';

const LIMIT_PINS: ReadonlySet<string> = new Set([
  'limit',
  'max',
  'maxPasses',
  'gap',
  'concurrency',
]);

const LOOP_CAPTION: Readonly<Record<string, string>> = {
  lane: 'Do these',
  next: 'After all items',
};

export function loopBadges(inputs: readonly ScenePin[]): readonly string[] {
  return inputs
    .filter((pin) => LIMIT_PINS.has(pin.name) && pin.value !== null && !pin.wired)
    .map((pin) => `${pin.label} ${pin.value ?? ''}`);
}

function loopCaption(row: SceneExecRow): string {
  return LOOP_CAPTION[row.role] ?? '';
}

function PassStepper({ id, run }: { readonly id: string; readonly run: GraphNodeRun }): ReactNode {
  const emit = useGraphEmit();
  const { stepper } = run;
  if (stepper === null) return null;
  return (
    <div className="gc-stepper nodrag nopan">
      <button
        type="button"
        aria-label="Previous pass"
        disabled={stepper.position <= 1}
        onClick={(): void => {
          emit({ type: 'stepPass', nodeId: id, delta: -1 });
        }}
      >
        &lt;
      </button>
      <span className="gc-stepper-text">{`Pass ${String(stepper.position)} of ${String(stepper.total)}`}</span>
      <button
        type="button"
        aria-label="Next pass"
        disabled={stepper.position >= stepper.total}
        onClick={(): void => {
          emit({ type: 'stepPass', nodeId: id, delta: 1 });
        }}
      >
        &gt;
      </button>
    </div>
  );
}

function Badges({ labels }: { readonly labels: readonly string[] }): ReactNode {
  if (labels.length === 0) return null;
  return (
    <div className="gc-badges">
      {labels.map((label) => (
        <span key={label} className="gc-chip">
          {label}
        </span>
      ))}
    </div>
  );
}

function LoopCardView({ id, data, selected }: NodeProps<GraphFlowNode>): ReactNode {
  const { scene } = data;
  const run = useGraphRun(id);
  const lanes = scene.rows.filter((row) => row.role === 'lane');
  const done = scene.rows.filter((row) => row.role !== 'lane');
  return (
    <CardShell scene={scene} run={run} selected={selected}>
      <CardHeader scene={scene} run={run} />
      <Badges labels={loopBadges(scene.inputs)} />
      <PassStepper id={id} run={run} />
      <ExecRows rows={lanes} captionOf={loopCaption} />
      <OutputGroup pins={pinsOf(scene.outputs, 'inside')} heading="inside the loop" />
      <ExecRows rows={done} captionOf={loopCaption} />
      <OutputGroup pins={pinsOf(scene.outputs, 'output')} heading={null} />
      <OutputGroup pins={pinsOf(scene.outputs, 'after')} heading="after the loop" />
      <InputRows pins={scene.inputs} />
    </CardShell>
  );
}

export const LoopCard = memo(LoopCardView);
