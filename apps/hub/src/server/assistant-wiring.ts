import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Logger } from '@smarteverything/logging';
import type { ToolHub } from '../ai-tools/tool-hub';
import { ConversationLog } from '../assistant/conversation-log';
import { AssistantService } from '../assistant/service';
import { ToolChanges } from '../assistant/tool-changes';
import type { Clock } from '../clock';
import { TurnAccumulator } from '../openrouter/turn';
import type { AiTurns } from '../schedules/steps';
import type { Store } from '../store/store';
import type { ServerContext } from './context';
import type { LiveHub } from './live';

export interface Listening {
  server: Server | null;
}

export interface AssistantWiring {
  readonly store: Store;
  readonly dataDirectory: string;
  readonly clock: Clock;
  readonly log: Logger;
}

export function localUrlOf(listening: Listening): string {
  const address: AddressInfo | string | null | undefined = listening.server?.address();
  if (address === null || address === undefined || typeof address === 'string') {
    throw new Error('The server is not listening yet, so its local address is unknown.');
  }
  return `http://127.0.0.1:${String(address.port)}`;
}

export function assistantOf(options: AssistantWiring, live: LiveHub): AssistantService {
  const service = new AssistantService({
    store: options.store,
    dataDirectory: options.dataDirectory,
    announce: (status): void => {
      live.announce({ type: 'assistant_status', status }, 'assistant');
    },
    emit: (notice, profileId): void => {
      live.profileNotice(notice, profileId, 'assistant');
    },
    now: options.clock.now,
    log: options.log.forArea('hub.assistant'),
  });
  live.prime('assistant', (profileId) => service.activity(profileId));
  return service;
}

export function attachAssistant(
  options: AssistantWiring,
  context: ServerContext,
  tools: ToolHub,
): ToolChanges {
  context.assistant.attachTools(tools);
  const changes = new ToolChanges({
    store: options.store,
    conversation: new ConversationLog(options.store),
    now: options.clock.now,
    log: options.log.forArea('hub.assistant'),
  });
  changes.attach(tools);
  context.assistant.attachOpenRouter({
    client: context.openRouter.client,
    catalogue: context.openRouter.catalogue,
    newTurn: () => new TurnAccumulator(),
    ledger: options.store.ledger,
    notes: context.mediaNotes,
  });
  context.assistant.attachLedger(options.store.ledger);
  return changes;
}

export function aiTurnsOf(context: ServerContext): AiTurns {
  return {
    run: (input): Promise<{ readonly chatId: string }> =>
      Promise.resolve({
        chatId: context.assistant.runTurn({
          profileId: input.profileId,
          ...(input.chatId === null ? {} : { chatId: input.chatId }),
          title: input.title,
          text: input.text,
          origin: {
            source: 'schedule',
            plugin_id: null,
            device_id: null,
            name: input.title,
            ...(input.plugin ?? {}),
          },
        }).chatId,
      }),
  };
}
