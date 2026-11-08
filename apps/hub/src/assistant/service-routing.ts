import { ApiError } from '@smarteverything/domain';
import type { ProjectFilesService } from '../projects/service';
import { Delegation, type DelegationDeps } from './delegation/delegation';
import { ChatDirectory } from './chat-directory';
import { AssistantFiles } from './files';
import type { EngineSelections } from './engine-selections';
import { AssistantRequests, type RequestsDeps } from './requests';
import type { EngineRegistry } from './engines/registry';
import { AssistantDelivery } from './delivery';
import type { DeliveryOptions } from './delivery';
import type { AssistantServiceOptions } from './service-contract';
import type { ConversationLog } from './conversation-log';
import { RepairDispatch } from './repair-dispatch';

export function assistantRepair(
  { store }: AssistantServiceOptions,
  conversation: ConversationLog,
  chats: Pick<ChatDirectory, 'repairChat'>,
  delivery: () => AssistantDelivery,
): RepairDispatch {
  return new RepairDispatch({
    store,
    conversation,
    repairChat: (profileId) => chats.repairChat(profileId),
    added: (): void => {
      delivery().added();
    },
  });
}
export function assistantDelivery(
  options: AssistantServiceOptions,
  engines: EngineRegistry,
  ports: Pick<DeliveryOptions, 'admit' | 'delivered' | 'failed' | 'retrying' | 'stopped'>,
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
  return new ChatDirectory(options.store, files, {
    projects,
    validate: (engine, user): void => {
      selections()?.validate(engine, user);
    },
    validateStandalone: (engine, user): void => {
      const catalogue = selections();
      if (catalogue === null) throw new ApiError('conflict', 'Computer AI engines are starting.');
      catalogue.validate(engine, user);
    },
  });
}

export function assistantDelegation(
  options: AssistantServiceOptions,
  ports: Pick<DelegationDeps, 'tools' | 'chats' | 'conversation' | 'added'>,
): Delegation {
  return new Delegation({ store: options.store, now: options.now, ...ports });
}

export function assistantFiles(
  options: AssistantServiceOptions,
  projects: ProjectFilesService,
): AssistantFiles {
  return new AssistantFiles({
    layout: options.layout,
    chat: options.store.assistantChat,
    now: options.now,
    projects,
  });
}
