import { useRef, useState } from 'react';
import { Logger } from '@smarteverything/logging';
import { errorFields } from '../design/log-tally';
import { notify } from '../components/toast-store';
import { rawErrorText } from '../format/errors';

const log = new Logger('app.store');

interface MutationRun<T> {
  readonly failure: string;
  readonly inline?: boolean;
  readonly onDone?: (value: T) => void;
}

export interface MutationState {
  readonly busy: boolean;
  readonly problem: string | null;
  readonly run: <T>(work: () => Promise<T>, options: MutationRun<T>) => void;
}

export function useMutationState(): MutationState {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const running = useRef(false);
  const run = <T>(work: () => Promise<T>, options: MutationRun<T>): void => {
    if (running.current) {
      log.debug('mutation.skipped', { label: options.failure, reason: 'already running' });
      return;
    }
    running.current = true;
    const begun = Date.now();
    setBusy(true);
    setProblem(null);
    work()
      .then(
        (value) => {
          log.debug('mutation.succeeded', () => ({
            label: options.failure,
            durationMs: Date.now() - begun,
          }));
          options.onDone?.(value);
        },
        (error: unknown) => {
          log.warn('mutation.failed', {
            label: options.failure,
            inline: options.inline === true,
            durationMs: Date.now() - begun,
            ...errorFields(error),
          });
          if (options.inline === true) {
            setProblem(rawErrorText(error));
            return;
          }
          notify({ message: options.failure, error, tone: 'critical' });
        },
      )
      .finally(() => {
        running.current = false;
        setBusy(false);
      });
  };
  return { busy, problem, run };
}
