import type { CommandRow, SignalInput } from '@smarteverything/domain';
import type { EffectRequest, NodeResult, Outputs } from '@smarteverything/flow/interpret/frames';

export interface EffectRun {
  readonly runId: string;
  readonly automationId: string;
  readonly signal: AbortSignal;
  readonly commands: (rows: readonly CommandRow[]) => void;
  readonly trigger: SignalInput | null;
}

export type EffectHandler = (
  params: Outputs,
  request: EffectRequest,
  run: EffectRun,
) => Promise<NodeResult>;

export type EffectHandlers = Readonly<Record<string, EffectHandler>>;
