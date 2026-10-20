import { memo, type ReactNode } from 'react';
import type { NodeProps, NodeTypes } from '@xyflow/react';
import type { SceneRole } from '../../../model/canvas/contract';
import type { CanvasNode } from '../canvas-types';
import { CommentCard } from './comment-card';
import { ContainerFrame, LaneFrame, TriggerGroupFrame } from './container-frame';
import { ExecCard } from './exec-card';
import { ExitsBar } from './exits';
import { FrameGroup } from './frame-group';
import { InputsBar } from './inputs-bar';
import { InstanceCard, isInstance } from './instance-card';
import { AdmitChip, SlotCard } from './slot-card';
import { TriggerCard } from './trigger-card';
import { ValueCard } from './value-card';

function StepNodeView(props: NodeProps<CanvasNode>): ReactNode {
  return isInstance(props.data.scene) ? <InstanceCard {...props} /> : <ExecCard {...props} />;
}

const StepNode = memo(StepNodeView);

const BY_ROLE = {
  trigger: TriggerCard,
  triggerGroup: TriggerGroupFrame,
  admit: AdmitChip,
  step: StepNode,
  container: ContainerFrame,
  value: ValueCard,
  lane: LaneFrame,
  failure: LaneFrame,
  slot: SlotCard,
  inputs: InputsBar,
  exits: ExitsBar,
} satisfies Record<SceneRole, NodeTypes[string]>;

export const SCENE_NODE_TYPES: NodeTypes = {
  ...BY_ROLE,
  comment: CommentCard,
  frame: FrameGroup,
};
