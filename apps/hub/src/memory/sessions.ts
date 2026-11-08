import type { ToolCaller } from '../ai-tools/hub-tool';
import type { Store } from '../store/store';
import type { MemorySessions } from './access';
import type { MemoryPrincipal } from './principal';
import type { LatestMessage } from './service';

export interface SessionCallers {
  readonly caller: (sessionId: string) => ToolCaller;
}

export function messageOfEvent(
  events: Pick<Store['assistantEvents'], 'event'>,
): (eventId: string) => string | null {
  return (eventId) => events.event(eventId).message_id;
}

export class HarnessMemorySessions implements MemorySessions {
  constructor(
    private readonly callers: SessionCallers,
    private readonly messageOf: (eventId: string) => string | null,
    private readonly textOf: (messageId: string) => string,
  ) {}

  latest(sessionId: string): LatestMessage | null {
    const id = this.principal(sessionId).messageId;
    return id === null ? null : { id, text: this.textOf(id) };
  }

  principal(sessionId: string): MemoryPrincipal {
    const caller = this.callers.caller(sessionId);
    const event = caller.authority?.event_id;
    return {
      profileId: caller.profileId,
      role: caller.role,
      chatId: caller.chatId,
      messageId: event === undefined ? null : this.messageOf(event),
    };
  }
}
