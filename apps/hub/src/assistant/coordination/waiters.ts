import { Logger } from '@smarteverything/logging';

const log = new Logger('hub.assistant-coordination');

export interface Settled {
  readonly state: 'answered' | 'failed' | 'working';
  readonly text: string | null;
}

interface Waiter {
  readonly from: string | null;
  readonly target: string;
  readonly settle: (result: Settled) => void;
}

export class Waiters {
  private readonly waiting = new Map<string, Waiter>();

  wait(eventId: string, from: string | null, target: string, seconds: number): Promise<Settled> {
    return new Promise((settle) => {
      log.debug('waiter.registered', {
        eventId,
        from,
        target,
        seconds,
        waiting: this.waiting.size + 1,
      });
      const timer = setTimeout(() => {
        this.waiting.delete(eventId);
        log.info('waiter.timed_out', { eventId, from, target, seconds });
        settle({ state: 'working', text: null });
      }, seconds * 1000);
      this.waiting.set(eventId, {
        from,
        target,
        settle: (result): void => {
          clearTimeout(timer);
          settle(result);
        },
      });
    });
  }

  has(eventId: string): boolean {
    return this.waiting.has(eventId);
  }

  settle(eventId: string, result: Settled): boolean {
    const waiter = this.waiting.get(eventId);
    if (waiter === undefined) {
      return false;
    }
    this.waiting.delete(eventId);
    log.debug('waiter.settled', {
      eventId,
      from: waiter.from,
      target: waiter.target,
      state: result.state,
      textChars: result.text?.length ?? 0,
    });
    waiter.settle(result);
    return true;
  }

  waitsOn(chatId: string, other: string): boolean {
    const seen = new Set<string>();
    const open = [chatId];
    for (let next = open.pop(); next !== undefined; next = open.pop()) {
      if (next === other) {
        return true;
      }
      if (!seen.has(next)) {
        seen.add(next);
        open.push(...this.targetsOf(next));
      }
    }
    return false;
  }

  private targetsOf(chatId: string): string[] {
    return [...this.waiting.values()]
      .filter((waiter) => waiter.from === chatId)
      .map((waiter) => waiter.target);
  }
}
