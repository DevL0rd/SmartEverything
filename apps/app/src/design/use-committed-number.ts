import { useEffect, useState } from 'react';
import { commitQueue } from './commit-queue';

const COMMIT_DELAY_MS = 600;

export function useCommittedNumber(
  value: number | null,
  save: (value: number) => Promise<unknown>,
): { readonly shown: number | null; readonly set: (next: number) => void } {
  const [draft, setDraft] = useState<number | null>(null);
  const [queue] = useState(() =>
    commitQueue(save, COMMIT_DELAY_MS, () => {
      setDraft(null);
    }),
  );
  useEffect(() => {
    queue.retarget(save);
  }, [queue, save]);
  useEffect(
    () => (): void => {
      queue.flush();
    },
    [queue],
  );
  if (draft !== null && draft === value) {
    setDraft(null);
  }
  return {
    shown: draft ?? value,
    set: (next): void => {
      setDraft(next);
      queue.push(next);
    },
  };
}
