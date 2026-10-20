import { memo, type ReactNode } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { CanvasNode } from '../canvas-types';
import { CardShell, TextBlock, useCardRun } from './card-parts';
import { IconWell } from './icons';
import { ExecHandles, OutputPins, WHOLE_CARD } from './ports';
import { StatusSlot } from './status-slot';

function TriggerCardView({ id, data, selected }: NodeProps<CanvasNode>): ReactNode {
  const { scene } = data;
  const run = useCardRun(id, scene);
  return (
    <CardShell
      scene={scene}
      run={run}
      selected={selected}
      pins={
        <>
          <ExecHandles />
          <OutputPins ports={scene.outputs} layout={WHOLE_CARD} labels />
        </>
      }
    >
      <div className="sn-head" data-outputs={scene.outputs.length > 0}>
        <IconWell icon={scene.icon} title={scene.title} />
        <TextBlock scene={scene} />
        <StatusSlot scene={scene} run={run} />
      </div>
    </CardShell>
  );
}

export const TriggerCard = memo(TriggerCardView);
