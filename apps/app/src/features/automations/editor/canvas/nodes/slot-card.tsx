import { memo, type ReactNode } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { CanvasNode } from '../canvas-types';
import { CardShell, useCardRun } from './card-parts';
import { Glyph } from './icons';
import { ExecHandles } from './ports';
import { StatusSlot } from './status-slot';

function SlotCardView({ id, data, selected }: NodeProps<CanvasNode>): ReactNode {
  const { scene } = data;
  const run = useCardRun(id, scene);
  return (
    <CardShell scene={scene} run={run} selected={selected} pins={<ExecHandles />}>
      <div className="sn-slot">
        <Glyph name="plus" className="sn-glyph" />
        <span className="sn-title">{scene.title}</span>
      </div>
    </CardShell>
  );
}

export const SlotCard = memo(SlotCardView);

function AdmitChipView({ id, data, selected }: NodeProps<CanvasNode>): ReactNode {
  const { scene } = data;
  const run = useCardRun(id, scene);
  return (
    <CardShell scene={scene} run={run} selected={selected} pins={<ExecHandles />}>
      <div className="sn-admit">
        <Glyph name={scene.icon} className="sn-glyph" />
        <span className="sn-admit-label">{`${scene.title}:`}</span>
        <span className="sn-admit-text">{scene.subtitle}</span>
        <StatusSlot scene={scene} run={run} />
      </div>
    </CardShell>
  );
}

export const AdmitChip = memo(AdmitChipView);
