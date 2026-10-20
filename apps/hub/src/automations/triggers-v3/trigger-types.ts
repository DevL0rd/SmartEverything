import type { PortValue } from '@smarteverything/domain';

export interface TriggerProblem {
  readonly automationId: string;
  readonly triggerId: string;
  readonly message: string;
}

export interface TriggerIdentity {
  readonly automationId: string;
  readonly triggerId: string;
  readonly key: string;
  readonly kind: string;
}

export interface ConditionEntry extends TriggerIdentity {
  readonly condition: PortValue;
  readonly holdMs: number;
}
