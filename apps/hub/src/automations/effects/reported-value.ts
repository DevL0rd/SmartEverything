import type { Cancel, Clock } from '../../clock';
import type { ChangeFeed } from '../../store/feed';
import { AutomationRunCancelledError } from './run-abort';
import type { EffectRun } from './effect-run';

export interface ReportedWait {
  readonly feed: Pick<ChangeFeed, 'subscribe'>;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly holds: () => boolean;
  readonly withinMs: number;
}

export function reportedWithin(
  wait: ReportedWait,
  run: Pick<EffectRun, 'runId' | 'signal'>,
): Promise<boolean> {
  const { feed, clock, holds, withinMs } = wait;
  if (holds()) return Promise.resolve(true);
  return new Promise((resolve, reject) => {
    const cancels: Cancel[] = [];
    const finish = (settle: () => void): void => {
      for (const cancel of cancels) cancel();
      run.signal.removeEventListener('abort', abort);
      settle();
    };
    const abort = (): void => {
      finish(() => {
        reject(new AutomationRunCancelledError(run.runId));
      });
    };
    cancels.push(
      feed.subscribe((change) => {
        if (change.table === 'device_state' && holds()) {
          finish(() => {
            resolve(true);
          });
        }
      }),
      clock.at(new Date(clock.now().getTime() + withinMs), () => {
        finish(() => {
          resolve(holds());
        });
      }),
    );
    run.signal.addEventListener('abort', abort, { once: true });
    if (run.signal.aborted) abort();
  });
}
