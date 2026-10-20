import { memo, type ReactNode } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { CanvasNode } from '../canvas-types';
import { CardShell, TextBlock, useCardRun } from './card-parts';

function FrameGroupView({ id, data, selected }: NodeProps<CanvasNode>): ReactNode {
  const { scene } = data;
  const run = useCardRun(id, scene);
  return (
    <CardShell scene={scene} run={run} selected={selected} look="frame" pins={null}>
      <div className="sn-lane-head">
        <TextBlock scene={scene} overline={null} />
      </div>
    </CardShell>
  );
}

export const FrameGroup = memo(FrameGroupView);
