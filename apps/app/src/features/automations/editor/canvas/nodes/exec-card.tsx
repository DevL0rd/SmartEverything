import { memo, type ReactNode } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { RunNode, SceneNode } from '../../../model/canvas/contract';
import type { CanvasNode } from '../canvas-types';
import { CardShell, TextBlock, useCardRun } from './card-parts';
import { CornerTag, Pill } from './chips';
import { IconWell } from './icons';
import { ExecHandles, InputHandles, OutputPins, PortRows, STEP_ROWS, WHOLE_CARD } from './ports';
import { StatusSlot } from './status-slot';

export function StepFace({
  scene,
  run,
  selected,
  instance,
}: {
  readonly scene: SceneNode;
  readonly run: RunNode | null;
  readonly selected: boolean;
  readonly instance: boolean;
}): ReactNode {
  const rows = scene.ports.length > 0;
  return (
    <CardShell
      scene={scene}
      run={run}
      selected={selected}
      instance={instance}
      pins={
        <>
          <ExecHandles />
          <InputHandles ports={scene.ports} layout={STEP_ROWS} />
          <OutputPins ports={scene.outputs} layout={WHOLE_CARD} labels={false} />
          {instance && scene.updateAvailable ? <CornerTag text="Update" /> : null}
        </>
      }
    >
      <div className="sn-head" data-rows={rows}>
        <IconWell icon={instance ? 'package' : scene.icon} title={scene.title} />
        <TextBlock scene={scene} />
        {instance && scene.revision !== null ? <Pill text={`v${String(scene.revision)}`} /> : null}
        <StatusSlot scene={scene} run={run} />
      </div>
      <PortRows ports={scene.ports} />
    </CardShell>
  );
}

function ExecCardView({ id, data, selected }: NodeProps<CanvasNode>): ReactNode {
  const { scene } = data;
  const run = useCardRun(id, scene);
  return <StepFace scene={scene} run={run} selected={selected} instance={false} />;
}

export const ExecCard = memo(ExecCardView);
