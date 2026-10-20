import { memo, type ReactNode } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { SceneNode } from '../../../model/canvas/contract';
import { CUSTOM_NODE_OVERLINE } from '../../../model/canvas/tree-env';
import type { CanvasNode } from '../canvas-types';
import { useCardRun } from './card-parts';
import { StepFace } from './exec-card';

export function isInstance(scene: SceneNode): boolean {
  return scene.overline === CUSTOM_NODE_OVERLINE;
}

function InstanceCardView({ id, data, selected }: NodeProps<CanvasNode>): ReactNode {
  const { scene } = data;
  const run = useCardRun(id, scene);
  return <StepFace scene={scene} run={run} selected={selected} instance />;
}

export const InstanceCard = memo(InstanceCardView);
