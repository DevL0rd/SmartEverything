import { setTimeout as delay } from 'node:timers/promises';
import { auxCompletionsOf } from '../assistant/aux-completion-binding';
import type { ServerContext } from '../server/context';
import type { Store } from '../store/store';
import { OpenRouterMemoryEmbedder } from './embedder';
import { MemoryManager } from './manager';
import { ManagerModel } from './manager-model';
import { MemoryService } from './service';

export interface HubMemory {
  readonly service: MemoryService;
  readonly manager: MemoryManager;
  readonly model: ManagerModel;
}

const built = new WeakMap<Store, HubMemory>();

export function hubMemoryOf(context: Pick<ServerContext, 'store' | 'openRouter'>): HubMemory {
  const existing = built.get(context.store);
  if (existing !== undefined) return existing;
  const { store } = context;
  const completions = auxCompletionsOf(store);
  const model = new ManagerModel({
    selected: (): string => store.assistantChat.settings().memory_model,
    complete: (request): Promise<string> => completions.complete(request),
    nameOf: (profileId): string => store.profiles.byId(profileId).name,
    now: (): Date => new Date(),
    sleep: (ms): Promise<void> => delay(ms),
  });
  const service = new MemoryService(
    store.aiMemories,
    store.aiChats,
    new OpenRouterMemoryEmbedder(context.openRouter.client),
    {
      judge: model,
      zone: (): string => store.settings.read().time_zone,
      now: (): Date => new Date(),
    },
  );
  const created = { service, manager: new MemoryManager(model, service.writer, service), model };
  built.set(store, created);
  return created;
}
