import type { NodeTypes } from '@xyflow/react';
import { DecisionCard } from './nodes/decision-card';
import { FailurePill } from './nodes/failure-pill';
import { ForkCard } from './nodes/fork-card';
import { JoinCard } from './nodes/join-card';
import { LoopCard } from './nodes/loop-card';
import { StartPill, TriggerPill } from './nodes/start-pill';
import { StepCard } from './nodes/step-card';
import { TerminalCard } from './nodes/terminal-card';
import { TryCard } from './nodes/try-card';
import { ValueCard } from './nodes/value-card';

export const GRAPH_NODE_TYPES: NodeTypes = {
  decision: DecisionCard,
  failure: FailurePill,
  fork: ForkCard,
  join: JoinCard,
  loop: LoopCard,
  owner: StepCard,
  start: StartPill,
  step: StepCard,
  terminal: TerminalCard,
  trigger: TriggerPill,
  try: TryCard,
  value: ValueCard,
};
