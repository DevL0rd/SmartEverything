import { webSearchSource } from '../assistant/web-search-supplier';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Logger } from '@smarteverything/logging';
import type { ComputerAiDirectory } from '../computers/ai-directory';
import type { ToolHub } from '../ai-tools/tool-hub';
import { AssistantService } from '../assistant/service';
import type { Clock } from '../clock';
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

export function assistantOf(
  options: AssistantWiring,
  live: LiveHub,
  directory?: ComputerAiDirectory,
): AssistantService {
  const service = new AssistantService({
    store: options.store,
    dataDirectory: options.dataDirectory,
    announce: (status): void => {
      live.announce({ type: 'assistant_status', status }, 'assistant');
    },
    emit: (notice, profileId): void => {
      live.profileNotice(notice, profileId, 'assistant');
    },
    runtimeNotice: (notice, profileId): void => {
      live.profileNotice(notice, profileId, 'assistant');
    },
    providerNotice: (notice, profileId): void => {
      live.profileNotice(notice, profileId, 'assistant');
    },
    now: options.clock.now,
    log: options.log.forArea('hub.assistant'),
  });
  if (directory !== undefined) service.attachComputerAi(directory);
  live.prime('assistant', (profileId) => service.activity(profileId));
  return service;
}

export function attachAssistant(context: ServerContext, tools: ToolHub): void {
  tools.add(webSearchSource(context.harness, context.openRouter.client));
  context.assistant.attachTools(tools);
  context.assistant.attachAuxiliaries(context.openRouter);
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
