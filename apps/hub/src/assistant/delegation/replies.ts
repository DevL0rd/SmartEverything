import { Logger } from '@smarteverything/logging';
import { assistantLabel } from '@smarteverything/domain';
import type { StoredEvent } from '../../store/repositories/assistant-events';
import type { Store } from '../../store/store';
import { authorityScope } from '../turn-authority';
import type { ConversationLog } from '../conversation-log';

const log = new Logger('hub.assistant-delegation');

export interface Settled {
  readonly state: 'answered' | 'failed' | 'working';
  readonly text: string | null;
}

export interface RepliesDeps {
  readonly store: Store;
  readonly conversation: ConversationLog;
  readonly now: () => Date;
  readonly added: () => void;
}

interface Waiter {
  readonly timer: NodeJS.Timeout;
  readonly settle: (result: Settled) => void;
}

export class Replies {
  private readonly waiting = new Map<string, Waiter>();

  constructor(private readonly deps: RepliesDeps) {}

  wait(eventId: string, from: string | null, target: string, seconds: number): Promise<Settled> {
    return new Promise((settle) => {
      const timer = setTimeout(() => {
        this.waiting.delete(eventId);
        log.info('waiter.timed_out', { eventId, from, target, seconds });
        settle({ state: 'working', text: null });
      }, seconds * 1000);
      this.waiting.set(eventId, { timer, settle });
    });
  }

  async finished(event: StoredEvent, text: string, ok: boolean): Promise<void> {
    const { store } = this.deps;
    const waiter = this.waiting.get(event.id);
    if (waiter !== undefined) {
      clearTimeout(waiter.timer);
      this.waiting.delete(event.id);
      const claimed = await store.host.write('delegationClaim', {
        eventId: event.id,
        destination: 'waiter',
      });
      waiter.settle(
        claimed ? { state: ok ? 'answered' : 'failed', text } : { state: 'working', text: null },
      );
      return;
    }
    const reported = await store.host.write('delegationReport', {
      event,
      text,
      ok,
      assistant: assistantLabel(store.live.home.assistant.read()),
      held: store.live.chatWork.holds.held(),
      scope: authorityScope(),
    });
    if (reported) this.deps.added();
  }
}
