import type { PersonBudget } from '@smarteverything/domain';
import type { HubLayout } from '../data-layout';
import type { ToolHub } from '../ai-tools/tool-hub';
import { HarnessAgentHost } from '../automations/effects/harness-agent-host';
import { OneShotModel } from '../automations/effects/one-shot-model';
import { StoredPictures } from '../automations/effects/camera-pictures';
import { PersonBudgets } from '../ledger/person-budget';
import { recordingPathIn } from '../services';
import type { Clock } from '../clock';
import type { Store } from '../store/store';
import type { ServerContext } from './context';

export interface AutomationIntegrationWiring {
  readonly store: Store;
  readonly layout: HubLayout;
  readonly clock: Clock;
}

export function attachAutomationIntegration(
  context: ServerContext,
  tools: ToolHub,
  options: AutomationIntegrationWiring,
): void {
  const { store, clock } = options;
  const { assistant, harness, hub } = context;
  const budgets = new PersonBudgets({
    ledger: store.ledger,
    people: {
      budget: (profileId): PersonBudget | null | undefined => store.personAccess.budget(profileId),
      budgeted: (): readonly string[] => store.personAccess.budgetedIds(),
      name: (profileId): string => store.profiles.byId(profileId).name,
    },
    now: clock.now,
  });
  hub.automationIntegration.attach({
    model: new OneShotModel({
      agents: new HarnessAgentHost({
        assistant,
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
    pictures: new StoredPictures({
      snapshot: (deviceId, size): Promise<Uint8Array> => hub.snapshot(deviceId, size),
      recordings: store.cameras,
      recordingPath: recordingPathIn(options.layout),
      attachments: store.assistantChat,
      attachmentPath: (file): string => assistant.files.pathOf(file),
      now: clock.now,
    }),
    computers: hub.automationComputers,
    tools,
    signals: hub.signals,
    replies: hub.automationWebhooks.replies,
    clock,
    ownerProfileId: (): string => store.personAccess.homeOwner(),
  });
}
