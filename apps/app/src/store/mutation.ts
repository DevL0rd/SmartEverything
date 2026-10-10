import { useState } from 'react';
import { notify } from '../components/toast-store';
import { rawErrorText } from '../format/errors';

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
  const run = <T>(work: () => Promise<T>, options: MutationRun<T>): void => {
    if (busy) {
      return;
    }
    setBusy(true);
    setProblem(null);
    work()
      .then(
        (value) => {
          options.onDone?.(value);
        },
        (error: unknown) => {
          if (options.inline === true) {
            setProblem(rawErrorText(error));
            return;
          }
          notify({ message: options.failure, error, tone: 'critical' });
        },
      )
      .finally(() => {
        setBusy(false);
      });
  };
  return { busy, problem, run };
}
