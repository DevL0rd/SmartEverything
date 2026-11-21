import { isFinished, type CommandRow, type JsonValue } from '@smarteverything/domain';
import type { EntityStore } from './entity-store';
import { background } from '@smarteverything/logging';

const EXPIRY_GRACE_MS = 5000;

export const COMMAND_READS = ['tables.commands'] as const;

export function commandSucceeded(store: EntityStore, row: CommandRow): Promise<boolean> {
  return new Promise((resolve) => {
    const end = (success: boolean): void => {
      clearTimeout(timer);
      unsubscribe();
      resolve(success);
    };
    const outcome = (): boolean | undefined => {
      const current = store.get().tables.commands.byId[row.id];
      return current !== undefined && isFinished(current.status)
        ? current.status === 'succeeded'
        : undefined;
    };
    const check = (): void => {
      const finished = outcome();
      if (finished !== undefined) {
        end(finished);
      }
    };
    const timer = setTimeout(
      () => {
        end(outcome() === true);
      },
      Math.max(0, Date.parse(row.expires_at) - Date.now() + EXPIRY_GRACE_MS),
    );
    const unsubscribe = store.subscribeSlices(COMMAND_READS, check);
    check();
  });
}

interface Waiting {
  readonly value: JsonValue;
  readonly done: (success: boolean) => void;
}

export function throttledSend(
  send: (value: JsonValue) => Promise<boolean>,
  intervalMs: number,
): (value: JsonValue) => Promise<boolean> {
  let sentAt = Number.NEGATIVE_INFINITY;
  let waiting: Waiting | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const deliver = (entry: Waiting): void => {
    sentAt = Date.now();
    background(send(entry.value).then(entry.done), 'live_commands.send_failed');
  };
  return (value) =>
    new Promise((done) => {
      waiting?.done(true);
      const entry = { value, done };
      const remaining = sentAt + intervalMs - Date.now();
      if (remaining <= 0 && timer === null) {
        waiting = null;
        deliver(entry);
        return;
      }
      waiting = entry;
      if (timer !== null) return;
      timer = setTimeout(() => {
        const next = waiting;
        timer = null;
        waiting = null;
        if (next !== null) deliver(next);
      }, remaining);
    });
}
