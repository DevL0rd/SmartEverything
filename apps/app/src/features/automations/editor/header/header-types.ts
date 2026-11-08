import type { AutomationV4, NodeRegistry } from '@smarteverything/domain';
import type { PatchOp } from '@smarteverything/flow/graph/ops/schema';
import type { ValueSlot } from '../inspector/sections/section-types';

export interface HeaderEnv {
  readonly program: AutomationV4;
  readonly registry: NodeRegistry;
  readonly renderValue: ValueSlot;
  readonly anchorKey: string;
  readonly locked: boolean;
  readonly apply: (ops: readonly PatchOp[]) => void;
}

export interface HeaderSectionProps {
  readonly env: HeaderEnv;
}
