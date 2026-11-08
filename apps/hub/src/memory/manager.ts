import type { StoredMemory } from '../store/repositories/ai-memories';
import type { ManagerModel, ManagerRequest } from './manager-model';
import type { MemoryPrincipal } from './principal';
import { MANAGER_NEIGHBOURS } from './search';
import type { MemoryService } from './service';
import { Logger } from '@smarteverything/logging';
import type { AppliedOperation, MemoryWriter } from './writer';

const log = new Logger('hub.memory');

export interface ManagerResult {
  readonly applied: readonly AppliedOperation[];
}

export class MemoryManager {
  constructor(
    private readonly model: ManagerModel,
    private readonly writer: MemoryWriter,
    private readonly memory: Pick<MemoryService, 'offered' | 'settings'>,
  ) {}

  async exchange(
    who: MemoryPrincipal,
    chatId: string,
    person: string,
    reply: string,
  ): Promise<ManagerResult> {
    const permitted = (): boolean => this.memory.offered(who);
    if (!permitted()) return { applied: [] };
    const memories = await this.neighbours(who, `${person}\n${reply}`, permitted);
    return this.run(
      { who, chatId, memories, subject: { kind: 'exchange', person, reply } },
      permitted,
    );
  }

  expired(who: MemoryPrincipal, chatId: string, memory: StoredMemory): Promise<ManagerResult> {
    return this.run(
      {
        who,
        chatId,
        memories: [memory],
        subject: { kind: 'expired', validUntil: memory.valid_until ?? '' },
      },
      () => this.memory.settings(who).enabled,
    );
  }

  private async neighbours(
    who: MemoryPrincipal,
    text: string,
    permitted: () => boolean,
  ): Promise<readonly StoredMemory[]> {
    try {
      const found = await this.writer.similar(who, text, MANAGER_NEIGHBOURS, permitted);
      return found.map((entry) => entry.memory);
    } catch (cause) {
      log.exception('memory.neighbours_failed', cause);
      return [];
    }
  }

  private async run(request: ManagerRequest, permitted: () => boolean): Promise<ManagerResult> {
    if (!permitted()) return { applied: [] };
    const operations = await this.model.propose(request, permitted);
    const applied = await this.writer.apply(
      request.who,
      operations,
      new Set(request.memories.map((memory) => memory.id)),
      permitted,
    );
    return { applied };
  }
}
