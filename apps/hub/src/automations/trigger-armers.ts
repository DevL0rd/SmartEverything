import type { SignalInput, Trigger } from '@smarteverything/domain';
import type { Cancel } from '../clock';

export interface TriggerArmer {
  readonly types: readonly Trigger['type'][];
  readonly arm: (
    automationId: string,
    trigger: Trigger,
    fire: (signal: SignalInput | null) => void,
  ) => Cancel;
}
