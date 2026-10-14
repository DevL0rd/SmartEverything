import { addAbortListener } from 'node:events';
import { ApiError } from '@smarteverything/domain';
import type { HarnessService } from './service';

export function awaitPluginResult(
  service: HarnessService,
  runId: string,
  signal: AbortSignal | undefined,
): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    let abort: ReturnType<typeof addAbortListener> | undefined;
    const release = service.store.feed.subscribeCommitted(check);
    function check(): void {
      try {
        const run = service.store.aiAgentRuns.read(runId);
        if (['queued', 'running'].includes(run.state)) return;
        release();
        abort?.[Symbol.dispose]();
        resolve();
      } catch (error) {
        release();
        abort?.[Symbol.dispose]();
        reject(error instanceof Error ? error : new Error('Helper outcome is unavailable.'));
      }
    }
    if (signal !== undefined)
      abort = addAbortListener(signal, () => {
        release();
        reject(
          new ApiError(
            'conflict',
            'Helper observation was cancelled; its durable task was not replayed.',
          ),
        );
      });
    check();
  });
}
