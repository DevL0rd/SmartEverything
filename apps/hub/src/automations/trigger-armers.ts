import type { SignalInput, TriggerV2 } from '@smarteverything/domain';
import type { Cancel } from '../clock';
import type { SpeechOccurrence } from '../transcripts/speech';

export interface TriggerAdmission {
  readonly validate: () => void;
  readonly occurrence: SpeechOccurrence;
}

export interface TriggerArmer {
  readonly types: readonly TriggerV2['on'][];
  readonly arm: (
    automationId: string,
    trigger: TriggerV2,
    fire: (signal: SignalInput | null, admission?: TriggerAdmission) => void,
  ) => Cancel;
}
