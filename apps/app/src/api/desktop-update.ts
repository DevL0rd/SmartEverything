import { useEffect, useState } from 'react';
import type { MachineUpdateStatus } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { DesktopBridge } from '../design/platform';
import { rawErrorText } from '../format/errors';

const log = new Logger('app.desktop-update');

export type UpdateReading =
  | { readonly kind: 'reading' }
  | { readonly kind: 'read'; readonly status: MachineUpdateStatus }
  | { readonly kind: 'failed'; readonly problem: string };

export function useUpdateStatus(bridge: DesktopBridge): {
  readonly reading: UpdateReading;
  readonly apply: (next: MachineUpdateStatus) => void;
} {
  const [reading, setReading] = useState<UpdateReading>({ kind: 'reading' });
  useEffect(() => {
    const stop = bridge.onUpdateStatus?.((status) => {
      setReading({ kind: 'read', status });
    });
    bridge.updateStatus?.().then(
      (status) => {
        setReading({ kind: 'read', status });
      },
      (error: unknown) => {
        log.error('update.status_unreadable', error);
        setReading({ kind: 'failed', problem: rawErrorText(error) });
      },
    );
    return stop;
  }, [bridge]);
  return {
    reading,
    apply: (status): void => {
      setReading({ kind: 'read', status });
    },
  };
}
