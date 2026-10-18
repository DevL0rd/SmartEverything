import type { ProjectFilesService } from '../projects/service';
import { Coordination, type CoordinationDeps } from './coordination/asks';
import { ChatDirectory } from './chat-directory';
import { AssistantFiles } from './files';
import type { EngineSelections } from './engine-selections';
import { AssistantRequests, type RequestsDeps } from './requests';
import type { EngineRegistry } from './engines/registry';
import { AssistantDelivery } from './delivery';
import type { DeliveryOptions } from './delivery';
import type { AssistantServiceOptions } from './service-contract';
export function assistantDelivery(
  options: AssistantServiceOptions,
  engines: EngineRegistry,
  ports: Pick<DeliveryOptions, 'admit' | 'delivered' | 'failed'>,
): AssistantDelivery {
  return new AssistantDelivery({
    events: options.store.assistantEvents,
    frozen: (id): boolean => options.store.aiChats.chat(id).deletion_state !== null,
    route: (event) => engines.route(event),
    ...ports,
    log: options.log,
  });
}

export function assistantRequests(
  options: AssistantServiceOptions,
  context: Pick<RequestsDeps, 'files' | 'chats' | 'conversation'>,
  ports: Pick<RequestsDeps, 'delivery' | 'voiceResult' | 'done'>,
): AssistantRequests {
  return new AssistantRequests({ store: options.store, ...context, ...ports });
}

export function assistantChats(
  options: AssistantServiceOptions,
  files: AssistantFiles,
  selections: () => EngineSelections | null,
  projects: ProjectFilesService,
): ChatDirectory {
  return new ChatDirectory(options.store, files, options.now, {
    projects,
    validate: (engine, user): void => {
      selections()?.validate(engine, user);
    },
  });
}

export function assistantCoordination(
  options: AssistantServiceOptions,
  ports: Pick<CoordinationDeps, 'tools' | 'chats' | 'conversation' | 'added'>,
): Coordination {
  return new Coordination({ store: options.store, emit: options.emit, now: options.now, ...ports });
}

export function assistantFiles(
  options: AssistantServiceOptions,
  projects: ProjectFilesService,
): AssistantFiles {
  return new AssistantFiles({
    dataDirectory: options.dataDirectory,
    chat: options.store.assistantChat,
    now: options.now,
    projects,
  });
}
