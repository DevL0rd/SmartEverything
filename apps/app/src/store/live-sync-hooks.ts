import type { LiveChange, LiveMessage } from '@smarteverything/domain';
import type { ImageNotice } from '../features/assistant';

export interface LiveSyncHooks {
  readonly onAiPreviewNotice?: (message: Extract<LiveMessage, { type: 'ai_preview' }>) => void;
  readonly onTranscriptNotice?: (
    message: Extract<LiveMessage, { type: 'transcript_changed' }>,
  ) => void;
  readonly onChanges: (changes: readonly LiveChange[]) => void;
  readonly onProfileChanged: () => void;
  readonly onSynchronized?: () => void;
  readonly onAiProviderNotice?: (
    message: Extract<LiveMessage, { type: 'ai_chat_provider' | 'ai_chat_runtime_provider' }>,
  ) => void;
  readonly onImageNotice?: (message: ImageNotice) => void;
  readonly onAiHarnessConfigurationNotice?: (
    message: Extract<LiveMessage, { type: 'ai_harness_configuration' }>,
  ) => void;
  readonly onAiHarnessNotice?: (message: Extract<LiveMessage, { type: 'ai_harness' }>) => void;
  readonly onComputerNotice?: (
    message: Extract<
      LiveMessage,
      {
        type:
          | 'computer_ai_status'
          | 'computer_claude'
          | 'computer_runtime_status'
          | 'computer_runtime_native';
      }
    >,
  ) => void;
}
