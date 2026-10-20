import { memo, type ReactNode } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { CanvasNode } from '../canvas-types';
import { CardShell, TextBlock, useCardRun } from './card-parts';
import { IconWell } from './icons';
import { ChipPin, ExecHandles } from './ports';
import { StatusSlot } from './status-slot';

function ExitsBarView({ id, data, selected }: NodeProps<CanvasNode>): ReactNode {
  const { scene } = data;
  const run = useCardRun(id, scene);
  return (
    <CardShell scene={scene} run={run} selected={selected} pins={<ExecHandles />}>
      <div className="sn-pins" data-edge="top">
        {scene.ports.map((port) => (
          <ChipPin key={port.name} port={port} side="top" />
        ))}
      </div>
      <div className="sn-head" data-rows="true">
        <IconWell icon={scene.icon} title={scene.title} />
        <TextBlock scene={scene} />
        <StatusSlot scene={scene} run={run} />
      </div>
    </CardShell>
  );
}

export const ExitsBar = memo(ExitsBarView);
