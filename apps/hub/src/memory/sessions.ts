import type { ToolCaller } from '../ai-tools/hub-tool';
import type { Store } from '../store/store';
import type { MemorySessions } from './access';
import type { MemoryPrincipal } from './principal';
import type { LatestMessage } from './service';

export interface SessionCallers {
  readonly caller: (sessionId: string) => ToolCaller;
}

export function messageOfEvent(
  store: Pick<Store, 'host'>,
): (eventId: string) => Promise<string | null> {
  return async (eventId) => (await store.host.call('assistantEvents', 'event', eventId)).message_id;
}

export class HarnessMemorySessions implements MemorySessions {
  constructor(
    private readonly callers: SessionCallers,
    private readonly messageOf: (eventId: string) => Promise<string | null>,
    private readonly textOf: (messageId: string) => Promise<string>,
  ) {}

  async latest(sessionId: string): Promise<LatestMessage | null> {
    const id = (await this.principal(sessionId)).messageId;
    return id === null ? null : { id, text: await this.textOf(id) };
  }

  async principal(sessionId: string): Promise<MemoryPrincipal> {
    const caller = this.callers.caller(sessionId);
    const event = caller.authority?.event_id;
    return {
      profileId: caller.profileId,
      role: caller.role,
      chatId: caller.chatId,
      messageId: event === undefined ? null : await this.messageOf(event),
    };
  }
}
