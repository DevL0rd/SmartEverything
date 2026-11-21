import { ApiError, type AiChatRow, type RecordingRow } from '@smarteverything/domain';
import type { StoredAttachment } from '../store/repositories/assistant-chat';
import type { HubLayout } from '../data-layout';
import type { ToolHub } from '../ai-tools/tool-hub';
import { HarnessAgentHost } from '../automations/effects/harness-agent-host';
import { OneShotModel } from '../automations/effects/one-shot-model';
import { StoredPictures } from '../automations/effects/camera-pictures';
import { recordingPathIn } from '../services';
import type { Clock } from '../clock';
import type { Store } from '../store/store';
import type { ServerContext } from './context';

export interface AutomationIntegrationWiring {
  readonly store: Store;
  readonly layout: HubLayout;
  readonly clock: Clock;
}

async function personBudgetCheck(store: Store, profileId: string): Promise<void> {
  const refused = await store.host.read('personBudgetRefusal', { profileId });
  if (refused !== null) throw new ApiError('conflict', refused);
}

function picturesOf(context: ServerContext, options: AutomationIntegrationWiring): StoredPictures {
  const { store, clock } = options;
  const { assistant, hub } = context;
  return new StoredPictures({
    snapshot: (deviceId, size): Promise<Uint8Array> => hub.snapshot(deviceId, size),
    recordings: {
      addRecording: (input): Promise<RecordingRow> =>
        store.host.call('cameras', 'addRecording', input),
      recording: (id): Promise<RecordingRow> => store.host.call('cameras', 'recording', id),
    },
    recordingPath: recordingPathIn(options.layout),
    attachments: {
      attachment: (id): Promise<StoredAttachment> =>
        store.host.call('assistantChat', 'attachment', id),
    },
    attachmentPath: (file): string => assistant.files.pathOf(file),
    now: clock.now,
  });
}

export function attachAutomationIntegration(
  context: ServerContext,
  tools: ToolHub,
  options: AutomationIntegrationWiring,
): void {
  const { store, clock } = options;
  const { assistant, harness, hub } = context;
  const budgets = {
    check: (profileId: string): Promise<void> => personBudgetCheck(store, profileId),
  };
  hub.automationIntegration.attach({
    model: new OneShotModel({
      agents: new HarnessAgentHost({
        assistant,
        chats: {
          create: (input): Promise<AiChatRow> => store.host.call('aiChats', 'create', input),
        },
        ledger: store.live.usage,
        store,
        interactions: (listener): (() => void) =>
          harness.onEvent((event) => {
            if (event.kind === 'interaction') listener(event.chat_id);
          }),
        tmp: options.layout.tmp,
      }),
      tools,
      budgets,
    }),
    pictures: picturesOf(context, options),
    computers: hub.automationComputers,
    tools,
    signals: hub.signals,
    replies: hub.automationWebhooks.replies,
    clock,
    ownerProfileId: (): Promise<string> => store.host.call('personAccess', 'homeOwner'),
  });
}
