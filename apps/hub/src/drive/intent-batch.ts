import type { DriveIntent, DriveIntentInput } from '../store/repositories/drive-intents';
import { unclaimed } from './replay-claims';
import type { DriveFileStore } from './intents';

interface QueuedIntent {
  readonly input: DriveIntentInput;
  readonly resolve: (intent: DriveIntent) => void;
  readonly reject: (cause: unknown) => void;
}

const queues = new WeakMap<DriveFileStore, QueuedIntent[]>();

function flush(store: DriveFileStore, queue: readonly QueuedIntent[]): void {
  queues.delete(store);
  let opened: readonly (readonly [QueuedIntent, DriveIntent])[];
  try {
    opened = store.write(() =>
      queue.map((queued) => [queued, store.driveIntents.open(queued.input)] as const),
    );
  } catch (cause) {
    for (const queued of queue) queued.reject(cause);
    return;
  }
  for (const [queued, intent] of opened) queued.resolve(intent);
}

export function openIntent(store: DriveFileStore, input: DriveIntentInput): Promise<DriveIntent> {
  return new Promise<DriveIntent>((resolve, reject) => {
    const waiting = queues.get(store);
    if (waiting !== undefined) {
      waiting.push({ input, resolve, reject });
      return;
    }
    const queue: QueuedIntent[] = [{ input, resolve, reject }];
    queues.set(store, queue);
    unclaimed(() => {
      setImmediate(() => {
        flush(store, queue);
      });
    });
  });
}
