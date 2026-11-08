import { parentPort, workerData } from 'node:worker_threads';
import { WALK_DATA, walkRoot, type WalkMessage } from './scanner-walk';

function post(message: WalkMessage): void {
  parentPort?.postMessage(message);
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

try {
  const data = WALK_DATA.parse(workerData);
  const result = walkRoot(data, {
    batch: (sequence, entries) => {
      post({ kind: 'batch', sequence, entries: [...entries] });
    },
    problem: (relPath, code) => {
      post({ kind: 'problem', relPath, code });
    },
  });
  post({ kind: 'done', skipped: result.skipped });
} catch (cause) {
  post({ kind: 'failed', message: messageOf(cause) });
}
