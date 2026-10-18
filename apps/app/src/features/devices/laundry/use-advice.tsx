import type { ReactNode } from 'react';
import { useState } from 'react';
import { AdviceSheet } from './advice-sheet';
import type { Laundry } from './use-laundry';
import { useRunner, type Runner } from './use-runner';

export interface Advised {
  readonly runner: Runner;
  readonly sheet: ReactNode;
}

export function useAdvice(laundry: Laundry): Advised {
  const [open, setOpen] = useState(false);
  const runner = useRunner(laundry, () => {
    setOpen(true);
  });
  const sheet = open ? (
    <AdviceSheet
      laundry={laundry}
      runner={runner}
      onClose={() => {
        setOpen(false);
      }}
    />
  ) : null;
  return { runner, sheet };
}
