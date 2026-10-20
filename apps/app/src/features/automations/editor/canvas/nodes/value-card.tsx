import { memo, type ReactNode } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { CanvasNode } from '../canvas-types';
import { CardShell, TextBlock, useCardRun } from './card-parts';
import { CornerTag } from './chips';
import { IconWell } from './icons';
import { ExecHandles, InputHandles, OutputPins, WHOLE_CARD } from './ports';
import { StatusSlot } from './status-slot';

function ValueCardView({ id, data, selected }: NodeProps<CanvasNode>): ReactNode {
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
          <InputHandles ports={scene.ports} layout={WHOLE_CARD} />
          <OutputPins ports={scene.outputs} layout={WHOLE_CARD} labels />
          {scene.unused ? <CornerTag text="Not used" /> : null}
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

export const ValueCard = memo(ValueCardView);
