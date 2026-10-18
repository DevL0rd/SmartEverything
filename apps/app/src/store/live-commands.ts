import { isFinished, type CommandRow, type JsonValue } from '@smarteverything/domain';
import type { EntityStore } from './entity-store';
import { background } from '@smarteverything/logging';

const EXPIRY_GRACE_MS = 5000;

export function commandSucceeded(store: EntityStore, row: CommandRow): Promise<boolean> {
  return new Promise((resolve) => {
    const end = (success: boolean): void => {
      clearTimeout(timer);
      unsubscribe();
      resolve(success);
    };
    const check = (): void => {
      const current = store.get().tables.commands.byId[row.id];
      if (current !== undefined && isFinished(current.status)) {
        end(current.status === 'succeeded');
      }
    };
    const timer = setTimeout(
      () => {
        end(false);
      },
      Math.max(0, Date.parse(row.expires_at) - Date.now() + EXPIRY_GRACE_MS),
    );
    const unsubscribe = store.subscribe(check);
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
