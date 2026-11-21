import { background } from '@smarteverything/logging';
import type { DriveIntent, DriveIntentInput } from '../store/repositories/drive-intents';
import { unclaimed } from './replay-claims';
import type { DriveFileStore } from './intents';
import { resultOf, writeDriveOps } from './units/ops';

interface QueuedIntent {
  readonly input: DriveIntentInput;
  readonly resolve: (intent: DriveIntent) => void;
  readonly reject: (cause: unknown) => void;
}

const queues = new WeakMap<DriveFileStore, QueuedIntent[]>();

async function flush(store: DriveFileStore, queue: readonly QueuedIntent[]): Promise<void> {
  queues.delete(store);
  let results: Awaited<ReturnType<typeof writeDriveOps>>;
  try {
    results = await writeDriveOps(
      store,
      queue.map((queued) => ({ kind: 'intent', intent: queued.input })),
    );
  } catch (cause) {
    for (const queued of queue) queued.reject(cause);
    return;
  }
  for (const [index, queued] of queue.entries()) {
    try {
      queued.resolve(resultOf(results, index, 'intent').intent);
    } catch (cause) {
      queued.reject(cause);
    }
  }
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
        background(flush(store, queue), 'drive.intent_batch_failed');
      });
    });
  });
}
